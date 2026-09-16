export { Gallery } from './components/Gallery';
export { ImageCropper } from './components/ImageCropper';
export { ZoomableImage } from './components/ZoomableImage';

/** Standard photographic aspect ratios, for a crop toolbar. */
export { ASPECT_PRESETS } from './core/crop';

/**
 * Whether the installed Gesture Handler exposes its v3 hook API.
 *
 * The library works either way — this is exported for diagnostics, so you can
 * confirm which path is active when reporting a gesture issue.
 */
export { HAS_HOOK_GESTURE_API } from './compat/gestures';

export type {
  AspectRatio,
  CropHandle,
  CropRect,
  CropResult,
  CropToolbarContext,
  GalleryImage,
  GalleryProps,
  GalleryRef,
  GalleryRenderContext,
  ImageComponentProps,
  ImageInput,
  ImageCropperProps,
  ImageCropperRef,
  ImageLoadState,
  ImageRenderer,
  ImageSource,
  Rect,
  Rotation,
  ItemRenderContext,
  ReduceMotionSetting,
  Size,
  Transform,
  Vector,
  ZoomableImageProps,
  ZoomableImageRef,
  ZoomBehaviourProps,
} from './types';
