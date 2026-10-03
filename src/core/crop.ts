import { clamp, fitSize, isUsableSize } from './geometry';
import type { Size, Transform, Vector } from './types';

/**
 * A rectangle in the source image's own pixel coordinates, with its origin at
 * the image's top-left.
 *
 * This is deliberately the shape `expo-image-manipulator`, `@react-native-community/image-editor`
 * and most native croppers already expect, so it can be handed straight to
 * them with no conversion.
 */
export type CropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

/** Quarter-turn rotations, clockwise. */
export type Rotation = 0 | 90 | 180 | 270;

/**
 * Everything needed to reproduce what the user framed.
 *
 * The operations are **order-dependent**: rotate, then flip, then crop. The
 * crop rectangle is expressed in the coordinates of the already-rotated,
 * already-flipped image, so applying them in any other order silently crops
 * the wrong region. `react-native-viewfinder/expo-image-manipulator` applies
 * them correctly for you.
 */
export type CropResult = {
  /** Clockwise rotation to apply before cropping. */
  rotate: Rotation;
  flipHorizontal: boolean;
  flipVertical: boolean;
  /** The crop rectangle, in the coordinates of the *rotated* image. */
  crop: CropRect;
  /** The source image's natural size, before any rotation. */
  sourceSize: Size;
};

/** A rectangle in container coordinates, origin top-left. */
export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * `'free'` lets the frame be dragged to any shape; a number locks it to
 * width ÷ height; `'original'` locks it to the source image's own ratio.
 */
export type AspectRatio = number | 'free' | 'original';

/** The eight drag targets on a crop frame. */
export type CropHandle =
  | 'topLeft'
  | 'top'
  | 'topRight'
  | 'right'
  | 'bottomRight'
  | 'bottom'
  | 'bottomLeft'
  | 'left';

/* --------------------------------------------------------------------------
 * The model
 *
 * The image's layout size depends only on the stage, never on the crop frame.
 * That separation is the whole design, and getting it wrong is what makes a
 * crop UI feel broken: if the image is laid out to *cover* the frame, then
 * dragging a handle resizes the image too, and the picture squirms out from
 * under your finger.
 *
 * So: the image is fitted to the padded stage at scale 1 and transformed about
 * the stage's centre. The frame is an independent rectangle. The only coupling
 * is a constraint — the frame must stay inside the image's drawn rect — and it
 * is enforced by clamping the transform, never by resizing anything.
 * ----------------------------------------------------------------------- */

/**
 * The size the image is drawn at when `scale` is 1.
 *
 * Fitted to the padded stage, so the whole image is visible to begin with and
 * the starting frame can sit exactly around it. Depends only on the stage —
 * changing the crop frame must never change this.
 */
export function cropImageSize(
  source: Size,
  container: Size,
  padding = 0
): Size {
  'worklet';
  if (!isUsableSize(container)) {
    return { width: 0, height: 0 };
  }
  return fitSize(source, {
    width: Math.max(1, container.width - padding * 2),
    height: Math.max(1, container.height - padding * 2),
  });
}

/**
 * Where the image is actually drawn, in container coordinates.
 *
 * Used for two things: the frame's starting shape, and the limit handles may
 * be dragged to — in iOS you cannot pull a crop handle out past the photo, and
 * neither can you here.
 */
export function imageRect(
  baseSize: Size,
  container: Size,
  transform: Transform
): Rect {
  'worklet';
  if (!isUsableSize(baseSize) || !isUsableSize(container)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale =
    Number.isFinite(transform.scale) && transform.scale > 0
      ? transform.scale
      : 1;
  const width = baseSize.width * scale;
  const height = baseSize.height * scale;
  return {
    x: container.width / 2 + transform.translateX - width / 2,
    y: container.height / 2 + transform.translateY - height / 2,
    width,
    height,
  };
}

/** The intersection of two rectangles, or a zero rect if they do not overlap. */
export function intersectRects(a: Rect, b: Rect): Rect {
  'worklet';
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

/**
 * The crop frame's centre, measured from the container's centre.
 *
 * Every transform here is expressed about the container's centre, so this is
 * the offset that must be threaded through once the frame stops being
 * centred — which is the moment a handle is dragged. Omitting it is why a
 * dragged frame can report a crop rectangle that never changes.
 */
export function frameCentreOffset(frame: Rect, container: Size): Vector {
  'worklet';
  if (!isUsableSize(container)) {
    return { x: 0, y: 0 };
  }
  return {
    x: frame.x + frame.width / 2 - container.width / 2,
    y: frame.y + frame.height / 2 - container.height / 2,
  };
}

/**
 * Resolves an {@link AspectRatio} to a concrete number, or `null` for free.
 */
export function resolveAspectRatio(
  aspect: AspectRatio,
  sourceSize: Size | null
): number | null {
  'worklet';
  if (aspect === 'free') {
    return null;
  }
  if (aspect === 'original') {
    return isUsableSize(sourceSize)
      ? sourceSize.width / sourceSize.height
      : null;
  }
  return Number.isFinite(aspect) && aspect > 0 ? aspect : null;
}

/**
 * The largest rectangle of a given aspect ratio that fits inside `container`,
 * inset by `padding` and centred.
 *
 * Also the target the frame expands back to after a handle drag — see
 * {@link maximizeFrame}.
 */
export function frameForAspect(
  container: Size,
  aspectRatio: number | null,
  padding = 0
): Rect {
  'worklet';
  if (!isUsableSize(container)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const availableWidth = Math.max(0, container.width - padding * 2);
  const availableHeight = Math.max(0, container.height - padding * 2);

  if (
    aspectRatio === null ||
    !Number.isFinite(aspectRatio) ||
    aspectRatio <= 0
  ) {
    return {
      x: padding,
      y: padding,
      width: availableWidth,
      height: availableHeight,
    };
  }

  let width = availableWidth;
  let height = width / aspectRatio;

  if (height > availableHeight) {
    height = availableHeight;
    width = height * aspectRatio;
  }

  return {
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
    width,
    height,
  };
}

/**
 * How far the image may be translated, per axis, while still covering the
 * frame. The range is centred on the *frame's* centre, not the container's.
 */
export function cropTranslationBounds(
  baseSize: Size,
  frame: Rect,
  scale: number
): { x: number; y: number } {
  'worklet';
  if (!isUsableSize(baseSize) || frame.width <= 0 || frame.height <= 0) {
    return { x: 0, y: 0 };
  }
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    x: Math.max(0, (baseSize.width * safeScale - frame.width) / 2),
    y: Math.max(0, (baseSize.height * safeScale - frame.height) / 2),
  };
}

/**
 * The smallest scale at which the image still covers the frame.
 *
 * Unlike the gallery's `minScale`, this is not floored at 1: once the frame
 * has been dragged smaller than the image, zooming out below the fitted size
 * is legitimate, because the frame is still covered.
 */
export function minScaleToCover(baseSize: Size, frame: Rect): number {
  'worklet';
  if (!isUsableSize(baseSize) || frame.width <= 0 || frame.height <= 0) {
    return 1;
  }
  return Math.max(frame.width / baseSize.width, frame.height / baseSize.height);
}

/**
 * Clamps a transform so the image keeps covering the frame, wherever the frame
 * happens to be.
 */
export function clampToCover(
  transform: Transform,
  baseSize: Size,
  frame: Rect,
  container: Size,
  minScale: number,
  maxScale: number
): Transform {
  'worklet';
  const scale = clamp(transform.scale, minScale, maxScale);
  const bounds = cropTranslationBounds(baseSize, frame, scale);
  const centre = frameCentreOffset(frame, container);
  return {
    scale,
    translateX: clamp(
      transform.translateX,
      centre.x - bounds.x,
      centre.x + bounds.x
    ),
    translateY: clamp(
      transform.translateY,
      centre.y - bounds.y,
      centre.y + bounds.y
    ),
  };
}

/**
 * Converts what is currently framed into a rectangle in source-image pixels.
 *
 * The derivation, in base units measured from the image's own centre:
 *
 * - A content point `c` is drawn at `translate + scale · c`, relative to the
 *   container's centre.
 * - So the content point under the **frame's** centre is
 *   `(frameCentre − translate) / scale`, where `frameCentre` is the frame's
 *   offset from the container's centre.
 * - The frame's half-extents in base units are `frame / (2 · scale)`.
 * - Base units convert to source pixels by `k = source.width / base.width`.
 * - The source's origin is its top-left, so half the source size is added back.
 *
 * Edges are then intersected with the image and rounded: a crop rectangle that
 * runs even half a pixel outside the source throws in most native
 * manipulators.
 */
export function cropRectFromTransform(
  transform: Transform,
  baseSize: Size,
  frame: Rect,
  container: Size,
  sourceSize: Size
): CropRect {
  'worklet';
  if (
    !isUsableSize(baseSize) ||
    !isUsableSize(sourceSize) ||
    !isUsableSize(container) ||
    frame.width <= 0 ||
    frame.height <= 0 ||
    !Number.isFinite(transform.scale) ||
    transform.scale <= 0
  ) {
    return { originX: 0, originY: 0, width: 0, height: 0 };
  }

  const k = sourceSize.width / baseSize.width;
  const scale = transform.scale;
  const centre = frameCentreOffset(frame, container);

  const contentX = (centre.x - transform.translateX) / scale;
  const contentY = (centre.y - transform.translateY) / scale;
  const halfWidth = frame.width / (2 * scale);
  const halfHeight = frame.height / (2 * scale);

  const rawX = sourceSize.width / 2 + (contentX - halfWidth) * k;
  const rawY = sourceSize.height / 2 + (contentY - halfHeight) * k;
  const rawWidth = (frame.width * k) / scale;
  const rawHeight = (frame.height * k) / scale;

  // Intersect with the image, keeping at least one pixel on each axis.
  // Clamping the origin and the size independently is not enough: an origin
  // pushed to the far edge leaves no room, and the size collapses to zero.
  const left = clamp(rawX, 0, Math.max(0, sourceSize.width - 1));
  const top = clamp(rawY, 0, Math.max(0, sourceSize.height - 1));
  const right = clamp(rawX + rawWidth, left + 1, sourceSize.width);
  const bottom = clamp(rawY + rawHeight, top + 1, sourceSize.height);

  const originX = Math.round(left);
  const originY = Math.round(top);

  return {
    originX,
    originY,
    width: clamp(
      Math.round(right) - originX,
      1,
      Math.max(1, Math.floor(sourceSize.width) - originX)
    ),
    height: clamp(
      Math.round(bottom) - originY,
      1,
      Math.max(1, Math.floor(sourceSize.height) - originY)
    ),
  };
}

/**
 * Expands a dragged frame back out to fill the stage, and says how the image
 * must move to keep the same content framed.
 *
 * This is the step that makes a crop screen feel like the iOS one. After you
 * let go of a handle, the frame does not sit there small and off to one side:
 * it animates out to the largest rectangle of that shape the stage can hold,
 * centred, while the photo zooms and slides underneath so that exactly the
 * same crop stays inside it.
 *
 * The returned transform is derived, not guessed. With `k` the ratio of the
 * new frame's width to the old one's, keeping the content point under the old
 * frame's centre at the new frame's centre requires:
 *
 *     scale′     = scale · k
 *     translate′ = −k · (frameCentre − translate)
 *
 * Substituting back shows the framed content point and the half-extents are
 * both unchanged, so `cropRectFromTransform` returns an identical rectangle
 * before and after.
 */
export function maximizeFrame(
  frame: Rect,
  transform: Transform,
  container: Size,
  padding = 0
): { frame: Rect; transform: Transform } {
  'worklet';
  if (
    !isUsableSize(container) ||
    frame.width <= 0 ||
    frame.height <= 0 ||
    !Number.isFinite(transform.scale) ||
    transform.scale <= 0
  ) {
    return { frame, transform };
  }

  const target = frameForAspect(container, frame.width / frame.height, padding);
  if (target.width <= 0) {
    return { frame, transform };
  }

  const k = target.width / frame.width;
  const centre = frameCentreOffset(frame, container);

  return {
    frame: target,
    transform: {
      scale: transform.scale * k,
      translateX: -k * (centre.x - transform.translateX),
      translateY: -k * (centre.y - transform.translateY),
    },
  };
}

/**
 * The image's size after a quarter-turn rotation.
 *
 * Every downstream calculation works in the rotated image's coordinate space,
 * because that is the space the crop rectangle is expressed in.
 */
export function rotatedSize(source: Size, rotation: Rotation): Size {
  'worklet';
  return rotation === 90 || rotation === 270
    ? { width: source.height, height: source.width }
    : { width: source.width, height: source.height };
}

/** Adds a quarter turn, wrapping at 360. */
export function nextRotation(rotation: Rotation, turns = 1): Rotation {
  'worklet';
  const steps = (((rotation / 90 + turns) % 4) + 4) % 4;
  return (steps * 90) as Rotation;
}

/**
 * Resizes a crop frame by dragging one of its handles.
 *
 * Constraints, in the order they are applied:
 *
 * 1. The dragged edges move with the finger; the opposite edges stay put, so
 *    the frame grows from the corner you are holding.
 * 2. With a locked aspect ratio, the other axis follows, pivoting about the
 *    anchor corner rather than the centre — otherwise the frame appears to
 *    slide sideways as you drag.
 * 3. The frame is never smaller than `minSize`, and never leaves `bounds` —
 *    which the caller sets to the image's drawn rect, so a handle cannot be
 *    pulled out past the photo.
 *
 * @param handle - which handle is being dragged
 * @param delta - movement since the gesture began, in container coordinates
 * @param bounds - the area the frame must stay inside
 * @param aspectRatio - locked ratio, or `null` for free
 */
export function resizeFrame(
  frame: Rect,
  handle: CropHandle,
  delta: Vector,
  bounds: Rect,
  aspectRatio: number | null,
  minSize = 64
): Rect {
  'worklet';
  const dx = Number.isFinite(delta.x) ? delta.x : 0;
  const dy = Number.isFinite(delta.y) ? delta.y : 0;

  // A frame smaller than two minimums cannot be dragged at all, so the minimum
  // is capped by what the bounds can actually hold.
  const limit = Math.max(
    8,
    Math.min(minSize, bounds.width / 2, bounds.height / 2)
  );

  let left = frame.x;
  let top = frame.y;
  let right = frame.x + frame.width;
  let bottom = frame.y + frame.height;

  const movesLeft =
    handle === 'left' || handle === 'topLeft' || handle === 'bottomLeft';
  const movesRight =
    handle === 'right' || handle === 'topRight' || handle === 'bottomRight';
  const movesTop =
    handle === 'top' || handle === 'topLeft' || handle === 'topRight';
  const movesBottom =
    handle === 'bottom' || handle === 'bottomLeft' || handle === 'bottomRight';

  if (movesLeft) {
    left = clamp(left + dx, bounds.x, right - limit);
  }
  if (movesRight) {
    right = clamp(right + dx, left + limit, bounds.x + bounds.width);
  }
  if (movesTop) {
    top = clamp(top + dy, bounds.y, bottom - limit);
  }
  if (movesBottom) {
    bottom = clamp(bottom + dy, top + limit, bounds.y + bounds.height);
  }

  let width = right - left;
  let height = bottom - top;

  if (aspectRatio !== null && aspectRatio > 0) {
    // Drive the ratio from whichever axis the handle actually controls, so a
    // side handle does not fight the corner it is anchored to.
    const drivenByWidth = movesLeft || movesRight;
    if (drivenByWidth) {
      height = width / aspectRatio;
    } else {
      width = height * aspectRatio;
    }

    // Grow away from the anchored edge.
    if (movesLeft) {
      left = right - width;
    } else {
      right = left + width;
    }
    if (movesTop) {
      top = bottom - height;
    } else {
      bottom = top + height;
    }

    // Re-clamping can break the ratio, so shrink to fit instead of forcing it.
    const overflowX = Math.max(
      0,
      bounds.x - left,
      right - (bounds.x + bounds.width)
    );
    const overflowY = Math.max(
      0,
      bounds.y - top,
      bottom - (bounds.y + bounds.height)
    );
    if (overflowX > 0 || overflowY > 0) {
      const shrink = Math.min(
        width > 0 ? (width - overflowX * 2) / width : 1,
        height > 0 ? (height - overflowY * 2) / height : 1
      );
      const factor = clamp(shrink, 0, 1);
      const centreX = (left + right) / 2;
      const centreY = (top + bottom) / 2;
      width = Math.max(limit, width * factor);
      height = Math.max(limit / aspectRatio, height * factor);

      // Shrinking about the old centre is not enough. When the ratio demanded
      // far more room than exists, that centre is itself outside the bounds,
      // and the shrunken frame lands outside with it. Slide it back in —
      // translating rather than resizing, so the ratio and the minimum survive.
      const maxLeft = Math.max(bounds.x, bounds.x + bounds.width - width);
      const maxTop = Math.max(bounds.y, bounds.y + bounds.height - height);
      left = clamp(centreX - width / 2, bounds.x, maxLeft);
      top = clamp(centreY - height / 2, bounds.y, maxTop);
      right = left + width;
      bottom = top + height;
    }
  }

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * Whether a crop is the whole image — used to decide if "Reset" should be
 * offered, and to skip a pointless round-trip through the manipulator when the
 * user has not actually cropped anything.
 */
export function isFullFrame(
  crop: CropRect,
  sourceSize: Size,
  tolerance = 2
): boolean {
  'worklet';
  if (!isUsableSize(sourceSize)) {
    return false;
  }
  return (
    Math.abs(crop.originX) <= tolerance &&
    Math.abs(crop.originY) <= tolerance &&
    Math.abs(crop.width - sourceSize.width) <= tolerance &&
    Math.abs(crop.height - sourceSize.height) <= tolerance
  );
}

/** Common aspect-ratio presets, in the order a toolbar should show them. */
export const ASPECT_PRESETS: readonly {
  label: string;
  value: AspectRatio;
}[] = [
  { label: 'Free', value: 'free' },
  { label: 'Original', value: 'original' },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '3:4', value: 3 / 4 },
  { label: '2:3', value: 2 / 3 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
];
