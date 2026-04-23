/**
 * WordPress dependencies
 */
import { Page } from '@wordpress/admin-ui';
import { __ } from '@wordpress/i18n';
import { lazy, Suspense } from '@wordpress/element';
import type { ComponentType } from '@wordpress/element';

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY DEMO — DELETE WHEN THE WIDGET RENDERING ENGINE LANDS.
// This file hardcodes a single widget (`hello-world`) behind a Suspense
// boundary just to prove the end-to-end pipeline (wp-build → script module →
// import map → dynamic import). The real implementation will ship a generic
// widget renderer driven by layout state, not a hardcoded import.
// ─────────────────────────────────────────────────────────────────────────────

// Opaque to the bundler; resolved at runtime via the WordPress import map.
const importFromImportMap = new Function(
	'specifier',
	'return import( specifier );'
) as ( specifier: string ) => Promise< { default: ComponentType } >;

const HelloWorldWidget = lazy( () => {
	// eslint-disable-next-line no-console
	console.log( 'importing `hello-world` widget' );
	return importFromImportMap( 'wp/widgets/hello-world/render' );
} );

function Dashboard() {
	return (
		<Page title={ __( 'Dashboard' ) } headingLevel={ 1 }>
			<div className="dashboard-widgets">
				<Suspense fallback={ <p>{ __( 'Loading widget…' ) }</p> }>
					<HelloWorldWidget />
				</Suspense>
			</div>
		</Page>
	);
}

export const stage = Dashboard;
