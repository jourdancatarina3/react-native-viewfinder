import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from '../compat/gestures';
import { DOUBLE_TAP_SCALES, MAX_SCALE, MIN_SCALE } from '../core/constants';
import { normalizeImage } from '../core/normalize';
import type { Size } from '../core/types';
import { useImageSize } from '../hooks/useImageSize';
import { toReduceMotion } from '../hooks/useReduceMotion';
import { useZoomable } from '../hooks/useZoomable';
import type { ZoomableImageProps, ZoomableImageRef } from '../types';
import { ImageSurface } from './ImageSurface';

const EMPTY_SIZE: Size = { width: 0, height: 0 };

/**
 * A single image you can pinch, pan and double-tap to zoom.
 *
 * Fills its parent by default, so the minimal usage is genuinely one line:
 *
 * ```tsx
 * <ZoomableImage source="https://example.com/photo.jpg" />
 * ```
 *
 * Everything else — zoom bounds, double-tap stops, which component draws the
 * image, loading and error states — has a working default and is overridable.
 *
 * Must be rendered inside a `GestureHandlerRootView`.
 */
export const ZoomableImage = forwardRef<ZoomableImageRef, ZoomableImageProps>(
  function ZoomableImageInner(props, ref) {
    const {
      source,
      width,
      height,
      placeholder,
      style,
      ImageComponent,
      renderLoading,
      renderError,
      onZoomChange,
      onTap,
      onDoubleTap,
      onLongPress,
      onLoad,
      onError,
      accessibilityLabel,
      accessibilityHint,
      reduceMotion = 'system',
      minScale = MIN_SCALE,
      maxScale = MAX_SCALE,
      doubleTapScales = DOUBLE_TAP_SCALES,
      doubleTapToZoom = true,
      doubleTapMaxDelay,
      pinchToZoom = true,
      panEnabled = true,
      testID,
    } = props;

    const item = useMemo(
      () => ({
        ...normalizeImage(source),
        ...(width != null ? { width } : null),
        ...(height != null ? { height } : null),
        ...(placeholder != null ? { placeholder } : null),
        ...(accessibilityLabel != null ? { accessibilityLabel } : null),
      }),
      [source, width, height, placeholder, accessibilityLabel]
    );

    const [containerSize, setContainerSize] = useState<Size>(EMPTY_SIZE);

    const onLayout = useCallback((event: LayoutChangeEvent) => {
      const { width: w, height: h } = event.nativeEvent.layout;
      setContainerSize((current) =>
        current.width === w && current.height === h
          ? current
          : { width: w, height: h }
      );
    }, []);

    const {
      size: contentSize,
      state,
      reportSize,
      reportLoaded,
      reportError,
      retry,
    } = useImageSize(item);

    const handleLoad = useCallback(
      (reported: Size | null) => {
        if (reported) {
          reportSize(reported);
        }
        reportLoaded();
        onLoad?.();
      },
      [reportSize, reportLoaded, onLoad]
    );

    const handleError = useCallback(() => {
      reportError();
      onError?.();
    }, [reportError, onError]);

    const zoomable = useZoomable({
      containerSize,
      contentSize,
      minScale,
      maxScale,
      doubleTapScales,
      pinchToZoom,
      doubleTapToZoom,
      ...(doubleTapMaxDelay !== undefined ? { doubleTapMaxDelay } : null),
      panEnabled,
      reduceMotion: toReduceMotion(reduceMotion),
      ...(onTap ? { onTap } : null),
      ...(onDoubleTap ? { onDoubleTap } : null),
      ...(onLongPress ? { onLongPress } : null),
      ...(onZoomChange ? { onZoomChange } : null),
    });

    useImperativeHandle(
      ref,
      () => ({
        reset: (options) => zoomable.reset(options?.animated ?? true),
        zoomTo: (scale, options) =>
          zoomable.zoomTo(scale, options?.focal, options?.animated ?? true),
        getTransform: zoomable.getTransform,
      }),
      [zoomable]
    );

    return (
      <View
        style={[styles.container, style]}
        onLayout={onLayout}
        testID={testID}
        accessibilityHint={accessibilityHint}
      >
        <GestureDetector gesture={zoomable.gesture as never}>
          <Animated.View style={styles.fill} collapsable={false}>
            <Animated.View style={[styles.centred, zoomable.animatedStyle]}>
              <ImageSurface
                item={item}
                size={zoomable.baseSize}
                state={state}
                {...(ImageComponent ? { ImageComponent } : null)}
                onLoad={handleLoad}
                onError={handleError}
                retry={retry}
                {...(renderLoading ? { renderLoading } : null)}
                {...(renderError ? { renderError } : null)}
                {...(accessibilityLabel != null
                  ? { accessibilityLabel }
                  : null)}
                {...(testID ? { testID: `${testID}-surface` } : null)}
              />
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
