/**
 * esbuild plugin that applies react-refresh/babel transform to source files
 * during IIFE bundling. This enables React Fast Refresh (hot module replacement)
 * for development mode.
 *
 * The plugin registers per-file $RefreshReg$ and $RefreshSig$ bindings that
 * connect to window.__hmr_runtime (the react-refresh runtime).
 *
 * Designed to be a no-op if @babel/core or react-refresh are not installed,
 * so wp-build remains usable by other projects.
 */

/**
 * Create the react-refresh esbuild plugin.
 *
 * @param {string} packagesDir Absolute path to the packages directory,
 *                             used to compute stable module IDs.
 * @return {Object} esbuild plugin.
 */
export function reactRefreshPlugin( packagesDir ) {
	let babel;
	let available = null; // null = not checked, true/false after check

	return {
		name: 'react-refresh',
		setup( build ) {
			// Only process files in the default namespace (skip external namespaces).
			build.onLoad(
				{ filter: /\.[jt]sx?$/, namespace: '' },
				async ( args ) => {
					// Lazy-check dependencies on first call.
					if ( available === null ) {
						try {
							babel = ( await import( '@babel/core' ) ).default;
							// Verify react-refresh/babel is importable.
							await import( 'react-refresh/babel' );
							available = true;
						} catch {
							available = false;
						}
					}

					if ( ! available ) {
						return null; // Let esbuild handle normally.
					}

					const { readFile } = await import( 'fs/promises' );
					const { relative } = await import( 'path' );

					const code = await readFile( args.path, 'utf8' );

					// Compute a stable module ID from the file path relative to packages/.
					const moduleId = relative( packagesDir, args.path )
						.replace( /\\/g, '/' )
						.replace( /\.[jt]sx?$/, '' );

					const result = babel.transformSync( code, {
						filename: args.path,
						ast: false,
						sourceMaps: 'inline',
						plugins: [
							[
								'react-refresh/babel',
								{ skipEnvCheck: true },
							],
						],
						// Don't load any config files - only use the plugin above.
						configFile: false,
						babelrc: false,
					} );

					if ( ! result || ! result.code ) {
						return null;
					}

					// Prepend per-file $RefreshReg$ / $RefreshSig$ bindings.
					const moduleIdStr = JSON.stringify( moduleId );
					const preamble = `var $RefreshSig$ = window.__hmr_runtime` +
						` ? window.__hmr_runtime.createSignatureFunctionForTransform` +
						` : function() { return function(t) { return t; }; };\n` +
						`var $RefreshReg$ = window.__hmr_runtime` +
						` ? function(type, id) { window.__hmr_runtime.register(type, ${ moduleIdStr } + " " + id); }` +
						` : function() {};\n`;

					return {
						contents: preamble + result.code,
						loader: 'jsx',
					};
				}
			);
		},
	};
}
