import type { GalleryImage } from 'react-native-image-viewfinder';

/**
 * Fixtures for the demo screens.
 *
 * These are chosen to exercise the cases the library claims to handle rather
 * than to look pretty: the aspect-ratio extremes, a missing URL, a very slow
 * one, and a bundled local asset. `docs/EDGE_CASES.md` maps each one to the
 * behaviour it is meant to prove.
 */

/** picsum.photos serves deterministic images by id, at any size we ask for. */
function picsum(id: number, width: number, height: number) {
  return `https://picsum.photos/id/${id}/${width}/${height}`;
}

/** An ordinary set of landscape and portrait photos. */
export const PHOTOS: GalleryImage[] = [
  {
    source: picsum(1015, 2000, 1333),
    width: 2000,
    height: 1333,
    accessibilityLabel: 'A river running through a rocky canyon',
  },
  {
    source: picsum(1025, 1400, 1867),
    width: 1400,
    height: 1867,
    accessibilityLabel: 'A pug wrapped in a blanket',
  },
  {
    source: picsum(1039, 2000, 1333),
    width: 2000,
    height: 1333,
    accessibilityLabel: 'A waterfall seen from above',
  },
  {
    source: picsum(1043, 1400, 1867),
    width: 1400,
    height: 1867,
    accessibilityLabel: 'A skyscraper shot from street level',
  },
  {
    source: picsum(1053, 2000, 1333),
    width: 2000,
    height: 1333,
    accessibilityLabel: 'A winding road through farmland',
  },
  {
    source: picsum(1062, 2000, 1333),
    width: 2000,
    height: 1333,
    accessibilityLabel: 'Waves breaking on a rocky shore',
  },
];

/**
 * The aspect-ratio matrix.
 *
 * Every one of these has broken a gallery somewhere: panoramas that collapse to
 * a hairline, tall images that overflow, and 1×1 pixels that divide by zero.
 */
export const ASPECT_RATIOS: GalleryImage[] = [
  {
    source: picsum(1016, 1200, 1200),
    width: 1200,
    height: 1200,
    accessibilityLabel: 'Square, 1:1',
  },
  {
    source: picsum(1018, 4000, 800),
    width: 4000,
    height: 800,
    accessibilityLabel: 'Ultra-wide panorama, 5:1',
  },
  {
    source: picsum(1019, 600, 3000),
    width: 600,
    height: 3000,
    accessibilityLabel: 'Ultra-tall, 1:5',
  },
  {
    source: picsum(1020, 8000, 6000),
    width: 8000,
    height: 6000,
    accessibilityLabel: 'Very large, 8000px wide',
  },
  {
    source: 'https://placehold.co/1x1/png',
    width: 1,
    height: 1,
    accessibilityLabel: 'A single pixel, scaled up to fit',
  },
  {
    source: picsum(1024, 1600, 900),
    width: 1600,
    height: 900,
    accessibilityLabel: 'Widescreen, 16:9',
  },
];

/** Failure modes: a dead host, a 404, and a deliberately slow response. */
export const UNRELIABLE: GalleryImage[] = [
  {
    source: picsum(1035, 1600, 1067),
    width: 1600,
    height: 1067,
    accessibilityLabel: 'A photo that loads normally, for comparison',
  },
  {
    source: 'https://example.invalid/does-not-resolve.jpg',
    accessibilityLabel: 'A host that does not resolve',
  },
  {
    source: 'https://picsum.photos/this-path-does-not-exist.jpg',
    accessibilityLabel: 'A URL that returns 404',
  },
  {
    // httpbin holds the response open before sending anything.
    source: 'https://httpbin.org/delay/10',
    accessibilityLabel: 'A response delayed by ten seconds',
  },
];

/** Bundled assets alongside remote ones, to prove both resolve. */
export const MIXED_SOURCES: GalleryImage[] = [
  {
    source: require('../../assets/icon.png'),
    accessibilityLabel: 'A local bundled asset',
  },
  {
    source: picsum(1074, 1600, 1067),
    width: 1600,
    height: 1067,
    accessibilityLabel: 'A remote photo',
  },
  {
    source: require('../../assets/splash-icon.png'),
    accessibilityLabel: 'Another local bundled asset',
  },
  {
    source: { uri: picsum(1080, 1600, 1067), width: 1600, height: 1067 },
    accessibilityLabel: 'A remote photo given as a source object',
  },
];

/**
 * 120 images for the stress screen.
 *
 * Sizes are declared so the list can lay out without a measurement pass — the
 * point of the screen is to show that only the windowed pages are ever mounted.
 */
export const STRESS: GalleryImage[] = Array.from({ length: 120 }, (_, i) => {
  const id = 1000 + (i % 84);
  const portrait = i % 3 === 0;
  return {
    source: picsum(id, portrait ? 800 : 1200, portrait ? 1200 : 800),
    width: portrait ? 800 : 1200,
    height: portrait ? 1200 : 800,
    key: `stress-${i}`,
    accessibilityLabel: `Stress test photo ${i + 1} of 120`,
  };
});

/**
 * Blurhash placeholders, which only `expo-image` can render.
 *
 * With React Native's `Image` these are ignored and you get the spinner, which
 * is exactly the graceful degradation the library promises.
 */
export const WITH_BLURHASH: GalleryImage[] = [
  {
    source: picsum(1011, 1600, 1067),
    width: 1600,
    height: 1067,
    placeholder: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
    accessibilityLabel: 'A boat on a lake, with a blurhash placeholder',
  },
  {
    source: picsum(1012, 1600, 1067),
    width: 1600,
    height: 1067,
    placeholder: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
    accessibilityLabel: 'A person on a cliff, with a blurhash placeholder',
  },
  {
    source: picsum(1013, 1600, 1067),
    width: 1600,
    height: 1067,
    placeholder: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
    accessibilityLabel: 'A snowy mountain, with a blurhash placeholder',
  },
];

/** Thumbnail URL for a grid cell — small enough to keep scrolling cheap. */
export function thumbnailFor(item: GalleryImage, size = 300): string {
  const { source } = item;
  if (typeof source === 'string' && source.includes('picsum.photos/id/')) {
    return source.replace(/\/\d+\/\d+$/, `/${size}/${size}`);
  }
  if (typeof source === 'string') {
    return source;
  }
  if (typeof source === 'object' && 'uri' in source) {
    return source.uri;
  }
  return '';
}
