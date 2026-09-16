import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { runOnJS } from 'react-native-reanimated';
import type { PanEvent } from '../compat/gestures';
import { GestureDetector, usePan } from '../compat/gestures';
import type { CropHandle, Rect } from '../core/crop';

export type CropHandleTargetProps = {
  handle: CropHandle;
  frame: Rect;
  onStart: () => void;
  onMove: (handle: CropHandle, delta: { x: number; y: number }) => void;
  onEnd: () => void;
  testID?: string;
};

/**
 * Touch target for one crop handle, with its visual marker.
 *
 * The **touch area is 44pt** — Apple's and Google's minimum — while the drawn
 * bracket is far smaller. Sizing the target to the graphic is the single most
 * common reason crop handles feel fiddly: the corner you are aiming at is
 * roughly the size of a fingernail, and fingers are not.
 *
 * Corner handles are L-shaped brackets sitting just inside the frame; edge
 * handles are short bars centred on each side. That is the arrangement both
 * phone photo editors use, so it needs no explanation.
 */
function CropHandleTargetComponent({
  handle,
  frame,
  onStart,
  onMove,
  onEnd,
  testID,
}: CropHandleTargetProps) {
  const gesture = usePan({
    // Handles must win over the image pan underneath them, which they do by
    // being later in the tree; no explicit relation is needed.
    onStart: () => {
      'worklet';
      runOnJS(onStart)();
    },
    onUpdate: (event: PanEvent) => {
      'worklet';
      runOnJS(onMove)(handle, {
        x: event.translationX,
        y: event.translationY,
      });
    },
    onEnd: () => {
      'worklet';
      runOnJS(onEnd)();
    },
  });

  const { position, marker } = useMemo(
    () => layoutFor(handle, frame),
    [handle, frame]
  );

  const isCorner = handle.length > 6; // 'topLeft', 'bottomRight', …

  return (
    <GestureDetector gesture={gesture as never}>
      <Animated.View
        style={[styles.target, position]}
        testID={testID}
        accessibilityRole="adjustable"
        accessibilityLabel={`Resize crop, ${labelFor(handle)}`}
      >
        <View
          pointerEvents="none"
          style={[isCorner ? styles.corner : styles.edge, marker]}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const TARGET = 44;
const BRACKET = 22;
const THICKNESS = 3;
const EDGE_LENGTH = 32;

/** Where the touch target sits, and how its marker is drawn inside it. */
function layoutFor(handle: CropHandle, frame: Rect) {
  const left = frame.x;
  const top = frame.y;
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const centreX = frame.x + frame.width / 2;
  const centreY = frame.y + frame.height / 2;
  const half = TARGET / 2;

  switch (handle) {
    case 'topLeft':
      return {
        position: { left: left - half, top: top - half },
        marker: {
          borderTopWidth: THICKNESS,
          borderLeftWidth: THICKNESS,
          top: half,
          left: half,
        },
      };
    case 'topRight':
      return {
        position: { left: right - half, top: top - half },
        marker: {
          borderTopWidth: THICKNESS,
          borderRightWidth: THICKNESS,
          top: half,
          right: half,
        },
      };
    case 'bottomLeft':
      return {
        position: { left: left - half, top: bottom - half },
        marker: {
          borderBottomWidth: THICKNESS,
          borderLeftWidth: THICKNESS,
          bottom: half,
          left: half,
        },
      };
    case 'bottomRight':
      return {
        position: { left: right - half, top: bottom - half },
        marker: {
          borderBottomWidth: THICKNESS,
          borderRightWidth: THICKNESS,
          bottom: half,
          right: half,
        },
      };
    case 'top':
      return {
        position: { left: centreX - half, top: top - half },
        marker: { width: EDGE_LENGTH, height: THICKNESS, top: half },
      };
    case 'bottom':
      return {
        position: { left: centreX - half, top: bottom - half },
        marker: { width: EDGE_LENGTH, height: THICKNESS, bottom: half },
      };
    case 'left':
      return {
        position: { left: left - half, top: centreY - half },
        marker: { width: THICKNESS, height: EDGE_LENGTH, left: half },
      };
    case 'right':
    default:
      return {
        position: { left: right - half, top: centreY - half },
        marker: { width: THICKNESS, height: EDGE_LENGTH, right: half },
      };
  }
}

function labelFor(handle: CropHandle): string {
  switch (handle) {
    case 'topLeft':
      return 'top left corner';
    case 'topRight':
      return 'top right corner';
    case 'bottomLeft':
      return 'bottom left corner';
    case 'bottomRight':
      return 'bottom right corner';
    case 'top':
      return 'top edge';
    case 'bottom':
      return 'bottom edge';
    case 'left':
      return 'left edge';
    case 'right':
    default:
      return 'right edge';
  }
}

const styles = StyleSheet.create({
  target: {
    position: 'absolute',
    width: TARGET,
    height: TARGET,
  },
  corner: {
    position: 'absolute',
    width: BRACKET,
    height: BRACKET,
    borderColor: '#ffffff',
  },
  edge: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderRadius: THICKNESS / 2,
  },
});

export const CropHandleTarget = memo(CropHandleTargetComponent);
