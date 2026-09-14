import { clamp, isUsableSize, translationBounds } from './geometry';
import type { Size, Transform, Vector } from './types';

/**
 * Recomputes the translation needed to keep the content point currently under
 * `focal` pinned in place while the scale changes.
 *
 * This is the single most bug-prone calculation in a zoom implementation — the
 * recurring "focal point calculation wrong on Android" and "pinch jumps" class
 * of issue almost always traces back to here. The derivation:
 *
 * A content point `c` (measured from the content's centre, in base units) is
 * drawn at, relative to the container's centre:
 *
 *     screen = translate + scale * c
 *
 * so the content point currently sitting under the focal point is:
 *
 *     c = (focal - translate) / scale
 *
 * To keep that same `c` under `focal` after scaling to `nextScale`:
 *
 *     focal = nextTranslate + nextScale * c
 *     nextTranslate = focal - (focal - translate) * (nextScale / scale)
 *
 * `focal` must already be expressed relative to the *container's centre*, not
 * its top-left corner — {@link toCentreRelative} does that conversion.
 *
 * @param transform - the transform before scaling
 * @param nextScale - the scale being moved to
 * @param focal - the anchor point, relative to the container's centre
 */
export function scaleAround(
  transform: Transform,
  nextScale: number,
  focal: Vector
): Transform {
  'worklet';
  const { scale, translateX, translateY } = transform;

  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(nextScale)) {
    return transform;
  }

  const ratio = nextScale / scale;

  return {
    scale: nextScale,
    translateX: focal.x - (focal.x - translateX) * ratio,
    translateY: focal.y - (focal.y - translateY) * ratio,
  };
}

/**
 * Converts a point in container coordinates (origin at the top-left, as
 * reported by gesture events) to one relative to the container's centre, which
 * is the origin every transform here is expressed in.
 */
export function toCentreRelative(point: Vector, container: Size): Vector {
  'worklet';
  if (!isUsableSize(container)) {
    return { x: 0, y: 0 };
  }
  return {
    x: point.x - container.width / 2,
    y: point.y - container.height / 2,
  };
}

/**
 * Clamps a transform so the content never shows a gap along an axis where it
 * is large enough to fill the container, and stays centred on axes where it is
 * not.
 *
 * Applied on gesture release rather than during the gesture, so that panning
 * past an edge can rubber-band first.
 */
export function clampTransform(
  transform: Transform,
  baseSize: Size,
  container: Size,
  minScale: number,
  maxScale: number
): Transform {
  'worklet';
  const scale = clamp(transform.scale, minScale, maxScale);
  const bounds = translationBounds(baseSize, container, scale);

  return {
    scale,
    translateX: clamp(transform.translateX, -bounds.x, bounds.x),
    translateY: clamp(transform.translateY, -bounds.y, bounds.y),
  };
}

/**
 * Picks the scale a double-tap should move to, cycling through `levels`.
 *
 * Tapping repeatedly steps up through each level and then returns to
 * `minScale`, mirroring the behaviour of the iOS and Android photo viewers. A
 * small epsilon absorbs floating-point drift so a scale of `2.0000001` still
 * counts as "already at level 2".
 *
 * @param currentScale - the scale at the moment of the tap
 * @param levels - ascending scale stops, e.g. `[2, 4]`
 * @param minScale - the scale to return to after the last level
 */
export function nextDoubleTapScale(
  currentScale: number,
  levels: readonly number[],
  minScale: number,
  epsilon = 0.01
): number {
  'worklet';
  if (levels.length === 0) {
    return minScale;
  }

  for (let i = 0; i < levels.length; i += 1) {
    const level = levels[i]!;
    if (currentScale < level - epsilon) {
      return level;
    }
  }

  return minScale;
}

/**
 * Computes the transform a double-tap should animate to.
 *
 * Zooming *in* anchors on the tapped point so the thing you tapped is what you
 * get a closer look at. Zooming back *out* ignores the tap location and
 * returns to centred, which is what makes the gesture feel like a reset rather
 * than a pan.
 *
 * @param tapPoint - the tap, in container coordinates (top-left origin)
 */
export function doubleTapTransform(
  transform: Transform,
  tapPoint: Vector,
  baseSize: Size,
  container: Size,
  levels: readonly number[],
  minScale: number,
  maxScale: number
): Transform {
  'worklet';
  const target = clamp(
    nextDoubleTapScale(transform.scale, levels, minScale),
    minScale,
    maxScale
  );

  if (target <= minScale) {
    return { scale: minScale, translateX: 0, translateY: 0 };
  }

  const focal = toCentreRelative(tapPoint, container);
  const scaled = scaleAround(transform, target, focal);

  return clampTransform(scaled, baseSize, container, minScale, maxScale);
}

/**
 * Whether the content is at (or within `epsilon` of) its resting, fitted size.
 *
 * Gates the interactions that only make sense when not zoomed in: swipe-to-
 * dismiss, and handing a horizontal drag to the pager. Checking scale rather
 * than tracking a separate "is zoomed" flag keeps the two from drifting apart
 * mid-gesture.
 */
export function isAtRest(
  scale: number,
  minScale: number,
  epsilon = 0.01
): boolean {
  'worklet';
  return scale <= minScale + epsilon;
}
