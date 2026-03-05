#!/usr/bin/env node
// @ts-nocheck

/**
 * Bundles react-refresh/runtime into build/hmr/react-refresh-runtime.js
 * as an IIFE that assigns to window.__hmr_runtime and calls
 * injectIntoGlobalHook(window).
 *
 * This script is run once at dev startup (before React loads).
 */

import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';

async function main() {
	const __dirname = path.dirname( fileURLToPath( import.meta.url ) );
	const ROOT_DIR = path.resolve( __dirname, '..', '..' );
	const OUTPUT_DIR = path.join( ROOT_DIR, 'build', 'hmr' );

	await mkdir( OUTPUT_DIR, { recursive: true } );

	await esbuild.build( {
		stdin: {
			contents: `
				import RefreshRuntime from 'react-refresh/runtime';
				RefreshRuntime.injectIntoGlobalHook( window );
				window.__hmr_runtime = RefreshRuntime;
			`,
			resolveDir: ROOT_DIR,
			loader: 'js',
		},
		outfile: path.join( OUTPUT_DIR, 'react-refresh-runtime.js' ),
		bundle: true,
		format: 'iife',
		platform: 'browser',
		minify: false,
	} );

	console.log( 'Built build/hmr/react-refresh-runtime.js' );
}

main();
