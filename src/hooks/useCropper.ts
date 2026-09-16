import { useCallback, useEffect, useMemo, useState } from 'react';
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
  cropBaseSize,
  cropRectFromTransform,
  cropTranslationBounds,
  frameForAspect,
  minScaleToCover,
  nextRotation,
  resizeFrame,
  resolveAspectRatio,
  rotatedSize,
} from '../core/crop';
import { withRubberBand } from '../core/pan';
import type { Size } from '../core/types';
import { scaleAround, toCentreRelative } from '../core/zoom';
import { useStableCallback } from './useStableCallback';

export type UseCropperOptions = {
  /** The area the cropper is laid out in. */
  containerSize: Size;
  /** The image's natural size, or `null` until measured. */
  sourceSize: Size | null;
  /** Locked ratio, `'free'`, or `'original'`. */
  aspectRatio: AspectRatio;
  /** Gap between the crop frame and the container edge. */
  framePadding: number;
  /** Largest zoom, relative to the frame-covering size. */
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
  /** The image's size at scale 1, covering the frame. */
  baseSize: Size;
  /** The crop frame, in container coordinates. */
  frame: Rect;
  /** True while a gesture is in progress; drives the grid overlay. */
  interacting: ReturnType<typeof useSharedValue<boolean>>;
  rotation: Rotation;
  flipHorizontal: boolean;
  flipVertical: boolean;
  /** Begins a handle drag. */
  beginFrameDrag: () => void;
  /** Moves a handle. `delta` is measured from the drag's start. */
  dragFrame: (handle: CropHandle, delta: { x: number; y: number }) => void;
  /** Ends a handle drag and settles the image back over the new frame. */
  endFrameDrag: () => void;
  rotate: (turns?: number) => void;
  flip: (axis: 'horizontal' | 'vertical') => void;
  setAspectRatio: (aspect: AspectRatio) => void;
  /** Returns everything to the untouched state. */
  reset: () => void;
  /** Snapshot of what is currently framed. */
  getResult: () => CropResult | null;
};

const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

/**
 * The crop engine.
 *
 * The model is the one the phone photo editors use, and it is chosen because it
 * removes a whole class of confusing states: the image *covers* the frame at
 * scale 1, so it can only ever be zoomed further in. There is no way to leave a
 * gap inside the crop, and therefore no need to decide what a gap would mean.
 *
 * Everything the user does — pinching, panning, dragging a handle, changing the
 * ratio, rotating — ends by re-clamping the image so the frame is still
 * covered.
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
  const [frameOverride, setFrameOverride] = useState<Rect | null>(null);

  useEffect(() => {
    setAspect(aspectRatio);
    setFrameOverride(null);
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
   * The ratio the frame *starts* at, which is not always the one it is locked
   * to.
   *
   * For a free crop the frame begins around the whole image rather than filling
   * the stage. Filling the stage is what the maths falls out to, but it means
   * opening a cropper on a landscape photo in a portrait app silently proposes
   * throwing half the photo away — and a crop screen that discards data before
   * the user touches anything is a bad crop screen. Starting at the image's own
   * shape shows everything, and the handles are still free to go anywhere.
   */
  const initialFrameRatio = useMemo(() => {
    if (aspect !== 'free') {
      return lockedRatio;
    }
    return displaySize && displaySize.height > 0
      ? displaySize.width / displaySize.height
      : null;
  }, [aspect, lockedRatio, displaySize]);

  /** The area a dragged frame must stay inside. */
  const frameBounds = useMemo(
    (): Rect => ({
      x: framePadding,
      y: framePadding,
      width: Math.max(0, containerSize.width - framePadding * 2),
      height: Math.max(0, containerSize.height - framePadding * 2),
    }),
    [containerSize, framePadding]
  );

  const defaultFrame = useMemo(
    () => frameForAspect(containerSize, initialFrameRatio, framePadding),
    [containerSize, initialFrameRatio, framePadding]
  );

  const frame = frameOverride ?? defaultFrame;

  const baseSize = useMemo(
    () =>
      displaySize && frame.width > 0
        ? cropBaseSize(displaySize, frame)
        : { width: 0, height: 0 },
    [displaySize, frame]
  );

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const interacting = useSharedValue(false);

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
    limits.value = { min: 1, max: maxScale };
  }, [limits, maxScale]);

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
        displaySize
      ),
      sourceSize,
    };
  }, [
    sourceSize,
    displaySize,
    baseSize,
    frame,
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
   * Re-covers the frame after it changes shape underneath the image.
   *
   * Changing the ratio, dragging a handle or rotating can all leave the image
   * too small or off-centre for the new frame. Scaling back out to
   * `minScaleToCover` before clamping is what stops a gap appearing.
   */
  const settle = useCallback(
    (animated = true) => {
      if (baseSize.width === 0 || frame.width === 0) {
        return;
      }
      const required = minScaleToCover(baseSize, frame);
      const target = clampToCover(
        {
          scale: Math.max(scale.value, required),
          translateX: translateX.value,
          translateY: translateY.value,
        },
        baseSize,
        frame,
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
    [baseSize, frame, maxScale, scale, translateX, translateY, timing, report]
  );

  // Re-settle whenever the geometry changes out from under the transform.
  useEffect(() => {
    settle(false);
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
      startY.value = translateY.value;
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
      interacting.value = false;
      runOnJS(settle)(true);
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
      startY.value = translateY.value;
    },
    onUpdate: (event: PanEvent) => {
      'worklet';
      const bounds = cropTranslationBounds(
        base.value,
        frameValue.value,
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
    onEnd: () => {
      'worklet';
      interacting.value = false;
      runOnJS(settle)(true);
    },
  });

  // A double-tap toggles between fitting the frame and a 2x look, which is the
  // quickest way to check detail without a two-finger gesture.
  const doubleTap = useTap({
    numberOfTaps: 2,
    maxDistance: 40,
    onEnd: () => {
      'worklet';
      const { min, max } = limits.value;
      const target = scale.value > min + 0.01 ? min : Math.min(2, max);
      scale.value = withTiming(target, timing);
      translateX.value = withTiming(0, timing);
      translateY.value = withTiming(0, timing, () => {
        'worklet';
        runOnJS(report)();
      });
    },
  });

  const imageGesture = useSimultaneous([pinch, pan, doubleTap]);

  // --- Frame handles -------------------------------------------------------

  const [dragStartFrame, setDragStartFrame] = useState<Rect | null>(null);

  const beginFrameDrag = useCallback(() => {
    setDragStartFrame(frame);
    interacting.value = true;
  }, [frame, interacting]);

  const dragFrame = useCallback(
    (handle: CropHandle, delta: { x: number; y: number }) => {
      const origin = dragStartFrame ?? frame;
      setFrameOverride(
        resizeFrame(
          origin,
          handle,
          delta,
          frameBounds,
          lockedRatio,
          minFrameSize
        )
      );
    },
    [dragStartFrame, frame, frameBounds, lockedRatio, minFrameSize]
  );

  const endFrameDrag = useCallback(() => {
    setDragStartFrame(null);
    interacting.value = false;
    settle(true);
  }, [interacting, settle]);

  // --- Commands ------------------------------------------------------------

  const rotate = useCallback((turns = 1) => {
    setRotation((current) => nextRotation(current, turns));
    // A quarter turn changes which axis is constrained, so any hand-dragged
    // frame no longer means what it did. Returning to the default for the
    // ratio is both simpler to reason about and what the phone editors do.
    setFrameOverride(null);
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
    setFrameOverride(null);
  }, []);

  const reset = useCallback(() => {
    setRotation(0);
    setFlipHorizontal(false);
    setFlipVertical(false);
    setAspect(aspectRatio);
    setFrameOverride(null);
    cancelAnimation(scale);
    cancelAnimation(translateX);
    cancelAnimation(translateY);
    scale.value = withTiming(1, timing);
    translateX.value = withTiming(0, timing);
    translateY.value = withTiming(0, timing);
  }, [aspectRatio, scale, translateX, translateY, timing]);

  // Report once the geometry is first known, so consumers have a result before
  // the user touches anything.
  useEffect(() => {
    if (baseSize.width > 0) {
      report();
    }
  }, [baseSize.width, rotation, flipHorizontal, flipVertical, report]);

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
    frame: frame ?? EMPTY_RECT,
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
