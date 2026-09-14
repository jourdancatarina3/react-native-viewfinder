import type { RenderResult } from '@testing-library/react-native';
import { act, render } from '@testing-library/react-native';
import { createRef } from 'react';
import { BackHandler, Image, Text, View } from 'react-native';
import { Gallery } from '../components/Gallery';
import type { GalleryRef, ImageComponentProps } from '../types';

const PHOTOS = [
  'https://example.com/1.jpg',
  'https://example.com/2.jpg',
  'https://example.com/3.jpg',
  'https://example.com/4.jpg',
];

function makeSpyImage() {
  const calls: ImageComponentProps[] = [];
  const SpyImage = (props: ImageComponentProps) => {
    calls.push(props);
    return <View testID="spy-image" />;
  };
  return { SpyImage, calls };
}

async function layout(view: RenderResult, width = 400, height = 800) {
  await act(async () => {
    view.getByTestId('g').props.onLayout?.({
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });
  });
}

beforeEach(() => {
  jest
    .spyOn(Image, 'getSize')
    .mockImplementation((_uri, success) => success?.(1000, 500));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Gallery', () => {
  describe('rendering', () => {
    it('renders from bare URI strings with no other props', async () => {
      const view = await render(
        <Gallery images={PHOTOS} presentation="inline" testID="g" />
      );
      expect(view.getByTestId('g')).toBeTruthy();
    });

    it('renders nothing for an empty image list rather than crashing', async () => {
      const view = await render(
        <Gallery images={[]} presentation="inline" testID="g" />
      );
      await layout(view);
      expect(view.getByTestId('g')).toBeTruthy();
      expect(view.queryByTestId('g-page-0')).toBeNull();
    });

    it('accepts a mix of strings, source objects and full items', async () => {
      const view = await render(
        <Gallery
          images={[
            'https://example.com/1.jpg',
            { uri: 'https://example.com/2.jpg', width: 800, height: 600 },
            {
              source: 'https://example.com/3.jpg',
              accessibilityLabel: 'Third',
            },
          ]}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);
      expect(view.getByTestId('g-page-0')).toBeTruthy();
      expect(view.getByTestId('g-page-1')).toBeTruthy();
    });

    it('only mounts pages inside the window', async () => {
      const many = Array.from(
        { length: 100 },
        (_, i) => `https://example.com/${i}.jpg`
      );
      const view = await render(
        <Gallery
          images={many}
          initialIndex={50}
          windowSize={1}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);

      expect(view.getByTestId('g-page-49')).toBeTruthy();
      expect(view.getByTestId('g-page-50')).toBeTruthy();
      expect(view.getByTestId('g-page-51')).toBeTruthy();
      expect(view.queryByTestId('g-page-48')).toBeNull();
      expect(view.queryByTestId('g-page-52')).toBeNull();
      expect(view.queryByTestId('g-page-0')).toBeNull();
    });

    it('honours a larger windowSize', async () => {
      const view = await render(
        <Gallery
          images={PHOTOS}
          initialIndex={2}
          windowSize={2}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);
      expect(view.getByTestId('g-page-0')).toBeTruthy();
      expect(view.getByTestId('g-page-3')).toBeTruthy();
    });

    it('clamps the window at the list boundaries', async () => {
      const view = await render(
        <Gallery
          images={PHOTOS}
          initialIndex={0}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);
      expect(view.getByTestId('g-page-0')).toBeTruthy();
      expect(view.getByTestId('g-page-1')).toBeTruthy();
      expect(view.queryByTestId('g-page-2')).toBeNull();
    });

    it('does not mount pages before the container has been measured', async () => {
      const view = await render(
        <Gallery images={PHOTOS} presentation="inline" testID="g" />
      );
      expect(view.queryByTestId('g-page-0')).toBeNull();
    });
  });

  describe('page indicator', () => {
    it('shows the current position by default', async () => {
      const view = await render(
        <Gallery
          images={PHOTOS}
          initialIndex={1}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);
      expect(view.getByTestId('g-indicator')).toBeTruthy();
      expect(view.getByText('2 / 4')).toBeTruthy();
    });

    it('can be turned off', async () => {
      const view = await render(
        <Gallery
          images={PHOTOS}
          showPageIndicator={false}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);
      expect(view.queryByTestId('g-indicator')).toBeNull();
    });

    it('is hidden for a single image, where a counter is noise', async () => {
      const view = await render(
        <Gallery images={[PHOTOS[0]!]} presentation="inline" testID="g" />
      );
      await layout(view);
      expect(view.queryByTestId('g-indicator')).toBeNull();
    });

    it('reads as one string to screen readers', async () => {
      const view = await render(
        <Gallery images={PHOTOS} presentation="inline" testID="g" />
      );
      await layout(view);
      expect(view.getByLabelText('1 of 4')).toBeTruthy();
    });
  });

  describe('render slots', () => {
    it('renders a custom header with the gallery context', async () => {
      const view = await render(
        <Gallery
          images={PHOTOS}
          initialIndex={2}
          presentation="inline"
          testID="g"
          renderHeader={({ index, count }) => (
            <Text>{`Header ${index + 1}/${count}`}</Text>
          )}
        />
      );
      await layout(view);
      expect(view.getByText('Header 3/4')).toBeTruthy();
      // A custom header replaces the built-in indicator.
      expect(view.queryByTestId('g-indicator')).toBeNull();
    });

    it('renders a custom footer', async () => {
      const view = await render(
        <Gallery
          images={PHOTOS}
          presentation="inline"
          testID="g"
          renderFooter={({ count }) => <Text>{`${count} photos`}</Text>}
        />
      );
      await layout(view);
      expect(view.getByText('4 photos')).toBeTruthy();
    });

    it('renderItem replaces the image entirely', async () => {
      const view = await render(
        <Gallery
          images={PHOTOS}
          presentation="inline"
          testID="g"
          renderItem={({ index }) => <Text>{`Custom ${index}`}</Text>}
        />
      );
      await layout(view);
      expect(view.getByText('Custom 0')).toBeTruthy();
      expect(view.getByText('Custom 1')).toBeTruthy();
    });

    it('renderLoading replaces the default spinner', async () => {
      jest.spyOn(Image, 'getSize').mockImplementation(() => {});
      const view = await render(
        <Gallery
          images={PHOTOS}
          presentation="inline"
          testID="g"
          renderLoading={({ index }) => <Text>{`Loading ${index}`}</Text>}
        />
      );
      await layout(view);
      expect(view.getByText('Loading 0')).toBeTruthy();
    });

    it('passes the header an item and a working close callback', async () => {
      const onClose = jest.fn();
      let captured: (() => void) | undefined;
      const view = await render(
        <Gallery
          images={PHOTOS}
          presentation="inline"
          onClose={onClose}
          testID="g"
          renderHeader={({ item, close }) => {
            captured = close;
            return <Text>{String(item?.source)}</Text>;
          }}
        />
      );
      await layout(view);
      expect(view.getByText('https://example.com/1.jpg')).toBeTruthy();
      expect(typeof captured).toBe('function');
    });
  });

  describe('index handling', () => {
    it('opens on initialIndex', async () => {
      const view = await render(
        <Gallery
          images={PHOTOS}
          initialIndex={2}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);
      expect(view.getByText('3 / 4')).toBeTruthy();
    });

    it('clamps an out-of-range initialIndex', async () => {
      const view = await render(
        <Gallery
          images={PHOTOS}
          initialIndex={99}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);
      expect(view.getByText('4 / 4')).toBeTruthy();
    });

    it('clamps a negative initialIndex', async () => {
      const view = await render(
        <Gallery
          images={PHOTOS}
          initialIndex={-5}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);
      expect(view.getByText('1 / 4')).toBeTruthy();
    });

    it('follows a controlled index prop', async () => {
      const view = await render(
        <Gallery images={PHOTOS} index={1} presentation="inline" testID="g" />
      );
      await layout(view);
      expect(view.getByText('2 / 4')).toBeTruthy();

      await view.rerender(
        <Gallery images={PHOTOS} index={3} presentation="inline" testID="g" />
      );
      expect(view.getByText('4 / 4')).toBeTruthy();
    });

    it('a controlled gallery ignores its own index changes', async () => {
      const onIndexChange = jest.fn();
      const ref = createRef<GalleryRef>();
      const view = await render(
        <Gallery
          ref={ref}
          images={PHOTOS}
          index={1}
          onIndexChange={onIndexChange}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);

      await act(async () => {
        ref.current?.goToIndex(3);
      });

      // It reports the intent but stays where the parent put it.
      expect(onIndexChange).toHaveBeenCalledWith(3);
      expect(view.getByText('2 / 4')).toBeTruthy();
    });

    it('an uncontrolled gallery moves itself', async () => {
      const onIndexChange = jest.fn();
      const ref = createRef<GalleryRef>();
      const view = await render(
        <Gallery
          ref={ref}
          images={PHOTOS}
          onIndexChange={onIndexChange}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);

      await act(async () => {
        ref.current?.goToIndex(2);
      });

      expect(onIndexChange).toHaveBeenCalledWith(2);
      expect(view.getByText('3 / 4')).toBeTruthy();
    });
  });

  describe('ref API', () => {
    async function setup(props: Record<string, unknown> = {}) {
      const ref = createRef<GalleryRef>();
      const view = await render(
        <Gallery
          ref={ref}
          images={PHOTOS}
          presentation="inline"
          testID="g"
          {...props}
        />
      );
      await layout(view);
      return { ref, view };
    }

    it('exposes the full handle', async () => {
      const { ref } = await setup();
      expect(typeof ref.current?.goToIndex).toBe('function');
      expect(typeof ref.current?.next).toBe('function');
      expect(typeof ref.current?.previous).toBe('function');
      expect(typeof ref.current?.reset).toBe('function');
      expect(typeof ref.current?.close).toBe('function');
      expect(typeof ref.current?.getIndex).toBe('function');
    });

    it('getIndex reports the current page', async () => {
      const { ref } = await setup({ initialIndex: 2 });
      expect(ref.current?.getIndex()).toBe(2);
    });

    it('next advances one page', async () => {
      const { ref, view } = await setup();
      await act(async () => {
        ref.current?.next();
      });
      expect(ref.current?.getIndex()).toBe(1);
      expect(view.getByText('2 / 4')).toBeTruthy();
    });

    it('previous goes back one page', async () => {
      const { ref } = await setup({ initialIndex: 2 });
      await act(async () => {
        ref.current?.previous();
      });
      expect(ref.current?.getIndex()).toBe(1);
    });

    it('next stops at the last page', async () => {
      const { ref } = await setup({ initialIndex: 3 });
      await act(async () => {
        ref.current?.next();
      });
      expect(ref.current?.getIndex()).toBe(3);
    });

    it('previous stops at the first page', async () => {
      const { ref } = await setup({ initialIndex: 0 });
      await act(async () => {
        ref.current?.previous();
      });
      expect(ref.current?.getIndex()).toBe(0);
    });

    it('goToIndex clamps out-of-range targets', async () => {
      const { ref } = await setup();
      await act(async () => {
        ref.current?.goToIndex(99);
      });
      expect(ref.current?.getIndex()).toBe(3);

      await act(async () => {
        ref.current?.goToIndex(-10);
      });
      expect(ref.current?.getIndex()).toBe(0);
    });

    it('reset does not throw when the page has no zoom applied', async () => {
      const { ref } = await setup();
      await act(async () => {
        expect(() => ref.current?.reset()).not.toThrow();
      });
    });

    it('close runs the close transition and then calls onClose', async () => {
      jest.useFakeTimers();
      try {
        const onClose = jest.fn();
        const { ref } = await setup({ onClose });

        await act(async () => {
          ref.current?.close();
        });
        // onClose waits for the transition rather than firing immediately.
        expect(onClose).not.toHaveBeenCalled();

        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
        expect(onClose).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('calls onClose exactly once however many times close is called', async () => {
      jest.useFakeTimers();
      try {
        const onClose = jest.fn();
        const { ref } = await setup({ onClose });

        await act(async () => {
          ref.current?.close();
          ref.current?.close();
          ref.current?.close();
        });
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });

        expect(onClose).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('visibility', () => {
    it('renders nothing when inline and not visible', async () => {
      const view = await render(
        <Gallery
          images={PHOTOS}
          visible={false}
          presentation="inline"
          testID="g"
        />
      );
      expect(view.queryByTestId('g')).toBeNull();
    });

    it('renders when inline and visible', async () => {
      const view = await render(
        <Gallery images={PHOTOS} visible presentation="inline" testID="g" />
      );
      expect(view.getByTestId('g')).toBeTruthy();
    });

    it('becomes visible when the prop flips', async () => {
      const view = await render(
        <Gallery
          images={PHOTOS}
          visible={false}
          presentation="inline"
          testID="g"
        />
      );
      expect(view.queryByTestId('g')).toBeNull();

      await view.rerender(
        <Gallery images={PHOTOS} visible presentation="inline" testID="g" />
      );
      expect(view.getByTestId('g')).toBeTruthy();
    });

    it('defaults to visible so an inline gallery needs only `images`', async () => {
      const view = await render(
        <Gallery images={PHOTOS} presentation="inline" testID="g" />
      );
      expect(view.getByTestId('g')).toBeTruthy();
    });
  });

  describe('Android back button', () => {
    it('closes the gallery instead of the screen', async () => {
      jest.useFakeTimers();
      const onClose = jest.fn();
      const handlers: Array<() => boolean> = [];
      jest
        .spyOn(BackHandler, 'addEventListener')
        .mockImplementation((_event, handler) => {
          handlers.push(handler as () => boolean);
          return { remove: jest.fn() } as never;
        });

      const view = await render(
        <Gallery
          images={PHOTOS}
          onClose={onClose}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);

      expect(handlers).toHaveLength(1);
      await act(async () => {
        // Returning true tells Android the event was consumed, so the
        // underlying screen is not popped as well.
        expect(handlers[0]!()).toBe(true);
      });
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it('is not registered when there is nothing to close', async () => {
      const spy = jest
        .spyOn(BackHandler, 'addEventListener')
        .mockImplementation(() => ({ remove: jest.fn() }) as never);

      const view = await render(
        <Gallery images={PHOTOS} presentation="inline" testID="g" />
      );
      await layout(view);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('image component', () => {
    it('uses the supplied ImageComponent for every page', async () => {
      const { SpyImage, calls } = makeSpyImage();
      const view = await render(
        <Gallery
          images={PHOTOS}
          ImageComponent={SpyImage}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);
      expect(calls.length).toBeGreaterThan(0);
    });

    it('passes per-item accessibility labels through', async () => {
      const { SpyImage, calls } = makeSpyImage();
      const view = await render(
        <Gallery
          images={[
            { source: PHOTOS[0]!, accessibilityLabel: 'First photo' },
            { source: PHOTOS[1]!, accessibilityLabel: 'Second photo' },
          ]}
          ImageComponent={SpyImage}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);
      const labels = calls.map((call) => call.accessibilityLabel);
      expect(labels).toContain('First photo');
      expect(labels).toContain('Second photo');
    });
  });

  describe('lifecycle', () => {
    it('unmounts without throwing', async () => {
      const view = await render(
        <Gallery images={PHOTOS} presentation="inline" testID="g" />
      );
      await layout(view);
      await expect(view.unmount()).resolves.not.toThrow();
    });

    it('unmounts cleanly mid-transition', async () => {
      const ref = createRef<GalleryRef>();
      const view = await render(
        <Gallery
          ref={ref}
          images={PHOTOS}
          presentation="inline"
          testID="g"
          onClose={jest.fn()}
        />
      );
      await layout(view);
      await act(async () => {
        ref.current?.goToIndex(2);
      });
      await expect(view.unmount()).resolves.not.toThrow();
    });

    it('survives the image list changing underneath it', async () => {
      const view = await render(
        <Gallery
          images={PHOTOS}
          initialIndex={3}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view);
      expect(view.getByText('4 / 4')).toBeTruthy();

      // Shrink the list so the current index is now out of range.
      await view.rerender(
        <Gallery
          images={PHOTOS.slice(0, 2)}
          initialIndex={3}
          presentation="inline"
          testID="g"
        />
      );
      expect(view.getByTestId('g')).toBeTruthy();
    });

    it('handles a rotation while open', async () => {
      const view = await render(
        <Gallery
          images={PHOTOS}
          initialIndex={1}
          presentation="inline"
          testID="g"
        />
      );
      await layout(view, 400, 800);
      expect(view.getByTestId('g-page-1')).toBeTruthy();

      await layout(view, 800, 400);
      expect(view.getByTestId('g-page-1')).toBeTruthy();
      expect(view.getByText('2 / 4')).toBeTruthy();
    });
  });
});
