<?php
/**
 * Block Bindings: Support for generically setting rich-text block attributes.
 *
 * @since 7.0
 * @package gutenberg
 * @subpackage Block Bindings
 */


// The following filter can be removed once the minimum required WordPress version is 6.9 or newer.
add_filter(
	'block_bindings_supported_attributes',
	function ( $attributes, $block_type ) {
		if ( 'core/cover' === $block_type && ! in_array( 'caption', $attributes, true ) ) {
			$attributes[] = 'url';
		}
		return $attributes;
	},
	10,
	2
);
