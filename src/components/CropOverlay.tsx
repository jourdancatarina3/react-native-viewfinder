import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import type { CropHandle } from '../core/crop';
import type { FrameValues } from '../hooks/useCropper';
import { CropHandleTarget } from './CropHandleTarget';

export type CropOverlayProps = {
  /** The crop frame, read on the UI thread. */
  frame: FrameValues;
  /** True while the user is pinching, panning or dragging a handle. */
  interacting: SharedValue<boolean>;
  /** Whether the frame can be resized by its handles. */
  resizable: boolean;
  /** Handle-drag worklets, called from inside each handle's gesture. */
  onHandleStart: () => void;
  onHandleMove: (handle: CropHandle, dx: number, dy: number) => void;
  onHandleEnd: () => void;
  /** Colour of the area outside the crop frame. */
  scrimColor: string;
  testID?: string;
};

const HANDLES: readonly CropHandle[] = [
  'topLeft',
  'top',
  'topRight',
  'right',
  'bottomRight',
  'bottom',
  'bottomLeft',
  'left',
];

/**
 * The chrome drawn over a cropping image: the dimmed surround, the frame, the
 * rule-of-thirds guides, and the drag handles.
 *
 * Everything is positioned from the frame's shared values in animated styles,
 * so a handle drag or the re-centring animation moves the chrome on the UI
 * thread without a single React render.
 *
 * Two details do most of the work for how this feels:
 *
 * - **The scrim is four solid rectangles, not one view with a hole.** React
 *   Native has no mask primitive that works identically on both platforms, and
 *   four plain views composite faster than any blend-mode trick.
 * - **The thirds grid only appears while you are interacting.** A permanent
 *   grid makes a crop screen look busy and competes with the photo; one that
 *   fades in exactly when you start moving reads as a guide instead of decor.
 */
function CropOverlayComponent({
  frame,
  interacting,
  resizable,
  onHandleStart,
  onHandleMove,
  onHandleEnd,
  scrimColor,
  testID,
}: CropOverlayProps) {
  const gridOpacity = useDerivedValue(() =>
    withTiming(interacting.value ? 1 : 0, { duration: 160 })
  );

  // The scrims reach well past the stage, so the dimming still covers the
  // photo while the whole view is turned or flipped mid-animation.
  const topScrim = useAnimatedStyle(() => ({
    height: Math.max(0, frame.y.value) + BLEED,
  }));
  const bottomScrim = useAnimatedStyle(() => ({
    top: frame.y.value + frame.height.value,
  }));
  const leftScrim = useAnimatedStyle(() => ({
    top: frame.y.value,
    width: Math.max(0, frame.x.value) + BLEED,
    height: frame.height.value,
  }));
  const rightScrim = useAnimatedStyle(() => ({
    top: frame.y.value,
    left: frame.x.value + frame.width.value,
    height: frame.height.value,
  }));
  const frameRect = useAnimatedStyle(() => ({
    left: frame.x.value,
    top: frame.y.value,
    width: frame.width.value,
    height: frame.height.value,
  }));
  const gridStyle = useAnimatedStyle(() => ({ opacity: gridOpacity.value }));

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      testID={testID}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.scrimTop, { backgroundColor: scrimColor }, topScrim]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.scrimBottom,
          { backgroundColor: scrimColor },
          bottomScrim,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.scrimLeft, { backgroundColor: scrimColor }, leftScrim]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.scrimRight, { backgroundColor: scrimColor }, rightScrim]}
      />

      {/* The frame outline. */}
      <Animated.View pointerEvents="none" style={[styles.frame, frameRect]} />

      {/* Rule-of-thirds guides, faded in while interacting. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.grid, frameRect, gridStyle]}
      >
        <View style={[styles.gridLineV, styles.firstThirdX]} />
        <View style={[styles.gridLineV, styles.secondThirdX]} />
        <View style={[styles.gridLineH, styles.firstThirdY]} />
        <View style={[styles.gridLineH, styles.secondThirdY]} />
      </Animated.View>

      {resizable
        ? HANDLES.map((handle) => (
            <CropHandleTarget
              key={handle}
              handle={handle}
              frame={frame}
              onStart={onHandleStart}
              onMove={onHandleMove}
              onEnd={onHandleEnd}
              {...(testID ? { testID: `${testID}-handle-${handle}` } : null)}
            />
          ))
        : null}
    </View>
  );
}

const LINE = 'rgba(255, 255, 255, 0.55)';

/** How far the scrims extend beyond the stage on every side. */
const BLEED = 2000;

const styles = StyleSheet.create({
  scrimTop: {
    position: 'absolute',
    top: -BLEED,
    left: -BLEED,
    right: -BLEED,
  },
  scrimBottom: {
    position: 'absolute',
    left: -BLEED,
    right: -BLEED,
    bottom: -BLEED,
  },
  scrimLeft: {
    position: 'absolute',
    left: -BLEED,
  },
  scrimRight: {
    position: 'absolute',
    right: -BLEED,
  },
  frame: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  grid: {
    position: 'absolute',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: LINE,
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: LINE,
  },
  firstThirdX: { left: '33.333%' },
  secondThirdX: { left: '66.667%' },
  firstThirdY: { top: '33.333%' },
  secondThirdY: { top: '66.667%' },
});

export const CropOverlay = memo(CropOverlayComponent);
