import {
  clamp,
  coverSize,
  fitSize,
  isUsableSize,
  nativeResolutionScale,
  resolveMaxScale,
  translationBounds,
} from '../geometry';

const PHONE = { width: 400, height: 800 };

describe('isUsableSize', () => {
  it('accepts a positive, finite size', () => {
    expect(isUsableSize({ width: 1, height: 1 })).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['zero width', { width: 0, height: 10 }],
    ['zero height', { width: 10, height: 0 }],
    ['negative width', { width: -10, height: 10 }],
    ['negative height', { width: 10, height: -10 }],
    ['NaN width', { width: NaN, height: 10 }],
    ['NaN height', { width: 10, height: NaN }],
    ['Infinite width', { width: Infinity, height: 10 }],
    ['Infinite height', { width: 10, height: Infinity }],
  ])('rejects %s', (_label, size) => {
    expect(isUsableSize(size as never)).toBe(false);
  });
});

describe('fitSize', () => {
  it('fits a landscape image to the container width', () => {
    // 1000x500 in 400x800 -> ratio limited by width: 400/1000 = 0.4
    expect(fitSize({ width: 1000, height: 500 }, PHONE)).toEqual({
      width: 400,
      height: 200,
    });
  });

  it('fits a portrait image to the container height', () => {
    // 500x1000 in 400x800 -> ratio limited by height: 800/1000 = 0.8
    expect(fitSize({ width: 500, height: 1000 }, PHONE)).toEqual({
      width: 400,
      height: 800,
    });
  });

  it('preserves the aspect ratio of a square image', () => {
    const fitted = fitSize({ width: 900, height: 900 }, PHONE);
    expect(fitted.width).toBe(fitted.height);
    expect(fitted.width).toBe(400);
  });

  it('scales a tiny image up to fill the container', () => {
    expect(fitSize({ width: 1, height: 1 }, PHONE)).toEqual({
      width: 400,
      height: 400,
    });
  });

  it('handles an ultra-wide panorama without collapsing', () => {
    const fitted = fitSize({ width: 12000, height: 1000 }, PHONE);
    expect(fitted.width).toBeCloseTo(400);
    expect(fitted.height).toBeCloseTo(33.333, 2);
    expect(fitted.height).toBeGreaterThan(0);
  });

  it('handles an ultra-tall image without collapsing', () => {
    const fitted = fitSize({ width: 1000, height: 12000 }, PHONE);
    expect(fitted.height).toBeCloseTo(800);
    expect(fitted.width).toBeCloseTo(66.667, 2);
    expect(fitted.width).toBeGreaterThan(0);
  });

  it('handles a very large image', () => {
    const fitted = fitSize({ width: 8000, height: 6000 }, PHONE);
    expect(fitted.width).toBe(400);
    expect(fitted.height).toBe(300);
  });

  it('never exceeds the container on either axis', () => {
    const contents = [
      { width: 8000, height: 6000 },
      { width: 1, height: 9000 },
      { width: 9000, height: 1 },
      { width: 399, height: 799 },
      { width: 401, height: 801 },
    ];
    for (const content of contents) {
      const fitted = fitSize(content, PHONE);
      expect(fitted.width).toBeLessThanOrEqual(PHONE.width + 1e-9);
      expect(fitted.height).toBeLessThanOrEqual(PHONE.height + 1e-9);
    }
  });

  it('returns a zero size for unmeasured input rather than NaN', () => {
    expect(fitSize({ width: 0, height: 0 }, PHONE)).toEqual({
      width: 0,
      height: 0,
    });
    expect(
      fitSize({ width: 100, height: 100 }, { width: 0, height: 0 })
    ).toEqual({ width: 0, height: 0 });
    expect(fitSize({ width: NaN, height: 10 }, PHONE)).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe('coverSize', () => {
  it('covers the container on both axes', () => {
    const covered = coverSize({ width: 1000, height: 500 }, PHONE);
    expect(covered.width).toBeGreaterThanOrEqual(PHONE.width);
    expect(covered.height).toBeGreaterThanOrEqual(PHONE.height);
  });

  it('is always at least as large as fitSize', () => {
    const content = { width: 1600, height: 900 };
    const fitted = fitSize(content, PHONE);
    const covered = coverSize(content, PHONE);
    expect(covered.width).toBeGreaterThanOrEqual(fitted.width);
    expect(covered.height).toBeGreaterThanOrEqual(fitted.height);
  });

  it('returns a zero size for unusable input', () => {
    expect(coverSize({ width: 0, height: 5 }, PHONE)).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe('translationBounds', () => {
  const base = { width: 400, height: 200 }; // a fitted landscape image

  it('is zero on both axes at rest', () => {
    expect(translationBounds(base, PHONE, 1)).toEqual({ x: 0, y: 0 });
  });

  it('grows on the x axis once the content is wider than the container', () => {
    // at scale 2: 800 wide vs 400 container -> (800-400)/2 = 200
    expect(translationBounds(base, PHONE, 2).x).toBe(200);
  });

  it('stays zero on an axis where the content is still smaller', () => {
    // at scale 2 the height is 400, still under the 800 container
    expect(translationBounds(base, PHONE, 2).y).toBe(0);
  });

  it('never returns a negative bound', () => {
    for (const scale of [0.1, 0.5, 1, 1.5, 3, 10]) {
      const bounds = translationBounds(base, PHONE, scale);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('increases monotonically with scale', () => {
    let previous = -1;
    for (const scale of [1, 2, 3, 4, 5]) {
      const { x } = translationBounds(base, PHONE, scale);
      expect(x).toBeGreaterThanOrEqual(previous);
      previous = x;
    }
  });

  it('falls back to a safe scale when given a bad one', () => {
    expect(translationBounds(base, PHONE, NaN)).toEqual({ x: 0, y: 0 });
    expect(translationBounds(base, PHONE, -3)).toEqual({ x: 0, y: 0 });
    expect(translationBounds(base, PHONE, 0)).toEqual({ x: 0, y: 0 });
  });

  it('returns zero bounds for an unmeasured container', () => {
    expect(translationBounds(base, { width: 0, height: 0 }, 3)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('clamp', () => {
  it('passes through values already in range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to each edge', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('handles the degenerate range where min equals max', () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });

  it('returns min for NaN rather than propagating it', () => {
    expect(clamp(NaN, 2, 8)).toBe(2);
  });

  it('handles infinities', () => {
    expect(clamp(Infinity, 0, 10)).toBe(10);
    expect(clamp(-Infinity, 0, 10)).toBe(0);
  });
});

describe('nativeResolutionScale', () => {
  it('is the factor between fitted and natural width', () => {
    // 1000x500 fits to 400x200, so 1:1 needs 2.5x
    expect(nativeResolutionScale({ width: 1000, height: 500 }, PHONE)).toBe(
      2.5
    );
  });

  it('is below 1 for an image smaller than the container', () => {
    expect(
      nativeResolutionScale({ width: 100, height: 100 }, PHONE)
    ).toBeCloseTo(0.25);
  });

  it('returns 1 for unusable sizes', () => {
    expect(nativeResolutionScale({ width: 0, height: 0 }, PHONE)).toBe(1);
    expect(
      nativeResolutionScale(
        { width: 100, height: 100 },
        { width: 0, height: 0 }
      )
    ).toBe(1);
  });
});

describe('resolveMaxScale', () => {
  it('uses the configured maximum for ordinary images', () => {
    expect(resolveMaxScale(6, { width: 800, height: 600 }, PHONE, 1)).toBe(6);
  });

  it('raises the ceiling so a large image reaches 1:1', () => {
    // 8000 wide fits to 400 -> needs 20x for 1:1, but the cap is 16
    expect(resolveMaxScale(6, { width: 8000, height: 6000 }, PHONE, 1)).toBe(
      16
    );
  });

  it('respects a custom native cap', () => {
    expect(
      resolveMaxScale(6, { width: 8000, height: 6000 }, PHONE, 1, 10)
    ).toBe(10);
  });

  it('never returns less than minScale', () => {
    expect(resolveMaxScale(0.5, { width: 100, height: 100 }, PHONE, 1)).toBe(1);
  });

  it('survives a nonsense configured maximum', () => {
    expect(resolveMaxScale(NaN, { width: 800, height: 600 }, PHONE, 1)).toBe(2);
    expect(resolveMaxScale(-4, { width: 800, height: 600 }, PHONE, 1)).toBe(2);
  });
});
