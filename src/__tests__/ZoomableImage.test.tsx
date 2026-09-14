import type { RenderResult } from '@testing-library/react-native';
import { act, render } from '@testing-library/react-native';
import { createRef } from 'react';
import { Image, Text, View } from 'react-native';
import { ZoomableImage } from '../components/ZoomableImage';
import type { ImageComponentProps, ZoomableImageRef } from '../types';

/**
 * A stand-in for whatever draws the image, so tests can drive `onLoad` and
 * `onError` deterministically instead of waiting on a real decode, and can
 * assert on exactly what the library asked the image component to render.
 */
function makeSpyImage() {
  const calls: ImageComponentProps[] = [];
  const SpyImage = (props: ImageComponentProps) => {
    calls.push(props);
    return <View testID="spy-image" />;
  };
  return { SpyImage, calls, last: () => calls[calls.length - 1] };
}

/** Fires the layout event the component waits on before it can measure. */
async function layout(
  view: RenderResult,
  width = 400,
  height = 800,
  testID = 'zi'
) {
  await act(async () => {
    view.getByTestId(testID).props.onLayout?.({
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });
  });
}

const REMOTE = 'https://example.com/a.jpg';

beforeEach(() => {
  jest
    .spyOn(Image, 'getSize')
    .mockImplementation((_uri, success) => success?.(1000, 500));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ZoomableImage', () => {
  it('renders from a bare URI string with no other props', async () => {
    const view = await render(<ZoomableImage source={REMOTE} testID="zi" />);
    expect(view.getByTestId('zi')).toBeTruthy();
  });

  it('accepts a source object', async () => {
    const view = await render(
      <ZoomableImage source={{ uri: REMOTE }} testID="zi" />
    );
    expect(view.getByTestId('zi')).toBeTruthy();
  });

  it('shows a loading indicator until the image reports success', async () => {
    const { SpyImage, last } = makeSpyImage();
    const view = await render(
      <ZoomableImage
        source={REMOTE}
        width={1000}
        height={500}
        ImageComponent={SpyImage}
        testID="zi"
      />
    );
    await layout(view);

    expect(view.getByTestId('zi-surface-loading')).toBeTruthy();

    await act(async () => {
      last()?.onLoad?.({
        nativeEvent: { source: { width: 1000, height: 500 } },
      });
    });

    expect(view.queryByTestId('zi-surface-loading')).toBeNull();
  });

  it('shows an error state when the image fails, and clears it on reload', async () => {
    const { SpyImage, last } = makeSpyImage();
    const view = await render(
      <ZoomableImage
        source="https://example.com/broken.jpg"
        width={100}
        height={100}
        ImageComponent={SpyImage}
        testID="zi"
      />
    );
    await layout(view);

    await act(async () => {
      last()?.onError?.({});
    });
    expect(view.getByTestId('zi-surface-error')).toBeTruthy();

    await act(async () => {
      last()?.onLoad?.({
        nativeEvent: { source: { width: 100, height: 100 } },
      });
    });
    expect(view.queryByTestId('zi-surface-error')).toBeNull();
  });

  it('renders a custom loading slot', async () => {
    const view = await render(
      <ZoomableImage
        source={REMOTE}
        width={100}
        height={100}
        renderLoading={() => <Text>Fetching…</Text>}
        testID="zi"
      />
    );
    await layout(view);
    expect(view.getByText('Fetching…')).toBeTruthy();
  });

  it('renders a custom error slot and hands it a retry function', async () => {
    const { SpyImage, last } = makeSpyImage();
    const view = await render(
      <ZoomableImage
        source="https://example.com/broken.jpg"
        width={100}
        height={100}
        ImageComponent={SpyImage}
        renderError={(retry) => <Text onPress={retry}>Try again</Text>}
        testID="zi"
      />
    );
    await layout(view);

    await act(async () => {
      last()?.onError?.({});
    });
    expect(view.getByText('Try again')).toBeTruthy();
  });

  it('uses the supplied ImageComponent rather than RN Image', async () => {
    const { SpyImage, calls } = makeSpyImage();
    const view = await render(
      <ZoomableImage
        source={REMOTE}
        width={1000}
        height={500}
        ImageComponent={SpyImage}
        testID="zi"
      />
    );
    await layout(view);
    expect(calls.length).toBeGreaterThan(0);
    expect(view.getByTestId('spy-image')).toBeTruthy();
  });

  it('passes the placeholder through to the image component', async () => {
    const { SpyImage, last } = makeSpyImage();
    const view = await render(
      <ZoomableImage
        source={REMOTE}
        width={100}
        height={100}
        placeholder="LEHV6nWB2yk8pyo0adR*"
        ImageComponent={SpyImage}
        testID="zi"
      />
    );
    await layout(view);
    expect(last()?.placeholder).toBe('LEHV6nWB2yk8pyo0adR*');
  });

  it('forwards request headers to the image component', async () => {
    const { SpyImage, last } = makeSpyImage();
    const view = await render(
      <ZoomableImage
        source={{
          uri: 'https://example.com/private.jpg',
          width: 100,
          height: 100,
          headers: { Authorization: 'Bearer token' },
        }}
        ImageComponent={SpyImage}
        testID="zi"
      />
    );
    await layout(view);
    expect(last()?.source).toEqual({
      uri: 'https://example.com/private.jpg',
      headers: { Authorization: 'Bearer token' },
    });
  });

  it('applies the accessibility label to the image', async () => {
    const { SpyImage, last } = makeSpyImage();
    const view = await render(
      <ZoomableImage
        source={REMOTE}
        width={100}
        height={100}
        accessibilityLabel="A tabby cat asleep on a keyboard"
        ImageComponent={SpyImage}
        testID="zi"
      />
    );
    await layout(view);
    expect(last()?.accessibilityLabel).toBe('A tabby cat asleep on a keyboard');
    expect(last()?.accessible).toBe(true);
  });

  describe('layout', () => {
    it('fits the image to the container, preserving aspect ratio', async () => {
      const { SpyImage, last } = makeSpyImage();
      const view = await render(
        <ZoomableImage
          source={REMOTE}
          width={1000}
          height={500}
          ImageComponent={SpyImage}
          testID="zi"
        />
      );
      await layout(view, 400, 800);
      // 1000x500 fitted into 400x800 -> 400x200
      expect(last()?.style).toEqual({ width: 400, height: 200 });
    });

    it('refits when the container changes size, as on rotation', async () => {
      const { SpyImage, last } = makeSpyImage();
      const view = await render(
        <ZoomableImage
          source={REMOTE}
          width={1000}
          height={500}
          ImageComponent={SpyImage}
          testID="zi"
        />
      );
      await layout(view, 400, 800);
      expect(last()?.style).toEqual({ width: 400, height: 200 });

      await layout(view, 800, 400);
      expect(last()?.style).toEqual({ width: 800, height: 400 });
    });

    it('fits an ultra-wide panorama without collapsing it', async () => {
      const { SpyImage, last } = makeSpyImage();
      const view = await render(
        <ZoomableImage
          source={REMOTE}
          width={12000}
          height={1000}
          ImageComponent={SpyImage}
          testID="zi"
        />
      );
      await layout(view, 400, 800);
      const style = last()?.style as { width: number; height: number };
      expect(style.width).toBeCloseTo(400);
      expect(style.height).toBeGreaterThan(0);
    });

    it('fits an ultra-tall image without collapsing it', async () => {
      const { SpyImage, last } = makeSpyImage();
      const view = await render(
        <ZoomableImage
          source={REMOTE}
          width={1000}
          height={12000}
          ImageComponent={SpyImage}
          testID="zi"
        />
      );
      await layout(view, 400, 800);
      const style = last()?.style as { width: number; height: number };
      expect(style.height).toBeCloseTo(800);
      expect(style.width).toBeGreaterThan(0);
    });

    it('scales a 1x1 pixel image up to fit', async () => {
      const { SpyImage, last } = makeSpyImage();
      const view = await render(
        <ZoomableImage
          source={REMOTE}
          width={1}
          height={1}
          ImageComponent={SpyImage}
          testID="zi"
        />
      );
      await layout(view, 400, 800);
      expect(last()?.style).toEqual({ width: 400, height: 400 });
    });

    it('does not render the image until a size is known', async () => {
      jest.spyOn(Image, 'getSize').mockImplementation(() => {});
      const { SpyImage, calls } = makeSpyImage();
      const view = await render(
        <ZoomableImage
          source="https://example.com/unmeasurable.jpg"
          ImageComponent={SpyImage}
          testID="zi"
        />
      );
      await layout(view);
      expect(calls).toHaveLength(0);
      expect(view.getByTestId('zi-surface-loading')).toBeTruthy();
    });

    it('survives a zero-sized container without producing NaN', async () => {
      const { SpyImage, calls } = makeSpyImage();
      const view = await render(
        <ZoomableImage
          source={REMOTE}
          width={1000}
          height={500}
          ImageComponent={SpyImage}
          testID="zi"
        />
      );
      await layout(view, 0, 0);
      for (const call of calls) {
        const style = call.style as
          { width?: number; height?: number } | undefined;
        expect(Number.isNaN(style?.width ?? 0)).toBe(false);
        expect(Number.isNaN(style?.height ?? 0)).toBe(false);
      }
    });
  });

  describe('ref API', () => {
    async function setup(props: Record<string, unknown> = {}) {
      const ref = createRef<ZoomableImageRef>();
      const view = await render(
        <ZoomableImage
          ref={ref}
          source={REMOTE}
          width={1000}
          height={500}
          testID="zi"
          {...props}
        />
      );
      await layout(view, 400, 800);
      return { ref, view };
    }

    it('exposes reset, zoomTo and getTransform', async () => {
      const { ref } = await setup();
      expect(typeof ref.current?.reset).toBe('function');
      expect(typeof ref.current?.zoomTo).toBe('function');
      expect(typeof ref.current?.getTransform).toBe('function');
    });

    it('starts at the identity transform', async () => {
      const { ref } = await setup();
      expect(ref.current?.getTransform()).toEqual({
        scale: 1,
        translateX: 0,
        translateY: 0,
      });
    });

    it('zoomTo without animation applies immediately', async () => {
      const { ref } = await setup();
      await act(async () => {
        ref.current?.zoomTo(3, { animated: false });
      });
      expect(ref.current?.getTransform().scale).toBe(3);
    });

    it('zoomTo clamps to maxScale', async () => {
      const { ref } = await setup({ maxScale: 4 });
      await act(async () => {
        ref.current?.zoomTo(99, { animated: false });
      });
      expect(ref.current?.getTransform().scale).toBe(4);
    });

    it('zoomTo clamps to minScale', async () => {
      const { ref } = await setup();
      await act(async () => {
        ref.current?.zoomTo(0.1, { animated: false });
      });
      expect(ref.current?.getTransform().scale).toBe(1);
    });

    it('reset without animation returns to the identity transform', async () => {
      const { ref } = await setup();
      await act(async () => {
        ref.current?.zoomTo(3, { animated: false });
      });
      await act(async () => {
        ref.current?.reset({ animated: false });
      });
      expect(ref.current?.getTransform()).toEqual({
        scale: 1,
        translateX: 0,
        translateY: 0,
      });
    });

    it('zoomTo anchored off-centre moves the image', async () => {
      const { ref } = await setup();
      await act(async () => {
        // Anchor on the right edge; the content must move left to keep it put.
        ref.current?.zoomTo(3, { focal: { x: 400, y: 400 }, animated: false });
      });
      expect(ref.current?.getTransform().translateX).toBeLessThan(0);
    });

    it('keeps the transform inside its bounds after an anchored zoom', async () => {
      const { ref } = await setup();
      await act(async () => {
        ref.current?.zoomTo(3, { focal: { x: 400, y: 800 }, animated: false });
      });
      const transform = ref.current!.getTransform();
      // Base is 400x200; at scale 3 that is 1200x600 in a 400x800 container.
      expect(Math.abs(transform.translateX)).toBeLessThanOrEqual(400 + 1e-6);
      // Height 600 < 800, so the y axis must stay centred.
      expect(transform.translateY).toBe(0);
    });
  });

  describe('lifecycle', () => {
    it('unmounts without throwing', async () => {
      const view = await render(<ZoomableImage source={REMOTE} testID="zi" />);
      await layout(view);
      await expect(view.unmount()).resolves.not.toThrow();
    });

    it('unmounts cleanly mid-animation', async () => {
      const ref = createRef<ZoomableImageRef>();
      const view = await render(
        <ZoomableImage
          ref={ref}
          source={REMOTE}
          width={1000}
          height={500}
          testID="zi"
        />
      );
      await layout(view);
      await act(async () => {
        ref.current?.zoomTo(4, { animated: true });
      });
      await expect(view.unmount()).resolves.not.toThrow();
    });

    it('does not set state after unmount when getSize resolves late', async () => {
      let resolve: ((w: number, h: number) => void) | undefined;
      jest.spyOn(Image, 'getSize').mockImplementation((_uri, success) => {
        resolve = success as (w: number, h: number) => void;
      });

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const view = await render(
        <ZoomableImage source="https://example.com/slow.jpg" testID="zi" />
      );
      await layout(view);
      await view.unmount();

      await act(async () => {
        resolve?.(800, 600);
      });

      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('callbacks', () => {
    it('fires onLoad when the image succeeds', async () => {
      const onLoad = jest.fn();
      const { SpyImage, last } = makeSpyImage();
      const view = await render(
        <ZoomableImage
          source={REMOTE}
          width={100}
          height={100}
          ImageComponent={SpyImage}
          onLoad={onLoad}
          testID="zi"
        />
      );
      await layout(view);

      await act(async () => {
        last()?.onLoad?.({
          nativeEvent: { source: { width: 100, height: 100 } },
        });
      });
      expect(onLoad).toHaveBeenCalledTimes(1);
    });

    it('fires onError when the image fails', async () => {
      const onError = jest.fn();
      const { SpyImage, last } = makeSpyImage();
      const view = await render(
        <ZoomableImage
          source="https://example.com/broken.jpg"
          width={100}
          height={100}
          ImageComponent={SpyImage}
          onError={onError}
          testID="zi"
        />
      );
      await layout(view);

      await act(async () => {
        last()?.onError?.({});
      });
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });
});
