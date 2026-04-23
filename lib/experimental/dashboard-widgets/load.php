<?php
/**
 * Bootstraps the Dashboard Widgets page in wp-admin.
 *
 * @package gutenberg
 */

add_action( 'admin_menu', 'gutenberg_register_dashboard_widgets_menu' );
add_action( 'dashboard_init', 'gutenberg_dashboard_widgets_register_demo_widget' );
add_action( 'dashboard-wp-admin_init', 'gutenberg_dashboard_widgets_register_demo_widget' );

/**
 * Registers the Dashboard Widgets menu item.
 */
function gutenberg_register_dashboard_widgets_menu() {
	add_menu_page(
		__( 'Dashboard (Beta)', 'gutenberg' ),
		__( 'Dashboard (Beta)', 'gutenberg' ),
		'read',
		'dashboard-wp-admin',
		'gutenberg_dashboard_wp_admin_render_page',
		'dashicons-dashboard',
		1
	);
}

/**
 * TEMPORARY DEMO — DELETE WHEN THE WIDGET RENDERING ENGINE LANDS.
 *
 * Wires the `hello-world` widget as a dynamic dep of the dashboard module
 * (via the route machinery, using a non-navigable path) so it lands in the
 * import map and `React.lazy` in the dashboard stage can resolve it.
 * The real implementation will wire widgets from layout state, not a
 * hardcoded demo registration.
 */
function gutenberg_dashboard_widgets_register_demo_widget() {
	$widget_module = 'wp/widgets/hello-world/render';

	if ( function_exists( 'gutenberg_register_dashboard_route' ) ) {
		gutenberg_register_dashboard_route( '/__widget_demo_hello_world', $widget_module );
	}

	if ( function_exists( 'gutenberg_register_dashboard_wp_admin_route' ) ) {
		gutenberg_register_dashboard_wp_admin_route( '/__widget_demo_hello_world', $widget_module );
	}
}
