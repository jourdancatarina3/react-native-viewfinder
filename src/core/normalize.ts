import type { GalleryImage, ImageInput, ImageSource } from '../types';

/**
 * Widens the shorthand accepted by `images` into the single shape the rest of
 * the library works with.
 *
 * Accepting bare strings is what makes the one-line case possible
 * (`images={['https://…']}`), but every layer below this should only ever see a
 * normalised {@link GalleryImage}.
 */
export function normalizeImage(input: ImageInput): GalleryImage {
  if (typeof input === 'string' || typeof input === 'number') {
    return { source: input };
  }

  // A `{ uri }` object is ambiguous: it is a valid ImageSource *and* looks like
  // a partial GalleryImage. Disambiguate on the presence of `source`.
  if ('source' in input) {
    return input as GalleryImage;
  }

  const source = input as Extract<ImageSource, { uri: string }>;
  return {
    source,
    // A `{ uri, width, height }` source carries its natural size; lift it so the
    // layout can use it without re-reading the source shape.
    ...(typeof source.width === 'number' ? { width: source.width } : null),
    ...(typeof source.height === 'number' ? { height: source.height } : null),
  };
}

/** Normalises a whole list. Returns a stable empty array for empty input. */
export function normalizeImages(
  inputs: readonly ImageInput[] | null | undefined
): GalleryImage[] {
  if (!inputs || inputs.length === 0) {
    return [];
  }
  return inputs.map(normalizeImage);
}

/**
 * Converts an {@link ImageSource} into the `source` prop shape that React
 * Native's `Image` and `expo-image` both accept.
 */
export function toImageSourceProp(
  source: ImageSource
): { uri: string; headers?: Record<string, string> } | number {
  if (typeof source === 'number') {
    return source;
  }
  if (typeof source === 'string') {
    return { uri: source };
  }
  return source.headers
    ? { uri: source.uri, headers: source.headers }
    : { uri: source.uri };
}

/**
 * A stable identity for an item, used as its React key.
 *
 * Prefers an explicit `key`, then the URI (stable across reorders), and falls
 * back to the index for bundler assets, which have no natural string identity.
 */
export function itemKey(item: GalleryImage, index: number): string {
  if (typeof item.key === 'string') {
    return item.key;
  }
  const { source } = item;
  if (typeof source === 'string') {
    return source;
  }
  if (typeof source === 'object' && typeof source.uri === 'string') {
    return source.uri;
  }
  return `image-${index}`;
}

/**
 * The natural size of an item, if it is known without decoding the image.
 *
 * Returns `null` when the size has to be measured — the caller then shows the
 * placeholder until `Image.getSize` or the component's `onLoad` reports it.
 */
export function knownSize(
  item: GalleryImage
): { width: number; height: number } | null {
  if (
    typeof item.width === 'number' &&
    typeof item.height === 'number' &&
    item.width > 0 &&
    item.height > 0
  ) {
    return { width: item.width, height: item.height };
  }
  return null;
}
