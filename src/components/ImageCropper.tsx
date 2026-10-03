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
import { MAX_SCALE } from '../core/constants';
import { normalizeImage } from '../core/normalize';
import type { Size } from '../core/types';
import { useCropper } from '../hooks/useCropper';
import { useImageSize } from '../hooks/useImageSize';
import { toReduceMotion } from '../hooks/useReduceMotion';
import type { ImageCropperProps, ImageCropperRef } from '../types';
import { CropOverlay } from './CropOverlay';
import { CropToolbar } from './CropToolbar';
import { ImageSurface } from './ImageSurface';

const EMPTY_SIZE: Size = { width: 0, height: 0 };

/**
 * An image cropper.
 *
 * ```tsx
 * const cropper = useRef<ImageCropperRef>(null);
 *
 * <ImageCropper ref={cropper} source={uri} aspectRatio={1} />
 *
 * // when the user confirms:
 * const result = cropper.current?.getResult();
 * ```
 *
 * `getResult()` returns a rectangle in the source image's own pixels, plus the
 * rotation and flips, in the shape `expo-image-manipulator` and the other
 * native manipulators already expect. The cropper itself performs no image
 * processing and adds no native dependency — see
 * `react-native-viewfinder/expo-image-manipulator` for a one-call helper that
 * turns the result into a file.
 *
 * The interaction is the one the phone photo editors use: the image covers the
 * frame and can only be zoomed further in, so there is no way to leave a gap
 * inside the crop.
 *
 * Must be rendered inside a `GestureHandlerRootView`.
 */
export const ImageCropper = forwardRef<ImageCropperRef, ImageCropperProps>(
  function ImageCropperInner(props, ref) {
    const {
      source,
      width,
      height,
      aspectRatio = 'free',
      framePadding = 20,
      maxScale = MAX_SCALE,
      minFrameSize = 72,
      resizableFrame = true,
      showToolbar = true,
      aspectPresets,
      scrimColor = 'rgba(0, 0, 0, 0.6)',
      backgroundColor = '#000000',
      ImageComponent,
      renderToolbar,
      renderLoading,
      renderError,
      onCropChange,
      accessibilityLabel,
      reduceMotion = 'system',
      style,
      testID,
    } = props;

    const item = useMemo(
      () => ({
        ...normalizeImage(source),
        ...(width != null ? { width } : null),
        ...(height != null ? { height } : null),
        ...(accessibilityLabel != null ? { accessibilityLabel } : null),
      }),
      [source, width, height, accessibilityLabel]
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
      size: sourceSize,
      state,
      reportSize,
      reportLoaded,
      reportError,
      retry,
    } = useImageSize(item);

    const cropper = useCropper({
      containerSize,
      sourceSize,
      aspectRatio,
      framePadding,
      maxScale,
      minFrameSize,
      reduceMotion: toReduceMotion(reduceMotion),
      ...(onCropChange ? { onCropChange } : null),
    });

    useImperativeHandle(
      ref,
      (): ImageCropperRef => ({
        getResult: cropper.getResult,
        rotate: cropper.rotate,
        flip: cropper.flip,
        setAspectRatio: cropper.setAspectRatio,
        reset: cropper.reset,
      }),
      [cropper]
    );

    const handleLoad = useCallback(
      (reported: Size | null) => {
        if (reported) {
          reportSize(reported);
        }
        reportLoaded();
      },
      [reportSize, reportLoaded]
    );

    const toolbar = renderToolbar ? (
      renderToolbar({
        aspectRatio: cropper.aspectRatio,
        rotation: cropper.rotation,
        flipHorizontal: cropper.flipHorizontal,
        flipVertical: cropper.flipVertical,
        rotate: cropper.rotate,
        flip: cropper.flip,
        setAspectRatio: cropper.setAspectRatio,
        reset: cropper.reset,
        getResult: cropper.getResult,
      })
    ) : showToolbar ? (
      <CropToolbar
        aspectRatio={cropper.aspectRatio}
        onAspectRatioChange={cropper.setAspectRatio}
        onRotate={() => cropper.rotate(1)}
        onFlipHorizontal={() => cropper.flip('horizontal')}
        onFlipVertical={() => cropper.flip('vertical')}
        onReset={cropper.reset}
        {...(aspectPresets ? { presets: aspectPresets } : null)}
        {...(testID ? { testID: `${testID}-toolbar` } : null)}
      />
    ) : null;

    return (
      <View style={[styles.root, style]} testID={testID}>
        <View
          style={[styles.stage, { backgroundColor }]}
          onLayout={onLayout}
          testID={testID ? `${testID}-stage` : undefined}
        >
          <GestureDetector gesture={cropper.imageGesture as never}>
            <Animated.View style={styles.fill} collapsable={false}>
              <Animated.View style={[styles.centred, cropper.animatedStyle]}>
                <Animated.View style={cropper.orientationStyle}>
                  <ImageSurface
                    item={item}
                    size={cropper.baseSize}
                    state={state}
                    {...(ImageComponent ? { ImageComponent } : null)}
                    onLoad={handleLoad}
                    onError={reportError}
                    retry={retry}
                    {...(renderLoading ? { renderLoading } : null)}
                    {...(renderError ? { renderError } : null)}
                    {...(testID ? { testID: `${testID}-surface` } : null)}
                  />
                </Animated.View>
              </Animated.View>
            </Animated.View>
          </GestureDetector>

          <CropOverlay
            frame={cropper.frame}
            containerSize={containerSize}
            interacting={cropper.interacting}
            resizable={resizableFrame}
            onHandleStart={cropper.beginFrameDrag}
            onHandleMove={cropper.dragFrame}
            onHandleEnd={cropper.endFrameDrag}
            scrimColor={scrimColor}
            {...(testID ? { testID: `${testID}-overlay` } : null)}
          />
        </View>

        {toolbar}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  stage: {
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
