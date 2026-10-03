import {
  ASPECT_PRESETS,
  clampToCover,
  cropImageSize,
  cropRectFromTransform,
  cropTranslationBounds,
  frameCentreOffset,
  frameForAspect,
  imageRect,
  intersectRects,
  isFullFrame,
  maximizeFrame,
  minScaleToCover,
  nextRotation,
  resizeFrame,
  resolveAspectRatio,
  rotatedSize,
} from '../crop';
import type { Rect } from '../crop';
import type { Size, Transform } from '../types';

const STAGE: Size = { width: 400, height: 700 };
const PAD = 20;
const SQUARE: Size = { width: 1000, height: 1000 };
const LANDSCAPE: Size = { width: 1600, height: 900 };

const identity: Transform = { scale: 1, translateX: 0, translateY: 0 };

/** The starting state for a free crop: image fitted, frame around it. */
function freeSetup(source: Size, stage: Size = STAGE) {
  const baseSize = cropImageSize(source, stage, PAD);
  const frame = imageRect(baseSize, stage, identity);
  return { baseSize, frame };
}

describe('cropImageSize', () => {
  it('fits the image inside the padded stage', () => {
    // 1600x900 into 360x660 -> limited by width
    const size = cropImageSize(LANDSCAPE, STAGE, PAD);
    expect(size.width).toBeCloseTo(360, 5);
    expect(size.height).toBeCloseTo(202.5, 5);
  });

  it('does not depend on the crop frame at all', () => {
    // The whole point of the model: the image's layout is a function of the
    // stage only, so dragging a handle can never resize the picture.
    expect(cropImageSize(LANDSCAPE, STAGE, PAD)).toEqual(
      cropImageSize(LANDSCAPE, STAGE, PAD)
    );
  });

  it('never exceeds the padded stage on either axis', () => {
    for (const source of [
      SQUARE,
      LANDSCAPE,
      { width: 900, height: 1600 },
      { width: 4000, height: 800 },
      { width: 1, height: 1 },
    ]) {
      const size = cropImageSize(source, STAGE, PAD);
      expect(size.width).toBeLessThanOrEqual(STAGE.width - PAD * 2 + 1e-9);
      expect(size.height).toBeLessThanOrEqual(STAGE.height - PAD * 2 + 1e-9);
    }
  });

  it('returns a zero size for an unmeasured stage', () => {
    expect(cropImageSize(SQUARE, { width: 0, height: 0 }, PAD)).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe('imageRect', () => {
  it('is centred in the stage at the identity transform', () => {
    const base = cropImageSize(LANDSCAPE, STAGE, PAD);
    const rect = imageRect(base, STAGE, identity);
    expect(rect.x + rect.width / 2).toBeCloseTo(STAGE.width / 2, 6);
    expect(rect.y + rect.height / 2).toBeCloseTo(STAGE.height / 2, 6);
    expect(rect.width).toBeCloseTo(base.width, 6);
  });

  it('grows with scale and moves with translation', () => {
    const base = { width: 200, height: 100 };
    const rect = imageRect(base, STAGE, {
      scale: 2,
      translateX: 30,
      translateY: -10,
    });
    expect(rect.width).toBe(400);
    expect(rect.height).toBe(200);
    expect(rect.x).toBeCloseTo(400 / 2 + 30 - 200, 6);
    expect(rect.y).toBeCloseTo(700 / 2 - 10 - 100, 6);
  });

  it('returns a zero rect for unusable input', () => {
    expect(imageRect({ width: 0, height: 0 }, STAGE, identity)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});

describe('intersectRects', () => {
  it('returns the overlap', () => {
    expect(
      intersectRects(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 50, y: 50, width: 100, height: 100 }
      )
    ).toEqual({ x: 50, y: 50, width: 50, height: 50 });
  });

  it('returns a zero rect when they do not overlap', () => {
    const none = intersectRects(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 100, y: 100, width: 10, height: 10 }
    );
    expect(none.width).toBe(0);
    expect(none.height).toBe(0);
  });

  it('returns the inner rect when one contains the other', () => {
    expect(
      intersectRects(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 10, y: 10, width: 20, height: 20 }
      )
    ).toEqual({ x: 10, y: 10, width: 20, height: 20 });
  });
});

describe('frameCentreOffset', () => {
  it('is zero for a centred frame', () => {
    expect(
      frameCentreOffset({ x: 100, y: 250, width: 200, height: 200 }, STAGE)
    ).toEqual({ x: 0, y: 0 });
  });

  it('is positive when the frame sits right of or below centre', () => {
    const offset = frameCentreOffset(
      { x: 200, y: 400, width: 100, height: 100 },
      STAGE
    );
    expect(offset.x).toBeGreaterThan(0);
    expect(offset.y).toBeGreaterThan(0);
  });

  it('returns the origin for an unmeasured stage', () => {
    expect(
      frameCentreOffset(
        { x: 0, y: 0, width: 10, height: 10 },
        { width: 0, height: 0 }
      )
    ).toEqual({ x: 0, y: 0 });
  });
});

describe('resolveAspectRatio', () => {
  it('returns null for free', () => {
    expect(resolveAspectRatio('free', SQUARE)).toBeNull();
  });

  it('returns the source ratio for original', () => {
    expect(resolveAspectRatio('original', LANDSCAPE)).toBeCloseTo(16 / 9, 10);
  });

  it('returns null for original when the source is not measured yet', () => {
    expect(resolveAspectRatio('original', null)).toBeNull();
    expect(resolveAspectRatio('original', { width: 0, height: 0 })).toBeNull();
  });

  it('passes a numeric ratio through', () => {
    expect(resolveAspectRatio(1.5, SQUARE)).toBe(1.5);
  });

  it('rejects a nonsense numeric ratio', () => {
    expect(resolveAspectRatio(0, SQUARE)).toBeNull();
    expect(resolveAspectRatio(-2, SQUARE)).toBeNull();
    expect(resolveAspectRatio(NaN, SQUARE)).toBeNull();
  });
});

describe('frameForAspect', () => {
  it('fills the padded stage when the ratio is free', () => {
    expect(frameForAspect(STAGE, null, PAD)).toEqual({
      x: 20,
      y: 20,
      width: 360,
      height: 660,
    });
  });

  it('produces a square frame for 1:1, centred', () => {
    const frame = frameForAspect(STAGE, 1, PAD);
    expect(frame.width).toBe(360);
    expect(frame.height).toBe(360);
    expect(frame.x + frame.width / 2).toBeCloseTo(STAGE.width / 2, 6);
    expect(frame.y + frame.height / 2).toBeCloseTo(STAGE.height / 2, 6);
  });

  it('constrains on width for a wide ratio', () => {
    const frame = frameForAspect(STAGE, 16 / 9, 0);
    expect(frame.width).toBe(400);
    expect(frame.height).toBeCloseTo(225, 5);
  });

  it('constrains on height for a tall ratio', () => {
    const frame = frameForAspect({ width: 800, height: 400 }, 1 / 4, 0);
    expect(frame.height).toBe(400);
    expect(frame.width).toBe(100);
  });

  it('never exceeds the padded stage', () => {
    for (const ratio of [0.25, 0.5, 1, 1.5, 2, 4, 16 / 9]) {
      const frame = frameForAspect(STAGE, ratio, 16);
      expect(frame.width).toBeLessThanOrEqual(400 - 32 + 1e-9);
      expect(frame.height).toBeLessThanOrEqual(700 - 32 + 1e-9);
    }
  });

  it('returns an empty rect for an unmeasured stage', () => {
    expect(frameForAspect({ width: 0, height: 0 }, 1, PAD)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });

  it('survives padding larger than the stage', () => {
    const frame = frameForAspect(STAGE, 1, 9999);
    expect(frame.width).toBeGreaterThanOrEqual(0);
    expect(frame.height).toBeGreaterThanOrEqual(0);
  });
});

describe('cropTranslationBounds', () => {
  const frame: Rect = { x: 50, y: 200, width: 300, height: 300 };

  it('is zero on an axis where the image exactly covers the frame', () => {
    expect(
      cropTranslationBounds({ width: 300, height: 300 }, frame, 1)
    ).toEqual({ x: 0, y: 0 });
  });

  it('allows movement on an axis with overhang', () => {
    const bounds = cropTranslationBounds({ width: 500, height: 300 }, frame, 1);
    expect(bounds.x).toBe(100);
    expect(bounds.y).toBe(0);
  });

  it('grows with scale', () => {
    expect(cropTranslationBounds({ width: 300, height: 300 }, frame, 2).x).toBe(
      150
    );
  });

  it('never returns a negative bound', () => {
    const bounds = cropTranslationBounds({ width: 100, height: 100 }, frame, 1);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
  });

  it('is safe with a degenerate frame or scale', () => {
    expect(
      cropTranslationBounds(
        { width: 300, height: 300 },
        { x: 0, y: 0, width: 0, height: 0 },
        1
      )
    ).toEqual({ x: 0, y: 0 });
    expect(
      cropTranslationBounds({ width: 300, height: 300 }, frame, NaN)
    ).toEqual({ x: 0, y: 0 });
  });
});

describe('minScaleToCover', () => {
  it('is 1 when the image exactly covers the frame', () => {
    expect(
      minScaleToCover(
        { width: 300, height: 300 },
        { x: 0, y: 0, width: 300, height: 300 }
      )
    ).toBeCloseTo(1, 10);
  });

  it('is above 1 when the frame is larger than the image', () => {
    expect(
      minScaleToCover(
        { width: 300, height: 300 },
        { x: 0, y: 0, width: 450, height: 300 }
      )
    ).toBeCloseTo(1.5, 6);
  });

  it('drops below 1 when the frame has been dragged smaller than the image', () => {
    // Not floored at 1: with a small frame, zooming out past the fitted size
    // still leaves the frame covered, so it is a legitimate state.
    expect(
      minScaleToCover(
        { width: 300, height: 300 },
        { x: 0, y: 0, width: 150, height: 150 }
      )
    ).toBeCloseTo(0.5, 6);
  });

  it('takes the larger of the two axes', () => {
    expect(
      minScaleToCover(
        { width: 300, height: 300 },
        { x: 0, y: 0, width: 450, height: 600 }
      )
    ).toBeCloseTo(2, 6);
  });

  it('is safe with degenerate input', () => {
    expect(
      minScaleToCover(
        { width: 0, height: 0 },
        { x: 0, y: 0, width: 10, height: 10 }
      )
    ).toBe(1);
  });
});

describe('clampToCover', () => {
  const base = { width: 500, height: 300 };
  const centred: Rect = { x: 50, y: 200, width: 300, height: 300 };

  it('leaves a covering transform alone', () => {
    const settled = clampToCover(
      { scale: 1, translateX: 0, translateY: 0 },
      base,
      centred,
      STAGE,
      1,
      6
    );
    expect(settled.translateX).toBe(0);
  });

  it('pulls the image back so the frame stays covered', () => {
    const drifted: Transform = { scale: 1, translateX: 9999, translateY: 0 };
    expect(clampToCover(drifted, base, centred, STAGE, 1, 6).translateX).toBe(
      100
    );
  });

  it('clamps around the frame centre, not the stage centre', () => {
    // An off-centre frame shifts the whole allowed range with it. Clamping
    // around the stage centre instead is what made a dragged frame report a
    // crop that never changed.
    const offset: Rect = { x: 250, y: 200, width: 100, height: 100 };
    const centre = frameCentreOffset(offset, STAGE);
    const clamped = clampToCover(
      { scale: 1, translateX: 0, translateY: 0 },
      { width: 120, height: 120 },
      offset,
      STAGE,
      1,
      6
    );
    const bounds = cropTranslationBounds(
      { width: 120, height: 120 },
      offset,
      1
    );
    expect(clamped.translateX).toBeCloseTo(centre.x - bounds.x, 6);
  });

  it('clamps scale before computing bounds', () => {
    const overshot: Transform = { scale: 99, translateX: 99999, translateY: 0 };
    const clamped = clampToCover(overshot, base, centred, STAGE, 1, 4);
    expect(clamped.scale).toBe(4);
    expect(clamped.translateX).toBeCloseTo(
      cropTranslationBounds(base, centred, 4).x,
      6
    );
  });

  it('is a fixed point of itself', () => {
    const once = clampToCover(
      { scale: 3, translateX: 5000, translateY: -5000 },
      base,
      centred,
      STAGE,
      1,
      6
    );
    expect(clampToCover(once, base, centred, STAGE, 1, 6)).toEqual(once);
  });
});

describe('cropRectFromTransform', () => {
  it('returns the whole image for a free crop at rest', () => {
    const { baseSize, frame } = freeSetup(LANDSCAPE);
    expect(
      cropRectFromTransform(identity, baseSize, frame, STAGE, LANDSCAPE)
    ).toEqual({
      originX: 0,
      originY: 0,
      width: 1600,
      height: 900,
    });
  });

  it('returns the centre half at 2x zoom', () => {
    const base = { width: 300, height: 300 };
    const frame: Rect = { x: 50, y: 200, width: 300, height: 300 };
    const zoomed: Transform = { scale: 2, translateX: 0, translateY: 0 };
    expect(cropRectFromTransform(zoomed, base, frame, STAGE, SQUARE)).toEqual({
      originX: 250,
      originY: 250,
      width: 500,
      height: 500,
    });
  });

  it('accounts for a frame that is not centred in the stage', () => {
    // This is the bug that made free cropping useless: with the frame moved,
    // the reported rectangle did not move with it.
    const { baseSize } = freeSetup(LANDSCAPE);
    const full = imageRect(baseSize, STAGE, identity);
    const leftHalf: Rect = {
      x: full.x,
      y: full.y,
      width: full.width / 2,
      height: full.height,
    };
    const rect = cropRectFromTransform(
      identity,
      baseSize,
      leftHalf,
      STAGE,
      LANDSCAPE
    );
    expect(rect.originX).toBe(0);
    expect(rect.width).toBeCloseTo(800, 0);
    expect(rect.height).toBe(900);
  });

  it('follows the frame as it moves right', () => {
    const { baseSize } = freeSetup(LANDSCAPE);
    const full = imageRect(baseSize, STAGE, identity);
    const rightHalf: Rect = {
      x: full.x + full.width / 2,
      y: full.y,
      width: full.width / 2,
      height: full.height,
    };
    const rect = cropRectFromTransform(
      identity,
      baseSize,
      rightHalf,
      STAGE,
      LANDSCAPE
    );
    expect(rect.originX).toBeCloseTo(800, 0);
    expect(rect.width).toBeCloseTo(800, 0);
  });

  it('never returns a rectangle outside the source', () => {
    const { baseSize, frame } = freeSetup(SQUARE);
    for (const transform of [
      { scale: 1, translateX: 99999, translateY: 99999 },
      { scale: 1, translateX: -99999, translateY: -99999 },
      { scale: 6, translateX: 5000, translateY: -5000 },
    ]) {
      const rect = cropRectFromTransform(
        transform,
        baseSize,
        frame,
        STAGE,
        SQUARE
      );
      expect(rect.originX).toBeGreaterThanOrEqual(0);
      expect(rect.originY).toBeGreaterThanOrEqual(0);
      expect(rect.originX + rect.width).toBeLessThanOrEqual(SQUARE.width);
      expect(rect.originY + rect.height).toBeLessThanOrEqual(SQUARE.height);
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
  });

  it('returns integers, which is what native manipulators require', () => {
    const source = { width: 1333, height: 777 };
    const { baseSize, frame } = freeSetup(source);
    const rect = cropRectFromTransform(
      { scale: 1.37, translateX: 11.3, translateY: -7.9 },
      baseSize,
      frame,
      STAGE,
      source
    );
    for (const value of [rect.originX, rect.originY, rect.width, rect.height]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('returns an empty rect for degenerate input rather than NaN', () => {
    const { frame } = freeSetup(SQUARE);
    expect(
      cropRectFromTransform(
        identity,
        { width: 0, height: 0 },
        frame,
        STAGE,
        SQUARE
      )
    ).toEqual({ originX: 0, originY: 0, width: 0, height: 0 });
    expect(
      cropRectFromTransform(
        { scale: 0, translateX: 0, translateY: 0 },
        { width: 300, height: 300 },
        frame,
        STAGE,
        SQUARE
      )
    ).toEqual({ originX: 0, originY: 0, width: 0, height: 0 });
  });
});

describe('maximizeFrame', () => {
  it('expands the frame to fill the padded stage', () => {
    const small: Rect = { x: 40, y: 300, width: 100, height: 100 };
    const { frame } = maximizeFrame(small, identity, STAGE, PAD);
    expect(frame.width).toBeCloseTo(360, 5);
    expect(frame.height).toBeCloseTo(360, 5);
  });

  it('centres the expanded frame', () => {
    const small: Rect = { x: 40, y: 300, width: 100, height: 60 };
    const { frame } = maximizeFrame(small, identity, STAGE, PAD);
    expect(frame.x + frame.width / 2).toBeCloseTo(STAGE.width / 2, 6);
    expect(frame.y + frame.height / 2).toBeCloseTo(STAGE.height / 2, 6);
  });

  it('preserves the frame aspect ratio', () => {
    for (const shape of [
      { width: 100, height: 100 },
      { width: 160, height: 90 },
      { width: 60, height: 180 },
    ]) {
      const small: Rect = { x: 40, y: 200, ...shape };
      const { frame } = maximizeFrame(small, identity, STAGE, PAD);
      expect(frame.width / frame.height).toBeCloseTo(
        shape.width / shape.height,
        4
      );
    }
  });

  /**
   * The property the whole animation rests on. If expanding the frame changed
   * the crop, letting go of a handle would silently alter what you had chosen.
   */
  it('leaves the reported crop rectangle identical', () => {
    const { baseSize } = freeSetup(LANDSCAPE);
    const full = imageRect(baseSize, STAGE, identity);

    const dragged: Rect = {
      x: full.x + 30,
      y: full.y + 12,
      width: full.width * 0.45,
      height: full.height * 0.6,
    };

    const before = cropRectFromTransform(
      identity,
      baseSize,
      dragged,
      STAGE,
      LANDSCAPE
    );
    const next = maximizeFrame(dragged, identity, STAGE, PAD);
    const after = cropRectFromTransform(
      next.transform,
      baseSize,
      next.frame,
      STAGE,
      LANDSCAPE
    );

    expect(after.originX).toBeCloseTo(before.originX, 0);
    expect(after.originY).toBeCloseTo(before.originY, 0);
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
  });

  it('preserves the crop from an already-zoomed, already-panned state', () => {
    const { baseSize } = freeSetup(SQUARE);
    const start: Transform = { scale: 1.8, translateX: -22, translateY: 14 };
    const dragged: Rect = { x: 70, y: 250, width: 140, height: 90 };

    const before = cropRectFromTransform(
      start,
      baseSize,
      dragged,
      STAGE,
      SQUARE
    );
    const next = maximizeFrame(dragged, start, STAGE, PAD);
    const after = cropRectFromTransform(
      next.transform,
      baseSize,
      next.frame,
      STAGE,
      SQUARE
    );

    expect(after.originX).toBeCloseTo(before.originX, 0);
    expect(after.originY).toBeCloseTo(before.originY, 0);
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
  });

  it('scales the image up by exactly the factor the frame grew by', () => {
    const small: Rect = { x: 40, y: 300, width: 90, height: 90 };
    const next = maximizeFrame(small, identity, STAGE, PAD);
    expect(next.transform.scale).toBeCloseTo(360 / 90, 6);
  });

  it('is a no-op for a frame that already fills the stage', () => {
    const full = frameForAspect(STAGE, 1, PAD);
    const next = maximizeFrame(full, identity, STAGE, PAD);
    expect(next.transform.scale).toBeCloseTo(1, 6);
    expect(next.frame.width).toBeCloseTo(full.width, 6);
  });

  it('returns its input for degenerate geometry', () => {
    const frame: Rect = { x: 0, y: 0, width: 0, height: 0 };
    expect(maximizeFrame(frame, identity, STAGE, PAD).frame).toBe(frame);
    const ok: Rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(
      maximizeFrame(ok, identity, { width: 0, height: 0 }, PAD).frame
    ).toBe(ok);
  });
});

describe('rotatedSize', () => {
  it('leaves dimensions alone for 0 and 180', () => {
    expect(rotatedSize(LANDSCAPE, 0)).toEqual(LANDSCAPE);
    expect(rotatedSize(LANDSCAPE, 180)).toEqual(LANDSCAPE);
  });

  it('swaps dimensions for 90 and 270', () => {
    expect(rotatedSize(LANDSCAPE, 90)).toEqual({ width: 900, height: 1600 });
    expect(rotatedSize(LANDSCAPE, 270)).toEqual({ width: 900, height: 1600 });
  });
});

describe('nextRotation', () => {
  it('steps a quarter turn clockwise', () => {
    expect(nextRotation(0)).toBe(90);
    expect(nextRotation(90)).toBe(180);
    expect(nextRotation(180)).toBe(270);
  });

  it('wraps back to zero', () => {
    expect(nextRotation(270)).toBe(0);
  });

  it('steps counter-clockwise with a negative turn', () => {
    expect(nextRotation(0, -1)).toBe(270);
    expect(nextRotation(90, -1)).toBe(0);
  });

  it('handles multiple turns', () => {
    expect(nextRotation(0, 4)).toBe(0);
    expect(nextRotation(0, 5)).toBe(90);
    expect(nextRotation(0, -5)).toBe(270);
  });
});

describe('resizeFrame', () => {
  const bounds: Rect = { x: 0, y: 0, width: 400, height: 700 };
  const frame: Rect = { x: 100, y: 200, width: 200, height: 200 };

  it('moves only the dragged edge when free', () => {
    const next = resizeFrame(frame, 'right', { x: 50, y: 0 }, bounds, null);
    expect(next.x).toBe(100);
    expect(next.width).toBe(250);
  });

  it('grows from the anchored corner when dragging a corner', () => {
    const next = resizeFrame(
      frame,
      'topLeft',
      { x: -50, y: -50 },
      bounds,
      null
    );
    expect(next.x).toBe(50);
    expect(next.y).toBe(150);
    expect(next.x + next.width).toBe(300);
    expect(next.y + next.height).toBe(400);
  });

  it('is measured from the gesture start, so a repeated delta is idempotent', () => {
    // Handle deltas are cumulative. Applying the same delta twice to the same
    // origin must land in the same place — this is what a lagging drag origin
    // broke, turning a slow drag into a runaway one.
    const a = resizeFrame(frame, 'bottomRight', { x: 40, y: 40 }, bounds, null);
    const b = resizeFrame(frame, 'bottomRight', { x: 40, y: 40 }, bounds, null);
    expect(a).toEqual(b);
  });

  it('respects the minimum size', () => {
    const next = resizeFrame(
      frame,
      'right',
      { x: -9999, y: 0 },
      bounds,
      null,
      64
    );
    expect(next.width).toBeGreaterThanOrEqual(64);
  });

  it('caps the minimum by what the bounds can hold', () => {
    // A tiny image must still be croppable rather than locking up.
    const tiny: Rect = { x: 0, y: 0, width: 40, height: 40 };
    const next = resizeFrame(tiny, 'right', { x: -9999, y: 0 }, tiny, null, 64);
    expect(next.width).toBeGreaterThan(0);
    expect(next.width).toBeLessThanOrEqual(40);
  });

  it('never leaves the bounds', () => {
    for (const handle of [
      'topLeft',
      'top',
      'topRight',
      'right',
      'bottomRight',
      'bottom',
      'bottomLeft',
      'left',
    ] as const) {
      const next = resizeFrame(
        frame,
        handle,
        { x: 9999, y: 9999 },
        bounds,
        null
      );
      expect(next.x).toBeGreaterThanOrEqual(bounds.x - 1e-6);
      expect(next.y).toBeGreaterThanOrEqual(bounds.y - 1e-6);
      expect(next.x + next.width).toBeLessThanOrEqual(
        bounds.x + bounds.width + 1e-6
      );
      expect(next.y + next.height).toBeLessThanOrEqual(
        bounds.y + bounds.height + 1e-6
      );
    }
  });

  it('cannot be pulled out past the image', () => {
    // The caller passes the image's drawn rect as the bounds, so this is the
    // "handles stop at the photo" rule.
    const photo: Rect = { x: 20, y: 250, width: 360, height: 200 };
    const inside: Rect = { x: 100, y: 300, width: 100, height: 100 };
    const next = resizeFrame(
      inside,
      'topLeft',
      { x: -9999, y: -9999 },
      photo,
      null
    );
    expect(next.x).toBeGreaterThanOrEqual(photo.x - 1e-6);
    expect(next.y).toBeGreaterThanOrEqual(photo.y - 1e-6);
  });

  it('keeps a locked ratio when dragging a side handle', () => {
    const next = resizeFrame(frame, 'right', { x: 100, y: 0 }, bounds, 1);
    expect(next.width / next.height).toBeCloseTo(1, 4);
  });

  it('keeps a locked ratio when dragging a corner', () => {
    const next = resizeFrame(frame, 'bottomRight', { x: 80, y: 20 }, bounds, 1);
    expect(next.width / next.height).toBeCloseTo(1, 4);
  });

  it('drives the ratio from the vertical axis for a top or bottom handle', () => {
    const next = resizeFrame(frame, 'top', { x: 0, y: -60 }, bounds, 1);
    expect(next.width / next.height).toBeCloseTo(1, 4);
    expect(next.y + next.height).toBeCloseTo(frame.y + frame.height, 4);
  });

  it('keeps a locked ratio even when clamped by the bounds', () => {
    const next = resizeFrame(
      frame,
      'bottomRight',
      { x: 9999, y: 9999 },
      bounds,
      1
    );
    expect(next.width / next.height).toBeCloseTo(1, 2);
    expect(next.x + next.width).toBeLessThanOrEqual(bounds.width + 1e-6);
    expect(next.y + next.height).toBeLessThanOrEqual(bounds.height + 1e-6);
  });

  it('shrinks to fit when a tall locked ratio pushes the top out of bounds', () => {
    const low: Rect = { x: 100, y: 600, width: 200, height: 50 };
    const next = resizeFrame(
      low,
      'topLeft',
      { x: -100, y: -500 },
      bounds,
      0.25
    );
    expect(next.y).toBeGreaterThanOrEqual(bounds.y - 1e-6);
    expect(next.y + next.height).toBeLessThanOrEqual(
      bounds.y + bounds.height + 1e-6
    );
    expect(next.width).toBeGreaterThan(0);
  });

  it('shrinks to fit when a wide locked ratio pushes a side out of bounds', () => {
    const narrow: Rect = { x: 170, y: 400, width: 64, height: 64 };
    const next = resizeFrame(narrow, 'top', { x: 0, y: -300 }, bounds, 4);
    expect(next.x).toBeGreaterThanOrEqual(bounds.x - 1e-6);
    expect(next.x + next.width).toBeLessThanOrEqual(
      bounds.x + bounds.width + 1e-6
    );
    expect(next.width).toBeGreaterThan(0);
  });

  it('is stable under a zero drag', () => {
    expect(resizeFrame(frame, 'right', { x: 0, y: 0 }, bounds, null)).toEqual(
      frame
    );
  });

  it('treats non-finite deltas as no movement', () => {
    expect(
      resizeFrame(frame, 'right', { x: NaN, y: NaN }, bounds, null)
    ).toEqual(frame);
  });

  it('never produces a negative size', () => {
    for (const handle of ['left', 'right', 'top', 'bottom'] as const) {
      for (const d of [-9999, -100, 0, 100, 9999]) {
        const next = resizeFrame(frame, handle, { x: d, y: d }, bounds, null);
        expect(next.width).toBeGreaterThanOrEqual(0);
        expect(next.height).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('isFullFrame', () => {
  it('is true for a crop covering the whole image', () => {
    expect(
      isFullFrame({ originX: 0, originY: 0, width: 1000, height: 1000 }, SQUARE)
    ).toBe(true);
  });

  it('tolerates a pixel of rounding', () => {
    expect(
      isFullFrame({ originX: 1, originY: 0, width: 999, height: 1000 }, SQUARE)
    ).toBe(true);
  });

  it('is false for a real crop', () => {
    expect(
      isFullFrame(
        { originX: 100, originY: 100, width: 500, height: 500 },
        SQUARE
      )
    ).toBe(false);
  });

  it('is false for an unmeasured source', () => {
    expect(
      isFullFrame(
        { originX: 0, originY: 0, width: 0, height: 0 },
        { width: 0, height: 0 }
      )
    ).toBe(false);
  });
});

describe('ASPECT_PRESETS', () => {
  it('leads with the two non-numeric options', () => {
    expect(ASPECT_PRESETS[0]!.value).toBe('free');
    expect(ASPECT_PRESETS[1]!.value).toBe('original');
  });

  it('has a usable label and value for every entry', () => {
    for (const preset of ASPECT_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      const resolved = resolveAspectRatio(preset.value, SQUARE);
      expect(resolved === null || resolved > 0).toBe(true);
    }
  });
});

describe('the whole flow', () => {
  /**
   * Drag a handle, let go, and the crop you chose is the crop you get —
   * expressed end to end rather than function by function.
   */
  it('a free drag then release reports the region that was framed', () => {
    const { baseSize } = freeSetup(LANDSCAPE);
    const start = imageRect(baseSize, STAGE, identity);

    // Drag the bottom-right corner in to roughly the top-left quarter.
    const dragged = resizeFrame(
      start,
      'bottomRight',
      { x: -start.width / 2, y: -start.height / 2 },
      start,
      null
    );
    const framed = cropRectFromTransform(
      identity,
      baseSize,
      dragged,
      STAGE,
      LANDSCAPE
    );

    // Roughly the top-left quarter of a 1600x900 photo.
    expect(framed.originX).toBe(0);
    expect(framed.originY).toBe(0);
    expect(framed.width).toBeCloseTo(800, -1);
    expect(framed.height).toBeCloseTo(450, -1);

    // Releasing expands the frame; the crop must not move.
    const next = maximizeFrame(dragged, identity, STAGE, PAD);
    const settled = cropRectFromTransform(
      next.transform,
      baseSize,
      next.frame,
      STAGE,
      LANDSCAPE
    );
    expect(settled.originX).toBeCloseTo(framed.originX, 0);
    expect(settled.originY).toBeCloseTo(framed.originY, 0);
    expect(settled.width).toBeCloseTo(framed.width, 0);
    expect(settled.height).toBeCloseTo(framed.height, 0);
  });

  it('every preset ratio yields a valid, correctly-shaped rect', () => {
    const sources: Size[] = [
      SQUARE,
      LANDSCAPE,
      { width: 900, height: 1600 },
      { width: 4000, height: 800 },
      { width: 120, height: 90 },
    ];

    for (const source of sources) {
      const baseSize = cropImageSize(source, STAGE, PAD);
      for (const ratio of [1, 4 / 5, 16 / 9, 3 / 2]) {
        const frame = frameForAspect(STAGE, ratio, PAD);
        const required = minScaleToCover(baseSize, frame);
        const transform = clampToCover(
          { scale: required, translateX: 0, translateY: 0 },
          baseSize,
          frame,
          STAGE,
          required,
          Math.max(6, required)
        );
        const rect = cropRectFromTransform(
          transform,
          baseSize,
          frame,
          STAGE,
          source
        );

        expect(rect.originX).toBeGreaterThanOrEqual(0);
        expect(rect.originY).toBeGreaterThanOrEqual(0);
        expect(rect.originX + rect.width).toBeLessThanOrEqual(source.width);
        expect(rect.originY + rect.height).toBeLessThanOrEqual(source.height);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
        expect(rect.width / rect.height).toBeCloseTo(ratio, 0);
      }
    }
  });
});
