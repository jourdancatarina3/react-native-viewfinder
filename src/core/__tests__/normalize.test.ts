import {
  itemKey,
  knownSize,
  normalizeImage,
  normalizeImages,
  toImageSourceProp,
} from '../normalize';

describe('normalizeImage', () => {
  it('widens a bare URI string', () => {
    expect(normalizeImage('https://example.com/a.jpg')).toEqual({
      source: 'https://example.com/a.jpg',
    });
  });

  it('widens a bundler asset number', () => {
    expect(normalizeImage(42)).toEqual({ source: 42 });
  });

  it('widens a { uri } source object', () => {
    expect(normalizeImage({ uri: 'https://example.com/a.jpg' })).toEqual({
      source: { uri: 'https://example.com/a.jpg' },
    });
  });

  it('lifts a natural size off a source object so layout can use it', () => {
    const result = normalizeImage({
      uri: 'https://example.com/a.jpg',
      width: 1600,
      height: 900,
    });
    expect(result.width).toBe(1600);
    expect(result.height).toBe(900);
  });

  it('passes a full GalleryImage through untouched', () => {
    const item = {
      source: 'https://example.com/a.jpg',
      width: 100,
      height: 200,
      accessibilityLabel: 'A cat',
    };
    expect(normalizeImage(item)).toBe(item);
  });

  it('distinguishes a { uri } source from a GalleryImage by its `source` key', () => {
    // Both are objects; only the presence of `source` tells them apart.
    const asSource = normalizeImage({ uri: 'a.jpg' });
    const asItem = normalizeImage({ source: { uri: 'a.jpg' } });
    expect(asSource.source).toEqual({ uri: 'a.jpg' });
    expect(asItem.source).toEqual({ uri: 'a.jpg' });
  });

  it('preserves arbitrary user metadata', () => {
    const result = normalizeImage({
      source: 'a.jpg',
      caption: 'Taken in 2019',
      id: 7,
    });
    expect(result.caption).toBe('Taken in 2019');
    expect(result.id).toBe(7);
  });

  it('ignores a partial natural size', () => {
    const result = normalizeImage({ uri: 'a.jpg', width: 100 });
    expect(result.width).toBe(100);
    expect(result.height).toBeUndefined();
  });
});

describe('normalizeImages', () => {
  it('normalises a mixed list', () => {
    const result = normalizeImages([
      'https://a.jpg',
      { uri: 'https://b.jpg', width: 10, height: 20 },
      { source: 'https://c.jpg', accessibilityLabel: 'C' },
      99,
    ]);
    expect(result).toHaveLength(4);
    expect(result[0]!.source).toBe('https://a.jpg');
    expect(result[1]!.width).toBe(10);
    expect(result[2]!.accessibilityLabel).toBe('C');
    expect(result[3]!.source).toBe(99);
  });

  it('returns an empty array for empty input', () => {
    expect(normalizeImages([])).toEqual([]);
  });

  it('returns an empty array for null or undefined', () => {
    expect(normalizeImages(null)).toEqual([]);
    expect(normalizeImages(undefined)).toEqual([]);
  });
});

describe('toImageSourceProp', () => {
  it('passes a bundler asset through as a number', () => {
    expect(toImageSourceProp(7)).toBe(7);
  });

  it('wraps a string into a { uri } object', () => {
    expect(toImageSourceProp('https://a.jpg')).toEqual({
      uri: 'https://a.jpg',
    });
  });

  it('forwards headers when present', () => {
    expect(
      toImageSourceProp({
        uri: 'https://a.jpg',
        headers: { Authorization: 'Bearer x' },
      })
    ).toEqual({
      uri: 'https://a.jpg',
      headers: { Authorization: 'Bearer x' },
    });
  });

  it('omits the headers key entirely when there are none', () => {
    const result = toImageSourceProp({ uri: 'https://a.jpg' });
    expect(result).toEqual({ uri: 'https://a.jpg' });
    expect('headers' in (result as object)).toBe(false);
  });

  it('does not leak width/height into the source prop', () => {
    const result = toImageSourceProp({
      uri: 'https://a.jpg',
      width: 10,
      height: 20,
    });
    expect(result).toEqual({ uri: 'https://a.jpg' });
  });
});

describe('itemKey', () => {
  it('prefers an explicit key', () => {
    expect(itemKey({ source: 'a.jpg', key: 'custom' }, 3)).toBe('custom');
  });

  it('falls back to a string source', () => {
    expect(itemKey({ source: 'https://a.jpg' }, 3)).toBe('https://a.jpg');
  });

  it('falls back to the uri of a source object', () => {
    expect(itemKey({ source: { uri: 'https://a.jpg' } }, 3)).toBe(
      'https://a.jpg'
    );
  });

  it('falls back to the index for a bundler asset', () => {
    expect(itemKey({ source: 42 }, 3)).toBe('image-3');
  });

  it('is stable across reorders for uri-identified items', () => {
    const item = { source: 'https://a.jpg' };
    expect(itemKey(item, 0)).toBe(itemKey(item, 9));
  });
});

describe('knownSize', () => {
  it('returns the size when both dimensions are present', () => {
    expect(knownSize({ source: 'a.jpg', width: 100, height: 200 })).toEqual({
      width: 100,
      height: 200,
    });
  });

  it('returns null when either dimension is missing', () => {
    expect(knownSize({ source: 'a.jpg', width: 100 })).toBeNull();
    expect(knownSize({ source: 'a.jpg', height: 200 })).toBeNull();
    expect(knownSize({ source: 'a.jpg' })).toBeNull();
  });

  it('rejects non-positive dimensions', () => {
    expect(knownSize({ source: 'a.jpg', width: 0, height: 200 })).toBeNull();
    expect(knownSize({ source: 'a.jpg', width: -5, height: 200 })).toBeNull();
  });
});
