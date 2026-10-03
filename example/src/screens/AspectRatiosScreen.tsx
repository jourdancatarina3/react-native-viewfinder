import { Gallery } from 'react-native-image-viewfinder';
import { ASPECT_RATIOS } from '../data/photos';

/**
 * An inline gallery over the aspect-ratio matrix.
 *
 * `presentation="inline"` renders in place with no modal, which is what you
 * want when the gallery *is* the screen. Swipe through to check that a 5:1
 * panorama, a 1:5 column and a single pixel all fit without layout bugs.
 */
export function AspectRatiosScreen() {
  return (
    <Gallery
      images={ASPECT_RATIOS}
      presentation="inline"
      doubleTapMaxDelay={700}
      testID="aspect-gallery"
    />
  );
}
