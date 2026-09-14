export { Gallery } from './components/Gallery';
export { ZoomableImage } from './components/ZoomableImage';

/**
 * Whether the installed Gesture Handler exposes its v3 hook API.
 *
 * The library works either way — this is exported for diagnostics, so you can
 * confirm which path is active when reporting a gesture issue.
 */
export { HAS_HOOK_GESTURE_API } from './compat/gestures';

export type {
  GalleryImage,
  GalleryProps,
  GalleryRef,
  GalleryRenderContext,
  ImageComponentProps,
  ImageInput,
  ImageLoadState,
  ImageSource,
  ItemRenderContext,
  ReduceMotionSetting,
  Size,
  Transform,
  Vector,
  ZoomableImageProps,
  ZoomableImageRef,
  ZoomBehaviourProps,
} from './types';
