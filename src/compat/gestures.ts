/**
 * A narrow adapter over the two Gesture Handler gesture APIs.
 *
 * Gesture Handler 3 replaced the `Gesture.Pan()` builder with hooks
 * (`usePanGesture()`) and renamed the lifecycle callbacks. Both APIs ship in
 * v3; only the builder exists in v2. Since Expo SDK 57 still pins v2 while npm
 * `latest` is v3, a library that picks one locks out a large share of apps —
 * see docs/DECISIONS.md D-003.
 *
 * This module exposes a single shape and resolves the implementation **once at
 * module evaluation**, from a property check on the imported namespace. The
 * installed version cannot change during a session, so the resulting hook
 * sequence is identical on every render and the Rules of Hooks are satisfied —
 * the same reasoning that makes module-scope `Platform.OS` branching safe.
 *
 * Deliberately covers only the gestures this library needs. It is not a
 * general-purpose shim and should not grow into one.
 */
import { useMemo } from 'react';
import * as RNGH from 'react-native-gesture-handler';

// `any` is load-bearing here: the two APIs return structurally different
// gesture objects, and erasing that difference is this module's entire job.
// Every exported function below is fully typed.
type AnyGesture = any;
type RNGHNamespace = typeof RNGH & Record<string, any>;

const NS = RNGH as RNGHNamespace;

/**
 * True when the host app has Gesture Handler 3 or newer.
 *
 * Exported for diagnostics and for the test suite, which exercises both
 * branches. Application code should not need it.
 */
export const HAS_HOOK_GESTURE_API: boolean =
  typeof NS.usePanGesture === 'function';

// --- Event payloads --------------------------------------------------------
// The payload shapes are identical across both versions; only construction and
// the callback names differ. These are re-declared rather than imported so the
// public types do not shift underneath consumers when they change RGH version.

/** Payload delivered by pan updates. */
export type PanEvent = {
  translationX: number;
  translationY: number;
  velocityX: number;
  velocityY: number;
  absoluteX: number;
  absoluteY: number;
  x: number;
  y: number;
};

/** Payload delivered by pinch updates. */
export type PinchEvent = {
  scale: number;
  focalX: number;
  focalY: number;
  velocity: number;
};

/** Payload delivered by tap and long-press events. */
export type TapEvent = {
  x: number;
  y: number;
  absoluteX: number;
  absoluteY: number;
};

type Handler<E> = (event: E) => void;

/** Lifecycle callbacks, named after the v2 vocabulary. */
type Lifecycle<E> = {
  /** Fires when the gesture is recognised and becomes active. */
  onStart?: Handler<E>;
  /** Fires on every movement while active. */
  onUpdate?: Handler<E>;
  /** Fires when the gesture ends, whether or not it was cancelled. */
  onEnd?: Handler<E>;
  /** Fires after `onEnd`, always, including on cancellation. */
  onFinalize?: Handler<E>;
};

export type PanConfig = Lifecycle<PanEvent> & {
  enabled?: boolean;
  minPointers?: number;
  maxPointers?: number;
  /** Pan only activates once movement exceeds this distance, in px. */
  minDistance?: number;
  /** Average the touches so a two-finger pan does not jump on finger lift. */
  averageTouches?: boolean;
  activeOffsetX?: number | [number, number];
  activeOffsetY?: number | [number, number];
  failOffsetX?: number | [number, number];
  failOffsetY?: number | [number, number];
};

export type PinchConfig = Lifecycle<PinchEvent> & {
  enabled?: boolean;
};

export type TapConfig = Lifecycle<TapEvent> & {
  enabled?: boolean;
  numberOfTaps?: number;
  /** Largest movement, in px, still counted as a tap. */
  maxDistance?: number;
  /** Longest gap between taps of a multi-tap, in ms. */
  maxDelay?: number;
};

export type LongPressConfig = Lifecycle<TapEvent> & {
  enabled?: boolean;
  /** Hold duration, in ms, before the gesture fires. */
  minDuration?: number;
  maxDistance?: number;
};

/**
 * Applies the lifecycle callbacks to a v2 builder.
 *
 * The builder throws if a callback is registered as `undefined`, so each is
 * attached only when supplied.
 */
function applyLifecycle<E>(gesture: AnyGesture, config: Lifecycle<E>) {
  if (config.onStart) {
    gesture.onStart(config.onStart);
  }
  if (config.onUpdate) {
    gesture.onUpdate(config.onUpdate);
  }
  if (config.onEnd) {
    gesture.onEnd(config.onEnd);
  }
  if (config.onFinalize) {
    gesture.onFinalize(config.onFinalize);
  }
  return gesture;
}

/** Translates this module's v2-flavoured callback names to v3's. */
function toHookConfig<E>(
  config: Lifecycle<E> & Record<string, unknown>
): Record<string, unknown> {
  const { onStart, onUpdate, onEnd, onFinalize, ...rest } = config;
  return {
    ...rest,
    ...(onStart ? { onActivate: onStart } : null),
    ...(onUpdate ? { onUpdate } : null),
    ...(onEnd ? { onDeactivate: onEnd } : null),
    ...(onFinalize ? { onFinalize } : null),
  };
}

/**
 * The set of gesture factories, resolved once for the installed RGH version.
 *
 * Both implementations call exactly one hook per gesture, so whichever is
 * chosen, the hook count is stable.
 */
const impl = HAS_HOOK_GESTURE_API
  ? {
      pan: (config: PanConfig) => NS.usePanGesture(toHookConfig(config)),
      pinch: (config: PinchConfig) => NS.usePinchGesture(toHookConfig(config)),
      tap: (config: TapConfig) => NS.useTapGesture(toHookConfig(config)),
      longPress: (config: LongPressConfig) =>
        NS.useLongPressGesture(toHookConfig(config)),
      simultaneous: (gestures: AnyGesture[]) =>
        NS.useSimultaneousGestures(...gestures),
      race: (gestures: AnyGesture[]) => NS.useCompetingGestures(...gestures),
      exclusive: (gestures: AnyGesture[]) =>
        NS.useExclusiveGestures(...gestures),
    }
  : {
      // Each builder is rebuilt when its *primitive* config changes — `enabled`
      // above all, which a gallery toggles as pages become active. Callbacks are
      // deliberately not dependencies: they are worklets recreated every render,
      // so depending on them would rebuild the gesture on every frame. They are
      // read at build time, which is why the exported hooks document that
      // callbacks must read shared values rather than close over React state.
      pan: (config: PanConfig) =>
        useMemo(() => {
          const gesture = NS.Gesture.Pan();
          if (config.enabled !== undefined) gesture.enabled(config.enabled);
          if (config.minPointers !== undefined)
            gesture.minPointers(config.minPointers);
          if (config.maxPointers !== undefined)
            gesture.maxPointers(config.maxPointers);
          if (config.minDistance !== undefined)
            gesture.minDistance(config.minDistance);
          if (config.averageTouches !== undefined)
            gesture.averageTouches(config.averageTouches);
          if (config.activeOffsetX !== undefined)
            gesture.activeOffsetX(config.activeOffsetX);
          if (config.activeOffsetY !== undefined)
            gesture.activeOffsetY(config.activeOffsetY);
          if (config.failOffsetX !== undefined)
            gesture.failOffsetX(config.failOffsetX);
          if (config.failOffsetY !== undefined)
            gesture.failOffsetY(config.failOffsetY);
          return applyLifecycle(gesture, config);
        }, [
          config.enabled,
          config.minPointers,
          config.maxPointers,
          config.minDistance,
          config.averageTouches,
          config.activeOffsetX,
          config.activeOffsetY,
          config.failOffsetX,
          config.failOffsetY,
        ]),

      pinch: (config: PinchConfig) =>
        useMemo(() => {
          const gesture = NS.Gesture.Pinch();
          if (config.enabled !== undefined) gesture.enabled(config.enabled);
          return applyLifecycle(gesture, config);
        }, [config.enabled]),

      tap: (config: TapConfig) =>
        useMemo(() => {
          const gesture = NS.Gesture.Tap();
          if (config.enabled !== undefined) gesture.enabled(config.enabled);
          if (config.numberOfTaps !== undefined)
            gesture.numberOfTaps(config.numberOfTaps);
          if (config.maxDistance !== undefined)
            gesture.maxDistance(config.maxDistance);
          if (config.maxDelay !== undefined) gesture.maxDelay(config.maxDelay);
          return applyLifecycle(gesture, config);
        }, [
          config.enabled,
          config.numberOfTaps,
          config.maxDistance,
          config.maxDelay,
        ]),

      longPress: (config: LongPressConfig) =>
        useMemo(() => {
          const gesture = NS.Gesture.LongPress();
          if (config.enabled !== undefined) gesture.enabled(config.enabled);
          if (config.minDuration !== undefined)
            gesture.minDuration(config.minDuration);
          if (config.maxDistance !== undefined)
            gesture.maxDistance(config.maxDistance);
          return applyLifecycle(gesture, config);
        }, [config.enabled, config.minDuration, config.maxDistance]),

      simultaneous: (gestures: AnyGesture[]) =>
        useMemo(() => NS.Gesture.Simultaneous(...gestures), gestures),

      race: (gestures: AnyGesture[]) =>
        useMemo(() => NS.Gesture.Race(...gestures), gestures),

      exclusive: (gestures: AnyGesture[]) =>
        useMemo(() => NS.Gesture.Exclusive(...gestures), gestures),
    };

/**
 * A pan gesture, built with whichever Gesture Handler API is installed.
 *
 * Callbacks must be worklets. They are read once, on mount: pass stable
 * worklets that read from shared values rather than closing over React state.
 */
export function usePan(config: PanConfig): AnyGesture {
  return impl.pan(config);
}

/** A pinch gesture. See {@link usePan} for the callback contract. */
export function usePinch(config: PinchConfig): AnyGesture {
  return impl.pinch(config);
}

/** A tap gesture. Set `numberOfTaps: 2` for double-tap. */
export function useTap(config: TapConfig): AnyGesture {
  return impl.tap(config);
}

/** A long-press gesture. */
export function useLongPress(config: LongPressConfig): AnyGesture {
  return impl.longPress(config);
}

/** Composes gestures so they can all recognise at the same time. */
export function useSimultaneous(gestures: AnyGesture[]): AnyGesture {
  return impl.simultaneous(gestures);
}

/** Composes gestures so the first to recognise wins. */
export function useRace(gestures: AnyGesture[]): AnyGesture {
  return impl.race(gestures);
}

/**
 * Composes gestures so earlier ones take priority, and later ones only
 * recognise once the earlier have failed. Used to let a double-tap beat a
 * single tap.
 */
export function useExclusive(gestures: AnyGesture[]): AnyGesture {
  return impl.exclusive(gestures);
}

export { GestureDetector } from 'react-native-gesture-handler';
