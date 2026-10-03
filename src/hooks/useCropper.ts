import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ReduceMotion,
  SharedValue,
  WithTimingConfig,
} from 'react-native-reanimated';
import {
  cancelAnimation,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { PanEvent, PinchEvent, TapEvent } from '../compat/gestures';
import { usePan, usePinch, useSimultaneous, useTap } from '../compat/gestures';
import {
  CROP_ANIMATION_DURATION,
  CROP_REVEAL_DISTANCE,
  CROP_SETTLE_DELAY,
  RUBBER_BAND_COEFFICIENT,
} from '../core/constants';
import type {
  AspectRatio,
  CanvasMapping,
  CropHandle,
  CropRect,
  CropResult,
  Rect,
  Rotation,
} from '../core/crop';
import {
  canvasMapping,
  clampToCover,
  composeMappings,
  cropImageSize,
  cropRectFromTransform,
  cropTranslationBounds,
  fitCrop,
  frameCentreOffset,
  frameForAspect,
  imageRect,
  maximizeFrame,
  minScaleToCover,
  mirrorCropRect,
  nextRotation,
  reframe,
  resizeFrameRevealing,
  resolveAspectRatio,
  rotateCropRect,
  rotatedSize,
  sameRect,
} from '../core/crop';
import { isUsableSize } from '../core/geometry';
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

/** The crop frame as four animatable values, in container coordinates. */
export type FrameValues = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  width: SharedValue<number>;
  height: SharedValue<number>;
};

export type UseCropperResult = {
  /** Composed pinch/pan/double-tap gesture for the image beneath the frame. */
  imageGesture: unknown;
  /** Zoom, pan, quarter turns and flips, applied to the image as one transform. */
  imageStyle: ReturnType<typeof useAnimatedStyle>;
  /**
   * Applied to the photo and the frame together. At rest it is the identity;
   * a turn or a flip animates it, so the two move as one piece.
   */
  canvasStyle: ReturnType<typeof useAnimatedStyle>;
  /**
   * The size the image is drawn at before that transform. Fixed for a given
   * stage: a quarter turn is part of the transform, never a relayout, which is
   * what lets it animate.
   */
  imageSize: Size;
  /** The crop frame. Lives on the UI thread; read it in animated styles. */
  frame: FrameValues;
  /** True once the image and the stage have both been measured. */
  ready: boolean;
  /**
   * The ratio in effect. A quarter turn inverts a numeric ratio, so after one
   * turn a 16:9 crop reads as 9:16.
   */
  aspectRatio: AspectRatio;
  /** True while a gesture is in progress; drives the grid overlay. */
  interacting: SharedValue<boolean>;
  rotation: Rotation;
  flipHorizontal: boolean;
  flipVertical: boolean;
  /** Handle-drag worklets. They run on the UI thread, inside the gesture. */
  beginFrameDrag: () => void;
  dragFrame: (handle: CropHandle, dx: number, dy: number) => void;
  endFrameDrag: () => void;
  rotate: (turns?: number) => void;
  flip: (axis: 'horizontal' | 'vertical') => void;
  setAspectRatio: (aspect: AspectRatio) => void;
  /** Returns everything to the untouched state. */
  reset: () => void;
  /** Snapshot of what is currently framed. */
  getResult: () => CropResult | null;
};

/**
 * Everything about the layout that the crop maths depends on, for one
 * rotation of one image on one stage.
 */
type Geometry = {
  container: Size;
  /** The image's natural size. */
  source: Size;
  rotation: Rotation;
  /** `source` after the quarter turns: the space the crop rectangle lives in. */
  display: Size;
  /** `display` fitted to the padded stage — the image's size at zoom 1. */
  base: Size;
  /** `source` fitted at rotation 0. The image is always drawn at this size. */
  image: Size;
  /** Extra scale that turns the turned `image` into `base`. */
  fit: number;
};

/**
 * The crop state JS last set, and when. Writes from JS reach the UI thread
 * asynchronously, and an animation reaches its target only at the end, so a
 * read straight after `rotate()` — or straight after the first layout — would
 * see the old values. Until a gesture takes over, this is the truth.
 */
type Pending = {
  generation: number;
  frame: Rect;
  transform: Transform;
};

/**
 * One atomic change to what is on screen, applied on the UI thread in a single
 * step so no frame can show half of it.
 */
type Scene = {
  /** Put the crop here at once. */
  place?: { frame: Rect; transform: Transform };
  /** How the drawn image is turned, fitted and mirrored. */
  image?: { angle: number; fit: number; flipX: number; flipY: number };
  /** Start the whole view from this mapping and animate it home. */
  mapping?: CanvasMapping;
  /** Then animate the crop to here. */
  target?: { frame: Rect; transform: Transform };
};

const IDENTITY: Transform = { scale: 1, translateX: 0, translateY: 0 };
const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

function geometryFor(
  source: Size | null,
  container: Size,
  padding: number,
  rotation: Rotation
): Geometry | null {
  if (!isUsableSize(source) || !isUsableSize(container)) {
    return null;
  }
  const display = rotatedSize(source, rotation);
  const base = cropImageSize(display, container, padding);
  const image = cropImageSize(source, container, padding);
  const drawn = rotatedSize(image, rotation);
  if (!isUsableSize(base) || !isUsableSize(drawn)) {
    return null;
  }
  return {
    container,
    source,
    rotation,
    display,
    base,
    image,
    fit: base.width / drawn.width,
  };
}

function sameGeometry(a: Geometry, b: Geometry): boolean {
  return (
    a.rotation === b.rotation &&
    a.container.width === b.container.width &&
    a.container.height === b.container.height &&
    a.source.width === b.source.width &&
    a.source.height === b.source.height &&
    a.base.width === b.base.width &&
    a.base.height === b.base.height
  );
}

/**
 * Where a fresh crop starts: the largest rectangle of a locked ratio the stage
 * can hold, or — for a free crop — exactly the image.
 *
 * A free crop starting around the whole image matters: filling the stage
 * instead would propose discarding a third of a landscape photo in a portrait
 * app before the user has touched anything.
 */
function restingFrame(ratio: number | null, g: Geometry, padding: number) {
  return ratio !== null
    ? frameForAspect(g.container, ratio, padding)
    : imageRect(g.base, g.container, IDENTITY);
}

/** Zoom 1, centred, raised only as far as covering the frame needs. */
function restingTransform(frame: Rect, g: Geometry, maxScale: number) {
  const required = minScaleToCover(g.base, frame);
  return clampToCover(
    IDENTITY,
    g.base,
    frame,
    g.container,
    required,
    Math.max(maxScale, required)
  );
}

/** Scales a crop to a source whose measured size changed under it. */
function rescaleCrop(crop: CropRect, from: Size, to: Size): CropRect {
  const kx = to.width / from.width;
  const ky = to.height / from.height;
  return {
    originX: crop.originX * kx,
    originY: crop.originY * ky,
    width: crop.width * kx,
    height: crop.height * ky,
  };
}

/**
 * The crop engine.
 *
 * The image is fitted to the stage once and drawn at that size forever after;
 * zoom, pan, quarter turns and flips are all one transform on top. The frame
 * is an independent rectangle, and the only rule linking the two is that the
 * image must cover the frame — enforced by moving the image, never by
 * resizing it.
 *
 * Both live in shared values and every gesture runs as a worklet, so dragging
 * a handle never waits on the JS thread. Letting go does what the Photos app
 * does: after a short pause the frame grows back to fill the stage while the
 * photo zooms and slides under it, keeping exactly the same crop the whole
 * way. Toolbar commands (ratio, rotate, flip, reset) animate the frame and the
 * photo together in the same way.
 *
 * Gesture callbacks are read once, when the gesture is built, so every worklet
 * here reads shared values and never React state: a value captured from the
 * first render would be stale for the lifetime of the component.
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
  const [ready, setReady] = useState(false);
  const [imageSize, setImageSize] = useState<Size>({ width: 0, height: 0 });

  // The latest state for commands, which can run several times before React
  // re-renders — three quick taps on rotate must make three quarter turns.
  const geometryRef = useRef<Geometry | null>(null);
  const rotationRef = useRef<Rotation>(0);
  const aspectRef = useRef<AspectRatio>(aspectRatio);
  const flipsRef = useRef({ horizontal: false, vertical: false });
  const pendingRef = useRef<Pending | null>(null);

  // --- Shared state -------------------------------------------------------

  // The crop: an image transform about the stage's centre, and a frame.
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const frameX = useSharedValue(0);
  const frameY = useSharedValue(0);
  const frameWidth = useSharedValue(0);
  const frameHeight = useSharedValue(0);

  // Presentation only: how the drawn image is turned and mirrored.
  const angle = useSharedValue(0);
  const fitScale = useSharedValue(1);
  const flipX = useSharedValue(1);
  const flipY = useSharedValue(1);

  // The whole view, photo and frame together. Identity at rest.
  const canvasX = useSharedValue(0);
  const canvasY = useSharedValue(0);
  const canvasAngle = useSharedValue(0);
  const canvasScale = useSharedValue(1);
  const canvasFlipX = useSharedValue(1);
  const canvasFlipY = useSharedValue(1);

  // Configuration, mirrored for the worklets.
  const base = useSharedValue<Size>({ width: 0, height: 0 });
  const container = useSharedValue<Size>({ width: 0, height: 0 });
  const padding = useSharedValue(framePadding);
  const zoomLimit = useSharedValue(maxScale);
  const lockedRatio = useSharedValue(0); // 0 = free
  const minFrame = useSharedValue(minFrameSize);
  const motion = useSharedValue<ReduceMotion>(reduceMotion);

  // Gesture bookkeeping.
  const interacting = useSharedValue(false);
  const activeGestures = useSharedValue(0);
  const interruptions = useSharedValue(0);
  /** The zoom the user chose, as opposed to one a ratio forced. */
  const zoomIntent = useSharedValue(1);
  const pinchStart = useSharedValue<Transform>(IDENTITY);
  const pinchFocal = useSharedValue({ x: 0, y: 0 });
  const pinchAnchored = useSharedValue(false);
  const pinchLimits = useSharedValue({ min: 1, max: maxScale });
  const pinching = useSharedValue(false);
  const panStart = useSharedValue({ x: 0, y: 0 });
  const panRebase = useSharedValue(false);
  const dragOrigin = useSharedValue<Rect>(EMPTY_RECT);
  const dragTransform = useSharedValue<Transform>(IDENTITY);
  const dragImage = useSharedValue<Rect>(EMPTY_RECT);
  const dragStage = useSharedValue<Rect>(EMPTY_RECT);

  useEffect(() => {
    padding.value = framePadding;
  }, [padding, framePadding]);
  useEffect(() => {
    zoomLimit.value = maxScale;
  }, [zoomLimit, maxScale]);
  useEffect(() => {
    minFrame.value = minFrameSize;
  }, [minFrame, minFrameSize]);
  useEffect(() => {
    motion.value = reduceMotion;
  }, [motion, reduceMotion]);

  // --- Worklet helpers ----------------------------------------------------

  const readFrame = (): Rect => {
    'worklet';
    return {
      x: frameX.value,
      y: frameY.value,
      width: frameWidth.value,
      height: frameHeight.value,
    };
  };

  const readTransform = (): Transform => {
    'worklet';
    return {
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
    };
  };

  const timing = (): WithTimingConfig => {
    'worklet';
    return { duration: CROP_ANIMATION_DURATION, reduceMotion: motion.value };
  };

  const stopCrop = () => {
    'worklet';
    cancelAnimation(scale);
    cancelAnimation(translateX);
    cancelAnimation(translateY);
    cancelAnimation(frameX);
    cancelAnimation(frameY);
    cancelAnimation(frameWidth);
    cancelAnimation(frameHeight);
  };

  const place = (frame: Rect, transform: Transform) => {
    'worklet';
    stopCrop();
    frameX.value = frame.x;
    frameY.value = frame.y;
    frameWidth.value = frame.width;
    frameHeight.value = frame.height;
    scale.value = transform.scale;
    translateX.value = transform.translateX;
    translateY.value = transform.translateY;
  };

  /**
   * Animates the frame and the image together. Every value runs the same
   * curve for the same time, which is what keeps the crop fixed while both
   * move — see `maximizeFrame`.
   */
  const animateCrop = (frame: Rect, transform: Transform) => {
    'worklet';
    const config = timing();
    scale.value = withTiming(transform.scale, config);
    translateX.value = withTiming(transform.translateX, config);
    translateY.value = withTiming(transform.translateY, config);
    frameX.value = withTiming(frame.x, config);
    frameY.value = withTiming(frame.y, config);
    frameWidth.value = withTiming(frame.width, config);
    frameHeight.value = withTiming(frame.height, config);
  };

  /** Applies a {@link Scene} in one UI-thread step. */
  const stage = (scene: Scene) => {
    'worklet';
    if (scene.place) {
      place(scene.place.frame, scene.place.transform);
    }
    if (scene.image) {
      angle.value = scene.image.angle;
      fitScale.value = scene.image.fit;
      flipX.value = scene.image.flipX;
      flipY.value = scene.image.flipY;
    }
    if (scene.mapping) {
      // Compose with wherever the view is now, so a second tap mid-animation
      // starts from what is on screen rather than jumping.
      const from = composeMappings(
        {
          x: canvasX.value,
          y: canvasY.value,
          angle: canvasAngle.value,
          scale: canvasScale.value,
          flipX: canvasFlipX.value < 0 ? -1 : 1,
          flipY: canvasFlipY.value < 0 ? -1 : 1,
        },
        scene.mapping
      );
      const config = timing();
      canvasX.value = from.x;
      canvasY.value = from.y;
      canvasAngle.value = from.angle;
      canvasScale.value = from.scale;
      canvasFlipX.value = from.flipX;
      canvasFlipY.value = from.flipY;
      canvasX.value = withTiming(0, config);
      canvasY.value = withTiming(0, config);
      canvasAngle.value = withTiming(0, config);
      canvasScale.value = withTiming(1, config);
      canvasFlipX.value = withTiming(1, config);
      canvasFlipY.value = withTiming(1, config);
    }
    if (scene.target) {
      animateCrop(scene.target.frame, scene.target.transform);
    }
  };

  // --- Results ------------------------------------------------------------

  const emitCropChange = useStableCallback(onCropChange);

  const getResult = useCallback((): CropResult | null => {
    const g = geometryRef.current;
    if (!g) {
      return null;
    }
    // Report where JS last put the crop: `rotate(); getResult()` must describe
    // the rotated crop, not a frame of the animation. A gesture since then
    // supersedes it, and its values live on the UI thread.
    const pending = pendingRef.current;
    const live = pending !== null && pending.generation === interruptions.value;
    const frame = live
      ? pending.frame
      : {
          x: frameX.value,
          y: frameY.value,
          width: frameWidth.value,
          height: frameHeight.value,
        };
    const transform = live
      ? pending.transform
      : {
          scale: scale.value,
          translateX: translateX.value,
          translateY: translateY.value,
        };
    return {
      rotate: g.rotation,
      flipHorizontal: flipsRef.current.horizontal,
      flipVertical: flipsRef.current.vertical,
      crop: cropRectFromTransform(
        transform,
        g.base,
        frame,
        g.container,
        g.display
      ),
      sourceSize: g.source,
    };
  }, [
    frameX,
    frameY,
    frameWidth,
    frameHeight,
    scale,
    translateX,
    translateY,
    interruptions,
  ]);

  /** Stable, so the worklets that captured it on the first render still work. */
  const report = useStableCallback(() => {
    const result = getResult();
    if (result) {
      emitCropChange(result);
    }
  });

  /**
   * Records where a gesture's settle animation will end, and reports it.
   * Called from the UI thread the moment the last finger lifts.
   */
  const commit = useStableCallback(
    (generation: number, frame: Rect, transform: Transform) => {
      pendingRef.current = { generation, frame, transform };
      report();
    }
  );

  /** The crop state commands start from: the pending target if there is one. */
  const current = useCallback((): { frame: Rect; transform: Transform } => {
    const pending = pendingRef.current;
    if (pending !== null && pending.generation === interruptions.value) {
      return { frame: pending.frame, transform: pending.transform };
    }
    return {
      frame: {
        x: frameX.value,
        y: frameY.value,
        width: frameWidth.value,
        height: frameHeight.value,
      },
      transform: {
        scale: scale.value,
        translateX: translateX.value,
        translateY: translateY.value,
      },
    };
  }, [
    frameX,
    frameY,
    frameWidth,
    frameHeight,
    scale,
    translateX,
    translateY,
    interruptions,
  ]);

  /** Starts a command's animation and remembers where it is heading. */
  const runCommand = useCallback(
    (frame: Rect, transform: Transform) => {
      const pending: Pending = {
        generation: interruptions.value,
        frame,
        transform,
      };
      pendingRef.current = pending;
      runOnUI(stage)({ target: { frame, transform } });
      // The result already describes the destination, so there is nothing to
      // wait for: report the new crop now rather than when the motion ends.
      report();
    },
    // `stage` is a worklet recreated each render. It reads only shared
    // values, so every render's copy behaves the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interruptions, report]
  );

  const applyGeometry = useCallback(
    (g: Geometry) => {
      geometryRef.current = g;
      rotationRef.current = g.rotation;
      base.value = g.base;
      container.value = g.container;
      lockedRatio.value = resolveAspectRatio(aspectRef.current, g.display) ?? 0;
      setImageSize((size) =>
        size.width === g.image.width && size.height === g.image.height
          ? size
          : g.image
      );
    },
    [base, container, lockedRatio]
  );

  // --- Geometry -----------------------------------------------------------

  /**
   * Lays the crop out when the image and stage are first measured, and again
   * whenever either changes size. After the first time the user's crop is
   * kept: it is carried across as a source rectangle and re-fitted, so a stage
   * resized by a device rotation shows the same region.
   */
  useEffect(() => {
    const previous = geometryRef.current;
    const next = geometryFor(
      sourceSize,
      containerSize,
      framePadding,
      previous ? previous.rotation : rotationRef.current
    );
    if (!next || (previous && sameGeometry(previous, next))) {
      return;
    }

    let frame: Rect;
    let transform: Transform;
    const before = previous ? getResult() : null;
    if (previous && before) {
      const crop =
        previous.display.width === next.display.width &&
        previous.display.height === next.display.height
          ? before.crop
          : rescaleCrop(before.crop, previous.display, next.display);
      ({ frame, transform } = fitCrop(
        crop,
        next.display,
        next.base,
        next.container,
        framePadding,
        maxScale
      ));
    } else {
      const ratio = resolveAspectRatio(aspectRef.current, next.display);
      frame = restingFrame(ratio, next, framePadding);
      transform = restingTransform(frame, next, maxScale);
      zoomIntent.value = 1;
    }

    applyGeometry(next);
    pendingRef.current = {
      generation: interruptions.value,
      frame,
      transform,
    };
    runOnUI(stage)({
      place: { frame, transform },
      image: {
        angle: next.rotation,
        fit: next.fit,
        flipX: flipsRef.current.horizontal ? -1 : 1,
        flipY: flipsRef.current.vertical ? -1 : 1,
      },
    });
    setReady(true);
    report();
    // Keyed on the measurements only. The worklet helpers are recreated every
    // render but read nothing except shared values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSize, containerSize, framePadding]);

  useEffect(
    () => () => {
      stopCrop();
      cancelAnimation(angle);
      cancelAnimation(fitScale);
      cancelAnimation(flipX);
      cancelAnimation(flipY);
      cancelAnimation(canvasX);
      cancelAnimation(canvasY);
      cancelAnimation(canvasAngle);
      cancelAnimation(canvasScale);
      cancelAnimation(canvasFlipX);
      cancelAnimation(canvasFlipY);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // --- Settling after a gesture ------------------------------------------

  /**
   * What happens when the last finger lifts.
   *
   * First the image snaps back to covering the frame if a pinch or pan left
   * it short. Then, after a pause, the frame grows to fill the stage while
   * the image zooms under it — the Photos-app step that turns a dragged
   * rectangle into a finished crop. A touch during the pause cancels it, so
   * a crop can be adjusted edge by edge without the picture moving between
   * touches.
   */
  const settle = () => {
    'worklet';
    const frame = readFrame();
    const now = readTransform();
    const b = base.value;
    const c = container.value;
    if (b.width <= 0 || frame.width <= 0) {
      return;
    }

    const required = minScaleToCover(b, frame);
    const covered = clampToCover(
      { ...now, scale: Math.max(now.scale, required) },
      b,
      frame,
      c,
      required,
      Math.max(zoomLimit.value, required)
    );
    const grown = maximizeFrame(
      frame,
      covered,
      c,
      padding.value,
      Math.max(zoomLimit.value, covered.scale)
    );
    zoomIntent.value = grown.transform.scale;

    // The re-centring never changes what is framed, so the crop is final the
    // moment the finger lifts. Hand JS the end state now: reporting from an
    // animation's completion is fragile, because an animation to the value a
    // shared value already holds can finish before the others have moved.
    runOnJS(commit)(interruptions.value, grown.frame, grown.transform);

    const config = timing();
    const moved =
      Math.abs(covered.scale - now.scale) > 1e-4 ||
      Math.abs(covered.translateX - now.translateX) > 0.25 ||
      Math.abs(covered.translateY - now.translateY) > 0.25;
    const reframes = !sameRect(grown.frame, frame);

    if (!reframes) {
      if (moved) {
        scale.value = withTiming(covered.scale, config);
        translateX.value = withTiming(covered.translateX, config);
        translateY.value = withTiming(covered.translateY, config);
      }
      return;
    }

    const later = (value: number) => {
      'worklet';
      return withDelay(
        CROP_SETTLE_DELAY,
        withTiming(value, config),
        motion.value
      );
    };
    if (moved) {
      scale.value = withSequence(
        withTiming(covered.scale, config),
        later(grown.transform.scale)
      );
      translateX.value = withSequence(
        withTiming(covered.translateX, config),
        later(grown.transform.translateX)
      );
      translateY.value = withSequence(
        withTiming(covered.translateY, config),
        later(grown.transform.translateY)
      );
    } else {
      scale.value = later(grown.transform.scale);
      translateX.value = later(grown.transform.translateX);
      translateY.value = later(grown.transform.translateY);
    }
    const lead = moved ? CROP_ANIMATION_DURATION : 0;
    const frameLater = (value: number) => {
      'worklet';
      return withDelay(
        lead + CROP_SETTLE_DELAY,
        withTiming(value, config),
        motion.value
      );
    };
    frameX.value = frameLater(grown.frame.x);
    frameY.value = frameLater(grown.frame.y);
    frameWidth.value = frameLater(grown.frame.width);
    frameHeight.value = frameLater(grown.frame.height);
  };

  /** A finger went down: whatever was animating stops where it is. */
  const interrupt = () => {
    'worklet';
    stopCrop();
    interruptions.value += 1;
    activeGestures.value += 1;
    interacting.value = true;
  };

  /** A finger came up. Settles once the last gesture has ended. */
  const release = () => {
    'worklet';
    activeGestures.value = Math.max(0, activeGestures.value - 1);
    if (activeGestures.value === 0) {
      interacting.value = false;
      settle();
    }
  };

  // --- Image gestures -----------------------------------------------------

  // Two fingers are the pinch's alone: it scales about the point between them
  // and follows that point as it moves, so pinching and moving at once feels
  // like holding the photo. The pan is for one finger, and stands aside while
  // a pinch runs rather than fighting it for the same values.
  const pinch = usePinch({
    onStart: () => {
      'worklet';
      interrupt();
      pinching.value = true;
      pinchAnchored.value = false;
      pinchStart.value = readTransform();
      const min = minScaleToCover(base.value, readFrame());
      pinchLimits.value = { min, max: Math.max(zoomLimit.value, min) };
    },
    onUpdate: (event: PinchEvent) => {
      'worklet';
      const focal = toCentreRelative(
        { x: event.focalX, y: event.focalY },
        container.value
      );
      if (!Number.isFinite(focal.x) || !Number.isFinite(focal.y)) {
        return;
      }
      if (!pinchAnchored.value) {
        pinchAnchored.value = true;
        pinchFocal.value = focal;
      }
      const start = pinchStart.value;
      const { min, max } = pinchLimits.value;
      const target = start.scale * event.scale;
      // A little give at each end, so the limits feel elastic rather than hard.
      const bounded =
        target < min
          ? min - (min - target) * 0.4
          : target > max
            ? max + (target - max) * 0.15
            : target;
      const k = bounded / start.scale;
      const origin = pinchFocal.value;
      scale.value = bounded;
      translateX.value = focal.x - (origin.x - start.translateX) * k;
      translateY.value = focal.y - (origin.y - start.translateY) * k;
    },
    onEnd: () => {
      'worklet';
      pinching.value = false;
      panRebase.value = true;
      release();
    },
  });

  const pan = usePan({
    maxPointers: 1,
    onStart: () => {
      'worklet';
      interrupt();
      panStart.value = { x: translateX.value, y: translateY.value };
      panRebase.value = false;
    },
    onUpdate: (event: PanEvent) => {
      'worklet';
      if (pinching.value) {
        return;
      }
      if (panRebase.value) {
        // A pinch moved the image under this finger; carry on from there.
        panRebase.value = false;
        panStart.value = {
          x: translateX.value - event.translationX,
          y: translateY.value - event.translationY,
        };
      }
      const frame = readFrame();
      const bounds = cropTranslationBounds(base.value, frame, scale.value);
      const centre = frameCentreOffset(frame, container.value);
      // Rubber-band about the frame's centre, which is where the limits sit.
      translateX.value =
        centre.x +
        withRubberBand(
          panStart.value.x + event.translationX - centre.x,
          bounds.x,
          container.value.width,
          RUBBER_BAND_COEFFICIENT
        );
      translateY.value =
        centre.y +
        withRubberBand(
          panStart.value.y + event.translationY - centre.y,
          bounds.y,
          container.value.height,
          RUBBER_BAND_COEFFICIENT
        );
    },
    onEnd: () => {
      'worklet';
      release();
    },
  });

  // A double-tap zooms into the tapped point, or back out to fill the frame —
  // the quickest way to check detail without a two-finger gesture.
  const doubleTap = useTap({
    numberOfTaps: 2,
    maxDistance: 40,
    onEnd: (event: TapEvent) => {
      'worklet';
      const frame = readFrame();
      const b = base.value;
      const c = container.value;
      if (b.width <= 0 || frame.width <= 0) {
        return;
      }
      stopCrop();
      interruptions.value += 1;
      const now = readTransform();
      const min = minScaleToCover(b, frame);
      const max = Math.max(zoomLimit.value, min);
      const zoomedIn = now.scale > min * 1.01;
      const point = toCentreRelative({ x: event.x, y: event.y }, c);
      const aimed = zoomedIn
        ? now
        : scaleAround(
            now,
            Math.min(min * 2, max),
            Number.isFinite(point.x) && Number.isFinite(point.y)
              ? point
              : frameCentreOffset(frame, c)
          );
      const target = clampToCover(
        { ...aimed, scale: zoomedIn ? min : aimed.scale },
        b,
        frame,
        c,
        min,
        max
      );
      zoomIntent.value = target.scale;
      runOnJS(commit)(interruptions.value, frame, target);
      const config = timing();
      scale.value = withTiming(target.scale, config);
      translateX.value = withTiming(target.translateX, config);
      translateY.value = withTiming(target.translateY, config);
    },
  });

  const imageGesture = useSimultaneous([pinch, pan, doubleTap]);

  // --- Frame handles ------------------------------------------------------

  /**
   * Begins a handle drag. Inside the stage the photo holds still and the
   * frame moves over it; pulled past the stage's edge, the photo zooms out
   * under a frame pinned to the edge, which is how a crop that has zoomed in
   * is opened back up. The frame never outgrows the photo.
   */
  const beginFrameDrag = () => {
    'worklet';
    interrupt();
    dragOrigin.value = readFrame();
    dragTransform.value = readTransform();
    const c = container.value;
    const p = padding.value;
    dragImage.value = imageRect(base.value, c, dragTransform.value);
    dragStage.value = {
      x: p,
      y: p,
      width: Math.max(0, c.width - p * 2),
      height: Math.max(0, c.height - p * 2),
    };
  };

  /** Moves a handle. `dx`/`dy` are measured from the drag's start. */
  const dragFrame = (handle: CropHandle, dx: number, dy: number) => {
    'worklet';
    const next = resizeFrameRevealing(
      dragOrigin.value,
      dragTransform.value,
      handle,
      { x: dx, y: dy },
      dragImage.value,
      dragStage.value,
      container.value,
      lockedRatio.value > 0 ? lockedRatio.value : null,
      minFrame.value,
      CROP_REVEAL_DISTANCE
    );
    frameX.value = next.frame.x;
    frameY.value = next.frame.y;
    frameWidth.value = next.frame.width;
    frameHeight.value = next.frame.height;
    scale.value = next.transform.scale;
    translateX.value = next.transform.translateX;
    translateY.value = next.transform.translateY;
  };

  const endFrameDrag = () => {
    'worklet';
    release();
  };

  // --- Commands -----------------------------------------------------------

  const setAspectRatio = useCallback(
    (next: AspectRatio) => {
      aspectRef.current = next;
      setAspect(next);
      const g = geometryRef.current;
      const ratio = g ? resolveAspectRatio(next, g.display) : null;
      lockedRatio.value = ratio ?? 0;
      // Freeform unlocks the handles and keeps whatever was framed, as in the
      // Photos app: switching to it to nudge one edge must not lose the crop.
      if (!g || ratio === null) {
        return;
      }
      const from = current();
      const frame = frameForAspect(g.container, ratio, framePadding);
      const transform = reframe(
        from.frame,
        from.transform,
        frame,
        g.base,
        g.container,
        maxScale,
        zoomIntent.value
      );
      runCommand(frame, transform);
    },
    [current, framePadding, lockedRatio, maxScale, runCommand, zoomIntent]
  );

  // The prop seeds the ratio; later changes to it behave like a toolbar tap.
  const seededAspect = useRef(aspectRatio);
  useEffect(() => {
    if (seededAspect.current !== aspectRatio) {
      seededAspect.current = aspectRatio;
      setAspectRatio(aspectRatio);
    }
  }, [aspectRatio, setAspectRatio]);

  /** The image's presentation for a rotation and the current flips. */
  const imageFor = useCallback(
    (g: Geometry) => ({
      angle: g.rotation,
      fit: g.fit,
      flipX: flipsRef.current.horizontal ? -1 : 1,
      flipY: flipsRef.current.vertical ? -1 : 1,
    }),
    []
  );

  /**
   * Quarter turns, clockwise on screen. The crop turns with the picture — a
   * 16:9 crop becomes a 9:16 crop of the same region — and the photo and its
   * frame turn together as one piece into their new place.
   */
  const rotate = useCallback(
    (turns = 1) => {
      const whole = Math.round(turns);
      const steps = ((whole % 4) + 4) % 4;
      if (steps === 0) {
        return;
      }
      // Rotation is applied before the flips, so with one flip on, turning
      // the source clockwise turns the picture on screen anticlockwise.
      const flips = flipsRef.current;
      const mirrored = flips.horizontal !== flips.vertical;
      const nextRotationValue = nextRotation(
        rotationRef.current,
        mirrored ? -whole : whole
      );
      rotationRef.current = nextRotationValue;
      setRotation(nextRotationValue);

      let nextAspect = aspectRef.current;
      if (typeof nextAspect === 'number' && steps % 2 === 1) {
        nextAspect = 1 / nextAspect;
      }
      aspectRef.current = nextAspect;
      setAspect(nextAspect);

      const g = geometryRef.current;
      const next = g
        ? geometryFor(g.source, g.container, framePadding, nextRotationValue)
        : null;
      if (!g || !next) {
        return;
      }
      const from = current();
      const crop = cropRectFromTransform(
        from.transform,
        g.base,
        from.frame,
        g.container,
        g.display
      );
      const placed = fitCrop(
        rotateCropRect(crop, g.display, whole),
        next.display,
        next.base,
        next.container,
        framePadding,
        maxScale
      );
      applyGeometry(next);
      zoomIntent.value = placed.transform.scale;
      pendingRef.current = {
        generation: interruptions.value,
        frame: placed.frame,
        transform: placed.transform,
      };
      runOnUI(stage)({
        place: placed,
        image: imageFor(next),
        // The new scene is the old one turned clockwise, so turning it back
        // anticlockwise lands it on the old one.
        mapping: canvasMapping(
          from.frame,
          placed.frame,
          g.container,
          -90 * whole
        ),
      });
      report();
    },
    // `stage` is a worklet that reads only shared values; see runCommand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      applyGeometry,
      current,
      framePadding,
      imageFor,
      interruptions,
      maxScale,
      report,
      zoomIntent,
    ]
  );

  /**
   * Mirrors the photo on screen. The crop is mirrored with it, so the same
   * part of the picture stays selected, and the whole view flips over.
   */
  const flip = useCallback(
    (axis: 'horizontal' | 'vertical') => {
      const horizontal = axis === 'horizontal';
      flipsRef.current = {
        horizontal: horizontal
          ? !flipsRef.current.horizontal
          : flipsRef.current.horizontal,
        vertical: horizontal
          ? flipsRef.current.vertical
          : !flipsRef.current.vertical,
      };
      setFlipHorizontal(flipsRef.current.horizontal);
      setFlipVertical(flipsRef.current.vertical);

      const g = geometryRef.current;
      if (!g) {
        return;
      }
      const { frame, transform } = current();
      const next = {
        frame: horizontal
          ? { ...frame, x: g.container.width - frame.x - frame.width }
          : { ...frame, y: g.container.height - frame.y - frame.height },
        transform: horizontal
          ? { ...transform, translateX: -transform.translateX }
          : { ...transform, translateY: -transform.translateY },
      };
      pendingRef.current = {
        generation: interruptions.value,
        ...next,
      };
      runOnUI(stage)({
        place: next,
        image: imageFor(g),
        mapping: canvasMapping(
          frame,
          next.frame,
          g.container,
          0,
          horizontal ? -1 : 1,
          horizontal ? 1 : -1
        ),
      });
      report();
    },
    // `stage` is a worklet that reads only shared values; see runCommand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, imageFor, interruptions, report]
  );

  /**
   * Back to the untouched photo. Any turn and flips unwind as one movement of
   * the whole view while the crop opens back out to the full image.
   */
  const reset = useCallback(() => {
    const g = geometryRef.current;
    const flips = flipsRef.current;
    const rotationBefore = rotationRef.current;

    rotationRef.current = 0;
    setRotation(0);
    flipsRef.current = { horizontal: false, vertical: false };
    setFlipHorizontal(false);
    setFlipVertical(false);
    aspectRef.current = aspectRatio;
    setAspect(aspectRatio);

    const next = g ? geometryFor(g.source, g.container, framePadding, 0) : null;
    if (!g || !next) {
      return;
    }

    // First, the same crop with the turn and flips taken out: the display is
    // the source turned and then mirrored, so undo the mirror, then the turn.
    const from = current();
    let crop = cropRectFromTransform(
      from.transform,
      g.base,
      from.frame,
      g.container,
      g.display
    );
    if (flips.horizontal) {
      crop = mirrorCropRect(crop, g.display, 'horizontal');
    }
    if (flips.vertical) {
      crop = mirrorCropRect(crop, g.display, 'vertical');
    }
    crop = rotateCropRect(crop, g.display, -rotationBefore / 90);
    const unwound = fitCrop(
      crop,
      next.display,
      next.base,
      next.container,
      framePadding,
      maxScale
    );

    applyGeometry(next);
    const frame = restingFrame(
      resolveAspectRatio(aspectRatio, next.display),
      next,
      framePadding
    );
    const transform = restingTransform(frame, next, maxScale);
    zoomIntent.value = 1;
    pendingRef.current = {
      generation: interruptions.value,
      frame,
      transform,
    };

    // The view on screen is the unwound scene turned, then mirrored, about
    // its frame; a mirror reverses the sense of the turn.
    const fx = flips.horizontal ? -1 : 1;
    const fy = flips.vertical ? -1 : 1;
    runOnUI(stage)({
      place: unwound,
      image: imageFor(next),
      mapping: canvasMapping(
        from.frame,
        unwound.frame,
        g.container,
        fx * fy * rotationBefore,
        fx,
        fy
      ),
      target: { frame, transform },
    });
    report();
    // `stage` is a worklet that reads only shared values; see runCommand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    applyGeometry,
    aspectRatio,
    current,
    framePadding,
    imageFor,
    interruptions,
    maxScale,
    report,
    zoomIntent,
  ]);

  // --- Styles -------------------------------------------------------------

  // Applied right to left: turn the drawn image, mirror it on screen, then
  // zoom and place it. Mirroring after the turn is what makes "flip
  // horizontally" mirror left-to-right on screen at any rotation, and it is
  // the same order `applyCrop` uses, so the file matches the preview.
  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value * fitScale.value },
      { scaleX: flipX.value },
      { scaleY: flipY.value },
      { rotate: `${angle.value}deg` },
    ],
  }));

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: canvasX.value },
      { translateY: canvasY.value },
      { rotate: `${canvasAngle.value}deg` },
      { scale: canvasScale.value },
      { scaleX: canvasFlipX.value },
      { scaleY: canvasFlipY.value },
    ],
  }));

  return {
    imageGesture,
    imageStyle,
    canvasStyle,
    imageSize,
    frame: { x: frameX, y: frameY, width: frameWidth, height: frameHeight },
    ready,
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
