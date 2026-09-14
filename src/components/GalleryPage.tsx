import { memo, useCallback, useEffect, useMemo } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import type { ReduceMotion } from 'react-native-reanimated';
import Animated from 'react-native-reanimated';
import type { PanEvent } from '../compat/gestures';
import { GestureDetector } from '../compat/gestures';
import type { Size } from '../core/types';
import { useImageSize } from '../hooks/useImageSize';
import { useZoomable } from '../hooks/useZoomable';
import type {
  GalleryImage,
  ImageComponentProps,
  ItemRenderContext,
} from '../types';
import { ImageSurface } from './ImageSurface';

export type GalleryPageProps = {
  item: GalleryImage;
  index: number;
  isActive: boolean;
  containerSize: Size;
  /** Where this page sits along the pager strip, in pixels. */
  offset: number;

  minScale: number;
  maxScale: number;
  doubleTapScales: readonly number[];
  pinchToZoom: boolean;
  doubleTapToZoom: boolean;
  panEnabled: boolean;
  reduceMotion: ReduceMotion;

  ImageComponent?: ComponentType<ImageComponentProps>;
  renderItem?: (context: ItemRenderContext) => ReactNode;
  renderLoading?: (context: ItemRenderContext) => ReactNode;
  renderError?: (context: ItemRenderContext) => ReactNode;

  onTap?: () => void;
  onLongPress?: () => void;
  onZoomChange?: (scale: number) => void;

  /** Called when a pan begins while this page is at its fitted size. */
  onRestPanStart: (event: PanEvent) => void;
  onRestPanUpdate: (event: PanEvent) => void;
  onRestPanEnd: (event: PanEvent) => void;

  /**
   * Registers this page's zoom reset so the gallery can drive it, and
   * deregisters with `null` on unmount.
   */
  registerReset?: (
    index: number,
    reset: ((animated?: boolean) => void) | null
  ) => void;

  testID?: string;
};

/**
 * One page of a gallery: a zoomable image positioned along the pager strip.
 *
 * Only the active page has its gestures enabled, so exactly one page can ever
 * be interacting at a time. When this page is at its fitted size the pan is
 * forwarded to the gallery (for paging and swipe-to-dismiss); when it is zoomed
 * the pan moves the image and the gallery never sees it.
 */
function GalleryPageComponent({
  item,
  index,
  isActive,
  containerSize,
  offset,
  minScale,
  maxScale,
  doubleTapScales,
  pinchToZoom,
  doubleTapToZoom,
  panEnabled,
  reduceMotion,
  ImageComponent,
  renderItem,
  renderLoading,
  renderError,
  onTap,
  onLongPress,
  onZoomChange,
  onRestPanStart,
  onRestPanUpdate,
  onRestPanEnd,
  registerReset,
  testID,
}: GalleryPageProps) {
  const {
    size: contentSize,
    state,
    reportSize,
    reportLoaded,
    reportError,
    retry,
  } = useImageSize(item);

  const zoomable = useZoomable({
    containerSize,
    contentSize,
    minScale,
    maxScale,
    doubleTapScales,
    pinchToZoom,
    doubleTapToZoom,
    panEnabled,
    enabled: isActive,
    reduceMotion,
    onRestPanStart,
    onRestPanUpdate,
    onRestPanEnd,
    ...(onTap ? { onTap } : null),
    ...(onLongPress ? { onLongPress } : null),
    ...(onZoomChange ? { onZoomChange } : null),
  });

  // Hand the gallery a way to reset this page's zoom. Registering in an effect
  // rather than during render keeps the render pure, and the cleanup makes sure
  // a page that unmounts out of the window does not leave a stale entry behind.
  const { reset } = zoomable;
  useEffect(() => {
    registerReset?.(index, reset);
    return () => registerReset?.(index, null);
  }, [registerReset, index, reset]);

  const handleLoad = useCallback(
    (reported: Size | null) => {
      if (reported) {
        reportSize(reported);
      }
      reportLoaded();
    },
    [reportSize, reportLoaded]
  );

  const context = useMemo(
    (): ItemRenderContext => ({ item, index, isActive, state, retry }),
    [item, index, isActive, state, retry]
  );

  const pageStyle = useMemo(
    () => [
      styles.page,
      {
        width: containerSize.width,
        height: containerSize.height,
        transform: [{ translateX: offset }],
      },
    ],
    [containerSize.width, containerSize.height, offset]
  );

  const content = renderItem ? (
    renderItem(context)
  ) : (
    <ImageSurface
      item={item}
      size={zoomable.baseSize}
      state={state}
      {...(ImageComponent ? { ImageComponent } : null)}
      onLoad={handleLoad}
      onError={reportError}
      retry={retry}
      {...(renderLoading
        ? { renderLoading: () => renderLoading(context) }
        : null)}
      {...(renderError ? { renderError: () => renderError(context) } : null)}
      {...(testID ? { testID: `${testID}-surface` } : null)}
    />
  );

  return (
    <Animated.View style={pageStyle} testID={testID} collapsable={false}>
      <GestureDetector gesture={zoomable.gesture as never}>
        <Animated.View style={styles.fill} collapsable={false}>
          <Animated.View style={[styles.centred, zoomable.animatedStyle]}>
            {content}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: {
    position: 'absolute',
    top: 0,
    left: 0,
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

export const GalleryPage = memo(GalleryPageComponent);
