/**
 * External dependencies
 */
import clsx from 'clsx';

/**
 * WordPress dependencies
 */
import { useEntityProp, store as coreStore } from '@wordpress/core-data';
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	useCallback,
} from '@wordpress/element';
import { Placeholder, Spinner } from '@wordpress/components';
import { compose, useResizeObserver } from '@wordpress/compose';
import {
	withColors,
	ColorPalette,
	useBlockProps,
	useSettings,
	useInnerBlocksProps,
	__experimentalUseGradient,
	store as blockEditorStore,
	useBlockEditingMode,
} from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';
import { useSelect, useDispatch } from '@wordpress/data';
import { isBlobURL } from '@wordpress/blob';
import { store as noticesStore } from '@wordpress/notices';
import { getBlockBindingsSource } from '@wordpress/blocks';

/**
 * Internal dependencies
 */
import {
	attributesFromMedia,
	IMAGE_BACKGROUND_TYPE,
	VIDEO_BACKGROUND_TYPE,
	EMBED_VIDEO_BACKGROUND_TYPE,
	dimRatioToClass,
	isContentPositionCenter,
	getPositionClassName,
	mediaPosition,
} from '../shared';
import CoverInspectorControls from './inspector-controls';
import CoverBlockControls from './block-controls';
import CoverPlaceholder from './cover-placeholder';
import ResizableCoverPopover from './resizable-cover-popover';
import {
	getMediaColor,
	compositeIsDark,
	DEFAULT_BACKGROUND_COLOR,
	DEFAULT_OVERLAY_COLOR,
} from './color-utils';
import { DEFAULT_MEDIA_SIZE_SLUG } from '../constants';
import { getIframeSrc, getBackgroundVideoSrc } from '../embed-video-utils';

function getInnerBlocksTemplate( attributes ) {
	return [
		[
			'core/paragraph',
			{
				style: {
					typography: {
						textAlign: 'center',
					},
				},
				placeholder: __( 'Write title…' ),
				...attributes,
			},
		],
	];
}

/**
 * Is the URL a temporary blob URL? A blob URL is one that is used temporarily while
 * the media (image or video) is being uploaded and will not have an id allocated yet.
 *
 * @param {number} id  The id of the media.
 * @param {string} url The url of the media.
 *
 * @return {boolean} Is the URL a Blob URL.
 */
const isTemporaryMedia = ( id, url ) => ! id && isBlobURL( url );

function CoverEdit( {
	attributes,
	clientId,
	isSelected,
	overlayColor,
	setAttributes,
	setOverlayColor,
	toggleSelection,
	context: { postId, postType },
} ) {
	const {
		contentPosition,
		id,
		url: originalUrl,
		backgroundType: originalBackgroundType,
		useFeaturedImage,
		dimRatio,
		focalPoint,
		hasParallax,
		isDark,
		isRepeated,
		minHeight,
		minHeightUnit,
		alt,
		allowedBlocks,
		templateLock,
		tagName: TagName = 'div',
		isUserOverlayColor,
		sizeSlug,
		poster,
		metadata,
	} = attributes;

	const [ featuredImage ] = useEntityProp(
		'postType',
		postType,
		'featured_media',
		postId
	);
	const { getSettings } = useSelect( blockEditorStore );

	const {
		__unstableMarkNextChangeAsNotPersistent,
		__unstableMarkLastChangeAsPersistent,
		updateBlockAttributes,
	} = useDispatch( blockEditorStore );
	const { media } = useSelect(
		( select ) => {
			return {
				media:
					featuredImage && useFeaturedImage
						? select( coreStore ).getEntityRecord(
								'postType',
								'attachment',
								featuredImage,
								{
									context: 'view',
								}
						  )
						: undefined,
			};
		},
		[ featuredImage, useFeaturedImage ]
	);
	const mediaUrl =
		media?.media_details?.sizes?.[ sizeSlug ]?.source_url ??
		media?.source_url;

	const { patternClientId, patternOverrides } = useSelect(
		( select ) => {
			const { getBlockAttributes, getBlockParentsByBlockName } =
				select( blockEditorStore );
			const [ parentPatternId ] = getBlockParentsByBlockName(
				clientId,
				'core/block',
				true
			);

			return {
				patternClientId: parentPatternId,
				patternOverrides:
					parentPatternId &&
					getBlockAttributes( parentPatternId )?.content,
			};
		},
		[ clientId ]
	);

	const hasImageBinding = !! metadata?.bindings?.url;
	const [ dimRatioInitialized, setDimRatioInitialized ] = useState( false );

	const { lockUrlControls = false } = useSelect(
		( select ) => {
			if ( ! isSelected ) {
				return {};
			}
			const { url: urlBinding } = metadata?.bindings || {};
			const urlBindingSource = getBlockBindingsSource(
				urlBinding?.source
			);
			return {
				lockUrlControls:
					!! urlBinding &&
					! urlBindingSource?.canUserEditValue?.( {
						select,
						context: { postId, postType },
						args: urlBinding?.args,
					} ),
			};
		},
		[ isSelected, metadata?.bindings, postId, postType ]
	);

	// Shared logic for updating overlay color based on image's average color.
	// Used by both featured image and bound URL effects below.
	const updateOverlayFromImage = useCallback(
		async ( imageUrl ) => {
			if ( ! imageUrl || isUserOverlayColor ) {
				return;
			}

			const averageBackgroundColor = await getMediaColor( imageUrl );

			let newOverlayColor = overlayColor.color;
			if ( ! isUserOverlayColor ) {
				newOverlayColor = averageBackgroundColor;
				__unstableMarkNextChangeAsNotPersistent();
				setOverlayColor( newOverlayColor );
			}

			const newIsDark = compositeIsDark(
				dimRatio,
				newOverlayColor,
				averageBackgroundColor
			);
			__unstableMarkNextChangeAsNotPersistent();
			setAttributes( {
				isDark: newIsDark,
				isUserOverlayColor: isUserOverlayColor || false,
			} );
		},
		// overlayColor.color is intentionally omitted to prevent unnecessary re-runs.
		[ isUserOverlayColor, dimRatio ]
	);

	// Update overlay color when featured image changes.
	// User can change the featured image outside of the block, so we need
	// to update the block when that happens.
	useEffect( () => {
		if ( useFeaturedImage ) {
			updateOverlayFromImage( mediaUrl );
		}
	}, [ mediaUrl, useFeaturedImage, updateOverlayFromImage ] );

	// Update overlay color when URL comes from a binding source.
	// This handles cases like pattern overrides or custom fields where
	// the URL changes without going through onSelectMedia.
	useEffect( () => {
		if ( hasImageBinding ) {
			updateOverlayFromImage( originalUrl );
		}
	}, [ originalUrl, hasImageBinding, updateOverlayFromImage ] );

	useEffect( () => {
		/**
		 * If the cover URL is bound (block bindings), disable `useFeaturedImage`
		 * and set `dimRatio` to 50. Otherwise, with no media selected,
		 * `dimRatio` defaults to 100 and the overlay fully obscures the image.
		 */
		if ( hasImageBinding ) {
			setAttributes( { useFeaturedImage: false } );
		}
		// Only set dimRatio to 50 once when binding is first detected with dimRatio at 100
		// This prevents blocking users from manually setting dimRatio to 100 later
		if ( hasImageBinding && dimRatio === 100 && ! dimRatioInitialized ) {
			setAttributes( { dimRatio: 50 } );
			setDimRatioInitialized( true );
		}
		// Reset the flag when binding is removed
		if ( ! hasImageBinding ) {
			setDimRatioInitialized( false );
		}
		// Set backgroundType to image when URL binding provides a URL
		if ( hasImageBinding && originalUrl && ! originalBackgroundType ) {
			setAttributes( { backgroundType: IMAGE_BACKGROUND_TYPE } );
		}
	}, [
		originalUrl,
		hasImageBinding,
		dimRatio,
		dimRatioInitialized,
		originalBackgroundType,
		setAttributes,
	] );

	// instead of destructuring the attributes
	// we define the url and background type
	// depending on the value of the useFeaturedImage flag
	// to preview in edit the dynamic featured image
	const url = useFeaturedImage
		? mediaUrl
		: // Ensure the url is not malformed due to sanitization through `wp_kses`.
		  originalUrl?.replaceAll( '&amp;', '&' );
	const backgroundType = useFeaturedImage
		? IMAGE_BACKGROUND_TYPE
		: originalBackgroundType;

	const { createErrorNotice } = useDispatch( noticesStore );
	const { gradientClass, gradientValue } = __experimentalUseGradient();

	const onSelectMedia = async ( newMedia ) => {
		const mediaAttributes = attributesFromMedia( newMedia );
		const isImage = [ newMedia?.type, newMedia?.media_type ].includes(
			IMAGE_BACKGROUND_TYPE
		);

		const averageBackgroundColor = await getMediaColor(
			isImage ? newMedia?.url : undefined
		);

		let newOverlayColor = overlayColor.color;
		if ( ! isUserOverlayColor ) {
			newOverlayColor = averageBackgroundColor;
			setOverlayColor( newOverlayColor );

			// Make undo revert the next setAttributes and the previous setOverlayColor.
			__unstableMarkNextChangeAsNotPersistent();
		}

		// Only set a new dimRatio if there was no previous media selected
		// to avoid resetting to 50 if it has been explicitly set to 100.
		// See issue #52835 for context.
		const newDimRatio =
			originalUrl === undefined && dimRatio === 100 ? 50 : dimRatio;

		const newIsDark = compositeIsDark(
			newDimRatio,
			newOverlayColor,
			averageBackgroundColor
		);

		if ( backgroundType === IMAGE_BACKGROUND_TYPE && mediaAttributes?.id ) {
			const { imageDefaultSize } = getSettings();

			// Try to use the previous selected image size if it's available
			// otherwise try the default image size or fallback to full size.
			if (
				sizeSlug &&
				( newMedia?.sizes?.[ sizeSlug ] ||
					newMedia?.media_details?.sizes?.[ sizeSlug ] )
			) {
				mediaAttributes.sizeSlug = sizeSlug;
				mediaAttributes.url =
					newMedia?.sizes?.[ sizeSlug ]?.url ||
					newMedia?.media_details?.sizes?.[ sizeSlug ]?.source_url;
			} else if (
				newMedia?.sizes?.[ imageDefaultSize ] ||
				newMedia?.media_details?.sizes?.[ imageDefaultSize ]
			) {
				mediaAttributes.sizeSlug = imageDefaultSize;
				mediaAttributes.url =
					newMedia?.sizes?.[ imageDefaultSize ]?.url ||
					newMedia?.media_details?.sizes?.[ imageDefaultSize ]
						?.source_url;
			} else {
				mediaAttributes.sizeSlug = DEFAULT_MEDIA_SIZE_SLUG;
			}
		}

		setAttributes( {
			...mediaAttributes,
			focalPoint: undefined,
			useFeaturedImage: undefined,
			dimRatio: newDimRatio,
			isDark: newIsDark,
			isUserOverlayColor: isUserOverlayColor || false,
		} );
	};

	const onClearMedia = () => {
		// Handle pattern overrides removal.
		const hasPatternOverride =
			metadata?.bindings?.__default?.source === 'core/pattern-overrides';
		const blockName = metadata?.name;

		if ( hasPatternOverride && blockName && patternClientId ) {
			const overrides = patternOverrides ?? {};
			if (
				overrides[ blockName ] &&
				Object.prototype.hasOwnProperty.call(
					overrides[ blockName ],
					'url'
				)
			) {
				__unstableMarkLastChangeAsPersistent();

				const newOverrides = { ...overrides };
				delete newOverrides[ blockName ];

				updateBlockAttributes( patternClientId, {
					content: Object.keys( newOverrides ).length
						? newOverrides
						: undefined,
				} );
				return; // Exit early, don't clear the url attribute
			}
		}

		let newOverlayColor = overlayColor.color;
		if ( ! isUserOverlayColor ) {
			newOverlayColor = DEFAULT_OVERLAY_COLOR;
			setOverlayColor( undefined );

			// Make undo revert the next setAttributes and the previous setOverlayColor.
			__unstableMarkNextChangeAsNotPersistent();
		}

		const newIsDark = compositeIsDark(
			dimRatio,
			newOverlayColor,
			DEFAULT_BACKGROUND_COLOR
		);

		setAttributes( {
			url: undefined,
			id: undefined,
			backgroundType: undefined,
			focalPoint: undefined,
			hasParallax: undefined,
			isRepeated: undefined,
			useFeaturedImage: undefined,
			isDark: newIsDark,
		} );
	};

	const onSetOverlayColor = async ( newOverlayColor ) => {
		const averageBackgroundColor = await getMediaColor( url );
		const newIsDark = compositeIsDark(
			dimRatio,
			newOverlayColor,
			averageBackgroundColor
		);

		setOverlayColor( newOverlayColor );

		// Make undo revert the next setAttributes and the previous setOverlayColor.
		__unstableMarkNextChangeAsNotPersistent();

		setAttributes( {
			isUserOverlayColor: true,
			isDark: newIsDark,
		} );
	};

	const onUpdateDimRatio = async ( newDimRatio ) => {
		const averageBackgroundColor = await getMediaColor( url );
		const newIsDark = compositeIsDark(
			newDimRatio,
			overlayColor.color,
			averageBackgroundColor
		);

		setAttributes( {
			dimRatio: newDimRatio,
			isDark: newIsDark,
		} );
	};

	const onUploadError = ( message ) => {
		createErrorNotice( message, { type: 'snackbar' } );
	};

	const onSelectEmbedUrl = ( embedUrl ) => {
		// Only set a new dimRatio if there was no previous media selected
		// to avoid resetting to 50 if it has been explicitly set to 100.
		const newDimRatio =
			originalUrl === undefined && dimRatio === 100 ? 50 : dimRatio;

		// Set initial attributes with URL
		setAttributes( {
			url: embedUrl,
			backgroundType: EMBED_VIDEO_BACKGROUND_TYPE,
			dimRatio: newDimRatio,
			id: undefined,
			focalPoint: undefined,
			hasParallax: undefined,
			isRepeated: undefined,
			useFeaturedImage: undefined,
		} );
	};

	// Fetch embed preview for embed videos
	const { embedPreview, isFetchingEmbed } = useSelect(
		( select ) => {
			if ( backgroundType !== EMBED_VIDEO_BACKGROUND_TYPE || ! url ) {
				return {
					embedPreview: undefined,
					isFetchingEmbed: false,
				};
			}

			const { getEmbedPreview, isRequestingEmbedPreview } =
				select( coreStore );

			return {
				embedPreview: getEmbedPreview( url ),
				isFetchingEmbed: isRequestingEmbedPreview( url ),
			};
		},
		[ url, backgroundType ]
	);

	// Compute embedSrc on-the-fly from embed preview for editor display
	const embedSrc = useMemo( () => {
		if (
			backgroundType !== EMBED_VIDEO_BACKGROUND_TYPE ||
			! embedPreview?.html
		) {
			return null;
		}

		// Extract iframe src from embed HTML
		const iframeSrc = getIframeSrc( embedPreview.html );
		if ( ! iframeSrc ) {
			return null;
		}

		// Modify the src to add background video parameters (provider auto-detected)
		return getBackgroundVideoSrc( iframeSrc );
	}, [ embedPreview, backgroundType ] );

	const isUploadingMedia = isTemporaryMedia( id, url );

	const isImageBackground = IMAGE_BACKGROUND_TYPE === backgroundType;
	const isVideoBackground = VIDEO_BACKGROUND_TYPE === backgroundType;
	const isEmbedVideoBackground =
		EMBED_VIDEO_BACKGROUND_TYPE === backgroundType;

	const blockEditingMode = useBlockEditingMode();
	const hasNonContentControls = blockEditingMode === 'default';

	const [ resizeListener, { height, width } ] = useResizeObserver();
	const resizableBoxDimensions = useMemo( () => {
		return {
			height: minHeightUnit === 'px' && minHeight ? minHeight : 'auto',
			width: 'auto',
		};
	}, [ minHeight, minHeightUnit ] );

	const minHeightWithUnit =
		minHeight && minHeightUnit
			? `${ minHeight }${ minHeightUnit }`
			: minHeight;

	const isImgElement = ! ( hasParallax || isRepeated );

	const style = {
		minHeight: minHeightWithUnit || undefined,
	};

	const backgroundImage = url ? `url(${ url })` : undefined;

	const backgroundPosition = mediaPosition( focalPoint );

	const bgStyle = { backgroundColor: overlayColor.color };
	const mediaStyle = {
		objectPosition:
			focalPoint && isImgElement
				? mediaPosition( focalPoint )
				: undefined,
	};

	const hasBackground = !! ( url || overlayColor.color || gradientValue );

	const hasInnerBlocks = useSelect(
		( select ) =>
			select( blockEditorStore ).getBlock( clientId ).innerBlocks.length >
			0,
		[ clientId ]
	);

	const ref = useRef();
	const blockProps = useBlockProps( { ref } );

	// Check for fontSize support before we pass a fontSize attribute to the innerBlocks.
	const [ fontSizes ] = useSettings( 'typography.fontSizes' );
	const hasFontSizes = fontSizes?.length > 0;
	const innerBlocksTemplate = getInnerBlocksTemplate( {
		fontSize: hasFontSizes ? 'large' : undefined,
	} );

	const innerBlocksProps = useInnerBlocksProps(
		{
			className: 'wp-block-cover__inner-container',
		},
		{
			// Avoid template sync when the `templateLock` value is `all` or `contentOnly`.
			// See: https://github.com/WordPress/gutenberg/pull/45632
			template: ! hasInnerBlocks ? innerBlocksTemplate : undefined,
			templateInsertUpdatesSelection: true,
			allowedBlocks,
			templateLock,
			dropZoneElement: ref.current,
		}
	);

	const mediaElement = useRef();
	const currentSettings = {
		isVideoBackground,
		isImageBackground,
		mediaElement,
		hasInnerBlocks,
		url,
		isImgElement,
		overlayColor,
	};

	const toggleUseFeaturedImage = async () => {
		const newUseFeaturedImage = ! useFeaturedImage;

		const averageBackgroundColor = newUseFeaturedImage
			? await getMediaColor( mediaUrl )
			: DEFAULT_BACKGROUND_COLOR;

		const newOverlayColor = ! isUserOverlayColor
			? averageBackgroundColor
			: overlayColor.color;

		if ( ! isUserOverlayColor ) {
			if ( newUseFeaturedImage ) {
				setOverlayColor( newOverlayColor );
			} else {
				setOverlayColor( undefined );
			}

			// Make undo revert the next setAttributes and the previous setOverlayColor.
			__unstableMarkNextChangeAsNotPersistent();
		}

		const newDimRatio = dimRatio === 100 ? 50 : dimRatio;
		const newIsDark = compositeIsDark(
			newDimRatio,
			newOverlayColor,
			averageBackgroundColor
		);

		setAttributes( {
			id: undefined,
			url: undefined,
			useFeaturedImage: newUseFeaturedImage,
			dimRatio: newDimRatio,
			backgroundType: useFeaturedImage
				? IMAGE_BACKGROUND_TYPE
				: undefined,
			isDark: newIsDark,
		} );
	};

	const blockControls = (
		<CoverBlockControls
			attributes={ attributes }
			setAttributes={ setAttributes }
			onSelectMedia={ onSelectMedia }
			onSelectEmbedUrl={ onSelectEmbedUrl }
			currentSettings={ currentSettings }
			toggleUseFeaturedImage={ toggleUseFeaturedImage }
			onClearMedia={ onClearMedia }
			blockEditingMode={ blockEditingMode }
			hasImageBinding={ hasImageBinding }
			lockUrlControls={ lockUrlControls }
		/>
	);

	const inspectorControls = (
		<CoverInspectorControls
			attributes={ attributes }
			setAttributes={ setAttributes }
			clientId={ clientId }
			setOverlayColor={ onSetOverlayColor }
			coverRef={ ref }
			currentSettings={ currentSettings }
			toggleUseFeaturedImage={ toggleUseFeaturedImage }
			updateDimRatio={ onUpdateDimRatio }
			onClearMedia={ onClearMedia }
			featuredImage={ media }
			hasImageBinding={ hasImageBinding }
		/>
	);

	const resizableCoverProps = {
		className: 'block-library-cover__resize-container',
		clientId,
		height,
		minHeight: minHeightWithUnit,
		onResizeStart: () => {
			setAttributes( { minHeightUnit: 'px' } );
			toggleSelection( false );
		},
		onResize: ( value ) => {
			setAttributes( { minHeight: value } );
		},
		onResizeStop: ( newMinHeight ) => {
			toggleSelection( true );
			setAttributes( { minHeight: newMinHeight } );
		},
		// Hide the resize handle if an aspect ratio is set, as the aspect ratio takes precedence.
		showHandle: ! attributes.style?.dimensions?.aspectRatio,
		size: resizableBoxDimensions,
		width,
	};

	if ( ! useFeaturedImage && ! hasInnerBlocks && ! hasBackground ) {
		return (
			<>
				{ blockControls }
				{ inspectorControls }
				{ hasNonContentControls && isSelected && (
					<ResizableCoverPopover { ...resizableCoverProps } />
				) }
				<TagName
					{ ...blockProps }
					className={ clsx( 'is-placeholder', blockProps.className ) }
					style={ {
						...blockProps.style,
						minHeight: minHeightWithUnit || undefined,
					} }
				>
					{ resizeListener }
					<CoverPlaceholder
						onSelectMedia={ onSelectMedia }
						onError={ onUploadError }
						toggleUseFeaturedImage={ toggleUseFeaturedImage }
					>
						<div className="wp-block-cover__placeholder-background-options">
							<ColorPalette
								disableCustomColors
								value={ overlayColor.color }
								onChange={ onSetOverlayColor }
								clearable={ false }
								asButtons
								aria-label={ __( 'Overlay color' ) }
							/>
						</div>
					</CoverPlaceholder>
				</TagName>
			</>
		);
	}

	const classes = clsx(
		{
			'is-dark-theme': isDark,
			'is-light': ! isDark,
			'is-transient': isUploadingMedia,
			'has-parallax': hasParallax,
			'is-repeated': isRepeated,
			'has-custom-content-position':
				! isContentPositionCenter( contentPosition ),
		},
		getPositionClassName( contentPosition )
	);

	const showOverlay =
		url || ! useFeaturedImage || ( useFeaturedImage && ! url );

	return (
		<>
			{ blockControls }
			{ inspectorControls }
			<TagName
				{ ...blockProps }
				className={ clsx( classes, blockProps.className ) }
				style={ { ...style, ...blockProps.style } }
				data-url={ url }
			>
				{ resizeListener }

				{ ! url && useFeaturedImage && (
					<Placeholder
						className="wp-block-cover__image--placeholder-image"
						withIllustration
					/>
				) }

				{ url &&
					isImageBackground &&
					( isImgElement ? (
						<img
							ref={ mediaElement }
							className="wp-block-cover__image-background"
							alt={ alt }
							src={ url }
							style={ mediaStyle }
						/>
					) : (
						<div
							ref={ mediaElement }
							role={ alt ? 'img' : undefined }
							aria-label={ alt ? alt : undefined }
							className={ clsx(
								classes,
								'wp-block-cover__image-background'
							) }
							style={ { backgroundImage, backgroundPosition } }
						/>
					) ) }
				{ url && isVideoBackground && (
					<video
						ref={ mediaElement }
						className="wp-block-cover__video-background"
						autoPlay
						muted
						loop
						src={ url }
						poster={ poster }
						style={ mediaStyle }
					/>
				) }
				{ isEmbedVideoBackground && embedSrc && (
					<div
						ref={ mediaElement }
						className="wp-block-cover__video-background wp-block-cover__embed-background"
						style={ mediaStyle }
					>
						<iframe
							src={ embedSrc }
							title="Background video"
							frameBorder="0"
							allow="autoplay; fullscreen"
						/>
					</div>
				) }
				{ isEmbedVideoBackground && ! embedSrc && isFetchingEmbed && (
					<Spinner />
				) }

				{ showOverlay && (
					<span
						aria-hidden="true"
						className={ clsx(
							'wp-block-cover__background',
							dimRatioToClass( dimRatio ),
							{
								[ overlayColor.class ]: overlayColor.class,
								'has-background-dim': dimRatio !== undefined,
								// For backwards compatibility. Former versions of the Cover Block applied
								// `.wp-block-cover__gradient-background` in the presence of
								// media, a gradient and a dim.
								'wp-block-cover__gradient-background':
									url && gradientValue && dimRatio !== 0,
								'has-background-gradient': gradientValue,
								[ gradientClass ]: gradientClass,
							}
						) }
						style={ { backgroundImage: gradientValue, ...bgStyle } }
					/>
				) }

				{ isUploadingMedia && <Spinner /> }

				<CoverPlaceholder
					disableMediaButtons
					onSelectMedia={ onSelectMedia }
					onError={ onUploadError }
					toggleUseFeaturedImage={ toggleUseFeaturedImage }
				/>
				<div { ...innerBlocksProps } />
			</TagName>
			{ hasNonContentControls && isSelected && (
				<ResizableCoverPopover { ...resizableCoverProps } />
			) }
		</>
	);
}

export default compose( [
	withColors( { overlayColor: 'background-color' } ),
] )( CoverEdit );
