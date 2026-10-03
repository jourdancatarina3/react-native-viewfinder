import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReduceMotion } from 'react-native-reanimated';
import {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { PanEvent, PinchEvent } from '../compat/gestures';
import { usePan, usePinch, useSimultaneous, useTap } from '../compat/gestures';
import { RUBBER_BAND_COEFFICIENT, TIMING_DURATION } from '../core/constants';
import type {
  AspectRatio,
  CropHandle,
  CropResult,
  Rect,
  Rotation,
} from '../core/crop';
import {
  clampToCover,
  cropImageSize,
  cropRectFromTransform,
  cropTranslationBounds,
  frameCentreOffset,
  frameForAspect,
  imageRect,
  intersectRects,
  maximizeFrame,
  minScaleToCover,
  nextRotation,
  resizeFrame,
  resolveAspectRatio,
  rotatedSize,
} from '../core/crop';
import { withRubberBand } from '../core/pan';
import type { Size, Transform } from '../core/types';
import { scaleAround, toCentreRelative } from '../core/zoom';
import { useStableCallback } from './useStableCallback';

export type UseCropperOptions = {
  /** The area the cropper is laid out in. */
  containerSize: Size;
  /** The image's natural size, or `null` until measured. */
  sourceSize: Size | null;
  /** Locked ratio, `'free'`, or `'original'`. */
  aspectRatio: AspectRatio;
  /** Gap between the stage's edge and the image at rest. */
  framePadding: number;
  /** Largest zoom, relative to the fitted size. */
  maxScale: number;
  /** Smallest the frame can be dragged to, per axis. */
  minFrameSize: number;
  reduceMotion: ReduceMotion;
  /** Fires whenever the framed region changes, on the JS thread. */
  onCropChange?: (result: CropResult) => void;
};

export type UseCropperResult = {
  /** Composed pinch/pan gesture for the image beneath the frame. */
  imageGesture: unknown;
  /** Animated style carrying the image transform. */
  animatedStyle: ReturnType<typeof useAnimatedStyle>;
  /** Style applying the current rotation and flip to the image. */
  orientationStyle: ReturnType<typeof useAnimatedStyle>;
  /** The image's size at scale 1, fitted to the stage. */
  baseSize: Size;
  /** The crop frame, in container coordinates. */
  frame: Rect;
  /** The ratio currently in effect, which the prop only seeds. */
  aspectRatio: AspectRatio;
  /** True while a gesture is in progress; drives the grid overlay. */
  interacting: ReturnType<typeof useSharedValue<boolean>>;
  rotation: Rotation;
  flipHorizontal: boolean;
  flipVertical: boolean;
  /** Begins a handle drag. */
  beginFrameDrag: () => void;
  /** Moves a handle. `delta` is measured from the drag's start. */
  dragFrame: (handle: CropHandle, delta: { x: number; y: number }) => void;
  /** Ends a handle drag and expands the frame back out over the image. */
  endFrameDrag: () => void;
  rotate: (turns?: number) => void;
  flip: (axis: 'horizontal' | 'vertical') => void;
  setAspectRatio: (aspect: AspectRatio) => void;
  /** Returns everything to the untouched state. */
  reset: () => void;
  /** Snapshot of what is currently framed. */
  getResult: () => CropResult | null;
};

const IDENTITY: Transform = { scale: 1, translateX: 0, translateY: 0 };

/**
 * The crop engine.
 *
 * The image is fitted to the stage and can be pinched and panned about the
 * stage's centre; the frame is an independent rectangle laid over it. The only
 * rule connecting them is that the frame must stay inside the image, which is
 * enforced by moving the image, never by resizing it.
 *
 * Letting go of a handle then does what iOS does: the frame expands back out
 * to the largest rectangle of that shape the stage can hold, and the image
 * zooms and slides underneath so that exactly the same crop stays inside it.
 * See `maximizeFrame` for why that leaves the reported rectangle unchanged.
 */
export function useCropper(options: UseCropperOptions): UseCropperResult {
  const {
    containerSize,
    sourceSize,
    aspectRatio,
    framePadding,
    maxScale,
    minFrameSize,
    reduceMotion,
    onCropChange,
  } = options;

  const [rotation, setRotation] = useState<Rotation>(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [aspect, setAspect] = useState<AspectRatio>(aspectRatio);

  useEffect(() => {
    setAspect(aspectRatio);
  }, [aspectRatio]);

  /** The image's dimensions as displayed, after any quarter turn. */
  const displaySize = useMemo(
    () => (sourceSize ? rotatedSize(sourceSize, rotation) : null),
    [sourceSize, rotation]
  );

  /** The ratio enforced while dragging a handle. `null` means unconstrained. */
  const lockedRatio = useMemo(
    () => resolveAspectRatio(aspect, displaySize),
    [aspect, displaySize]
  );

  /**
   * The image's laid-out size. Depends only on the stage, so dragging a handle
   * never resizes the picture.
   */
  const baseSize = useMemo(
    () =>
      displaySize
        ? cropImageSize(displaySize, containerSize, framePadding)
        : { width: 0, height: 0 },
    [displaySize, containerSize, framePadding]
  );

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const translateStartY = useSharedValue(0);
  const interacting = useSharedValue(false);

  /**
   * The frame's resting shape for a given ratio: the largest rectangle of that
   * ratio the stage can hold, or — for a free crop — exactly the image.
   *
   * A free crop starting around the whole image matters: filling the stage
   * instead would propose discarding a third of a landscape photo in a
   * portrait app before the user has touched anything.
   */
  const restingFrame = useCallback(
    (ratio: number | null, size: Size): Rect => {
      if (size.width <= 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
      }
      return ratio !== null
        ? frameForAspect(containerSize, ratio, framePadding)
        : imageRect(size, containerSize, IDENTITY);
    },
    [containerSize, framePadding]
  );

  const [frame, setFrame] = useState<Rect>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  /**
   * Snaps the frame when a ratio is chosen, and when the stage is re-measured.
   *
   * Choosing *Freeform* deliberately does **not** snap: it unlocks the handles
   * and keeps whatever you had framed, which is what iOS does and what people
   * expect — switching to Freeform to nudge one edge should not throw the
   * crop away. Only a real layout change re-derives a free frame.
   */
  const lastRatioRef = useRef<number | null | undefined>(undefined);
  const lastGeometryRef = useRef('');

  useEffect(() => {
    if (baseSize.width <= 0) {
      return;
    }
    const geometry = `${baseSize.width}x${baseSize.height}`;
    const geometryChanged = geometry !== lastGeometryRef.current;
    const ratioChanged = lockedRatio !== lastRatioRef.current;
    lastGeometryRef.current = geometry;
    lastRatioRef.current = lockedRatio;

    if (lockedRatio !== null && (ratioChanged || geometryChanged)) {
      setFrame(restingFrame(lockedRatio, baseSize));
    } else if (lockedRatio === null && geometryChanged) {
      setFrame(restingFrame(null, baseSize));
    }
  }, [baseSize, lockedRatio, restingFrame]);

  // Mirrors for the worklets.
  const base = useSharedValue<Size>(baseSize);
  const frameValue = useSharedValue<Rect>(frame);
  const container = useSharedValue<Size>(containerSize);
  const limits = useSharedValue({ min: 1, max: maxScale });

  useEffect(() => {
    base.value = baseSize;
  }, [base, baseSize]);
  useEffect(() => {
    frameValue.value = frame;
  }, [frameValue, frame]);
  useEffect(() => {
    container.value = containerSize;
  }, [container, containerSize]);
  useEffect(() => {
    limits.value = {
      min: baseSize.width > 0 ? minScaleToCover(baseSize, frame) : 1,
      max: maxScale,
    };
  }, [limits, baseSize, frame, maxScale]);

  const timing = useMemo(
    () => ({ duration: TIMING_DURATION, reduceMotion }),
    [reduceMotion]
  );

  const emitCropChange = useStableCallback(onCropChange);

  const getResult = useCallback((): CropResult | null => {
    if (!sourceSize || !displaySize || baseSize.width === 0) {
      return null;
    }
    return {
      rotate: rotation,
      flipHorizontal,
      flipVertical,
      crop: cropRectFromTransform(
        {
          scale: scale.value,
          translateX: translateX.value,
          translateY: translateY.value,
        },
        baseSize,
        frame,
        containerSize,
        displaySize
      ),
      sourceSize,
    };
  }, [
    sourceSize,
    displaySize,
    baseSize,
    frame,
    containerSize,
    rotation,
    flipHorizontal,
    flipVertical,
    scale,
    translateX,
    translateY,
  ]);

  /** Reports the framed region after anything that could have changed it. */
  const report = useCallback(() => {
    const result = getResult();
    if (result) {
      emitCropChange(result);
    }
  }, [getResult, emitCropChange]);

  /**
   * Settles the image so it covers the frame, wherever the frame now is.
   *
   * Used after a pinch or a pan, and after the ratio changes — anything that
   * can leave the frame partly off the picture.
   */
  const settle = useCallback(
    (nextFrame: Rect = frame, animated = true) => {
      if (baseSize.width === 0 || nextFrame.width === 0) {
        return;
      }
      const required = minScaleToCover(baseSize, nextFrame);
      const target = clampToCover(
        {
          scale: Math.max(scale.value, required),
          translateX: translateX.value,
          translateY: translateY.value,
        },
        baseSize,
        nextFrame,
        containerSize,
        required,
        Math.max(maxScale, required)
      );

      if (animated) {
        scale.value = withTiming(target.scale, timing);
        translateX.value = withTiming(target.translateX, timing);
        translateY.value = withTiming(target.translateY, timing, () => {
          'worklet';
          runOnJS(report)();
        });
      } else {
        scale.value = target.scale;
        translateX.value = target.translateX;
        translateY.value = target.translateY;
        report();
      }
    },
    [
      frame,
      baseSize,
      containerSize,
      maxScale,
      scale,
      translateX,
      translateY,
      timing,
      report,
    ]
  );

  // Re-settle when the geometry changes out from under the transform.
  useEffect(() => {
    settle(frame, false);
    // Keyed on geometry only: this must not re-run because the transform moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSize, frame]);

  useEffect(
    () => () => {
      cancelAnimation(scale);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
    },
    [scale, translateX, translateY]
  );

  // --- Image gestures ------------------------------------------------------

  const pinch = usePinch({
    onStart: () => {
      'worklet';
      interacting.value = true;
      cancelAnimation(scale);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      startScale.value = scale.value;
      startX.value = translateX.value;
      translateStartY.value = translateY.value;
    },
    onUpdate: (event: PinchEvent) => {
      'worklet';
      const { min, max } = limits.value;
      const target = startScale.value * event.scale;
      // A little give at each end, so the limits feel elastic rather than hard.
      const bounded =
        target < min
          ? min - (min - target) * 0.4
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
          translateY: translateStartY.value,
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
      interacting.value = false;
      runOnJS(settle)(frameValue.value, true);
    },
  });

  const pan = usePan({
    averageTouches: true,
    maxPointers: 2,
    onStart: () => {
      'worklet';
      interacting.value = true;
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      startX.value = translateX.value;
      translateStartY.value = translateY.value;
    },
    onUpdate: (event: PanEvent) => {
      'worklet';
      const bounds = cropTranslationBounds(
        base.value,
        frameValue.value,
        scale.value
      );
      const centre = frameCentreOffset(frameValue.value, container.value);
      // Rubber-band about the frame's centre, which is where the limits sit.
      translateX.value =
        centre.x +
        withRubberBand(
          startX.value + event.translationX - centre.x,
          bounds.x,
          container.value.width,
          RUBBER_BAND_COEFFICIENT
        );
      translateY.value =
        centre.y +
        withRubberBand(
          translateStartY.value + event.translationY - centre.y,
          bounds.y,
          container.value.height,
          RUBBER_BAND_COEFFICIENT
        );
    },
    onEnd: () => {
      'worklet';
      interacting.value = false;
      runOnJS(settle)(frameValue.value, true);
    },
  });

  // A double-tap toggles between filling the frame and a closer look, which is
  // the quickest way to check detail without a two-finger gesture.
  const doubleTap = useTap({
    numberOfTaps: 2,
    maxDistance: 40,
    onEnd: () => {
      'worklet';
      const { min, max } = limits.value;
      const target = scale.value > min + 0.01 ? min : Math.min(min * 2, max);
      const centre = frameCentreOffset(frameValue.value, container.value);
      scale.value = withTiming(target, timing);
      translateX.value = withTiming(centre.x, timing);
      translateY.value = withTiming(centre.y, timing, () => {
        'worklet';
        runOnJS(report)();
      });
    },
  });

  const imageGesture = useSimultaneous([pinch, pan, doubleTap]);

  // --- Frame handles -------------------------------------------------------

  /**
   * The frame as it was when the drag began.
   *
   * A ref, not state: handle deltas are cumulative from the gesture's start, so
   * if the origin lagged a render behind, each update would apply the whole
   * delta to an already-moved frame and the drag would run away.
   */
  const dragOriginRef = useRef<Rect | null>(null);

  /** Handles may not be pulled out past the photo, as in iOS. */
  const handleBounds = useCallback((): Rect => {
    const drawn = imageRect(baseSize, containerSize, {
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
    });
    return intersectRects(drawn, {
      x: framePadding,
      y: framePadding,
      width: Math.max(0, containerSize.width - framePadding * 2),
      height: Math.max(0, containerSize.height - framePadding * 2),
    });
  }, [baseSize, containerSize, framePadding, scale, translateX, translateY]);

  const beginFrameDrag = useCallback(() => {
    dragOriginRef.current = frame;
    interacting.value = true;
    cancelAnimation(scale);
    cancelAnimation(translateX);
    cancelAnimation(translateY);
  }, [frame, interacting, scale, translateX, translateY]);

  const dragFrame = useCallback(
    (handle: CropHandle, delta: { x: number; y: number }) => {
      const origin = dragOriginRef.current ?? frame;
      setFrame(
        resizeFrame(
          origin,
          handle,
          delta,
          handleBounds(),
          lockedRatio,
          minFrameSize
        )
      );
    },
    [frame, handleBounds, lockedRatio, minFrameSize]
  );

  /**
   * Expands the frame back out over the image, iOS-style.
   *
   * The frame animating out while the picture zooms in under it is what turns
   * a dragged rectangle into a finished crop. `maximizeFrame` derives the pair
   * so the framed region is provably identical either side of the animation.
   */
  const endFrameDrag = useCallback(() => {
    dragOriginRef.current = null;
    interacting.value = false;

    if (baseSize.width === 0 || frame.width === 0) {
      return;
    }

    const current: Transform = {
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
    };
    const next = maximizeFrame(frame, current, containerSize, framePadding);

    setFrame(next.frame);
    scale.value = withTiming(next.transform.scale, timing);
    translateX.value = withTiming(next.transform.translateX, timing);
    translateY.value = withTiming(next.transform.translateY, timing, () => {
      'worklet';
      runOnJS(report)();
    });
  }, [
    frame,
    baseSize,
    containerSize,
    framePadding,
    interacting,
    scale,
    translateX,
    translateY,
    timing,
    report,
  ]);

  // --- Commands ------------------------------------------------------------

  const rotate = useCallback((turns = 1) => {
    setRotation((current) => nextRotation(current, turns));
  }, []);

  const flip = useCallback((axis: 'horizontal' | 'vertical') => {
    if (axis === 'horizontal') {
      setFlipHorizontal((current) => !current);
    } else {
      setFlipVertical((current) => !current);
    }
  }, []);

  const setAspectRatio = useCallback((next: AspectRatio) => {
    setAspect(next);
  }, []);

  const reset = useCallback(() => {
    setRotation(0);
    setFlipHorizontal(false);
    setFlipVertical(false);
    setAspect(aspectRatio);

    // Derive the frame from the *target* state rather than the current one.
    // Reading the memoised frame here would use the ratio being reset away
    // from, because `setAspect` has not committed yet.
    const restSize = sourceSize
      ? cropImageSize(sourceSize, containerSize, framePadding)
      : baseSize;
    const restRatio = resolveAspectRatio(aspectRatio, sourceSize);
    lastRatioRef.current = restRatio;
    lastGeometryRef.current = `${restSize.width}x${restSize.height}`;
    setFrame(restingFrame(restRatio, restSize));

    cancelAnimation(scale);
    cancelAnimation(translateX);
    cancelAnimation(translateY);
    scale.value = withTiming(1, timing);
    translateX.value = withTiming(0, timing);
    translateY.value = withTiming(0, timing);
  }, [
    aspectRatio,
    sourceSize,
    baseSize,
    containerSize,
    framePadding,
    restingFrame,
    scale,
    translateX,
    translateY,
    timing,
  ]);

  // Report once the geometry is first known, so consumers have a result before
  // the user touches anything.
  useEffect(() => {
    if (baseSize.width > 0) {
      report();
    }
  }, [baseSize.width, frame, rotation, flipHorizontal, flipVertical, report]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const orientationStyle = useAnimatedStyle(
    () => ({
      transform: [
        { rotate: `${rotation}deg` },
        { scaleX: flipHorizontal ? -1 : 1 },
        { scaleY: flipVertical ? -1 : 1 },
      ],
    }),
    [rotation, flipHorizontal, flipVertical]
  );

  return {
    imageGesture,
    animatedStyle,
    orientationStyle,
    baseSize,
    frame,
    aspectRatio: aspect,
    interacting,
    rotation,
    flipHorizontal,
    flipVertical,
    beginFrameDrag,
    dragFrame,
    endFrameDrag,
    rotate,
    flip,
    setAspectRatio,
    reset,
    getResult,
  };
}
