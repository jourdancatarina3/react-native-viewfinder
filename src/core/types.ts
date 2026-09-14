/**
 * Geometry primitives shared by the pure math layer.
 *
 * Everything in `src/core` is deliberately free of React, Reanimated and React
 * Native imports so it can be unit-tested directly and reasoned about in
 * isolation. The hooks in `src/hooks` are the only place these are wired to
 * shared values.
 */

/** A width/height pair, in pixels. */
export type Size = {
  width: number;
  height: number;
};

/** A 2D point or offset, in pixels. */
export type Vector = {
  x: number;
  y: number;
};

/**
 * The complete transform state of a zoomable surface.
 *
 * `scale` is relative to the content's *fitted* size (see
 * {@link import('./geometry').fitSize}), so `scale: 1` always means "exactly
 * fills the container along its constrained axis", regardless of the image's
 * natural pixel dimensions.
 *
 * `translateX`/`translateY` are measured in container pixels, from the
 * container's centre, and are applied *after* scaling — matching the
 * `[{ translateX }, { translateY }, { scale }]` transform order used by the
 * components.
 */
export type Transform = {
  scale: number;
  translateX: number;
  translateY: number;
};

/**
 * The maximum absolute translation available on each axis at a given scale.
 *
 * A value of `0` means the content is smaller than the container on that axis
 * and should stay centred.
 */
export type TranslationBounds = {
  x: number;
  y: number;
};

/** The identity transform: fitted, centred, unzoomed. */
export const IDENTITY_TRANSFORM: Transform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};
