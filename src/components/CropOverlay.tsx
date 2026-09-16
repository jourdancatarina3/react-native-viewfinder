/* eslint-disable react-native/no-inline-styles -- the scrim, frame and grid are
   positioned from the live crop rectangle, so their geometry cannot live in a
   StyleSheet. Only the static parts of each style do. */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import type { CropHandle, Rect } from '../core/crop';
import { CropHandleTarget } from './CropHandleTarget';

export type CropOverlayProps = {
  frame: Rect;
  containerSize: { width: number; height: number };
  /** True while the user is pinching, panning or dragging a handle. */
  interacting: SharedValue<boolean>;
  /** Whether the frame can be resized by its handles. */
  resizable: boolean;
  onHandleStart: () => void;
  onHandleMove: (handle: CropHandle, delta: { x: number; y: number }) => void;
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
  containerSize,
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

  const gridStyle = useAnimatedStyle(() => ({ opacity: gridOpacity.value }));

  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;

  if (frame.width <= 0 || frame.height <= 0) {
    return null;
  }

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      testID={testID}
    >
      {/* Scrim: top, bottom, left and right of the frame. */}
      <View
        pointerEvents="none"
        style={[
          styles.scrim,
          {
            backgroundColor: scrimColor,
            top: 0,
            left: 0,
            right: 0,
            height: frame.y,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.scrim,
          {
            backgroundColor: scrimColor,
            top: bottom,
            left: 0,
            right: 0,
            height: Math.max(0, containerSize.height - bottom),
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.scrim,
          {
            backgroundColor: scrimColor,
            top: frame.y,
            left: 0,
            width: frame.x,
            height: frame.height,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.scrim,
          {
            backgroundColor: scrimColor,
            top: frame.y,
            left: right,
            width: Math.max(0, containerSize.width - right),
            height: frame.height,
          },
        ]}
      />

      {/* The frame outline. */}
      <View
        pointerEvents="none"
        style={[
          styles.frame,
          {
            left: frame.x,
            top: frame.y,
            width: frame.width,
            height: frame.height,
          },
        ]}
      />

      {/* Rule-of-thirds guides, faded in while interacting. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.grid,
          {
            left: frame.x,
            top: frame.y,
            width: frame.width,
            height: frame.height,
          },
          gridStyle,
        ]}
      >
        <View style={[styles.gridLineV, { left: frame.width / 3 }]} />
        <View style={[styles.gridLineV, { left: (frame.width * 2) / 3 }]} />
        <View style={[styles.gridLineH, { top: frame.height / 3 }]} />
        <View style={[styles.gridLineH, { top: (frame.height * 2) / 3 }]} />
      </Animated.View>

      {/* Corner brackets, drawn on top of the outline. */}
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

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
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
});

export const CropOverlay = memo(CropOverlayComponent);
