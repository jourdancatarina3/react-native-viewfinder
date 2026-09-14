import { clamp } from './geometry';

/**
 * iOS-style rubber-band resistance.
 *
 * Maps an unbounded overshoot distance onto a bounded, decelerating one, so
 * dragging past an edge feels like stretching rather than hitting a wall:
 *
 *     f(x) = (x · d · c) / (x + d)
 *
 * The form is chosen so that both of its endpoints behave:
 *
 * - `f'(0) = c`, so at the instant the finger crosses the boundary the content
 *   is still tracking it at the same rate it was a moment earlier. Curves that
 *   start slower than this produce a perceptible "stick" at the edge.
 * - `f(∞) = d · c`, so however far the finger travels the content never moves
 *   more than ~55% of a container past the limit.
 *
 * @param overshoot - distance travelled past the limit (may be negative)
 * @param dimension - the container extent along this axis
 * @param coefficient - resistance; lower is stiffer. 0.55 matches UIScrollView.
 */
export function rubberBand(
  overshoot: number,
  dimension: number,
  coefficient = 0.55
): number {
  'worklet';
  if (!Number.isFinite(overshoot) || overshoot === 0) {
    return 0;
  }
  if (!Number.isFinite(dimension) || dimension <= 0) {
    return 0;
  }

  const direction = overshoot < 0 ? -1 : 1;
  const distance = Math.abs(overshoot);
  const resisted =
    (distance * dimension * coefficient) / (distance + dimension);

  return direction * resisted;
}

/**
 * Applies a translation, letting it rubber-band once it passes `limit`.
 *
 * Inside the bounds the value passes through untouched; outside, only the
 * excess is resisted, so there is no discontinuity at the boundary.
 *
 * @param value - the raw, unclamped translation
 * @param limit - the maximum absolute translation (from `translationBounds`)
 * @param dimension - the container extent along this axis
 */
export function withRubberBand(
  value: number,
  limit: number,
  dimension: number,
  coefficient = 0.55
): number {
  'worklet';
  if (!Number.isFinite(value)) {
    return 0;
  }

  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 0;

  if (value > safeLimit) {
    return safeLimit + rubberBand(value - safeLimit, dimension, coefficient);
  }
  if (value < -safeLimit) {
    return -safeLimit + rubberBand(value + safeLimit, dimension, coefficient);
  }
  return value;
}

/**
 * How far past an edge the content currently sits, per axis.
 *
 * Positive means past the upper bound, negative past the lower, `0` in range.
 * Used to decide whether a drag at the edge should be handed to the pager.
 */
export function overshootAmount(value: number, limit: number): number {
  'worklet';
  if (!Number.isFinite(value)) {
    return 0;
  }
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 0;
  if (value > safeLimit) {
    return value - safeLimit;
  }
  if (value < -safeLimit) {
    return value + safeLimit;
  }
  return 0;
}

/**
 * Predicts where a decaying pan will come to rest.
 *
 * Uses the same exponential model Reanimated's `withDecay` does, so the page
 * that a fling settles on can be decided *before* the animation starts rather
 * than by watching it.
 *
 * @param velocity - in px/s
 * @param deceleration - per-frame retention factor; 0.998 is Reanimated's default
 */
export function decayEndpoint(
  position: number,
  velocity: number,
  deceleration = 0.998
): number {
  'worklet';
  if (!Number.isFinite(position)) {
    return 0;
  }
  if (!Number.isFinite(velocity) || velocity === 0) {
    return position;
  }
  // Sum of the geometric series the per-frame decay produces, at 60fps.
  return position + (velocity * deceleration) / (1000 * (1 - deceleration));
}

/**
 * Decides which page a horizontal swipe should land on.
 *
 * A page changes when the drag passes `distanceThreshold` *or* when it is
 * released fast enough to read as a flick, even if it barely moved. Movement
 * is capped at one page per gesture so a fast swipe cannot skip images.
 *
 * @param translation - horizontal drag distance; negative moves to later pages
 * @param velocity - release velocity in px/s
 * @param currentIndex - the page the gesture started on
 * @param pageCount - total pages
 * @param distanceThreshold - drag distance that commits a page change
 * @param velocityThreshold - release speed that commits a page change
 */
export function resolvePageIndex(
  translation: number,
  velocity: number,
  currentIndex: number,
  pageCount: number,
  distanceThreshold: number,
  velocityThreshold = 500
): number {
  'worklet';
  if (pageCount <= 0) {
    return 0;
  }

  const safeTranslation = Number.isFinite(translation) ? translation : 0;
  const safeVelocity = Number.isFinite(velocity) ? velocity : 0;

  const passedDistance = Math.abs(safeTranslation) > distanceThreshold;
  const passedVelocity = Math.abs(safeVelocity) > velocityThreshold;

  let next = currentIndex;

  if (passedDistance || passedVelocity) {
    // Distance wins when both apply but disagree — a long drag that ends with a
    // small flick back should still commit to where it was dragged.
    const direction = passedDistance
      ? Math.sign(safeTranslation)
      : Math.sign(safeVelocity);
    next = currentIndex - direction;
  }

  return clamp(Math.round(next), 0, pageCount - 1);
}

/**
 * Whether a vertical drag should dismiss the gallery.
 *
 * Deliberately requires both a real distance *or* a decisive flick, and is
 * only ever consulted when the image is at rest — panning a zoomed-in image
 * upward must never close the viewer, which is a long-standing complaint
 * against several existing libraries.
 */
export function shouldDismiss(
  translationY: number,
  velocityY: number,
  distanceThreshold: number,
  velocityThreshold = 800
): boolean {
  'worklet';
  const distance = Number.isFinite(translationY) ? Math.abs(translationY) : 0;
  const velocity = Number.isFinite(velocityY) ? Math.abs(velocityY) : 0;
  return distance > distanceThreshold || velocity > velocityThreshold;
}

/**
 * Backdrop opacity for a given dismiss drag distance.
 *
 * Fades to `minOpacity` as the drag approaches the distance at which releasing
 * would dismiss, giving a continuous preview of the outcome.
 */
export function dismissProgress(
  translationY: number,
  dismissDistance: number
): number {
  'worklet';
  if (!Number.isFinite(translationY) || !Number.isFinite(dismissDistance)) {
    return 0;
  }
  if (dismissDistance <= 0) {
    return 0;
  }
  return clamp(Math.abs(translationY) / dismissDistance, 0, 1);
}

/**
 * Scale applied to the image while it is being dragged away.
 *
 * Shrinking slightly as the drag progresses reads as the image receding
 * towards its origin, and makes the dismissal feel deliberate rather than
 * accidental.
 */
export function dismissScale(progress: number, minScale = 0.75): number {
  'worklet';
  const safeProgress = clamp(progress, 0, 1);
  return 1 - (1 - minScale) * safeProgress;
}
