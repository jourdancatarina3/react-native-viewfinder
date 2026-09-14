import { useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'react-native';
import { knownSize } from '../core/normalize';
import type { Size } from '../core/types';
import type { GalleryImage, ImageLoadState } from '../types';

export type UseImageSizeResult = {
  /** The image's natural size, or `null` until it is known. */
  size: Size | null;
  /** Whether the image is loading, ready, or failed. */
  state: ImageLoadState;
  /** Call from the image component's `onLoad` when it reports a size. */
  reportSize: (size: Size) => void;
  /** Call from the image component's `onLoad`. */
  reportLoaded: () => void;
  /** Call from the image component's `onError`. */
  reportError: () => void;
  /** Re-attempt a failed load. */
  retry: () => void;
};

/**
 * Resolves an image's natural size, which the layout needs before it can fit
 * the image to the container.
 *
 * Three routes, cheapest first:
 *
 * 1. The caller supplied `width`/`height` on the item — no work at all, and no
 *    flash of a wrongly-sized first frame.
 * 2. A bundler asset (`require('./x.jpg')`) — `resolveAssetSource` knows the
 *    size synchronously.
 * 3. A remote URI — `Image.getSize` performs a HEAD-and-decode round trip.
 *
 * The async route is cancelled on unmount and re-run if the source changes, so
 * a fast swipe through a gallery cannot land a stale size on the wrong image.
 */
export function useImageSize(item: GalleryImage): UseImageSizeResult {
  const declared = useMemo(() => knownSize(item), [item]);

  const assetSize = useMemo((): Size | null => {
    if (typeof item.source !== 'number') {
      return null;
    }
    const resolved = Image.resolveAssetSource(item.source);
    const w = resolved?.width;
    const h = resolved?.height;
    return typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0
      ? { width: w, height: h }
      : null;
  }, [item.source]);

  const uri = useMemo(() => {
    const { source } = item;
    if (typeof source === 'string') {
      return source;
    }
    if (typeof source === 'object' && typeof source.uri === 'string') {
      return source.uri;
    }
    return null;
  }, [item]);

  const immediate = declared ?? assetSize;

  const [measured, setMeasured] = useState<Size | null>(null);
  const [state, setState] = useState<ImageLoadState>('loading');
  const [attempt, setAttempt] = useState(0);

  // Guards the async measurement against resolving after the source changed or
  // the component unmounted.
  const liveRef = useRef(true);
  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Reset per-source state so a recycled component does not show the previous
    // image's dimensions or error.
    setMeasured(null);
    setState('loading');
  }, [uri, item.source]);

  useEffect(() => {
    if (immediate || !uri) {
      return;
    }

    let cancelled = false;
    const headers =
      typeof item.source === 'object' && item.source !== null
        ? item.source.headers
        : undefined;

    const onSize = (width: number, height: number) => {
      if (cancelled || !liveRef.current) {
        return;
      }
      if (width > 0 && height > 0) {
        setMeasured({ width, height });
      }
    };

    const onFailure = () => {
      if (cancelled || !liveRef.current) {
        return;
      }
      setState('error');
    };

    if (headers) {
      Image.getSizeWithHeaders(uri, headers, onSize, onFailure);
    } else {
      Image.getSize(uri, onSize, onFailure);
    }

    return () => {
      cancelled = true;
    };
  }, [uri, immediate, item.source, attempt]);

  const size = immediate ?? measured;

  return {
    size,
    state,
    reportSize: (next: Size) => {
      if (next.width > 0 && next.height > 0) {
        setMeasured((current) =>
          current &&
          current.width === next.width &&
          current.height === next.height
            ? current
            : next
        );
      }
    },
    reportLoaded: () =>
      setState((current) => (current === 'error' ? current : 'loaded')),
    reportError: () => setState('error'),
    retry: () => {
      setState('loading');
      setMeasured(null);
      setAttempt((n) => n + 1);
    },
  };
}
