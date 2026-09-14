import {
  decayEndpoint,
  dismissProgress,
  dismissScale,
  overshootAmount,
  resolvePageIndex,
  rubberBand,
  shouldDismiss,
  withRubberBand,
} from '../pan';

const WIDTH = 400;

describe('rubberBand', () => {
  it('returns zero for no overshoot', () => {
    expect(rubberBand(0, WIDTH)).toBe(0);
  });

  it('resists: the result is always smaller than the input', () => {
    for (const overshoot of [1, 10, 50, 200, 1000]) {
      expect(rubberBand(overshoot, WIDTH)).toBeLessThan(overshoot);
    }
  });

  it('is symmetric about zero', () => {
    expect(rubberBand(-120, WIDTH)).toBeCloseTo(-rubberBand(120, WIDTH), 10);
  });

  it('increases monotonically with overshoot', () => {
    let previous = 0;
    for (const overshoot of [1, 5, 20, 100, 500, 5000]) {
      const value = rubberBand(overshoot, WIDTH);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it('is asymptotically bounded no matter how far the finger travels', () => {
    // The curve tends to dimension * coefficient.
    const ceiling = WIDTH * 0.55;
    expect(rubberBand(1e9, WIDTH)).toBeLessThan(ceiling);
    expect(rubberBand(1e9, WIDTH)).toBeGreaterThan(ceiling * 0.99);
  });

  it('tracks the finger roughly 1:1 for very small overshoots', () => {
    // f'(0) = coefficient, so a 1px overshoot moves ~0.55px.
    expect(rubberBand(1, WIDTH)).toBeCloseTo(0.55, 1);
  });

  it('is stiffer with a lower coefficient', () => {
    expect(rubberBand(100, WIDTH, 0.2)).toBeLessThan(
      rubberBand(100, WIDTH, 0.8)
    );
  });

  it('returns zero for a degenerate dimension', () => {
    expect(rubberBand(100, 0)).toBe(0);
    expect(rubberBand(100, -5)).toBe(0);
    expect(rubberBand(100, NaN)).toBe(0);
  });

  it('returns zero for a non-finite overshoot', () => {
    expect(rubberBand(NaN, WIDTH)).toBe(0);
    expect(rubberBand(Infinity, WIDTH)).toBe(0);
  });
});

describe('withRubberBand', () => {
  it('passes values inside the bounds through untouched', () => {
    expect(withRubberBand(50, 100, WIDTH)).toBe(50);
    expect(withRubberBand(-50, 100, WIDTH)).toBe(-50);
    expect(withRubberBand(100, 100, WIDTH)).toBe(100);
  });

  it('resists beyond the upper bound', () => {
    const value = withRubberBand(200, 100, WIDTH);
    expect(value).toBeGreaterThan(100);
    expect(value).toBeLessThan(200);
  });

  it('resists beyond the lower bound', () => {
    const value = withRubberBand(-200, 100, WIDTH);
    expect(value).toBeLessThan(-100);
    expect(value).toBeGreaterThan(-200);
  });

  it('is continuous at the boundary', () => {
    const inside = withRubberBand(99.999, 100, WIDTH);
    const outside = withRubberBand(100.001, 100, WIDTH);
    expect(Math.abs(outside - inside)).toBeLessThan(0.01);
  });

  it('resists from zero when there is no slack at all', () => {
    // limit 0 is the common case: content smaller than the container.
    const value = withRubberBand(120, 0, WIDTH);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(120);
  });

  it('is monotonic across the boundary', () => {
    let previous = -Infinity;
    for (let raw = -500; raw <= 500; raw += 25) {
      const value = withRubberBand(raw, 100, WIDTH);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it('treats a negative or NaN limit as no slack', () => {
    expect(withRubberBand(0, -10, WIDTH)).toBe(0);
    expect(withRubberBand(0, NaN, WIDTH)).toBe(0);
  });

  it('collapses a NaN input to zero', () => {
    expect(withRubberBand(NaN, 100, WIDTH)).toBe(0);
  });
});

describe('overshootAmount', () => {
  it('is zero inside the bounds', () => {
    expect(overshootAmount(50, 100)).toBe(0);
    expect(overshootAmount(-100, 100)).toBe(0);
  });

  it('reports the excess past the upper bound', () => {
    expect(overshootAmount(150, 100)).toBe(50);
  });

  it('reports the excess past the lower bound as negative', () => {
    expect(overshootAmount(-150, 100)).toBe(-50);
  });

  it('treats the whole value as overshoot when there is no slack', () => {
    expect(overshootAmount(30, 0)).toBe(30);
  });

  it('returns zero for non-finite input', () => {
    expect(overshootAmount(NaN, 100)).toBe(0);
  });
});

describe('decayEndpoint', () => {
  it('does not move without velocity', () => {
    expect(decayEndpoint(100, 0)).toBe(100);
  });

  it('travels in the direction of the velocity', () => {
    expect(decayEndpoint(0, 1000)).toBeGreaterThan(0);
    expect(decayEndpoint(0, -1000)).toBeLessThan(0);
  });

  it('travels further for a faster flick', () => {
    expect(decayEndpoint(0, 4000)).toBeGreaterThan(decayEndpoint(0, 1000));
  });

  it('is linear in velocity', () => {
    expect(decayEndpoint(0, 2000)).toBeCloseTo(2 * decayEndpoint(0, 1000), 6);
  });

  it('offsets from the starting position', () => {
    expect(decayEndpoint(500, 1000) - decayEndpoint(0, 1000)).toBeCloseTo(
      500,
      6
    );
  });

  it('returns the position for a non-finite velocity', () => {
    expect(decayEndpoint(42, NaN)).toBe(42);
  });

  it('returns zero for a non-finite position', () => {
    expect(decayEndpoint(NaN, 1000)).toBe(0);
  });
});

describe('resolvePageIndex', () => {
  const THRESHOLD = WIDTH * 0.25; // 100

  it('stays put for a drag that commits to nothing', () => {
    expect(resolvePageIndex(20, 0, 2, 5, THRESHOLD)).toBe(2);
  });

  it('advances when dragged left past the distance threshold', () => {
    expect(resolvePageIndex(-150, 0, 2, 5, THRESHOLD)).toBe(3);
  });

  it('goes back when dragged right past the distance threshold', () => {
    expect(resolvePageIndex(150, 0, 2, 5, THRESHOLD)).toBe(1);
  });

  it('advances on a fast flick even when barely dragged', () => {
    expect(resolvePageIndex(-5, -900, 2, 5, THRESHOLD)).toBe(3);
  });

  it('ignores a slow drag that falls short on both counts', () => {
    expect(resolvePageIndex(-40, -100, 2, 5, THRESHOLD)).toBe(2);
  });

  it('lets distance win when a long drag ends with a contrary flick', () => {
    // Dragged well past the threshold to the left, but released flicking right.
    expect(resolvePageIndex(-300, 900, 2, 5, THRESHOLD)).toBe(3);
  });

  it('never moves more than one page per gesture', () => {
    expect(resolvePageIndex(-4000, -9000, 2, 20, THRESHOLD)).toBe(3);
  });

  it('cannot move before the first page', () => {
    expect(resolvePageIndex(900, 4000, 0, 5, THRESHOLD)).toBe(0);
  });

  it('cannot move past the last page', () => {
    expect(resolvePageIndex(-900, -4000, 4, 5, THRESHOLD)).toBe(4);
  });

  it('handles a single-page gallery', () => {
    expect(resolvePageIndex(-900, -4000, 0, 1, THRESHOLD)).toBe(0);
  });

  it('handles an empty gallery without returning a negative index', () => {
    expect(resolvePageIndex(-900, -4000, 0, 0, THRESHOLD)).toBe(0);
  });

  it('treats non-finite input as no movement', () => {
    expect(resolvePageIndex(NaN, NaN, 2, 5, THRESHOLD)).toBe(2);
  });

  it('is exactly at the boundary: a drag equal to the threshold does not commit', () => {
    expect(resolvePageIndex(-THRESHOLD, 0, 2, 5, THRESHOLD)).toBe(2);
    expect(resolvePageIndex(-THRESHOLD - 0.001, 0, 2, 5, THRESHOLD)).toBe(3);
  });
});

describe('shouldDismiss', () => {
  const DISTANCE = 96;

  it('does not dismiss for a small, slow drag', () => {
    expect(shouldDismiss(30, 100, DISTANCE)).toBe(false);
  });

  it('dismisses once dragged far enough', () => {
    expect(shouldDismiss(120, 0, DISTANCE)).toBe(true);
  });

  it('dismisses on a fast flick regardless of distance', () => {
    expect(shouldDismiss(10, 1200, DISTANCE)).toBe(true);
  });

  it('dismisses on an upward drag too', () => {
    expect(shouldDismiss(-120, 0, DISTANCE)).toBe(true);
    expect(shouldDismiss(-10, -1200, DISTANCE)).toBe(true);
  });

  it('does not dismiss exactly at the threshold', () => {
    expect(shouldDismiss(DISTANCE, 0, DISTANCE)).toBe(false);
  });

  it('treats non-finite input as no dismissal', () => {
    expect(shouldDismiss(NaN, NaN, DISTANCE)).toBe(false);
  });
});

describe('dismissProgress', () => {
  it('is zero at the start of a drag', () => {
    expect(dismissProgress(0, 100)).toBe(0);
  });

  it('is one at the dismissal distance', () => {
    expect(dismissProgress(100, 100)).toBe(1);
  });

  it('is halfway at half the distance', () => {
    expect(dismissProgress(50, 100)).toBe(0.5);
  });

  it('saturates at one rather than exceeding it', () => {
    expect(dismissProgress(1000, 100)).toBe(1);
  });

  it('treats upward and downward drags identically', () => {
    expect(dismissProgress(-60, 100)).toBe(dismissProgress(60, 100));
  });

  it('returns zero for a degenerate distance', () => {
    expect(dismissProgress(50, 0)).toBe(0);
    expect(dismissProgress(50, -10)).toBe(0);
  });

  it('returns zero for non-finite input', () => {
    expect(dismissProgress(NaN, 100)).toBe(0);
  });
});

describe('dismissScale', () => {
  it('is full size at the start', () => {
    expect(dismissScale(0)).toBe(1);
  });

  it('reaches the minimum at full progress', () => {
    expect(dismissScale(1, 0.75)).toBeCloseTo(0.75, 10);
  });

  it('interpolates linearly', () => {
    expect(dismissScale(0.5, 0.75)).toBeCloseTo(0.875, 10);
  });

  it('clamps progress outside [0, 1]', () => {
    expect(dismissScale(-1, 0.75)).toBe(1);
    expect(dismissScale(5, 0.75)).toBeCloseTo(0.75, 10);
  });

  it('never returns a non-positive scale', () => {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      expect(dismissScale(progress, 0.75)).toBeGreaterThan(0);
    }
  });
});
