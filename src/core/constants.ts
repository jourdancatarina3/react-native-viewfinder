/**
 * Defaults shared by the components and the hooks.
 *
 * These are the values that make the "pass nothing but `images`" case feel
 * right; every one of them is overridable through props.
 */

/** Resting scale. The content is fitted to the container at this scale. */
export const MIN_SCALE = 1;

/**
 * Default zoom ceiling. Raised automatically for large images so they can
 * always be inspected at 1:1 — see `resolveMaxScale`.
 */
export const MAX_SCALE = 6;

/** Scale stops a double-tap cycles through before returning to `MIN_SCALE`. */
export const DOUBLE_TAP_SCALES: readonly number[] = [2.5];

/** Gap between gallery pages, in pixels. */
export const PAGE_GAP = 24;

/**
 * Fraction of the container width a horizontal drag must cover to commit to a
 * page change.
 */
export const PAGE_CHANGE_DISTANCE_RATIO = 0.25;

/** Release speed, in px/s, that commits a page change regardless of distance. */
export const PAGE_CHANGE_VELOCITY = 500;

/**
 * Fraction of the container height a vertical drag must cover to dismiss.
 * Roughly 12% of a phone screen, which is far enough to be deliberate and
 * close enough to be effortless.
 */
export const DISMISS_DISTANCE_RATIO = 0.12;

/** Release speed, in px/s, that dismisses regardless of distance. */
export const DISMISS_VELOCITY = 800;

/** How small the image gets at the point of dismissal. */
export const DISMISS_MIN_SCALE = 0.75;

/** Resistance coefficient for panning past an edge. Matches UIScrollView. */
export const RUBBER_BAND_COEFFICIENT = 0.55;

/** Per-frame velocity retention used by pan decay. */
export const DECELERATION = 0.998;

/** Duration, in ms, of the open/close and double-tap animations. */
export const TIMING_DURATION = 260;

/** Spring used when settling the image back inside its bounds. */
export const SETTLE_SPRING = {
  damping: 30,
  stiffness: 280,
  mass: 0.8,
  overshootClamping: true,
} as const;

/**
 * Number of pages kept mounted on each side of the current one.
 *
 * One is enough to make a swipe reveal a decoded image rather than a
 * placeholder, while keeping at most three images in memory at a time.
 */
export const WINDOW_SIZE = 1;
