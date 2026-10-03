import type { RenderResult } from '@testing-library/react-native';
import { act } from '@testing-library/react-native';
import { createRef } from 'react';
import { Image, Text, View } from 'react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { ImageCropper } from '../components/ImageCropper';
import { CROP_ANIMATION_DURATION } from '../core/constants';
import type { ImageComponentProps, ImageCropperRef } from '../types';
import { render } from './render';

const SOURCE = 'https://example.com/photo.jpg';

function makeSpyImage() {
  const calls: ImageComponentProps[] = [];
  const SpyImage = (props: ImageComponentProps) => {
    calls.push(props);
    return <View testID="spy-image" />;
  };
  return { SpyImage, calls, last: () => calls[calls.length - 1] };
}

async function layout(view: RenderResult, width = 400, height = 700) {
  await act(async () => {
    view.getByTestId('c-stage').props.onLayout?.({
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });
  });
}

beforeEach(() => {
  jest
    .spyOn(Image, 'getSize')
    .mockImplementation((_uri, success) => success?.(1600, 900));
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * Collapses a style array into one object, as React Native would, and returns
 * where the view's top-left ends up. Handles are placed with a translate so
 * they move on the UI thread, so the translate counts as much as the offset.
 */
function flatten(style: unknown): { left: number; top: number } {
  const parts = Array.isArray(style) ? style.flat(Infinity) : [style];
  const merged = Object.assign({}, ...parts.filter(Boolean)) as {
    left?: number;
    top?: number;
    transform?: Record<string, number>[];
  };
  const shift = (key: 'translateX' | 'translateY') =>
    (merged.transform ?? []).reduce((sum, step) => sum + (step[key] ?? 0), 0);
  return {
    left: (merged.left ?? 0) + shift('translateX'),
    top: (merged.top ?? 0) + shift('translateY'),
  };
}

/**
 * A view's live animated style. The handles move on the UI thread, so their
 * props only hold what the last React render saw. Reanimated's own typing of
 * `getAnimatedStyle` differs between versions, hence the one cast here.
 */
function liveStyle(element: unknown): unknown {
  return (getAnimatedStyle as unknown as (target: unknown) => unknown)(element);
}

/**
 * Lets queued UI-thread work run. The cropper applies layout changes on the UI
 * thread, which Reanimated's test build runs on the next animation frame.
 */
async function nextFrame() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

/**
 * Lets the cropper's frame-and-image animations run to the end. Reanimated's
 * test build steps animations on timers, so this needs fake timers on.
 */
async function finishAnimations(extra = 0) {
  await act(async () => {
    jest.advanceTimersByTime(CROP_ANIMATION_DURATION + extra + 100);
  });
}

async function setup(props: Record<string, unknown> = {}) {
  const ref = createRef<ImageCropperRef>();
  const view = await render(
    <ImageCropper
      ref={ref}
      source={SOURCE}
      width={1600}
      height={900}
      testID="c"
      {...props}
    />
  );
  await layout(view);
  return { ref, view };
}

describe('ImageCropper', () => {
  describe('rendering', () => {
    it('renders from a bare URI with no other props', async () => {
      const view = await render(<ImageCropper source={SOURCE} testID="c" />);
      expect(view.getByTestId('c')).toBeTruthy();
    });

    it('shows the overlay once measured', async () => {
      const { view } = await setup();
      expect(view.getByTestId('c-overlay')).toBeTruthy();
    });

    it('shows the toolbar by default', async () => {
      const { view } = await setup();
      expect(view.getByTestId('c-toolbar')).toBeTruthy();
    });

    it('can hide the toolbar', async () => {
      const { view } = await setup({ showToolbar: false });
      expect(view.queryByTestId('c-toolbar')).toBeNull();
    });

    it('renders a custom toolbar instead', async () => {
      const { view } = await setup({
        renderToolbar: () => <Text>My controls</Text>,
      });
      expect(view.getByText('My controls')).toBeTruthy();
      expect(view.queryByTestId('c-toolbar')).toBeNull();
    });

    it('renders eight resize handles', async () => {
      const { view } = await setup();
      for (const handle of [
        'topLeft',
        'top',
        'topRight',
        'right',
        'bottomRight',
        'bottom',
        'bottomLeft',
        'left',
      ]) {
        expect(view.getByTestId(`c-overlay-handle-${handle}`)).toBeTruthy();
      }
    });

    it('hides the handles when the frame is not resizable', async () => {
      const { view } = await setup({ resizableFrame: false });
      expect(view.queryByTestId('c-overlay-handle-topLeft')).toBeNull();
    });

    it('does not render the overlay before measurement', async () => {
      const view = await render(<ImageCropper source={SOURCE} testID="c" />);
      expect(view.queryByTestId('c-overlay-handle-topLeft')).toBeNull();
    });
  });

  describe('image layout', () => {
    it('lays the image out from the stage, never from the crop frame', async () => {
      // The image is fitted to the padded stage and stays that size whatever
      // the frame does. Sizing it to cover the frame instead is what made
      // dragging a handle resize the picture out from under the finger.
      const sizes: { width: number; height: number }[] = [];
      for (const ratio of ['free' as const, 1, 16 / 9]) {
        const { SpyImage, last } = makeSpyImage();
        const view = await render(
          <ImageCropper
            source={SOURCE}
            width={1600}
            height={900}
            aspectRatio={ratio}
            ImageComponent={SpyImage}
            testID="c"
          />
        );
        await layout(view, 400, 700);
        sizes.push(last()?.style as { width: number; height: number });
      }

      // 1600x900 fitted into a 360x660 padded stage -> 360x202.5
      expect(sizes[0]!.width).toBeCloseTo(360, 0);
      expect(sizes[0]!.height).toBeCloseTo(202.5, 0);
      // Identical for every aspect ratio.
      for (const size of sizes) {
        expect(size.width).toBeCloseTo(sizes[0]!.width, 3);
        expect(size.height).toBeCloseTo(sizes[0]!.height, 3);
      }
    });

    it('never leaves the frame uncovered for any aspect ratio', async () => {
      for (const ratio of [1, 4 / 5, 16 / 9, 'original' as const]) {
        const { SpyImage, last } = makeSpyImage();
        const view = await render(
          <ImageCropper
            source={SOURCE}
            width={1600}
            height={900}
            aspectRatio={ratio}
            ImageComponent={SpyImage}
            testID="c"
          />
        );
        await layout(view, 400, 700);
        const style = last()?.style as { width: number; height: number };
        expect(style.width).toBeGreaterThan(0);
        expect(style.height).toBeGreaterThan(0);
      }
    });
  });

  describe('ref API', () => {
    it('exposes the full handle', async () => {
      const { ref } = await setup();
      expect(typeof ref.current?.getResult).toBe('function');
      expect(typeof ref.current?.rotate).toBe('function');
      expect(typeof ref.current?.flip).toBe('function');
      expect(typeof ref.current?.setAspectRatio).toBe('function');
      expect(typeof ref.current?.reset).toBe('function');
    });

    it('a free crop starts around the whole image, not the stage', async () => {
      // The stage is portrait and the photo is landscape. Filling the stage
      // would propose discarding a third of the photo before the user has
      // touched anything.
      const { ref } = await setup({ aspectRatio: 'free' });
      const { crop } = ref.current!.getResult()!;
      expect(crop.originX).toBe(0);
      expect(crop.originY).toBe(0);
      expect(crop.width).toBe(1600);
      expect(crop.height).toBe(900);
    });

    it('switching back to free keeps the crop and only unlocks the handles', async () => {
      // iOS behaviour: tapping Freeform after Square leaves the square crop
      // where it is. Snapping back to the whole image would throw away the
      // crop someone had just chosen.
      const { ref } = await setup({ aspectRatio: 'free' });
      await act(async () => {
        ref.current?.setAspectRatio(1);
      });
      const square = ref.current!.getResult()!.crop;
      expect(square.width).toBe(square.height);

      await act(async () => {
        ref.current?.setAspectRatio('free');
      });
      const after = ref.current!.getResult()!.crop;
      expect(after.width).toBe(square.width);
      expect(after.height).toBe(square.height);
    });

    it('returns the whole image when nothing has been changed', async () => {
      const { ref } = await setup({ aspectRatio: 'original' });
      const result = ref.current?.getResult();
      expect(result).not.toBeNull();
      expect(result!.rotate).toBe(0);
      expect(result!.flipHorizontal).toBe(false);
      expect(result!.flipVertical).toBe(false);
      expect(result!.sourceSize).toEqual({ width: 1600, height: 900 });
      expect(result!.crop.originX).toBe(0);
      expect(result!.crop.originY).toBe(0);
      expect(result!.crop.width).toBe(1600);
      expect(result!.crop.height).toBe(900);
    });

    it('returns a square region for a 1:1 ratio on a wide image', async () => {
      const { ref } = await setup({ aspectRatio: 1 });
      const { crop } = ref.current!.getResult()!;
      expect(crop.width).toBe(crop.height);
      expect(crop.height).toBe(900);
      // Centred horizontally on a 1600-wide source.
      expect(crop.originX).toBe(Math.round((1600 - 900) / 2));
      expect(crop.originY).toBe(0);
    });

    it('keeps the crop inside the source for every preset ratio', async () => {
      for (const ratio of [1, 4 / 5, 3 / 4, 2 / 3, 4 / 3, 3 / 2, 16 / 9]) {
        const { ref } = await setup({ aspectRatio: ratio });
        const { crop, sourceSize } = ref.current!.getResult()!;
        expect(crop.originX).toBeGreaterThanOrEqual(0);
        expect(crop.originY).toBeGreaterThanOrEqual(0);
        expect(crop.originX + crop.width).toBeLessThanOrEqual(sourceSize.width);
        expect(crop.originY + crop.height).toBeLessThanOrEqual(
          sourceSize.height
        );
        expect(crop.width).toBeGreaterThan(0);
        expect(crop.height).toBeGreaterThan(0);
      }
    });

    it('returns null before the image has been measured', async () => {
      jest.spyOn(Image, 'getSize').mockImplementation(() => {});
      const ref = createRef<ImageCropperRef>();
      const view = await render(
        <ImageCropper ref={ref} source={SOURCE} testID="c" />
      );
      await layout(view);
      expect(ref.current?.getResult()).toBeNull();
    });

    it('rotate steps a quarter turn clockwise and wraps', async () => {
      const { ref } = await setup();
      for (const expected of [90, 180, 270, 0]) {
        await act(async () => {
          ref.current?.rotate();
        });
        expect(ref.current?.getResult()?.rotate).toBe(expected);
      }
    });

    it('rotate accepts a negative turn', async () => {
      const { ref } = await setup();
      await act(async () => {
        ref.current?.rotate(-1);
      });
      expect(ref.current?.getResult()?.rotate).toBe(270);
    });

    it('rotation swaps which axis the crop is constrained on', async () => {
      const { ref } = await setup({ aspectRatio: 'original' });
      const before = ref.current!.getResult()!.crop;
      expect(before.width).toBe(1600);

      await act(async () => {
        ref.current?.rotate();
      });
      const after = ref.current!.getResult()!.crop;
      // The rotated image is 900x1600, so a full-frame crop reports that way.
      expect(after.width).toBeLessThanOrEqual(900);
      expect(after.height).toBeLessThanOrEqual(1600);
    });

    it('flip toggles each axis independently', async () => {
      const { ref } = await setup();
      await act(async () => {
        ref.current?.flip('horizontal');
      });
      expect(ref.current?.getResult()?.flipHorizontal).toBe(true);
      expect(ref.current?.getResult()?.flipVertical).toBe(false);

      await act(async () => {
        ref.current?.flip('vertical');
      });
      expect(ref.current?.getResult()?.flipHorizontal).toBe(true);
      expect(ref.current?.getResult()?.flipVertical).toBe(true);

      await act(async () => {
        ref.current?.flip('horizontal');
      });
      expect(ref.current?.getResult()?.flipHorizontal).toBe(false);
    });

    it('setAspectRatio changes the shape of the crop', async () => {
      const { ref } = await setup({ aspectRatio: 'original' });
      expect(ref.current!.getResult()!.crop.width).toBe(1600);

      await act(async () => {
        ref.current?.setAspectRatio(1);
      });
      const { crop } = ref.current!.getResult()!;
      expect(crop.width).toBe(crop.height);
    });

    it('reset returns rotation, flips and ratio to their initial state', async () => {
      const { ref } = await setup({ aspectRatio: 'original' });
      await act(async () => {
        ref.current?.rotate();
        ref.current?.flip('horizontal');
        ref.current?.setAspectRatio(1);
      });
      await act(async () => {
        ref.current?.reset();
      });

      const result = ref.current!.getResult()!;
      expect(result.rotate).toBe(0);
      expect(result.flipHorizontal).toBe(false);
      // Back to the whole image, even though the ratio being reset away from
      // was a square one.
      expect(result.crop.width).toBe(1600);
      expect(result.crop.height).toBe(900);
    });

    it('a quarter turn keeps the crop, turned with the picture', async () => {
      const { ref } = await setup();
      await act(async () => {
        ref.current?.rotate();
      });
      expect(ref.current!.getResult()!.crop).toEqual({
        originX: 0,
        originY: 0,
        width: 900,
        height: 1600,
      });
    });

    it('a locked ratio turns on its side with the picture', async () => {
      const { ref } = await setup({ aspectRatio: 16 / 9 });
      await act(async () => {
        ref.current?.rotate();
      });
      const { crop } = ref.current!.getResult()!;
      expect(crop.width).toBe(900);
      expect(crop.height).toBe(1600);
    });

    it('four turns bring back the same crop', async () => {
      const { ref } = await setup();
      await act(async () => {
        ref.current?.setAspectRatio(1);
      });
      const before = ref.current!.getResult()!.crop;
      await act(async () => {
        for (let i = 0; i < 4; i++) {
          ref.current?.rotate();
        }
      });
      const after = ref.current!.getResult()!.crop;
      expect(Math.abs(after.originX - before.originX)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.originY - before.originY)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
    });

    /**
     * Commands animate, but the result must describe where they are going: an
     * app that calls `rotate()` and then `getResult()` in the same tick must
     * get the rotated crop, not a frame of the animation.
     */
    it('describes the destination straight after a command', async () => {
      const { ref } = await setup();
      let crop: unknown;
      await act(async () => {
        ref.current?.rotate();
        crop = ref.current?.getResult()?.crop;
      });
      expect(crop).toEqual({
        originX: 0,
        originY: 0,
        width: 900,
        height: 1600,
      });
    });

    it('flipping keeps the size of the crop', async () => {
      const { ref } = await setup();
      await act(async () => {
        ref.current?.setAspectRatio(1);
      });
      const before = ref.current!.getResult()!.crop;
      await act(async () => {
        ref.current?.flip('horizontal');
      });
      const after = ref.current!.getResult()!.crop;
      expect(after.width).toBe(before.width);
      expect(after.height).toBe(before.height);
    });

    /**
     * Rotation is applied before the flips, so with one flip on, a clockwise
     * turn of the source would turn the picture anticlockwise on screen. The
     * button must turn what the user sees clockwise.
     */
    it('turns the picture clockwise on screen even when it is mirrored', async () => {
      const { ref } = await setup();
      await act(async () => {
        ref.current?.flip('horizontal');
      });
      await act(async () => {
        ref.current?.rotate();
      });
      expect(ref.current!.getResult()!.rotate).toBe(270);
    });

    it('reset unwinds turns and flips back to the whole image', async () => {
      const { ref } = await setup();
      await act(async () => {
        ref.current?.setAspectRatio(1);
        ref.current?.rotate();
        ref.current?.flip('vertical');
        ref.current?.rotate();
      });
      await act(async () => {
        ref.current?.reset();
      });
      const result = ref.current!.getResult()!;
      expect(result.rotate).toBe(0);
      expect(result.flipHorizontal).toBe(false);
      expect(result.flipVertical).toBe(false);
      expect(result.crop).toEqual({
        originX: 0,
        originY: 0,
        width: 1600,
        height: 900,
      });
    });
  });

  describe('onCropChange', () => {
    it('reports once the image has been measured', async () => {
      const onCropChange = jest.fn();
      await setup({ onCropChange });
      expect(onCropChange).toHaveBeenCalled();
      expect(onCropChange.mock.calls[0]![0]).toMatchObject({
        rotate: 0,
        flipHorizontal: false,
      });
    });

    it('reports again after a rotation', async () => {
      const onCropChange = jest.fn();
      const { ref } = await setup({ onCropChange });
      onCropChange.mockClear();

      await act(async () => {
        ref.current?.rotate();
      });
      expect(onCropChange).toHaveBeenCalled();
      expect(onCropChange.mock.calls.at(-1)![0].rotate).toBe(90);
    });

    it('reports again after an aspect-ratio change', async () => {
      const onCropChange = jest.fn();
      const { ref } = await setup({ aspectRatio: 'original', onCropChange });
      onCropChange.mockClear();

      await act(async () => {
        ref.current?.setAspectRatio(1);
      });
      expect(onCropChange).toHaveBeenCalled();
    });
  });

  describe('toolbar', () => {
    it('marks the selected ratio for screen readers', async () => {
      const { view } = await setup({ aspectRatio: 1 });
      const chip = view.getByTestId('c-toolbar-aspect-1:1');
      expect(chip.props.accessibilityState).toMatchObject({ selected: true });
    });

    it('shows a turned ratio the right way round', async () => {
      const { ref, view } = await setup({ aspectRatio: 16 / 9 });
      await act(async () => {
        ref.current?.rotate();
      });
      const chip = view.getByTestId('c-toolbar-aspect-16:9');
      expect(chip.props.accessibilityState).toMatchObject({ selected: true });
      expect(chip.props.accessibilityLabel).toBe('Aspect ratio 9:16');
    });

    it('prefers an exact preset over a turned one', async () => {
      const { ref, view } = await setup({ aspectRatio: 4 / 3 });
      await act(async () => {
        ref.current?.rotate();
      });
      // 4:3 turned is 3:4, which has a chip of its own.
      expect(
        view.getByTestId('c-toolbar-aspect-3:4').props.accessibilityState
      ).toMatchObject({ selected: true });
      expect(
        view.getByTestId('c-toolbar-aspect-4:3').props.accessibilityState
      ).toMatchObject({ selected: false });
    });

    it('labels every control', async () => {
      const { view } = await setup();
      expect(view.getByLabelText('Rotate')).toBeTruthy();
      expect(view.getByLabelText('Flip horizontally')).toBeTruthy();
      expect(view.getByLabelText('Flip vertically')).toBeTruthy();
      expect(view.getByLabelText('Reset')).toBeTruthy();
    });

    it('labels every resize handle', async () => {
      const { view } = await setup();
      expect(view.getByLabelText('Resize crop, top left corner')).toBeTruthy();
      expect(view.getByLabelText('Resize crop, right edge')).toBeTruthy();
    });

    it('accepts a custom preset list', async () => {
      const { view } = await setup({
        aspectPresets: [
          { label: 'Square', value: 1 },
          { label: 'Wide', value: 16 / 9 },
        ],
      });
      expect(view.getByTestId('c-toolbar-aspect-Square')).toBeTruthy();
      expect(view.queryByTestId('c-toolbar-aspect-4:5')).toBeNull();
    });
  });

  describe('frame handles', () => {
    /**
     * Handles are rendered from the live frame, so their positions are a
     * readable proxy for where the frame actually is — and they caught the
     * bug where the handles were wired to a stale, zero-sized frame and
     * dragging did nothing at all.
     */
    it('positions the handles around the image for a free crop', async () => {
      const { view } = await setup({ aspectRatio: 'free' });
      await nextFrame();
      const topLeft = view.getByTestId('c-overlay-handle-topLeft');
      const bottomRight = view.getByTestId('c-overlay-handle-bottomRight');

      const tl = flatten(liveStyle(topLeft));
      const br = flatten(liveStyle(bottomRight));

      // Not stacked at the origin, which is what a zero-sized frame produces.
      expect(br.left).toBeGreaterThan(tl.left + 100);
      expect(br.top).toBeGreaterThan(tl.top + 50);
    });

    it('moves the handles when the ratio changes', async () => {
      jest.useFakeTimers();
      try {
        const { ref, view } = await setup({ aspectRatio: 'free' });
        await finishAnimations();
        const before = flatten(
          liveStyle(view.getByTestId('c-overlay-handle-bottomRight'))
        );

        await act(async () => {
          ref.current?.setAspectRatio(1);
        });
        await finishAnimations();

        // The handle moves on the UI thread, so read its live animated style;
        // the props only hold what the last React render saw.
        const after = flatten(
          liveStyle(view.getByTestId('c-overlay-handle-bottomRight'))
        );
        // A 1:1 frame is much taller than the fitted 16:9 image.
        expect(after.top).toBeGreaterThan(before.top);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('lifecycle', () => {
    it('unmounts without throwing', async () => {
      const { view } = await setup();
      await expect(view.unmount()).resolves.not.toThrow();
    });

    it('handles the stage being resized, as on rotation', async () => {
      const { ref, view } = await setup({ aspectRatio: 1 });
      const before = ref.current!.getResult()!.crop;
      expect(before.width).toBe(before.height);

      await layout(view, 700, 400);
      const after = ref.current!.getResult()!.crop;
      expect(after.width).toBe(after.height);
      expect(after.width).toBeGreaterThan(0);
    });

    it('survives a zero-sized stage', async () => {
      const { ref, view } = await setup();
      await layout(view, 0, 0);
      const result = ref.current?.getResult();
      // Either null or a valid rect — never NaN.
      if (result) {
        expect(Number.isNaN(result.crop.width)).toBe(false);
        expect(Number.isNaN(result.crop.originX)).toBe(false);
      }
    });
  });
});
