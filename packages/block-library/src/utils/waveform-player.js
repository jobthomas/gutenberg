/**
 * WordPress dependencies
 */
import { useRef } from '@wordpress/element';
import { useRefEffect } from '@wordpress/compose';

/**
 * Internal dependencies
 */
import { initWaveformPlayer } from './waveform-utils';
import {
	getEffectiveBackgroundColor,
	getProgressBackgroundColor,
} from '../playlist/utils';

/**
 * A reusable WaveformPlayer component for the block editor.
 *
 * Renders an audio waveform visualization with dual layers (base + hover),
 * time elements, control buttons, and progress background.
 * Automatically inherits colors from the parent block's text color.
 *
 * @param {Object}   props                        - Component props.
 * @param {string}   props.src                    - The audio file URL.
 * @param {string}   props.title                  - The track title.
 * @param {string}   props.artist                 - The artist name.
 * @param {string}   props.album                  - The album name.
 * @param {string}   props.image                  - The artwork image URL.
 * @param {string}   props.visualizationStyle     - Waveform style (bars, mirror, etc).
 * @param {boolean}  props.showProgressBackground - Whether to show progress background.
 * @param {string}   props.progressColor          - Custom progress background color.
 * @param {Function} props.onEnded                - Callback when the track finishes playing.
 * @return {Element} The WaveformPlayer element.
 */
export function WaveformPlayer( {
	src,
	title,
	artist,
	album,
	image,
	visualizationStyle,
	showProgressBackground,
	progressColor,
	onEnded,
} ) {
	// Store onEnded in a ref so it doesn't need to be a useRefEffect dependency.
	// The callback changes reference on every render (its dependency chain
	// includes an unstable array), which would cause useRefEffect to destroy
	// and recreate the entire player on every re-render, making it disappear
	// during editor resizes.
	const onEndedRef = useRef( onEnded );
	onEndedRef.current = onEnded;

	const ref = useRefEffect(
		( element ) => {
			if ( ! src ) {
				return;
			}

			let cancelled = false;
			let playerDestroy;

			function init() {
				if ( cancelled ) {
					return;
				}

				// Compute colors from the element's position in the DOM.
				const bgColor = getEffectiveBackgroundColor( element );
				const progressBgColor =
					progressColor || getProgressBackgroundColor( bgColor );

				const player = initWaveformPlayer( element, {
					src,
					title,
					artist,
					album,
					image,
					visualizationStyle,
					showProgressBackground,
					progressBackgroundColor: progressBgColor,
					bgColor,
					onEnded: () => onEndedRef.current?.(),
				} );
				playerDestroy = player.destroy;
			}

			// Defer initialization so the element inherits the correct
			// text color, which is used to derive waveform colors. In the
			// editor iframe, theme styles (CSS custom properties) are
			// injected dynamically, so getComputedStyle may return the
			// default black on first render.
			// Using a requestAnimationFrame loop isn't sufficient to solve the issue.
			// TODO - find a better option than a setTimeout, so we're not relying on an arbitrary number.
			const timeoutId = setTimeout( init, 100 );

			return () => {
				cancelled = true;
				clearTimeout( timeoutId );
				playerDestroy?.();
			};
		},
		[
			src,
			title,
			artist,
			album,
			image,
			visualizationStyle,
			showProgressBackground,
			progressColor,
		]
	);

	return (
		<div
			ref={ ref }
			className="wp-block-playlist__waveform-player"
			data-waveform-style={ visualizationStyle || 'bars' }
		/>
	);
}
