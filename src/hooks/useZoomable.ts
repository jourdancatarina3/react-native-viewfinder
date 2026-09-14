import { useCallback, useEffect, useMemo } from 'react';
import type { ReduceMotion } from 'react-native-reanimated';
import {
  cancelAnimation,
  runOnJS,
  runOnUI,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { PanEvent, PinchEvent, TapEvent } from '../compat/gestures';
import {
  useExclusive,
  useLongPress,
  usePan,
  usePinch,
  useSimultaneous,
  useTap,
} from '../compat/gestures';
import {
  DECELERATION,
  RUBBER_BAND_COEFFICIENT,
  SETTLE_SPRING,
  TIMING_DURATION,
} from '../core/constants';
import { fitSize, resolveMaxScale, translationBounds } from '../core/geometry';
import { withRubberBand } from '../core/pan';
import type { Size, Transform, Vector } from '../core/types';
import {
  clampTransform,
  doubleTapTransform,
  isAtRest,
  scaleAround,
  toCentreRelative,
} from '../core/zoom';
import { useStableCallback } from './useStableCallback';

/** A worklet invoked while a pan is happening at the resting scale. */
type RestPanHandler = (event: PanEvent) => void;

export type UseZoomableOptions = {
  /** The viewport the image is laid out in. */
  containerSize: Size;
  /** The image's natural size, or `null` until it has been measured. */
  contentSize: Size | null;

  minScale: number;
  maxScale: number;
  doubleTapScales: readonly number[];
  pinchToZoom: boolean;
  doubleTapToZoom: boolean;
  doubleTapMaxDelay?: number;
  panEnabled: boolean;

  /** Turns every gesture off, e.g. for a gallery page that is not on screen. */
  enabled?: boolean;

  reduceMotion: ReduceMotion;

  onTap?: () => void;
  onDoubleTap?: (targetScale: number) => void;
  onLongPress?: () => void;
  onZoomChange?: (scale: number) => void;

  /**
   * Handed the pan gesture whenever the image is at its resting scale.
   *
   * This is how {@link import('../components/Gallery').Gallery} takes over for
   * paging and swipe-to-dismiss without a second, competing pan gesture — the
   * source of the long-standing "panning a zoomed image triggers close" bug in
   * other libraries. When the image *is* zoomed, these are never called and the
   * pan moves the image instead.
   */
  onRestPanStart?: RestPanHandler;
  onRestPanUpdate?: RestPanHandler;
  onRestPanEnd?: RestPanHandler;
};

export type UseZoomableResult = {
  /** Composed gesture to hand to a `GestureDetector`. */
  gesture: unknown;
  /** Animated style carrying the transform. Apply to the content wrapper. */
  animatedStyle: ReturnType<typeof useAnimatedStyle>;
  /** The image's size at rest, fitted to the container. */
  baseSize: Size;
  /** Live scale. Read from worklets; do not write. */
  scale: ReturnType<typeof useSharedValue<number>>;
  /** Animate back to fitted and centred. */
  reset: (animated?: boolean) => void;
  /** Zoom to a scale, optionally anchored on a container-space point. */
  zoomTo: (scale: number, focal?: Vector, animated?: boolean) => void;
  /** Snapshot the current transform on the JS thread. */
  getTransform: () => Transform;
};

/**
 * The zoom/pan engine for a single image.
 *
 * Everything here runs on the UI thread: the gesture callbacks are worklets
 * that read and write shared values and call into the pure functions in
 * `src/core`. Nothing crosses to JS per frame — user callbacks are marshalled
 * with `runOnJS` and only fire on discrete events, never on every update.
 */
export function useZoomable(options: UseZoomableOptions): UseZoomableResult {
  const {
    containerSize,
    contentSize,
    minScale,
    maxScale,
    doubleTapScales,
    pinchToZoom,
    doubleTapToZoom,
    doubleTapMaxDelay,
    panEnabled,
    enabled = true,
    reduceMotion,
    onTap,
    onDoubleTap,
    onLongPress,
    onZoomChange,
    onRestPanStart,
    onRestPanUpdate,
    onRestPanEnd,
  } = options;

  // User callbacks are captured by worklets when the gesture is built, so they
  // must not change identity afterwards or the gesture keeps calling the old
  // one. These wrappers stay stable and dispatch to the latest handler.
  const emitTap = useStableCallback(onTap);
  const emitDoubleTap = useStableCallback(onDoubleTap);
  const emitLongPress = useStableCallback(onLongPress);
  const emitZoomChange = useStableCallback(onZoomChange);

  const scale = useSharedValue(minScale);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Snapshots taken when a gesture begins, so every update is computed from the
  // gesture's start rather than accumulated frame by frame (which drifts).
  const startScale = useSharedValue(minScale);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  /** True while the active pan is moving the image rather than the gallery. */
  const panningImage = useSharedValue(false);

  const baseSize = useMemo(
    () =>
      contentSize
        ? fitSize(contentSize, containerSize)
        : { width: 0, height: 0 },
    [contentSize, containerSize]
  );

  const effectiveMaxScale = useMemo(
    () =>
      contentSize
        ? resolveMaxScale(maxScale, contentSize, containerSize, minScale)
        : maxScale,
    [maxScale, contentSize, containerSize, minScale]
  );

  // Mirror the layout into shared values so worklets can read it without
  // capturing a React value that would go stale between renders.
  const base = useSharedValue<Size>(baseSize);
  const container = useSharedValue<Size>(containerSize);
  const limits = useSharedValue({ min: minScale, max: effectiveMaxScale });
  const levels = useSharedValue<readonly number[]>(doubleTapScales);

  useEffect(() => {
    base.value = baseSize;
  }, [base, baseSize]);

  useEffect(() => {
    container.value = containerSize;
  }, [container, containerSize]);

  useEffect(() => {
    limits.value = { min: minScale, max: effectiveMaxScale };
  }, [limits, minScale, effectiveMaxScale]);

  useEffect(() => {
    levels.value = doubleTapScales;
  }, [levels, doubleTapScales]);

  const timing = useMemo(
    () => ({ duration: TIMING_DURATION, reduceMotion }),
    [reduceMotion]
  );
  const spring = useMemo(
    () => ({ ...SETTLE_SPRING, reduceMotion }),
    [reduceMotion]
  );

  /**
   * Re-clamps the transform after the layout changes underneath it.
   *
   * This is what keeps a rotation or a container resize from stranding a
   * zoomed image half off-screen — a recurring complaint against libraries
   * that only clamp on gesture release.
   */
  useEffect(() => {
    if (baseSize.width === 0 || containerSize.width === 0) {
      return;
    }
    const clamped = clampTransform(
      {
        scale: scale.value,
        translateX: translateX.value,
        translateY: translateY.value,
      },
      baseSize,
      containerSize,
      minScale,
      effectiveMaxScale
    );
    scale.value = withTiming(clamped.scale, timing, reportSettled);
    translateX.value = withTiming(clamped.translateX, timing);
    translateY.value = withTiming(clamped.translateY, timing);
    // Intentionally keyed on layout only: this must run when the container or
    // fitted size changes, not when the transform does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSize, containerSize, minScale, effectiveMaxScale]);

  /** The last value handed to `onZoomChange`, so repeats can be skipped. */
  const lastReported = useSharedValue(minScale);

  /**
   * Reports the scale a movement came to rest at.
   *
   * Every animated scale change calls this from its completion callback, using
   * the live value rather than the target so that an *interrupted* animation
   * reports where it actually stopped.
   *
   * This exists because filtering the reaction below on "moved more than
   * epsilon" is not enough on its own: the closing frames of an animation move
   * by less than the epsilon, so the resting value would never be sent and
   * consumers would hold a stale scale indefinitely — a reset button keyed on
   * `scale > 1` would never switch off.
   */
  const reportSettled = useCallback(() => {
    'worklet';
    if (scale.value !== lastReported.value) {
      lastReported.value = scale.value;
      runOnJS(emitZoomChange)(scale.value);
    }
  }, [scale, lastReported, emitZoomChange]);

  // Live updates during a gesture, throttled so a pinch does not cross to the
  // JS thread on every frame. The resting value is handled by `reportSettled`.
  useAnimatedReaction(
    () => scale.value,
    (current) => {
      if (Math.abs(current - lastReported.value) > 0.01) {
        lastReported.value = current;
        runOnJS(emitZoomChange)(current);
      }
    },
    [emitZoomChange]
  );

  // Stop every animation on unmount. Without this, a spring still running when
  // the component goes away keeps writing to a detached shared value.
  useEffect(
    () => () => {
      cancelAnimation(scale);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
    },
    [scale, translateX, translateY]
  );

  // --- Gestures ------------------------------------------------------------

  const pinch = usePinch({
    enabled: enabled && pinchToZoom,
    onStart: () => {
      'worklet';
      cancelAnimation(scale);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      startScale.value = scale.value;
      startX.value = translateX.value;
      startY.value = translateY.value;
    },
    onUpdate: (event: PinchEvent) => {
      'worklet';
      const { min, max } = limits.value;
      // Allow a little travel past the limits so the pinch feels elastic, then
      // snap back on release.
      const target = startScale.value * event.scale;
      const bounded =
        target < min
          ? min - (min - target) * 0.5
          : target > max
            ? max + (target - max) * 0.15
            : target;

      const focal = toCentreRelative(
        { x: event.focalX, y: event.focalY },
        container.value
      );
      const next = scaleAround(
        {
          scale: startScale.value,
          translateX: startX.value,
          translateY: startY.value,
        },
        bounded,
        focal
      );

      scale.value = next.scale;
      translateX.value = next.translateX;
      translateY.value = next.translateY;
    },
    onEnd: () => {
      'worklet';
      const { min, max } = limits.value;
      const settled = clampTransform(
        {
          scale: scale.value,
          translateX: translateX.value,
          translateY: translateY.value,
        },
        base.value,
        container.value,
        min,
        max
      );
      scale.value = withSpring(settled.scale, spring, reportSettled);
      translateX.value = withSpring(settled.translateX, spring);
      translateY.value = withSpring(settled.translateY, spring);
    },
  });

  const pan = usePan({
    enabled: enabled && panEnabled,
    // Averaging keeps the image from jumping when a second finger lifts at the
    // end of a pinch.
    averageTouches: true,
    maxPointers: 2,
    onStart: (event: PanEvent) => {
      'worklet';
      const { min } = limits.value;
      // Decide once, at the start, who owns this gesture. Re-deciding mid-pan
      // is what makes a zoomed-in upward drag accidentally close the gallery.
      panningImage.value = !isAtRest(scale.value, min);

      if (panningImage.value) {
        cancelAnimation(translateX);
        cancelAnimation(translateY);
        startX.value = translateX.value;
        startY.value = translateY.value;
      } else if (onRestPanStart) {
        onRestPanStart(event);
      }
    },
    onUpdate: (event: PanEvent) => {
      'worklet';
      if (!panningImage.value) {
        // The image is at rest, so this drag belongs to the gallery.
        if (onRestPanUpdate) {
          onRestPanUpdate(event);
        }
        return;
      }

      const bounds = translationBounds(
        base.value,
        container.value,
        scale.value
      );
      translateX.value = withRubberBand(
        startX.value + event.translationX,
        bounds.x,
        container.value.width,
        RUBBER_BAND_COEFFICIENT
      );
      translateY.value = withRubberBand(
        startY.value + event.translationY,
        bounds.y,
        container.value.height,
        RUBBER_BAND_COEFFICIENT
      );
    },
    onEnd: (event: PanEvent) => {
      'worklet';
      if (!panningImage.value) {
        if (onRestPanEnd) {
          onRestPanEnd(event);
        }
        return;
      }

      const bounds = translationBounds(
        base.value,
        container.value,
        scale.value
      );

      // Decay carries the fling on, but stays inside the bounds and bounces
      // gently if it arrives at one with speed left.
      translateX.value = withDecay({
        velocity: event.velocityX,
        clamp: [-bounds.x, bounds.x],
        deceleration: DECELERATION,
        rubberBandEffect: true,
        rubberBandFactor: 0.8,
        reduceMotion,
      });
      translateY.value = withDecay({
        velocity: event.velocityY,
        clamp: [-bounds.y, bounds.y],
        deceleration: DECELERATION,
        rubberBandEffect: true,
        rubberBandFactor: 0.8,
        reduceMotion,
      });
    },
  });

  const doubleTap = useTap({
    enabled: enabled && doubleTapToZoom,
    numberOfTaps: 2,
    maxDistance: 40,
    ...(doubleTapMaxDelay !== undefined
      ? { maxDelay: doubleTapMaxDelay }
      : null),
    onEnd: (event: TapEvent) => {
      'worklet';
      const { min, max } = limits.value;
      const next = doubleTapTransform(
        {
          scale: scale.value,
          translateX: translateX.value,
          translateY: translateY.value,
        },
        { x: event.x, y: event.y },
        base.value,
        container.value,
        levels.value,
        min,
        max
      );

      scale.value = withTiming(next.scale, timing, reportSettled);
      translateX.value = withTiming(next.translateX, timing);
      translateY.value = withTiming(next.translateY, timing);

      runOnJS(emitDoubleTap)(next.scale);
    },
  });

  const singleTap = useTap({
    enabled: enabled && onTap != null,
    numberOfTaps: 1,
    maxDistance: 20,
    onEnd: () => {
      'worklet';
      runOnJS(emitTap)();
    },
  });

  const longPress = useLongPress({
    enabled: enabled && onLongPress != null,
    minDuration: 500,
    maxDistance: 20,
    onStart: () => {
      'worklet';
      runOnJS(emitLongPress)();
    },
  });

  // Pinch and pan must run together so a two-finger gesture can zoom and move
  // at once. The taps are exclusive so a double-tap is not also read as two
  // single taps.
  const continuous = useSimultaneous([pinch, pan]);
  const taps = useExclusive([doubleTap, singleTap]);
  const gesture = useSimultaneous([continuous, taps, longPress]);

  // --- Imperative API ------------------------------------------------------

  const reset = useCallback(
    (animated = true) => {
      if (animated) {
        scale.value = withTiming(minScale, timing, reportSettled);
        translateX.value = withTiming(0, timing);
        translateY.value = withTiming(0, timing);
      } else {
        cancelAnimation(scale);
        cancelAnimation(translateX);
        cancelAnimation(translateY);
        scale.value = minScale;
        translateX.value = 0;
        translateY.value = 0;
        runOnUI(reportSettled)();
      }
    },
    [scale, translateX, translateY, minScale, timing, reportSettled]
  );

  const zoomTo = useCallback(
    (target: number, focal?: Vector, animated = true) => {
      const anchor = focal
        ? toCentreRelative(focal, containerSize)
        : { x: 0, y: 0 };
      const next = clampTransform(
        scaleAround(
          {
            scale: scale.value,
            translateX: translateX.value,
            translateY: translateY.value,
          },
          target,
          anchor
        ),
        baseSize,
        containerSize,
        minScale,
        effectiveMaxScale
      );

      if (animated) {
        scale.value = withTiming(next.scale, timing, reportSettled);
        translateX.value = withTiming(next.translateX, timing);
        translateY.value = withTiming(next.translateY, timing);
      } else {
        scale.value = next.scale;
        translateX.value = next.translateX;
        translateY.value = next.translateY;
        runOnUI(reportSettled)();
      }
    },
    [
      scale,
      translateX,
      translateY,
      baseSize,
      containerSize,
      minScale,
      effectiveMaxScale,
      timing,
      reportSettled,
    ]
  );

  const getTransform = useCallback(
    (): Transform => ({
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
    }),
    [scale, translateX, translateY]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return {
    gesture,
    animatedStyle,
    baseSize,
    scale,
    reset,
    zoomTo,
    getTransform,
  };
}
