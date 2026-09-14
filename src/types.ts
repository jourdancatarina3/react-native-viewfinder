import type { ComponentType, ReactNode } from 'react';
import type {
  AccessibilityProps,
  ImageStyle,
  StyleProp,
  ViewStyle,
} from 'react-native';
import type { Transform } from './core/types';

export type { Size, Transform, Vector } from './core/types';

/**
 * Anything that can identify an image.
 *
 * A bare string is treated as a remote URI, which is what makes
 * `<Gallery images={['https://…', 'https://…']} />` work with no ceremony.
 * A number is a bundler asset from `require('./photo.jpg')`.
 */
export type ImageSource =
  | string
  | number
  | {
      uri: string;
      /** Natural width, if known. Saves a measurement round-trip. */
      width?: number;
      /** Natural height, if known. Saves a measurement round-trip. */
      height?: number;
      /** Sent with the request — useful for signed or authenticated URLs. */
      headers?: Record<string, string>;
      /** Passed through to `expo-image` for cache control. */
      cacheKey?: string;
    };

/**
 * A gallery entry with optional metadata.
 *
 * Supplying `width`/`height` lets the first frame be laid out correctly without
 * waiting for the image to decode, which removes the "pop" when a tall or wide
 * photo first appears.
 */
export type GalleryImage = {
  source: ImageSource;
  /** Natural width in pixels, if known ahead of time. */
  width?: number;
  /** Natural height in pixels, if known ahead of time. */
  height?: number;
  /**
   * Shown while the full image loads. A blurhash or thumbhash string when the
   * image component supports it (`expo-image` does), or a low-resolution URI.
   */
  placeholder?: string;
  /** Read aloud by screen readers in place of the image. */
  accessibilityLabel?: string;
  /** Stable identity for the item. Falls back to the resolved URI, then index. */
  key?: string;
  /** Anything else you want handed back to your render slots. */
  [key: string]: unknown;
};

/** Either shorthand — a bare source — or a full {@link GalleryImage}. */
export type ImageInput = ImageSource | GalleryImage;

/**
 * The props the library passes to whatever component renders an image.
 *
 * This is the contract to implement when writing your own renderer. React
 * Native's `Image`, `expo-image`'s `Image` and `FastImage` all accept these at
 * runtime, though their own prop types are broader — see {@link ImageRenderer}.
 */
export type ImageComponentProps = {
  source: { uri: string; headers?: Record<string, string> } | number;
  /**
   * Image styles rather than view styles: `expo-image` narrows `overflow` to
   * `visible | hidden`, so a `ViewStyle` here would not be assignable to it.
   */
  style?: StyleProp<ImageStyle>;
  /** React Native's `Image` fit mode; ignored by `expo-image`. */
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  /** `expo-image`'s equivalent of `resizeMode`; ignored by RN's `Image`. */
  contentFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  /** Blurhash, thumbhash or URI. Honoured by `expo-image`. */
  placeholder?: string | { uri: string } | null;
  onLoad?: (event: unknown) => void;
  onError?: (event: unknown) => void;
  accessible?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * A component that can draw an image for the library.
 *
 * Deliberately loose. The precise contract is {@link ImageComponentProps}, but
 * requiring an exact match would mean every real image library needed a cast:
 * `expo-image` types `source` as a union of thousands of members including
 * `undefined`, and `FastImage` has its own shape again. Neither is assignable
 * to a narrow prop type, even though both render correctly.
 *
 * The trade is deliberate: an escape hatch that demands a cast is not much of
 * an escape hatch. Implement {@link ImageComponentProps} and you get full
 * checking on your own component's props.
 */

export type ImageRenderer = ComponentType<any>;

/** How a transition should decide whether to animate. */
export type ReduceMotionSetting =
  /** Follow the OS accessibility setting. The default. */
  | 'system'
  /** Never animate, regardless of the OS setting. */
  | 'always'
  /** Always animate, even when the OS asks for reduced motion. */
  | 'never';

/** Load state of a single image. */
export type ImageLoadState = 'loading' | 'loaded' | 'error';

/** Context handed to per-item render slots. */
export type ItemRenderContext = {
  /** The normalised item. */
  item: GalleryImage;
  /** Its position in `images`. */
  index: number;
  /** Whether this is the page currently on screen. */
  isActive: boolean;
  /** Current load state. */
  state: ImageLoadState;
  /** Retry a failed load. No-op unless `state` is `'error'`. */
  retry: () => void;
};

/** Context handed to the header and footer slots. */
export type GalleryRenderContext = {
  /** The page currently on screen. */
  index: number;
  /** Total number of images. */
  count: number;
  /** The item currently on screen, or `undefined` for an empty gallery. */
  item: GalleryImage | undefined;
  /** Dismiss the gallery, running the close transition. */
  close: () => void;
  /** Jump to a page. */
  goToIndex: (index: number, options?: { animated?: boolean }) => void;
};

/** Behaviour shared by {@link ZoomableImageProps} and {@link GalleryProps}. */
export type ZoomBehaviourProps = {
  /**
   * Smallest scale, relative to the image's fitted size.
   * @defaultValue 1
   */
  minScale?: number;
  /**
   * Largest scale, relative to the image's fitted size.
   *
   * Raised automatically for large images so they can always be inspected at
   * their true pixel resolution — a 4000px-wide photo on a 400px screen gets a
   * ceiling of 10 even if you leave this at the default.
   * @defaultValue 6
   */
  maxScale?: number;
  /**
   * Scale stops a double-tap cycles through before returning to `minScale`.
   *
   * `[2.5]` toggles between fit and 2.5x. `[2, 4]` steps fit → 2x → 4x → fit.
   * @defaultValue [2.5]
   */
  doubleTapScales?: readonly number[];
  /**
   * Whether double-tapping zooms.
   * @defaultValue true
   */
  doubleTapToZoom?: boolean;
  /**
   * Whether pinching zooms.
   * @defaultValue true
   */
  pinchToZoom?: boolean;
  /**
   * Whether a zoomed image can be panned.
   * @defaultValue true
   */
  panEnabled?: boolean;
};

/** Imperative handle for {@link ZoomableImage}. */
export type ZoomableImageRef = {
  /** Animate back to fitted and centred. */
  reset: (options?: { animated?: boolean }) => void;
  /**
   * Zoom to a scale, optionally anchored on a point in container coordinates.
   * Defaults to the centre.
   */
  zoomTo: (
    scale: number,
    options?: { focal?: { x: number; y: number }; animated?: boolean }
  ) => void;
  /** Read the current transform. Useful for persisting view state. */
  getTransform: () => Transform;
};

export type ZoomableImageProps = ZoomBehaviourProps &
  Pick<AccessibilityProps, 'accessibilityHint'> & {
    /** The image to display. */
    source: ImageSource;
    /** Natural width, if known. Avoids a measurement round-trip. */
    width?: number;
    /** Natural height, if known. Avoids a measurement round-trip. */
    height?: number;
    /** Shown while loading. Blurhash/thumbhash with `expo-image`, or a URI. */
    placeholder?: string;
    /** Style for the container the image is measured against. */
    style?: StyleProp<ViewStyle>;
    /**
     * Component used to render the image.
     *
     * Defaults to React Native's `Image`. Pass `expo-image`'s `Image` for
     * blurhash placeholders and progressive decoding, or any component
     * accepting {@link ImageComponentProps}.
     *
     * @example
     * ```tsx
     * import { Image } from 'expo-image';
     * <ZoomableImage source={uri} ImageComponent={Image} />
     * ```
     */
    ImageComponent?: ImageRenderer;
    /** Replaces the default spinner shown while loading. */
    renderLoading?: () => ReactNode;
    /** Replaces the default message shown when loading fails. */
    renderError?: (retry: () => void) => ReactNode;
    /** Fires on every scale change, on the JS thread. */
    onZoomChange?: (scale: number) => void;
    /** Fires on a single tap that was not part of a double-tap. */
    onTap?: () => void;
    /** Fires when a double-tap zoom begins, with the scale being moved to. */
    onDoubleTap?: (targetScale: number) => void;
    /** Fires on a long press. */
    onLongPress?: () => void;
    /** Fires once the image has decoded. */
    onLoad?: () => void;
    /** Fires if the image fails to load. */
    onError?: () => void;
    /** Read aloud by screen readers. */
    accessibilityLabel?: string;
    /**
     * Whether transitions respect the OS "reduce motion" setting.
     * @defaultValue 'system'
     */
    reduceMotion?: ReduceMotionSetting;
    testID?: string;
  };

/** Imperative handle for {@link Gallery}. */
export type GalleryRef = {
  /** Animate to a page. */
  goToIndex: (index: number, options?: { animated?: boolean }) => void;
  /** Advance one page, if there is one. */
  next: (options?: { animated?: boolean }) => void;
  /** Go back one page, if there is one. */
  previous: (options?: { animated?: boolean }) => void;
  /** Reset the current page's zoom to fitted and centred. */
  reset: (options?: { animated?: boolean }) => void;
  /** Run the close transition and call `onClose`. */
  close: () => void;
  /** The page currently on screen. */
  getIndex: () => number;
};

export type GalleryProps = ZoomBehaviourProps & {
  /**
   * The images to show. Accepts bare URI strings, `require()` results, or
   * {@link GalleryImage} objects — you can mix them freely.
   *
   * @example
   * ```tsx
   * <Gallery images={['https://a.jpg', 'https://b.jpg']} />
   * ```
   */
  images: readonly ImageInput[];

  /**
   * Whether the gallery is on screen.
   *
   * Omit it to render inline — the gallery then fills its parent with no modal
   * and no backdrop, which is what you want when embedding it in a screen.
   * @defaultValue true
   */
  visible?: boolean;

  /**
   * Page to open on. Only read when the gallery becomes visible.
   * @defaultValue 0
   */
  initialIndex?: number;

  /**
   * Controls the current page. Supplying this makes the gallery controlled:
   * it will not change page on its own, so pair it with `onIndexChange`.
   */
  index?: number;

  /** Fires whenever the page changes, from a swipe or from the ref. */
  onIndexChange?: (index: number) => void;

  /**
   * Called after the close transition finishes — from the close button, a
   * swipe-to-dismiss, or the Android back button.
   */
  onClose?: () => void;

  /** Rendered above the images. Receives {@link GalleryRenderContext}. */
  renderHeader?: (context: GalleryRenderContext) => ReactNode;
  /** Rendered below the images. Receives {@link GalleryRenderContext}. */
  renderFooter?: (context: GalleryRenderContext) => ReactNode;
  /** Replaces the default spinner. */
  renderLoading?: (context: ItemRenderContext) => ReactNode;
  /** Replaces the default error message. */
  renderError?: (context: ItemRenderContext) => ReactNode;
  /**
   * Replaces the image entirely, keeping the zoom and paging behaviour. Use it
   * for video, PDF pages, or anything else that is not an image.
   */
  renderItem?: (context: ItemRenderContext) => ReactNode;

  /**
   * Component used to render each image. Defaults to React Native's `Image`.
   * @see {@link ZoomableImageProps.ImageComponent}
   */
  ImageComponent?: ImageRenderer;

  /**
   * Whether dragging vertically dismisses the gallery. Only ever active when
   * the current image is at its fitted size.
   * @defaultValue true
   */
  swipeToClose?: boolean;

  /**
   * Whether swiping horizontally changes page.
   * @defaultValue true
   */
  swipeEnabled?: boolean;

  /**
   * Gap between pages, in pixels.
   * @defaultValue 24
   */
  pageGap?: number;

  /**
   * Colour behind the images. Fades out as you drag to dismiss.
   * @defaultValue '#000000'
   */
  backdropColor?: string;

  /**
   * Whether to show the built-in "3 / 12" page indicator. Ignored when
   * `renderHeader` is supplied.
   * @defaultValue true
   */
  showPageIndicator?: boolean;

  /**
   * How many pages either side of the current one stay mounted.
   * @defaultValue 1
   */
  windowSize?: number;

  /** Fires on a single tap on the current image. */
  onTap?: (index: number) => void;
  /** Fires on a long press on the current image. */
  onLongPress?: (index: number) => void;
  /** Fires on every scale change of the current image, on the JS thread. */
  onZoomChange?: (scale: number, index: number) => void;

  /**
   * Whether transitions respect the OS "reduce motion" setting.
   * @defaultValue 'system'
   */
  reduceMotion?: ReduceMotionSetting;

  /**
   * Presentation when `visible` is used.
   *
   * `'modal'` renders in a native modal, so it covers navigation chrome and
   * handles the Android back button. `'inline'` renders in place, which is
   * what you want inside an existing screen or your own modal.
   * @defaultValue 'modal'
   */
  presentation?: 'modal' | 'inline';

  /** Style applied to the gallery container. */
  style?: StyleProp<ViewStyle>;

  testID?: string;
};
