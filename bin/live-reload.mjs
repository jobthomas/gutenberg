/**
 * Live-reload / HMR SSE server for Gutenberg development.
 *
 * Watches `build/` for .js/.css changes (from `npm run dev`) and pushes
 * reload events to the browser via Server-Sent Events on port 35729.
 *
 * Routes:
 *   /events  → SSE stream (changed file list as JSON)
 *   /hmr/*   → static files from build/hmr/ and bin/hmr/
 *   *        → 404
 *
 * On startup, installs a mu-plugin in the wp-env container that:
 *   - Loads the react-refresh runtime BEFORE React (wp_head priority 1)
 *   - Loads the HMR client AFTER all scripts (admin_footer priority PHP_INT_MAX)
 *
 * On shutdown, the mu-plugin is removed.
 *
 * Usage:  node bin/live-reload.mjs   (run alongside `npm run dev`)
 */

import { createServer } from 'node:http';
import { watch } from 'chokidar';
import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { statSync, readFileSync, existsSync } from 'node:fs';

const PORT = 35729;
const DEBOUNCE_MS = 300;
const ROOT_DIR = resolve( import.meta.dirname, '..' );
const BUILD_DIR = resolve( ROOT_DIR, 'build' );
const MU_PLUGIN_PATH =
	'/var/www/html/wp-content/mu-plugins/live-reload.php';

const MU_PLUGIN_PHP = `<?php
// Auto-installed by bin/live-reload.mjs — do not edit.

// Load react-refresh runtime BEFORE React (priority 1, before wp_print_head_scripts at 8).
add_action( 'wp_head', function () {
	echo '<script src="http://localhost:${ PORT }/hmr/react-refresh-runtime.js"></script>';
}, 1 );
add_action( 'admin_head', function () {
	echo '<script src="http://localhost:${ PORT }/hmr/react-refresh-runtime.js"></script>';
}, 1 );

// Load HMR client AFTER all scripts.
add_action( 'wp_footer', function () {
	echo '<script src="http://localhost:${ PORT }/hmr/hmr-client.js"></script>';
}, PHP_INT_MAX );
add_action( 'admin_footer', function () {
	echo '<script src="http://localhost:${ PORT }/hmr/hmr-client.js"></script>';
}, PHP_INT_MAX );
`;

const clients = new Set();

// --- mu-plugin install / cleanup ------------------------------------------

function wpEnv( ...args ) {
	execSync( [ 'npm', 'run', 'wp-env', '--', ...args ].join( ' ' ), {
		cwd: ROOT_DIR,
		stdio: 'pipe',
	} );
}

function installMuPlugin() {
	const b64 = Buffer.from( MU_PLUGIN_PHP ).toString( 'base64' );
	wpEnv(
		'run',
		'cli',
		'bash',
		'-c',
		`"mkdir -p /var/www/html/wp-content/mu-plugins && echo ${ b64 } | base64 -d > ${ MU_PLUGIN_PATH }"`
	);
	console.log( 'Installed mu-plugin in wp-env container.' );
}

function removeMuPlugin() {
	try {
		wpEnv( 'run', 'cli', 'rm', '-f', MU_PLUGIN_PATH );
		console.log( 'Removed mu-plugin from wp-env container.' );
	} catch {
		// Best-effort cleanup.
	}
}

// --- Static file serving for HMR assets -----------------------------------

const MIME_TYPES = {
	'.js': 'application/javascript',
	'.mjs': 'application/javascript',
	'.css': 'text/css',
};

/**
 * Serve a static file with CORS headers.
 *
 * @param {string}                    filePath Absolute path to the file.
 * @param {import('http').ServerResponse} res      HTTP response.
 */
function serveFile( filePath, res ) {
	if ( ! existsSync( filePath ) ) {
		res.writeHead( 404 );
		res.end( 'Not found' );
		return;
	}

	const ext = filePath.match( /\.[^.]+$/ )?.[ 0 ] || '';
	const contentType = MIME_TYPES[ ext ] || 'application/octet-stream';

	const content = readFileSync( filePath );
	res.writeHead( 200, {
		'Content-Type': contentType,
		'Cache-Control': 'no-cache',
		'Access-Control-Allow-Origin': '*',
	} );
	res.end( content );
}

// --- HTTP server with routing ---------------------------------------------

const server = createServer( ( req, res ) => {
	const url = new URL( req.url, `http://localhost:${ PORT }` );
	const pathname = url.pathname;

	// SSE endpoint
	if ( pathname === '/events' ) {
		res.writeHead( 200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'Access-Control-Allow-Origin': '*',
		} );
		// Flush headers so the browser fires `onopen` immediately.
		res.write( ':ok\n\n' );

		clients.add( res );
		req.on( 'close', () => clients.delete( res ) );
		return;
	}

	// HMR static files
	if ( pathname.startsWith( '/hmr/' ) ) {
		const fileName = pathname.slice( 5 ); // strip "/hmr/"

		// Security: reject path traversal
		if ( fileName.includes( '..' ) || fileName.includes( '/' ) ) {
			res.writeHead( 400 );
			res.end( 'Bad request' );
			return;
		}

		// Try build/hmr/ first (react-refresh-runtime.js), then bin/hmr/ (hmr-client.js)
		const buildPath = join( BUILD_DIR, 'hmr', fileName );
		const binPath = join( ROOT_DIR, 'bin', 'hmr', fileName );

		if ( existsSync( buildPath ) ) {
			serveFile( buildPath, res );
		} else if ( existsSync( binPath ) ) {
			serveFile( binPath, res );
		} else {
			res.writeHead( 404 );
			res.end( 'Not found' );
		}
		return;
	}

	// Everything else
	res.writeHead( 404 );
	res.end( 'Not found' );
} );

server.on( 'error', ( err ) => {
	if ( err.code === 'EADDRINUSE' ) {
		console.error(
			`Port ${ PORT } is already in use. Kill the other process first:\n` +
				`  lsof -ti :${ PORT } | xargs kill`
		);
		process.exit( 1 );
	}
	throw err;
} );

server.listen( PORT, () => {
	console.log(
		`Live-reload SSE server listening on http://localhost:${ PORT }`
	);
	console.log( `Watching ${ BUILD_DIR } for changes…` );

	installMuPlugin();
} );

// --- File watcher ---------------------------------------------------------

let debounceTimer;
const pendingChanges = new Set();

watch( BUILD_DIR, {
	ignoreInitial: true,
	ignored: ( watchPath ) => {
		try {
			if ( statSync( watchPath ).isDirectory() ) {
				return false;
			}
		} catch {}
		return ! /\.(js|css)$/.test( watchPath );
	},
} ).on( 'all', ( event, watchPath ) => {
	const short = watchPath.replace( BUILD_DIR + '/', '' );
	pendingChanges.add( short );

	clearTimeout( debounceTimer );
	debounceTimer = setTimeout( () => {
		const files = Array.from( pendingChanges );
		pendingChanges.clear();

		console.log( `HMR → ${ files.join( ', ' ) } (${ event })` );

		const payload = JSON.stringify( { files } );
		for ( const client of clients ) {
			client.write( `data: ${ payload }\n\n` );
		}
	}, DEBOUNCE_MS );
} );

// --- Cleanup on exit ------------------------------------------------------

function cleanup() {
	removeMuPlugin();
	process.exit();
}

process.on( 'SIGINT', cleanup );
process.on( 'SIGTERM', cleanup );
