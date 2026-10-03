import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { PanEvent } from '../compat/gestures';
import { GestureDetector, usePan } from '../compat/gestures';
import type { CropHandle } from '../core/crop';
import type { FrameValues } from '../hooks/useCropper';

export type CropHandleTargetProps = {
  handle: CropHandle;
  frame: FrameValues;
  /** Worklets, called on the UI thread from inside the gesture. */
  onStart: () => void;
  onMove: (handle: CropHandle, dx: number, dy: number) => void;
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
 *
 * The drag runs entirely on the UI thread: the gesture calls the cropper's
 * worklets directly, and the target follows the frame through an animated
 * transform. Nothing crosses to JS until the finger lifts.
 */
function CropHandleTargetComponent({
  handle,
  frame,
  onStart,
  onMove,
  onEnd,
  testID,
}: CropHandleTargetProps) {
  // Read once when the gesture is built, so these must be worklets that read
  // only shared values — which the cropper's are.
  const gesture = usePan({
    onStart: () => {
      'worklet';
      onStart();
    },
    onUpdate: (event: PanEvent) => {
      'worklet';
      onMove(handle, event.translationX, event.translationY);
    },
    onEnd: () => {
      'worklet';
      onEnd();
    },
  });

  const position = useAnimatedStyle(() => {
    const point = anchorFor(
      handle,
      frame.x.value,
      frame.y.value,
      frame.width.value,
      frame.height.value
    );
    return {
      transform: [
        { translateX: point.x - TARGET / 2 },
        { translateY: point.y - TARGET / 2 },
      ],
    };
  });

  const marker = useMemo(() => markerFor(handle), [handle]);
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

/** The point on the frame a handle sits on. */
function anchorFor(
  handle: CropHandle,
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  'worklet';
  const right = x + width;
  const bottom = y + height;
  const centreX = x + width / 2;
  const centreY = y + height / 2;
  switch (handle) {
    case 'topLeft':
      return { x, y };
    case 'topRight':
      return { x: right, y };
    case 'bottomLeft':
      return { x, y: bottom };
    case 'bottomRight':
      return { x: right, y: bottom };
    case 'top':
      return { x: centreX, y };
    case 'bottom':
      return { x: centreX, y: bottom };
    case 'left':
      return { x, y: centreY };
    case 'right':
    default:
      return { x: right, y: centreY };
  }
}

/** How a handle's marker is drawn inside its centred touch target. */
function markerFor(handle: CropHandle) {
  const half = TARGET / 2;
  switch (handle) {
    case 'topLeft':
      return {
        borderTopWidth: THICKNESS,
        borderLeftWidth: THICKNESS,
        top: half,
        left: half,
      };
    case 'topRight':
      return {
        borderTopWidth: THICKNESS,
        borderRightWidth: THICKNESS,
        top: half,
        right: half,
      };
    case 'bottomLeft':
      return {
        borderBottomWidth: THICKNESS,
        borderLeftWidth: THICKNESS,
        bottom: half,
        left: half,
      };
    case 'bottomRight':
      return {
        borderBottomWidth: THICKNESS,
        borderRightWidth: THICKNESS,
        bottom: half,
        right: half,
      };
    case 'top':
      return {
        width: EDGE_LENGTH,
        height: THICKNESS,
        top: half,
        left: half - EDGE_LENGTH / 2,
      };
    case 'bottom':
      return {
        width: EDGE_LENGTH,
        height: THICKNESS,
        bottom: half,
        left: half - EDGE_LENGTH / 2,
      };
    case 'left':
      return {
        width: THICKNESS,
        height: EDGE_LENGTH,
        left: half,
        top: half - EDGE_LENGTH / 2,
      };
    case 'right':
    default:
      return {
        width: THICKNESS,
        height: EDGE_LENGTH,
        right: half,
        top: half - EDGE_LENGTH / 2,
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
    left: 0,
    top: 0,
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
