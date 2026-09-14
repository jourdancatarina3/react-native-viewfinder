import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  BackHandler,
  I18nManager,
  Modal,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { PanEvent } from '../compat/gestures';
import {
  DISMISS_DISTANCE_RATIO,
  DISMISS_MIN_SCALE,
  DISMISS_VELOCITY,
  DOUBLE_TAP_SCALES,
  MAX_SCALE,
  MIN_SCALE,
  PAGE_CHANGE_DISTANCE_RATIO,
  PAGE_CHANGE_VELOCITY,
  PAGE_GAP,
  RUBBER_BAND_COEFFICIENT,
  TIMING_DURATION,
  WINDOW_SIZE,
} from '../core/constants';
import { clamp } from '../core/geometry';
import { itemKey, normalizeImages } from '../core/normalize';
import {
  dismissProgress,
  dismissScale,
  resolvePageIndex,
  shouldDismiss,
  withRubberBand,
} from '../core/pan';
import type { Size } from '../core/types';
import { toReduceMotion } from '../hooks/useReduceMotion';
import { useStableCallback } from '../hooks/useStableCallback';
import type { GalleryProps, GalleryRef, GalleryRenderContext } from '../types';
import { GalleryPage } from './GalleryPage';
import { PageIndicator } from './PageIndicator';

const EMPTY_SIZE: Size = { width: 0, height: 0 };

/** Which interaction an at-rest drag has committed to. */
const MODE_UNDECIDED = 0;
const MODE_PAGE = 1;
const MODE_DISMISS = 2;

/**
 * A full-screen, swipeable image gallery.
 *
 * The minimal case needs one prop:
 *
 * ```tsx
 * <Gallery images={['https://a.jpg', 'https://b.jpg']} />
 * ```
 *
 * and the common modal case needs three:
 *
 * ```tsx
 * const [index, setIndex] = useState<number | null>(null);
 *
 * <Gallery
 *   images={photos}
 *   visible={index !== null}
 *   initialIndex={index ?? 0}
 *   onClose={() => setIndex(null)}
 * />
 * ```
 *
 * Each page zooms independently and resets when you swipe away from it, the
 * way the system photo viewers behave. Dragging down dismisses, but only while
 * the current image is at its fitted size — panning a zoomed-in image can never
 * close the gallery by accident.
 *
 * Must be rendered inside a `GestureHandlerRootView`.
 */
export const Gallery = forwardRef<GalleryRef, GalleryProps>(
  function GalleryInner(props, ref) {
    const {
      images,
      visible = true,
      initialIndex = 0,
      index: controlledIndex,
      onIndexChange,
      onClose,
      renderHeader,
      renderFooter,
      renderLoading,
      renderError,
      renderItem,
      ImageComponent,
      swipeToClose = true,
      swipeEnabled = true,
      pageGap = PAGE_GAP,
      backdropColor = '#000000',
      showPageIndicator = true,
      windowSize = WINDOW_SIZE,
      onTap,
      onLongPress,
      onZoomChange,
      reduceMotion = 'system',
      presentation = 'modal',
      style,
      minScale = MIN_SCALE,
      maxScale = MAX_SCALE,
      doubleTapScales = DOUBLE_TAP_SCALES,
      doubleTapToZoom = true,
      pinchToZoom = true,
      panEnabled = true,
      testID,
    } = props;

    const items = useMemo(() => normalizeImages(images), [images]);
    const count = items.length;

    // In RTL the first image sits on the right, so "next" is to the left and
    // every horizontal quantity flips sign. Keeping the layout maths in one
    // logical space and applying this factor at the two boundaries — slot
    // position and gesture direction — is what makes RTL work without a
    // parallel code path.
    const direction = I18nManager.isRTL ? -1 : 1;

    const isControlled = controlledIndex != null;
    const [uncontrolledIndex, setUncontrolledIndex] = useState(() =>
      clamp(initialIndex, 0, Math.max(0, count - 1))
    );
    const activeIndex = isControlled
      ? clamp(controlledIndex, 0, Math.max(0, count - 1))
      : uncontrolledIndex;

    const [containerSize, setContainerSize] = useState<Size>(EMPTY_SIZE);
    const stride = containerSize.width + pageGap;

    const reduceMotionValue = toReduceMotion(reduceMotion);
    const timing = useMemo(
      () => ({ duration: TIMING_DURATION, reduceMotion: reduceMotionValue }),
      [reduceMotionValue]
    );

    // --- Animated state ----------------------------------------------------

    /** Horizontal offset of the pager strip. */
    const pagerX = useSharedValue(0);
    /** Vertical offset while dragging to dismiss. */
    const dismissY = useSharedValue(0);
    /** 0 while closed, 1 while open. Drives the open/close transition. */
    const openProgress = useSharedValue(visible ? 1 : 0);

    const panStartPagerX = useSharedValue(0);
    const panMode = useSharedValue(MODE_UNDECIDED);

    // Mirrors of layout and config that worklets need to read.
    const strideValue = useSharedValue(stride);
    const sizeValue = useSharedValue(containerSize);
    const indexValue = useSharedValue(activeIndex);
    const countValue = useSharedValue(count);
    const config = useSharedValue({
      swipeEnabled,
      swipeToClose,
      direction,
      controlled: isControlled,
    });

    useEffect(() => {
      strideValue.value = stride;
    }, [strideValue, stride]);

    useEffect(() => {
      sizeValue.value = containerSize;
    }, [sizeValue, containerSize]);

    useEffect(() => {
      countValue.value = count;
    }, [countValue, count]);

    useEffect(() => {
      config.value = {
        swipeEnabled,
        swipeToClose,
        direction,
        controlled: isControlled,
      };
    }, [config, swipeEnabled, swipeToClose, direction, isControlled]);

    // --- Index plumbing ----------------------------------------------------

    const emitIndexChange = useStableCallback(onIndexChange);
    const emitClose = useStableCallback(onClose);

    const resetsRef = useRef(new Map<number, (animated?: boolean) => void>());

    const registerReset = useCallback(
      (pageIndex: number, reset: ((animated?: boolean) => void) | null) => {
        if (reset) {
          resetsRef.current.set(pageIndex, reset);
        } else {
          resetsRef.current.delete(pageIndex);
        }
      },
      []
    );

    /**
     * Commits a page change.
     *
     * The outgoing page's zoom is reset without animation so that swiping back
     * to it shows a fitted image, matching the system photo viewers — and
     * avoiding the "image is still zoomed when I swipe back" complaint levelled
     * at several existing libraries.
     */
    const commitIndex = useCallback(
      (next: number) => {
        const bounded = clamp(next, 0, Math.max(0, count - 1));
        if (bounded === indexValue.value) {
          return;
        }

        resetsRef.current.get(indexValue.value)?.(false);
        indexValue.value = bounded;

        if (!isControlled) {
          setUncontrolledIndex(bounded);
        }
        emitIndexChange(bounded);
      },
      [count, indexValue, isControlled, emitIndexChange]
    );

    /** Slides the strip to a page. */
    const settleToIndex = useCallback(
      (target: number, animated = true) => {
        const destination = -direction * target * stride;
        cancelAnimation(pagerX);
        pagerX.value = animated ? withTiming(destination, timing) : destination;
      },
      [direction, stride, pagerX, timing]
    );

    // Keep the strip aligned when the index, layout or direction changes from
    // outside a gesture — a controlled index, a rotation, or the ref API.
    useEffect(() => {
      indexValue.value = activeIndex;
      if (stride > 0) {
        settleToIndex(activeIndex, false);
      }
    }, [activeIndex, stride, settleToIndex, indexValue]);

    // --- Open / close ------------------------------------------------------

    /**
     * Guards `onClose` against both double-firing and never firing.
     *
     * The close animation's completion callback deliberately does *not* check
     * its `finished` flag. An interrupted close would otherwise leave the
     * gallery invisible while the parent still believes it is open — with no
     * further event coming to correct it. Instead, the flag below decides: it
     * is set when a close starts, cleared when `onClose` fires, and also
     * cleared if the gallery is re-opened mid-transition, so a reopen cancels
     * the pending close rather than closing on top of it.
     */
    const closingRef = useRef(false);

    const finishClose = useCallback(() => {
      if (!closingRef.current) {
        return;
      }
      closingRef.current = false;
      dismissY.value = 0;
      emitClose();
    }, [dismissY, emitClose]);

    const close = useCallback(() => {
      if (closingRef.current) {
        return;
      }
      closingRef.current = true;
      openProgress.value = withTiming(0, timing, () => {
        'worklet';
        runOnJS(finishClose)();
      });
    }, [openProgress, timing, finishClose]);

    useEffect(() => {
      if (visible) {
        // A reopen supersedes any close still in flight.
        closingRef.current = false;
      }
      openProgress.value = withTiming(visible ? 1 : 0, timing);
      if (!visible) {
        dismissY.value = 0;
      }
    }, [visible, openProgress, dismissY, timing]);

    // Android hardware back closes the gallery rather than the whole screen.
    useEffect(() => {
      if (!visible || !onClose) {
        return;
      }
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          close();
          return true;
        }
      );
      return () => subscription.remove();
    }, [visible, onClose, close]);

    // Stop every animation on unmount so nothing writes to a detached value.
    useEffect(
      () => () => {
        cancelAnimation(pagerX);
        cancelAnimation(dismissY);
        cancelAnimation(openProgress);
      },
      [pagerX, dismissY, openProgress]
    );

    // --- At-rest pan: paging and swipe-to-dismiss --------------------------

    const onRestPanStart = useCallback(() => {
      'worklet';
      cancelAnimation(pagerX);
      cancelAnimation(dismissY);
      panStartPagerX.value = pagerX.value;
      panMode.value = MODE_UNDECIDED;
    }, [pagerX, dismissY, panStartPagerX, panMode]);

    const onRestPanUpdate = useCallback(
      (event: PanEvent) => {
        'worklet';
        const { swipeEnabled: canSwipe, swipeToClose: canDismiss } =
          config.value;

        if (panMode.value === MODE_UNDECIDED) {
          const dx = Math.abs(event.translationX);
          const dy = Math.abs(event.translationY);
          // Wait for enough travel to tell the axes apart; committing on the
          // first pixel makes a slightly-diagonal swipe feel random.
          if (dx < 6 && dy < 6) {
            return;
          }
          if (dx > dy) {
            panMode.value = canSwipe ? MODE_PAGE : MODE_DISMISS;
          } else {
            panMode.value = canDismiss ? MODE_DISMISS : MODE_PAGE;
          }
          if (panMode.value === MODE_PAGE && !canSwipe) {
            return;
          }
          if (panMode.value === MODE_DISMISS && !canDismiss) {
            return;
          }
        }

        if (panMode.value === MODE_PAGE) {
          const { direction: dir } = config.value;
          const span = (countValue.value - 1) * strideValue.value;
          // The strip lives in [-span, 0] for LTR and [0, span] for RTL.
          const lower = dir > 0 ? -span : 0;
          const upper = dir > 0 ? 0 : span;
          const raw = panStartPagerX.value + event.translationX;
          const centre = (lower + upper) / 2;
          const halfSpan = (upper - lower) / 2;
          pagerX.value =
            centre +
            withRubberBand(
              raw - centre,
              halfSpan,
              sizeValue.value.width,
              RUBBER_BAND_COEFFICIENT
            );
        } else if (panMode.value === MODE_DISMISS) {
          dismissY.value = event.translationY;
        }
      },
      [
        config,
        panMode,
        pagerX,
        dismissY,
        panStartPagerX,
        strideValue,
        countValue,
        sizeValue,
      ]
    );

    const onRestPanEnd = useCallback(
      (event: PanEvent) => {
        'worklet';
        const mode = panMode.value;
        panMode.value = MODE_UNDECIDED;

        if (mode === MODE_PAGE) {
          const { direction: dir, controlled } = config.value;
          const threshold = sizeValue.value.width * PAGE_CHANGE_DISTANCE_RATIO;
          const next = resolvePageIndex(
            dir * event.translationX,
            dir * event.velocityX,
            indexValue.value,
            countValue.value,
            threshold,
            PAGE_CHANGE_VELOCITY
          );

          // A controlled gallery must not move itself; it reports the intent
          // and waits for the parent to change `index`.
          const settleTo = controlled ? indexValue.value : next;
          pagerX.value = withTiming(
            -dir * settleTo * strideValue.value,
            timing
          );

          if (next !== indexValue.value) {
            runOnJS(commitIndex)(next);
          }
          return;
        }

        if (mode === MODE_DISMISS) {
          const distance = sizeValue.value.height * DISMISS_DISTANCE_RATIO;
          if (
            shouldDismiss(
              event.translationY,
              event.velocityY,
              distance,
              DISMISS_VELOCITY
            )
          ) {
            runOnJS(close)();
          } else {
            dismissY.value = withTiming(0, timing);
          }
        }
      },
      [
        panMode,
        config,
        sizeValue,
        indexValue,
        countValue,
        strideValue,
        pagerX,
        dismissY,
        timing,
        commitIndex,
        close,
      ]
    );

    // --- Imperative API ----------------------------------------------------

    const goToIndex = useCallback(
      (target: number, options?: { animated?: boolean }) => {
        const bounded = clamp(target, 0, Math.max(0, count - 1));
        commitIndex(bounded);
        settleToIndex(bounded, options?.animated ?? true);
      },
      [count, commitIndex, settleToIndex]
    );

    useImperativeHandle(
      ref,
      (): GalleryRef => ({
        goToIndex,
        next: (options) => goToIndex(indexValue.value + 1, options),
        previous: (options) => goToIndex(indexValue.value - 1, options),
        reset: (options) =>
          resetsRef.current.get(indexValue.value)?.(options?.animated ?? true),
        close,
        getIndex: () => indexValue.value,
      }),
      [goToIndex, close, indexValue]
    );

    // --- Layout ------------------------------------------------------------

    const onLayout = useCallback((event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setContainerSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height }
      );
    }, []);

    const backdropStyle = useAnimatedStyle(() => {
      const progress = dismissProgress(
        dismissY.value,
        sizeValue.value.height * DISMISS_DISTANCE_RATIO
      );
      return {
        opacity: openProgress.value * (1 - progress * 0.85),
      };
    });

    const stripStyle = useAnimatedStyle(() => {
      const progress = dismissProgress(
        dismissY.value,
        sizeValue.value.height * DISMISS_DISTANCE_RATIO
      );
      return {
        opacity: openProgress.value,
        transform: [
          { translateX: pagerX.value },
          { translateY: dismissY.value },
          { scale: dismissScale(progress, DISMISS_MIN_SCALE) },
        ],
      };
    });

    const chromeStyle = useAnimatedStyle(() => {
      const progress = dismissProgress(
        dismissY.value,
        sizeValue.value.height * DISMISS_DISTANCE_RATIO
      );
      return { opacity: openProgress.value * (1 - progress) };
    });

    // --- Render ------------------------------------------------------------

    const visiblePages = useMemo(() => {
      if (count === 0 || containerSize.width === 0) {
        return [];
      }
      const first = Math.max(0, activeIndex - windowSize);
      const last = Math.min(count - 1, activeIndex + windowSize);
      const pages = [];
      for (let i = first; i <= last; i += 1) {
        pages.push(i);
      }
      return pages;
    }, [count, activeIndex, windowSize, containerSize.width]);

    const context = useMemo(
      (): GalleryRenderContext => ({
        index: activeIndex,
        count,
        item: items[activeIndex],
        close,
        goToIndex,
      }),
      [activeIndex, count, items, close, goToIndex]
    );

    const handleTap = useCallback(
      () => onTap?.(activeIndex),
      [onTap, activeIndex]
    );
    const handleLongPress = useCallback(
      () => onLongPress?.(activeIndex),
      [onLongPress, activeIndex]
    );
    const handleZoomChange = useCallback(
      (value: number) => onZoomChange?.(value, activeIndex),
      [onZoomChange, activeIndex]
    );

    const body = (
      <View
        style={[styles.root, style]}
        onLayout={onLayout}
        testID={testID}
        accessibilityViewIsModal={presentation === 'modal'}
      >
        <Animated.View
          style={[
            styles.backdrop,
            { backgroundColor: backdropColor },
            backdropStyle,
          ]}
          pointerEvents="none"
        />

        <Animated.View style={[styles.strip, stripStyle]}>
          {visiblePages.map((pageIndex) => {
            const item = items[pageIndex]!;
            return (
              <GalleryPage
                key={itemKey(item, pageIndex)}
                item={item}
                index={pageIndex}
                isActive={pageIndex === activeIndex}
                containerSize={containerSize}
                offset={direction * pageIndex * stride}
                minScale={minScale}
                maxScale={maxScale}
                doubleTapScales={doubleTapScales}
                pinchToZoom={pinchToZoom}
                doubleTapToZoom={doubleTapToZoom}
                panEnabled={panEnabled}
                reduceMotion={reduceMotionValue}
                {...(ImageComponent ? { ImageComponent } : null)}
                {...(renderItem ? { renderItem } : null)}
                {...(renderLoading ? { renderLoading } : null)}
                {...(renderError ? { renderError } : null)}
                {...(onTap ? { onTap: handleTap } : null)}
                {...(onLongPress ? { onLongPress: handleLongPress } : null)}
                {...(onZoomChange ? { onZoomChange: handleZoomChange } : null)}
                onRestPanStart={onRestPanStart}
                onRestPanUpdate={onRestPanUpdate}
                onRestPanEnd={onRestPanEnd}
                registerReset={registerReset}
                {...(testID ? { testID: `${testID}-page-${pageIndex}` } : null)}
              />
            );
          })}
        </Animated.View>

        <Animated.View
          style={[styles.chrome, chromeStyle]}
          pointerEvents="box-none"
        >
          {renderHeader ? (
            renderHeader(context)
          ) : showPageIndicator ? (
            <PageIndicator
              index={activeIndex}
              count={count}
              {...(testID ? { testID: `${testID}-indicator` } : null)}
            />
          ) : null}
        </Animated.View>

        {renderFooter ? (
          <Animated.View
            style={[styles.footer, chromeStyle]}
            pointerEvents="box-none"
          >
            {renderFooter(context)}
          </Animated.View>
        ) : null}
      </View>
    );

    if (presentation === 'inline') {
      return visible ? body : null;
    }

    return (
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={close}
        supportedOrientations={[
          'portrait',
          'landscape-left',
          'landscape-right',
        ]}
      >
        {body}
      </Modal>
    );
  }
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  strip: {
    flex: 1,
  },
  chrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
