/**
 * Pre-wired `expo-image` variants of the components.
 *
 * ```tsx
 * import { Gallery, ZoomableImage } from 'react-native-viewfinder/expo-image';
 * ```
 *
 * Importing from this path gives you blurhash placeholders, progressive
 * decoding and `expo-image`'s disk cache without passing `ImageComponent`
 * yourself. It is a separate entry point rather than runtime detection because
 * Metro resolves imports at bundle time: a `try`/`catch` around
 * `require('expo-image')` would make an app *without* `expo-image` fail to
 * bundle, and the `catch` would never run. See docs/DECISIONS.md D-009.
 *
 * Only reach for this path if `expo-image` is installed. Everything else in the
 * library works without it.
 */
import { Image } from 'expo-image';
import { forwardRef } from 'react';
import { Gallery as BaseGallery } from './components/Gallery';
import { ZoomableImage as BaseZoomableImage } from './components/ZoomableImage';
import type {
  GalleryProps,
  GalleryRef,
  ImageComponentProps,
  ZoomableImageProps,
  ZoomableImageRef,
} from './types';

const ExpoImage = Image as unknown as React.ComponentType<ImageComponentProps>;

/** {@link BaseGallery} with `expo-image` as the renderer. */
export const Gallery = forwardRef<GalleryRef, GalleryProps>(
  function ExpoImageGallery(props, ref) {
    return <BaseGallery ImageComponent={ExpoImage} {...props} ref={ref} />;
  }
);

/** {@link BaseZoomableImage} with `expo-image` as the renderer. */
export const ZoomableImage = forwardRef<ZoomableImageRef, ZoomableImageProps>(
  function ExpoImageZoomableImage(props, ref) {
    return (
      <BaseZoomableImage ImageComponent={ExpoImage} {...props} ref={ref} />
    );
  }
);

export type * from './types';
