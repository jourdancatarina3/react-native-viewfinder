import { fitSize, translationBounds } from '../geometry';
import type { Size, Transform, Vector } from '../types';
import {
  clampTransform,
  doubleTapTransform,
  isAtRest,
  nextDoubleTapScale,
  scaleAround,
  toCentreRelative,
} from '../zoom';

const PHONE: Size = { width: 400, height: 800 };
const LANDSCAPE = { width: 1000, height: 500 };
const BASE = fitSize(LANDSCAPE, PHONE); // 400x200

const rest: Transform = { scale: 1, translateX: 0, translateY: 0 };

/**
 * Where a content point (measured from the content's centre, in base units)
 * ends up on screen, relative to the container's centre. This mirrors what the
 * render transform does, and lets the focal-point tests assert the property
 * that actually matters rather than the formula's internals.
 */
function project(transform: Transform, contentPoint: Vector): Vector {
  return {
    x: transform.translateX + transform.scale * contentPoint.x,
    y: transform.translateY + transform.scale * contentPoint.y,
  };
}

/** The inverse: which content point currently sits under a screen point. */
function unproject(transform: Transform, screenPoint: Vector): Vector {
  return {
    x: (screenPoint.x - transform.translateX) / transform.scale,
    y: (screenPoint.y - transform.translateY) / transform.scale,
  };
}

describe('toCentreRelative', () => {
  it('maps the container centre to the origin', () => {
    expect(toCentreRelative({ x: 200, y: 400 }, PHONE)).toEqual({ x: 0, y: 0 });
  });

  it('maps the top-left corner to negative half-extents', () => {
    expect(toCentreRelative({ x: 0, y: 0 }, PHONE)).toEqual({
      x: -200,
      y: -400,
    });
  });

  it('maps the bottom-right corner to positive half-extents', () => {
    expect(toCentreRelative({ x: 400, y: 800 }, PHONE)).toEqual({
      x: 200,
      y: 400,
    });
  });

  it('returns the origin for an unmeasured container', () => {
    expect(toCentreRelative({ x: 10, y: 10 }, { width: 0, height: 0 })).toEqual(
      {
        x: 0,
        y: 0,
      }
    );
  });
});

describe('scaleAround', () => {
  it('keeps the point under the focal exactly stationary', () => {
    const focal = { x: 120, y: -60 };
    const before = unproject(rest, focal);
    const after = scaleAround(rest, 3, focal);
    const projected = project(after, before);

    expect(projected.x).toBeCloseTo(focal.x, 10);
    expect(projected.y).toBeCloseTo(focal.y, 10);
  });

  it('keeps the focal stationary from an already-zoomed, already-panned state', () => {
    const start: Transform = { scale: 2.4, translateX: -85, translateY: 37 };
    const focal = { x: -150, y: 210 };
    const before = unproject(start, focal);
    const after = scaleAround(start, 4.7, focal);
    const projected = project(after, before);

    expect(projected.x).toBeCloseTo(focal.x, 10);
    expect(projected.y).toBeCloseTo(focal.y, 10);
  });

  it('holds the invariant across a wide sweep of scales and focals', () => {
    const start: Transform = { scale: 1.7, translateX: 33, translateY: -12 };
    for (const nextScale of [0.5, 1, 1.7, 2, 5, 12]) {
      for (const focal of [
        { x: 0, y: 0 },
        { x: 200, y: 400 },
        { x: -200, y: -400 },
        { x: 13.5, y: -77.25 },
      ]) {
        const before = unproject(start, focal);
        const after = scaleAround(start, nextScale, focal);
        const projected = project(after, before);
        expect(projected.x).toBeCloseTo(focal.x, 8);
        expect(projected.y).toBeCloseTo(focal.y, 8);
      }
    }
  });

  it('scaling around the centre leaves translation untouched', () => {
    const after = scaleAround(rest, 4, { x: 0, y: 0 });
    expect(after).toEqual({ scale: 4, translateX: 0, translateY: 0 });
  });

  it('is reversible: scaling up then back down restores the transform', () => {
    const focal = { x: 90, y: -140 };
    const up = scaleAround(rest, 3.3, focal);
    const down = scaleAround(up, 1, focal);

    expect(down.scale).toBeCloseTo(1, 10);
    expect(down.translateX).toBeCloseTo(0, 10);
    expect(down.translateY).toBeCloseTo(0, 10);
  });

  it('returns the input unchanged when the current scale is degenerate', () => {
    const bad: Transform = { scale: 0, translateX: 5, translateY: 5 };
    expect(scaleAround(bad, 2, { x: 1, y: 1 })).toBe(bad);

    const nan: Transform = { scale: NaN, translateX: 0, translateY: 0 };
    expect(scaleAround(nan, 2, { x: 1, y: 1 })).toBe(nan);
  });

  it('returns the input unchanged when the target scale is not finite', () => {
    expect(scaleAround(rest, NaN, { x: 1, y: 1 })).toBe(rest);
    expect(scaleAround(rest, Infinity, { x: 1, y: 1 })).toBe(rest);
  });
});

describe('clampTransform', () => {
  it('leaves a resting transform alone', () => {
    expect(clampTransform(rest, BASE, PHONE, 1, 6)).toEqual(rest);
  });

  it('recentres an axis where the content is smaller than the container', () => {
    // BASE is 400x200; at scale 2 the height (400) is still under 800.
    const drifted: Transform = { scale: 2, translateX: 0, translateY: 300 };
    expect(clampTransform(drifted, BASE, PHONE, 1, 6).translateY).toBe(0);
  });

  it('clamps translation to the available slack', () => {
    const bounds = translationBounds(BASE, PHONE, 3);
    const overshot: Transform = { scale: 3, translateX: 9999, translateY: 0 };
    expect(clampTransform(overshot, BASE, PHONE, 1, 6).translateX).toBe(
      bounds.x
    );
  });

  it('clamps scale into the configured range', () => {
    expect(
      clampTransform({ ...rest, scale: 99 }, BASE, PHONE, 1, 6).scale
    ).toBe(6);
    expect(
      clampTransform({ ...rest, scale: 0.1 }, BASE, PHONE, 1, 6).scale
    ).toBe(1);
  });

  it('clamps scale before computing bounds, so an over-scaled transform cannot smuggle in extra pan', () => {
    const overshot: Transform = { scale: 99, translateX: 9999, translateY: 0 };
    const clamped = clampTransform(overshot, BASE, PHONE, 1, 6);
    // Bounds must correspond to the clamped scale of 6, not to 99.
    expect(clamped.translateX).toBe(translationBounds(BASE, PHONE, 6).x);
  });

  it('produces a transform that is a fixed point of itself', () => {
    const once = clampTransform(
      { scale: 4, translateX: 5000, translateY: -5000 },
      BASE,
      PHONE,
      1,
      6
    );
    expect(clampTransform(once, BASE, PHONE, 1, 6)).toEqual(once);
  });

  it('never leaves a gap when the content is large enough to fill the axis', () => {
    const scale = 4;
    const clamped = clampTransform(
      { scale, translateX: 1e6, translateY: 1e6 },
      BASE,
      PHONE,
      1,
      6
    );
    const half = (BASE.width * scale) / 2;
    const leftEdge = clamped.translateX - half;
    expect(leftEdge).toBeLessThanOrEqual(-PHONE.width / 2 + 1e-9);
  });

  it('collapses NaN translation rather than propagating it', () => {
    const clamped = clampTransform(
      { scale: 3, translateX: NaN, translateY: NaN },
      BASE,
      PHONE,
      1,
      6
    );
    expect(Number.isNaN(clamped.translateX)).toBe(false);
    expect(Number.isNaN(clamped.translateY)).toBe(false);
  });
});

describe('nextDoubleTapScale', () => {
  it('steps up to the first level from rest', () => {
    expect(nextDoubleTapScale(1, [2.5], 1)).toBe(2.5);
  });

  it('returns to the minimum once the last level is reached', () => {
    expect(nextDoubleTapScale(2.5, [2.5], 1)).toBe(1);
  });

  it('cycles through multiple levels in order and wraps', () => {
    const levels = [2, 4];
    expect(nextDoubleTapScale(1, levels, 1)).toBe(2);
    expect(nextDoubleTapScale(2, levels, 1)).toBe(4);
    expect(nextDoubleTapScale(4, levels, 1)).toBe(1);
  });

  it('picks the next level up from an arbitrary intermediate scale', () => {
    expect(nextDoubleTapScale(3, [2, 4, 6], 1)).toBe(4);
  });

  it('absorbs floating-point drift at a level boundary', () => {
    // 2.0000001 must count as "already at 2", not "just below it".
    expect(nextDoubleTapScale(2.0000001, [2, 4], 1)).toBe(4);
  });

  it('returns the minimum when no levels are configured', () => {
    expect(nextDoubleTapScale(3, [], 1)).toBe(1);
  });

  it('returns the minimum when already beyond every level', () => {
    expect(nextDoubleTapScale(10, [2, 4], 1)).toBe(1);
  });
});

describe('doubleTapTransform', () => {
  it('zooms in anchored on the tapped point', () => {
    const tap = { x: 340, y: 300 }; // right of centre
    const result = doubleTapTransform(rest, tap, BASE, PHONE, [2.5], 1, 6);

    expect(result.scale).toBe(2.5);
    // Anchoring right of centre must pull the content left.
    expect(result.translateX).toBeLessThan(0);
  });

  it('keeps the tapped content point under the finger when bounds allow', () => {
    const tap = { x: 260, y: 400 };
    const focal = toCentreRelative(tap, PHONE);
    const before = unproject(rest, focal);
    const result = doubleTapTransform(rest, tap, BASE, PHONE, [2.5], 1, 6);

    // The x axis has slack at 2.5x (400*2.5=1000 > 400), so x stays pinned.
    expect(project(result, before).x).toBeCloseTo(focal.x, 6);
  });

  it('returns to a centred, resting transform when cycling back out', () => {
    const zoomed: Transform = { scale: 2.5, translateX: -120, translateY: 40 };
    const result = doubleTapTransform(
      zoomed,
      { x: 10, y: 10 },
      BASE,
      PHONE,
      [2.5],
      1,
      6
    );
    expect(result).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });

  it('ignores the tap location when zooming out', () => {
    const zoomed: Transform = { scale: 2.5, translateX: -120, translateY: 40 };
    const cornerTap = doubleTapTransform(
      zoomed,
      { x: 0, y: 0 },
      BASE,
      PHONE,
      [2.5],
      1,
      6
    );
    const centreTap = doubleTapTransform(
      zoomed,
      { x: 200, y: 400 },
      BASE,
      PHONE,
      [2.5],
      1,
      6
    );
    expect(cornerTap).toEqual(centreTap);
  });

  it('always returns a transform inside its own bounds', () => {
    for (const tap of [
      { x: 0, y: 0 },
      { x: 400, y: 800 },
      { x: 200, y: 400 },
      { x: 399, y: 1 },
    ]) {
      const result = doubleTapTransform(rest, tap, BASE, PHONE, [2.5], 1, 6);
      const bounds = translationBounds(BASE, PHONE, result.scale);
      expect(Math.abs(result.translateX)).toBeLessThanOrEqual(bounds.x + 1e-9);
      expect(Math.abs(result.translateY)).toBeLessThanOrEqual(bounds.y + 1e-9);
    }
  });

  it('respects a maxScale lower than the configured level', () => {
    const result = doubleTapTransform(
      rest,
      { x: 200, y: 400 },
      BASE,
      PHONE,
      [8],
      1,
      3
    );
    expect(result.scale).toBe(3);
  });

  it('survives a tap on an unmeasured container', () => {
    const result = doubleTapTransform(
      rest,
      { x: 5, y: 5 },
      { width: 0, height: 0 },
      { width: 0, height: 0 },
      [2.5],
      1,
      6
    );
    expect(Number.isFinite(result.scale)).toBe(true);
    expect(Number.isFinite(result.translateX)).toBe(true);
    expect(Number.isFinite(result.translateY)).toBe(true);
  });

  it('handles rapid repeated taps without drifting out of bounds', () => {
    let current = rest;
    for (let i = 0; i < 12; i += 1) {
      current = doubleTapTransform(
        current,
        { x: 380, y: 120 },
        BASE,
        PHONE,
        [2, 4],
        1,
        6
      );
      const bounds = translationBounds(BASE, PHONE, current.scale);
      expect(Math.abs(current.translateX)).toBeLessThanOrEqual(bounds.x + 1e-9);
      expect(Math.abs(current.translateY)).toBeLessThanOrEqual(bounds.y + 1e-9);
      expect(current.scale).toBeGreaterThanOrEqual(1);
      expect(current.scale).toBeLessThanOrEqual(6);
    }
  });
});

describe('isAtRest', () => {
  it('is true exactly at the minimum', () => {
    expect(isAtRest(1, 1)).toBe(true);
  });

  it('tolerates floating-point drift just above the minimum', () => {
    expect(isAtRest(1.000001, 1)).toBe(true);
  });

  it('is false once genuinely zoomed', () => {
    expect(isAtRest(1.5, 1)).toBe(false);
  });

  it('is true below the minimum, which happens mid rubber-band', () => {
    expect(isAtRest(0.8, 1)).toBe(true);
  });
});
