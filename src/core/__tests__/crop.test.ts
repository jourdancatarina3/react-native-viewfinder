import {
  ASPECT_PRESETS,
  clampToCover,
  cropBaseSize,
  cropRectFromTransform,
  cropTranslationBounds,
  frameForAspect,
  isFullFrame,
  minScaleToCover,
  nextRotation,
  resizeFrame,
  resolveAspectRatio,
  rotatedSize,
} from '../crop';
import type { Rect } from '../crop';
import type { Size, Transform } from '../types';

const CONTAINER: Size = { width: 400, height: 800 };
const SQUARE: Size = { width: 1000, height: 1000 };
const LANDSCAPE: Size = { width: 1600, height: 900 };

const identity: Transform = { scale: 1, translateX: 0, translateY: 0 };

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
  it('fills the padded container when the ratio is free', () => {
    expect(frameForAspect(CONTAINER, null, 20)).toEqual({
      x: 20,
      y: 20,
      width: 360,
      height: 760,
    });
  });

  it('produces a square frame for 1:1, centred', () => {
    const frame = frameForAspect(CONTAINER, 1, 20);
    expect(frame.width).toBe(360);
    expect(frame.height).toBe(360);
    expect(frame.x).toBe(20);
    expect(frame.y).toBe((800 - 360) / 2);
  });

  it('constrains on height when the ratio is very wide', () => {
    // A 16:9 frame in a 400x800 container is limited by width, not height.
    const frame = frameForAspect(CONTAINER, 16 / 9, 0);
    expect(frame.width).toBe(400);
    expect(frame.height).toBeCloseTo(225, 5);
  });

  it('constrains on width when the ratio is very tall', () => {
    const frame = frameForAspect({ width: 800, height: 400 }, 1 / 4, 0);
    expect(frame.height).toBe(400);
    expect(frame.width).toBe(100);
  });

  it('never exceeds the padded container', () => {
    for (const ratio of [0.25, 0.5, 1, 1.5, 2, 4, 16 / 9]) {
      const frame = frameForAspect(CONTAINER, ratio, 16);
      expect(frame.width).toBeLessThanOrEqual(400 - 32 + 1e-9);
      expect(frame.height).toBeLessThanOrEqual(800 - 32 + 1e-9);
    }
  });

  it('is always centred', () => {
    for (const ratio of [0.5, 1, 2]) {
      const frame = frameForAspect(CONTAINER, ratio, 10);
      expect(frame.x + frame.width / 2).toBeCloseTo(CONTAINER.width / 2, 6);
      expect(frame.y + frame.height / 2).toBeCloseTo(CONTAINER.height / 2, 6);
    }
  });

  it('returns an empty rect for an unmeasured container', () => {
    expect(frameForAspect({ width: 0, height: 0 }, 1, 10)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });

  it('survives padding larger than the container', () => {
    const frame = frameForAspect(CONTAINER, 1, 9999);
    expect(frame.width).toBeGreaterThanOrEqual(0);
    expect(frame.height).toBeGreaterThanOrEqual(0);
  });
});

describe('cropBaseSize', () => {
  it('covers the frame exactly on the constrained axis', () => {
    const frame: Rect = { x: 0, y: 0, width: 300, height: 300 };
    const base = cropBaseSize(LANDSCAPE, frame);
    expect(base.height).toBeCloseTo(300, 6);
    expect(base.width).toBeGreaterThanOrEqual(300);
  });

  it('never leaves a gap on either axis', () => {
    const frame: Rect = { x: 0, y: 0, width: 360, height: 200 };
    for (const source of [
      SQUARE,
      LANDSCAPE,
      { width: 900, height: 1600 },
      { width: 4000, height: 800 },
    ]) {
      const base = cropBaseSize(source, frame);
      expect(base.width).toBeGreaterThanOrEqual(frame.width - 1e-9);
      expect(base.height).toBeGreaterThanOrEqual(frame.height - 1e-9);
    }
  });
});

describe('cropTranslationBounds', () => {
  const frame: Rect = { x: 0, y: 0, width: 300, height: 300 };

  it('is zero on an axis where the image exactly covers the frame', () => {
    const base = { width: 300, height: 300 };
    expect(cropTranslationBounds(base, frame, 1)).toEqual({ x: 0, y: 0 });
  });

  it('allows movement on an axis with overhang', () => {
    const base = { width: 500, height: 300 };
    expect(cropTranslationBounds(base, frame, 1).x).toBe(100);
    expect(cropTranslationBounds(base, frame, 1).y).toBe(0);
  });

  it('grows with scale', () => {
    const base = { width: 300, height: 300 };
    expect(cropTranslationBounds(base, frame, 2).x).toBe(150);
  });

  it('never returns a negative bound', () => {
    const base = { width: 100, height: 100 };
    const bounds = cropTranslationBounds(base, frame, 1);
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
    ).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('minScaleToCover', () => {
  it('is 1 when the image already covers the frame', () => {
    expect(
      minScaleToCover(
        { width: 400, height: 400 },
        { x: 0, y: 0, width: 300, height: 300 }
      )
    ).toBe(1);
  });

  it('is above 1 when the frame has outgrown the image', () => {
    // A frame widened from 1:1 to 16:9 can be wider than the laid-out image.
    expect(
      minScaleToCover(
        { width: 300, height: 300 },
        { x: 0, y: 0, width: 450, height: 300 }
      )
    ).toBeCloseTo(1.5, 6);
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
  const frame: Rect = { x: 0, y: 0, width: 300, height: 300 };
  const base = { width: 500, height: 300 };

  it('leaves a centred transform alone', () => {
    expect(clampToCover(identity, base, frame, 1, 6)).toEqual(identity);
  });

  it('pulls the image back so the frame stays covered', () => {
    const drifted: Transform = { scale: 1, translateX: 9999, translateY: 0 };
    expect(clampToCover(drifted, base, frame, 1, 6).translateX).toBe(100);
  });

  it('recentres an axis with no overhang', () => {
    const drifted: Transform = { scale: 1, translateX: 0, translateY: 50 };
    expect(clampToCover(drifted, base, frame, 1, 6).translateY).toBe(0);
  });

  it('clamps scale before computing bounds', () => {
    const overshot: Transform = { scale: 99, translateX: 99999, translateY: 0 };
    const clamped = clampToCover(overshot, base, frame, 1, 4);
    expect(clamped.scale).toBe(4);
    expect(clamped.translateX).toBe(cropTranslationBounds(base, frame, 4).x);
  });

  it('is a fixed point of itself', () => {
    const once = clampToCover(
      { scale: 3, translateX: 5000, translateY: -5000 },
      base,
      frame,
      1,
      6
    );
    expect(clampToCover(once, base, frame, 1, 6)).toEqual(once);
  });
});

describe('cropRectFromTransform', () => {
  const frame: Rect = { x: 50, y: 250, width: 300, height: 300 };

  it('returns the whole image when untransformed and exactly covering', () => {
    const base = cropBaseSize(SQUARE, frame); // 300x300
    expect(cropRectFromTransform(identity, base, frame, SQUARE)).toEqual({
      originX: 0,
      originY: 0,
      width: 1000,
      height: 1000,
    });
  });

  it('returns the centre half at 2x zoom', () => {
    const base = cropBaseSize(SQUARE, frame);
    const zoomed: Transform = { scale: 2, translateX: 0, translateY: 0 };
    expect(cropRectFromTransform(zoomed, base, frame, SQUARE)).toEqual({
      originX: 250,
      originY: 250,
      width: 500,
      height: 500,
    });
  });

  it('moves the crop window opposite to the pan', () => {
    const base = cropBaseSize(SQUARE, frame);
    // Dragging the image right reveals the part of it further left.
    const panned: Transform = { scale: 2, translateX: 50, translateY: 0 };
    const rect = cropRectFromTransform(panned, base, frame, SQUARE);
    expect(rect.originX).toBeLessThan(250);
  });

  it('crops the centre band of a landscape image in a square frame', () => {
    const base = cropBaseSize(LANDSCAPE, frame); // covers 300x300 -> 533x300
    const rect = cropRectFromTransform(identity, base, frame, LANDSCAPE);
    // The full height, and a centred square-ish slice of the width.
    expect(rect.originY).toBe(0);
    expect(rect.height).toBe(900);
    expect(rect.width).toBe(900);
    expect(rect.originX).toBe(Math.round((1600 - 900) / 2));
  });

  it('never returns a rectangle outside the source', () => {
    const base = cropBaseSize(SQUARE, frame);
    for (const transform of [
      { scale: 1, translateX: 99999, translateY: 99999 },
      { scale: 1, translateX: -99999, translateY: -99999 },
      { scale: 6, translateX: 5000, translateY: -5000 },
    ]) {
      const rect = cropRectFromTransform(transform, base, frame, SQUARE);
      expect(rect.originX).toBeGreaterThanOrEqual(0);
      expect(rect.originY).toBeGreaterThanOrEqual(0);
      expect(rect.originX + rect.width).toBeLessThanOrEqual(SQUARE.width);
      expect(rect.originY + rect.height).toBeLessThanOrEqual(SQUARE.height);
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
  });

  it('returns integers, which is what native manipulators require', () => {
    const base = cropBaseSize({ width: 1333, height: 777 }, frame);
    const rect = cropRectFromTransform(
      { scale: 1.37, translateX: 11.3, translateY: -7.9 },
      base,
      frame,
      { width: 1333, height: 777 }
    );
    for (const value of [rect.originX, rect.originY, rect.width, rect.height]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('preserves the frame aspect ratio in the cropped region', () => {
    const wide: Rect = { x: 0, y: 0, width: 320, height: 180 };
    const base = cropBaseSize(SQUARE, wide);
    const rect = cropRectFromTransform(identity, base, wide, SQUARE);
    expect(rect.width / rect.height).toBeCloseTo(320 / 180, 1);
  });

  it('returns an empty rect for degenerate input rather than NaN', () => {
    expect(
      cropRectFromTransform(identity, { width: 0, height: 0 }, frame, SQUARE)
    ).toEqual({ originX: 0, originY: 0, width: 0, height: 0 });
    expect(
      cropRectFromTransform(
        { scale: 0, translateX: 0, translateY: 0 },
        { width: 300, height: 300 },
        frame,
        SQUARE
      )
    ).toEqual({ originX: 0, originY: 0, width: 0, height: 0 });
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
  const bounds: Rect = { x: 0, y: 0, width: 400, height: 800 };
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
    // The bottom-right corner has not moved.
    expect(next.x + next.width).toBe(300);
    expect(next.y + next.height).toBe(400);
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

  it('keeps a locked ratio when dragging a side handle', () => {
    const next = resizeFrame(frame, 'right', { x: 100, y: 0 }, bounds, 1);
    expect(next.width / next.height).toBeCloseTo(1, 4);
  });

  it('keeps a locked ratio when dragging a corner', () => {
    const next = resizeFrame(frame, 'bottomRight', { x: 80, y: 20 }, bounds, 1);
    expect(next.width / next.height).toBeCloseTo(1, 4);
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

  it('drives the ratio from the vertical axis for a top or bottom handle', () => {
    // A side handle must not fight the corner it is anchored to: dragging the
    // top edge should resize by height and let width follow.
    const next = resizeFrame(frame, 'top', { x: 0, y: -60 }, bounds, 1);
    expect(next.width / next.height).toBeCloseTo(1, 4);
    // The bottom edge is the anchor and must not move.
    expect(next.y + next.height).toBeCloseTo(frame.y + frame.height, 4);
  });

  it('anchors on the bottom-right when dragging the top-left with a locked ratio', () => {
    const next = resizeFrame(frame, 'topLeft', { x: -40, y: -40 }, bounds, 1);
    expect(next.width / next.height).toBeCloseTo(1, 4);
    expect(next.x + next.width).toBeCloseTo(frame.x + frame.width, 4);
    expect(next.y + next.height).toBeCloseTo(frame.y + frame.height, 4);
  });

  it('shrinks to fit when a locked ratio overflows the top of the bounds', () => {
    const tall: Rect = { x: 100, y: 10, width: 200, height: 200 };
    const next = resizeFrame(tall, 'top', { x: 0, y: -9999 }, bounds, 1);
    expect(next.y).toBeGreaterThanOrEqual(bounds.y - 1e-6);
    expect(next.width / next.height).toBeCloseTo(1, 2);
  });

  it('shrinks to fit when a locked ratio overflows the left of the bounds', () => {
    const near: Rect = { x: 10, y: 200, width: 200, height: 200 };
    const next = resizeFrame(near, 'left', { x: -9999, y: 0 }, bounds, 1);
    expect(next.x).toBeGreaterThanOrEqual(bounds.x - 1e-6);
    expect(next.width / next.height).toBeCloseTo(1, 2);
  });

  it('keeps a non-square locked ratio when clamped', () => {
    const next = resizeFrame(
      frame,
      'bottomRight',
      { x: 9999, y: 9999 },
      bounds,
      16 / 9
    );
    expect(next.width / next.height).toBeCloseTo(16 / 9, 1);
    expect(next.x + next.width).toBeLessThanOrEqual(bounds.width + 1e-6);
    expect(next.y + next.height).toBeLessThanOrEqual(bounds.height + 1e-6);
  });

  it('shrinks to fit when a tall locked ratio pushes the top out of bounds', () => {
    // A 1:4 ratio turns a 300-wide frame into a 1200-tall one, which cannot fit
    // above the anchored bottom edge. The frame must shrink rather than escape.
    const low: Rect = { x: 100, y: 700, width: 200, height: 50 };
    const next = resizeFrame(
      low,
      'topLeft',
      { x: -100, y: -600 },
      bounds,
      0.25
    );
    expect(next.y).toBeGreaterThanOrEqual(bounds.y - 1e-6);
    expect(next.y + next.height).toBeLessThanOrEqual(
      bounds.y + bounds.height + 1e-6
    );
    expect(next.width).toBeGreaterThan(0);
    expect(next.height).toBeGreaterThan(0);
  });

  it('shrinks to fit when a wide locked ratio pushes a side out of bounds', () => {
    // Driven by height (a top handle), a 4:1 ratio demands far more width than
    // the bounds allow.
    const narrow: Rect = { x: 170, y: 400, width: 64, height: 64 };
    const next = resizeFrame(narrow, 'top', { x: 0, y: -300 }, bounds, 4);
    expect(next.x).toBeGreaterThanOrEqual(bounds.x - 1e-6);
    expect(next.x + next.width).toBeLessThanOrEqual(
      bounds.x + bounds.width + 1e-6
    );
    expect(next.width).toBeGreaterThan(0);
    expect(next.height).toBeGreaterThan(0);
  });

  it('respects the minimum size even when shrinking to fit', () => {
    const tiny: Rect = { x: 0, y: 0, width: 80, height: 80 };
    const next = resizeFrame(
      tiny,
      'bottomRight',
      { x: 9999, y: 9999 },
      { x: 0, y: 0, width: 90, height: 90 },
      1,
      64
    );
    expect(next.width).toBeGreaterThanOrEqual(64 - 1e-6);
    expect(next.height).toBeGreaterThanOrEqual(64 - 1e-6);
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

describe('round trip', () => {
  /**
   * The property that matters most: whatever the user frames, the rectangle
   * handed to the manipulator has the frame's aspect ratio and lies inside the
   * image. Checked across a sweep rather than at one point.
   */
  it('produces a valid, correctly-shaped rect across many states', () => {
    const sources: Size[] = [
      SQUARE,
      LANDSCAPE,
      { width: 900, height: 1600 },
      { width: 4000, height: 800 },
      { width: 120, height: 90 },
    ];
    const ratios = [1, 4 / 5, 16 / 9, 3 / 2];
    const scales = [1, 1.3, 2.7, 5];

    for (const source of sources) {
      for (const ratio of ratios) {
        const frame = frameForAspect(CONTAINER, ratio, 16);
        const base = cropBaseSize(source, frame);
        for (const scale of scales) {
          const bounds = cropTranslationBounds(base, frame, scale);
          const transform: Transform = {
            scale,
            translateX: bounds.x,
            translateY: -bounds.y,
          };
          const rect = cropRectFromTransform(transform, base, frame, source);

          expect(rect.originX).toBeGreaterThanOrEqual(0);
          expect(rect.originY).toBeGreaterThanOrEqual(0);
          expect(rect.originX + rect.width).toBeLessThanOrEqual(source.width);
          expect(rect.originY + rect.height).toBeLessThanOrEqual(source.height);
          expect(rect.width).toBeGreaterThan(0);
          expect(rect.height).toBeGreaterThan(0);
          // Aspect ratio survives, within a pixel of rounding on small images.
          expect(rect.width / rect.height).toBeCloseTo(ratio, 0);
        }
      }
    }
  });
});
