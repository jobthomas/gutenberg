// @ts-nocheck
/**
 * Browser-side HMR client.
 *
 * Connects to the live-reload SSE server and handles hot updates:
 * - JS changes: reloads bundles via new <script> tags, then calls
 *   performReactRefresh(). Falls back to full reload if no React
 *   components were updated.
 * - CSS changes: swaps <link> stylesheets with cache-busted URLs.
 */
( function () {
	'use strict';

	var PORT = 35729;
	var BATCH_MS = 200;
	var runtime = window.__hmr_runtime;

	if ( ! runtime ) {
		console.warn( '[HMR] react-refresh runtime not found, falling back to full reload' );
	}

	var source = new EventSource( 'http://localhost:' + PORT + '/events' );
	var pendingFiles = [];
	var batchTimer = null;

	source.onopen = function () {
		console.log( '[HMR] Connected' );
	};

	source.onerror = function () {
		console.warn( '[HMR] Connection lost, will retry...' );
	};

	source.onmessage = function ( event ) {
		var data;
		try {
			data = JSON.parse( event.data );
		} catch ( e ) {
			return;
		}

		if ( ! data.files || ! data.files.length ) {
			return;
		}

		for ( var i = 0; i < data.files.length; i++ ) {
			pendingFiles.push( data.files[ i ] );
		}

		clearTimeout( batchTimer );
		batchTimer = setTimeout( processBatch, BATCH_MS );
	};

	function processBatch() {
		var files = pendingFiles.slice();
		pendingFiles = [];

		var jsFiles = [];
		var cssFiles = [];

		for ( var i = 0; i < files.length; i++ ) {
			var file = files[ i ];
			if ( /\.css$/.test( file ) ) {
				cssFiles.push( file );
			} else if ( /\.js$/.test( file ) ) {
				// Only handle non-minified bundles (index.js, not index.min.js)
				if ( ! /\.min\.js$/.test( file ) ) {
					jsFiles.push( file );
				}
			}
		}

		// Handle CSS hot swap
		for ( var c = 0; c < cssFiles.length; c++ ) {
			swapCSS( cssFiles[ c ] );
		}

		// Handle JS hot update
		if ( jsFiles.length > 0 ) {
			if ( ! runtime ) {
				console.log( '[HMR] No runtime, full reload' );
				window.location.reload();
				return;
			}
			hotUpdateJS( jsFiles );
		}
	}

	/**
	 * Swap a CSS stylesheet by finding its <link> and updating the href.
	 *
	 * @param {string} filePath Relative path under build/ (e.g. "styles/components/style.css")
	 */
	function swapCSS( filePath ) {
		var links = document.querySelectorAll( 'link[rel="stylesheet"]' );
		for ( var i = 0; i < links.length; i++ ) {
			var href = links[ i ].getAttribute( 'href' );
			if ( ! href ) {
				continue;
			}

			// Match by the file path portion (strip query strings from existing href)
			var hrefBase = href.split( '?' )[ 0 ];
			if ( hrefBase.indexOf( filePath ) !== -1 ) {
				var newHref = hrefBase + '?hmr=' + Date.now();
				links[ i ].setAttribute( 'href', newHref );
				console.log( '[HMR] CSS updated: ' + filePath );
				return;
			}
		}
		console.log( '[HMR] CSS link not found for: ' + filePath + ', full reload' );
		window.location.reload();
	}

	/**
	 * Hot-update JS bundles by loading them via new <script> tags,
	 * then calling performReactRefresh().
	 *
	 * @param {string[]} filePaths Array of relative paths under build/
	 */
	function hotUpdateJS( filePaths ) {
		var loaded = 0;
		var total = filePaths.length;
		var hasError = false;

		function onAllLoaded() {
			if ( hasError ) {
				return; // Error handler already triggered reload
			}

			try {
				var result = runtime.performReactRefresh();
				if ( result === null || result === undefined ) {
					console.log( '[HMR] No React components changed, full reload' );
					window.location.reload();
				} else {
					console.log( '[HMR] React components refreshed' );
				}
			} catch ( e ) {
				console.error( '[HMR] React refresh failed:', e );
				window.location.reload();
			}
		}

		for ( var i = 0; i < filePaths.length; i++ ) {
			loadScript( filePaths[ i ], function () {
				loaded++;
				if ( loaded === total ) {
					onAllLoaded();
				}
			}, function ( failedPath ) {
				if ( ! hasError ) {
					hasError = true;
					console.error( '[HMR] Script load error: ' + failedPath + ', full reload' );
					window.location.reload();
				}
			} );
		}
	}

	/**
	 * Load a JS bundle by finding the original <script> tag and creating
	 * a new one with a cache-busted URL.
	 *
	 * @param {string}   filePath  Relative path under build/ (e.g. "scripts/edit-site/index.js")
	 * @param {Function} onLoad    Called on successful load.
	 * @param {Function} onError   Called with filePath on error.
	 */
	function loadScript( filePath, onLoad, onError ) {
		// Find the original script tag
		var scripts = document.querySelectorAll( 'script[src]' );
		var originalSrc = null;

		for ( var i = 0; i < scripts.length; i++ ) {
			var src = scripts[ i ].getAttribute( 'src' );
			if ( ! src ) {
				continue;
			}
			var srcBase = src.split( '?' )[ 0 ];
			if ( srcBase.indexOf( filePath ) !== -1 ) {
				originalSrc = srcBase;
				break;
			}
		}

		if ( ! originalSrc ) {
			console.log( '[HMR] Script tag not found for: ' + filePath + ', full reload' );
			window.location.reload();
			return;
		}

		var script = document.createElement( 'script' );
		script.src = originalSrc + '?hmr=' + Date.now();
		script.onload = onLoad;
		script.onerror = function () {
			onError( filePath );
		};
		document.head.appendChild( script );
		console.log( '[HMR] Loading: ' + filePath );
	}
} )();
