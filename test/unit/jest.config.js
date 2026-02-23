/**
 * External dependencies
 */
const path = require( 'path' );
const glob = require( 'glob' ).sync;

/**
 * Path to root project directory.
 */
const ROOT_DIR = path.resolve( __dirname, '../..' );

// Ensure Babel config resolution works from the repo root,
// even when Jest runs from the workspace directory.
process.chdir( ROOT_DIR );

// Finds all packages which are transpiled with Babel to force Jest to use their source code.
const transpiledPackageNames = glob(
	path.join( ROOT_DIR, 'packages/*/src/index.{js,ts,tsx}' )
).map( ( fileName ) => {
	const relative = path.relative( ROOT_DIR, fileName );
	return relative.split( path.sep )[ 1 ];
} );

// Make sure the tests run in UTC timezone, regardless of the system timezone.
process.env.TZ = 'UTC';

module.exports = {
	rootDir: '../../',
	moduleNameMapper: {
		// Specific mappings first (before generic patterns)
		'@wordpress/vips/worker':
			'<rootDir>/test/unit/config/vips-worker-code-stub.js',
		'@wordpress/theme/design-tokens.js':
			'<rootDir>/packages/theme/src/prebuilt/js/design-tokens.mjs',
		'.+\\.wasm$': '<rootDir>/test/unit/config/wasm-stub.js',
		// Map deep paths (e.g., @wordpress/block-editor/src/hooks/list-view)
		[ `@wordpress\\/(${ transpiledPackageNames.join( '|' ) })\\/(.+)$` ]:
			'packages/$1/$2',
		// Then map exact package imports (e.g., @wordpress/compose)
		[ `@wordpress\\/(${ transpiledPackageNames.join( '|' ) })$` ]:
			'packages/$1/src',
	},
	preset: '@wordpress/jest-preset-default',
	testEnvironment: require.resolve( 'jest-environment-jsdom' ),
	setupFiles: [
		'<rootDir>/test/unit/config/global-mocks.js',
		'<rootDir>/test/unit/config/gutenberg-env.js',
	],
	setupFilesAfterEnv: [
		'<rootDir>/test/unit/config/testing-library.js',
		'<rootDir>/test/unit/mocks/match-media.js',
	],
	testEnvironmentOptions: {
		url: 'http://localhost/',
	},
	testPathIgnorePatterns: [
		'/.git/',
		'/node_modules/',
		'/packages/e2e-tests',
		'/packages/e2e-test-utils-playwright/src/test.ts',
		'<rootDir>/.*/build/',
		'<rootDir>/.*/build-module/',
		'<rootDir>/.*/build-types/',
		'<rootDir>/.+.d.ts$',
		'<rootDir>/.+.native.js$',
		'/packages/react-native-*',
	],
	resolver: '<rootDir>/test/unit/scripts/resolver.js',
	transform: {
		'^.+\\.m?[jt]sx?$': '<rootDir>/test/unit/scripts/babel-transformer.js',
	},
	transformIgnorePatterns: [
		'/node_modules/(?!(\\.store/.+/node_modules/)?(docker-compose|yaml|preact|@preact|parsel-js|comctx)/)',
		'\\.pnp\\.[^\\/]+$',
	],
	snapshotSerializers: [
		require.resolve( '@emotion/jest/serializer' ),
		require.resolve( 'snapshot-diff/serializer' ),
	],
	snapshotFormat: {
		escapeString: false,
		printBasicPrototype: false,
	},
	watchPlugins: [
		'jest-watch-typeahead/filename',
		'jest-watch-typeahead/testname',
	],
	reporters: [
		'default',
		'<rootDir>packages/scripts/config/jest-github-actions-reporter/index.js',
	],
};
