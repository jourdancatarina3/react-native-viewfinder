import { Image } from 'expo-image';
import { Gallery } from 'react-native-viewfinder';
import { WITH_BLURHASH } from '../data/photos';

/**
 * `expo-image` supplying blurhash placeholders and progressive decoding.
 *
 * The only difference from every other screen is one prop. Drop
 * `ImageComponent` and these same items still work — the blurhashes are simply
 * ignored and you get the default spinner instead.
 */
export function ExpoImageScreen() {
  return (
    <Gallery
      images={WITH_BLURHASH}
      presentation="inline"
      ImageComponent={Image}
      testID="expo-image-gallery"
    />
  );
}
