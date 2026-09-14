import { memo, useMemo } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  ActivityIndicator,
  Image as RNImage,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { toImageSourceProp } from '../core/normalize';
import type { Size } from '../core/types';
import type {
  GalleryImage,
  ImageComponentProps,
  ImageLoadState,
  ImageRenderer,
} from '../types';

export type ImageSurfaceProps = {
  item: GalleryImage;
  /** The fitted size to draw at. Zero until the natural size is known. */
  size: Size;
  state: ImageLoadState;
  ImageComponent?: ImageRenderer;
  onLoad?: (size: Size | null) => void;
  onError?: () => void;
  retry: () => void;
  renderLoading?: () => ReactNode;
  renderError?: (retry: () => void) => ReactNode;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Draws one image at a given size, with its loading and error states.
 *
 * Deliberately has no gesture or animation logic — it is a leaf that re-renders
 * only when the load state or the fitted size changes, which keeps a swipe from
 * re-rendering three images' worth of tree.
 */
function ImageSurfaceComponent({
  item,
  size,
  state,
  ImageComponent,
  onLoad,
  onError,
  retry,
  renderLoading,
  renderError,
  accessibilityLabel,
  testID,
}: ImageSurfaceProps) {
  const Component = (ImageComponent ??
    RNImage) as ComponentType<ImageComponentProps>;

  const source = useMemo(() => toImageSourceProp(item.source), [item.source]);

  const sized = useMemo(
    () => ({ width: size.width, height: size.height }),
    [size.width, size.height]
  );

  const label = accessibilityLabel ?? item.accessibilityLabel;
  const hasSize = size.width > 0 && size.height > 0;

  return (
    <View style={styles.container} testID={testID}>
      {hasSize ? (
        <Component
          source={source}
          style={sized}
          resizeMode="contain"
          contentFit="contain"
          placeholder={item.placeholder ?? null}
          accessible={label != null}
          accessibilityLabel={label}
          testID={testID ? `${testID}-image` : undefined}
          onLoad={(event: unknown) => {
            onLoad?.(readSourceSize(event));
          }}
          onError={() => {
            onError?.();
          }}
        />
      ) : null}

      {state === 'loading' ? (
        <View style={styles.overlay} pointerEvents="none">
          {renderLoading ? (
            renderLoading()
          ) : (
            <ActivityIndicator
              color="#ffffff"
              testID={testID ? `${testID}-loading` : undefined}
            />
          )}
        </View>
      ) : null}

      {state === 'error' ? (
        <View style={styles.overlay}>
          {renderError ? (
            renderError(retry)
          ) : (
            <Text
              style={styles.errorText}
              accessibilityRole="alert"
              testID={testID ? `${testID}-error` : undefined}
            >
              Image unavailable
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Pulls the natural size out of a load event.
 *
 * React Native reports `nativeEvent.source.{width,height}`; `expo-image`
 * reports `source.{width,height}` on a plain object. Both are handled so the
 * size is known even when the caller did not declare it and `Image.getSize`
 * has not resolved yet.
 */
function readSourceSize(event: unknown): Size | null {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const candidate =
    (event as { nativeEvent?: { source?: unknown } }).nativeEvent?.source ??
    (event as { source?: unknown }).source;

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const { width, height } = candidate as { width?: number; height?: number };
  if (
    typeof width === 'number' &&
    typeof height === 'number' &&
    width > 0 &&
    height > 0
  ) {
    return { width, height };
  }
  return null;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#ffffff',
    fontSize: 15,
    opacity: 0.8,
    textAlign: 'center',
  },
});

export const ImageSurface = memo(ImageSurfaceComponent);
