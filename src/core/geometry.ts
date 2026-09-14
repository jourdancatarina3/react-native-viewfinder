import type { Size, TranslationBounds } from './types';

/**
 * Returns true when a size is usable for layout maths.
 *
 * Sizes arrive from `onLayout`, from `Image.getSize`, and from user props, all
 * of which can legitimately produce `0`, `NaN` or `Infinity` before the first
 * real measurement lands. Every public function here guards on this rather
 * than propagating `NaN` into a shared value, where it would silently freeze an
 * animation.
 */
export function isUsableSize(size: Size | null | undefined): size is Size {
  return (
    size != null &&
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

/**
 * Scales `content` to fit entirely inside `container`, preserving aspect ratio.
 *
 * This is the "base" size every transform is relative to: at `scale: 1` the
 * content is exactly this size, so it touches the container on its constrained
 * axis and is letterboxed on the other.
 *
 * Returns a zero size if either input is unusable, which callers treat as
 * "not measured yet".
 */
export function fitSize(content: Size, container: Size): Size {
  'worklet';
  if (!isUsableSize(content) || !isUsableSize(container)) {
    return { width: 0, height: 0 };
  }

  const ratio = Math.min(
    container.width / content.width,
    container.height / content.height
  );

  return {
    width: content.width * ratio,
    height: content.height * ratio,
  };
}

/**
 * Scales `content` to completely cover `container`, preserving aspect ratio.
 *
 * Used by the hero transition, where the thumbnail is usually rendered with
 * `resizeMode: 'cover'` and the full-screen image with `contain`.
 */
export function coverSize(content: Size, container: Size): Size {
  'worklet';
  if (!isUsableSize(content) || !isUsableSize(container)) {
    return { width: 0, height: 0 };
  }

  const ratio = Math.max(
    container.width / content.width,
    container.height / content.height
  );

  return {
    width: content.width * ratio,
    height: content.height * ratio,
  };
}

/**
 * The furthest the content can be translated on each axis before a gap would
 * appear between its edge and the container's.
 *
 * At scales where the content is smaller than the container on an axis, the
 * bound is `0`: the content stays centred rather than drifting into a corner.
 * This is what stops the "image keeps top after zoom out" class of bug.
 *
 * @param baseSize - the content's fitted size (scale 1)
 * @param container - the viewport
 * @param scale - current scale, relative to `baseSize`
 */
export function translationBounds(
  baseSize: Size,
  container: Size,
  scale: number
): TranslationBounds {
  'worklet';
  if (!isUsableSize(baseSize) || !isUsableSize(container)) {
    return { x: 0, y: 0 };
  }

  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

  return {
    x: Math.max(0, (baseSize.width * safeScale - container.width) / 2),
    y: Math.max(0, (baseSize.height * safeScale - container.height) / 2),
  };
}

/**
 * Clamps `value` into `[min, max]`.
 *
 * Infinities clamp to the bound they run into, which is the useful answer.
 * `NaN` has no ordering, so it cannot be clamped meaningfully and would poison
 * every subsequent frame if returned; it collapses to `min` instead.
 *
 * Reanimated exports its own `clamp`, but keeping a local copy means the core
 * layer stays importable from plain Node for tests.
 */
export function clamp(value: number, min: number, max: number): number {
  'worklet';
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * The scale at which the image renders at its true pixel resolution.
 *
 * Below this, the image is downsampled and zooming in reveals genuine extra
 * detail; above it, you are magnifying pixels. Used to pick a sensible default
 * `maxScale` so that large photos can always be inspected at 1:1 without the
 * caller having to know their dimensions.
 *
 * Returns `1` when either size is unusable.
 */
export function nativeResolutionScale(content: Size, container: Size): number {
  'worklet';
  const base = fitSize(content, container);
  if (!isUsableSize(base) || !isUsableSize(content)) {
    return 1;
  }
  return content.width / base.width;
}

/**
 * Resolves the effective maximum scale for an image.
 *
 * Takes the larger of the caller's configured maximum and the image's native
 * resolution scale (capped, so a 12000px panorama does not produce an absurd
 * limit), then guarantees the result is at least `minScale`.
 */
export function resolveMaxScale(
  configuredMax: number,
  content: Size,
  container: Size,
  minScale: number,
  /** Hard ceiling applied to the native-resolution component. */
  nativeCap = 16
): number {
  'worklet';
  const configured =
    Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : 1;
  const native = Math.min(nativeResolutionScale(content, container), nativeCap);
  return Math.max(minScale, configured, Number.isFinite(native) ? native : 1);
}
