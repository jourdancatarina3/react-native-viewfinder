// Imported from the pre-wired entry point rather than passing `ImageComponent`.
// Both work; this one also proves the subpath export resolves.
import { Gallery } from 'react-native-image-viewfinder/expo-image';
import { WITH_BLURHASH } from '../data/photos';

/**
 * `expo-image` supplying blurhash placeholders and progressive decoding.
 *
 * The only difference from every other screen is where `Gallery` is imported
 * from. Import it from `react-native-image-viewfinder` instead and these same items
 * still work — the blurhashes are ignored and you get the default spinner.
 */
export function ExpoImageScreen() {
  return (
    <Gallery
      images={WITH_BLURHASH}
      presentation="inline"
      doubleTapMaxDelay={700}
      testID="expo-image-gallery"
    />
  );
}
