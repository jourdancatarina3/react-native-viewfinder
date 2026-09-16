# react-native-viewfinder

**Zoom, browse and crop images in React Native.** No native code, no config plugin, no
version lock-in.

```tsx
<ZoomableImage source={uri} />                  // pinch, pan, double-tap
<Gallery images={[uri1, uri2, uri3]} />         // swipeable full-screen gallery
<ImageCropper source={uri} aspectRatio={1} />   // crop, rotate, flip
```

Each of those is complete as written. The gallery pinches to zoom, double-taps to zoom to
a point, swipes between images and drags down to dismiss. The cropper gives you ratio
presets, draggable handles, rotation and flips.

| Grid | Gallery | Crop |
| :--: | :-----: | :--: |
| <img src="https://raw.githubusercontent.com/jourdancatarina3/react-native-viewfinder/main/docs/media/grid.png" width="230" alt="A thumbnail grid of photos"> | <img src="https://raw.githubusercontent.com/jourdancatarina3/react-native-viewfinder/main/docs/media/gallery.png" width="230" alt="A photo open full-screen with a caption and close button"> | <img src="https://raw.githubusercontent.com/jourdancatarina3/react-native-viewfinder/main/docs/media/crop.png" width="230" alt="The crop screen with a 16:9 frame, ratio chips and tools"> |

<!-- These are stills captured from the example app on an iPhone 17 Pro.
     Animated GIFs sell the gestures far better — PUBLISHING.md §5 has the
     recording and conversion commands, and the layout to drop them into. -->

---

## Why this one

**It works on the Gesture Handler and Reanimated versions you already have.** Gesture
Handler 3 replaced the `Gesture.Pan()` builder with hooks; Reanimated 4 dropped support for
the old architecture. Expo SDK 57 still pins Gesture Handler 2, while npm `latest` is 3 —
both actively maintained. Libraries that picked one side leave the other stranded, which is
why *"reanimated v4"* has been the top open issue on a popular gallery library for a year.
Viewfinder runs on **Gesture Handler 2 and 3**, **Reanimated 3 and 4**, and therefore on
**both architectures**, from a single install.

**The maths is tested, not eyeballed.** Focal-point zoom, translation bounds, rubber-band
resistance, page resolution, dismissal and the whole crop model live in pure functions with
no React or Reanimated imports, covered by 339 tests including the degenerate cases —
zero-sized images, 12000×1000 panoramas, `NaN` deltas, twelve double-taps in a row, crop
rectangles pushed past an image's edge. The recurring bugs in this category of library are
all in that maths.

**Panning a zoomed-in image can never close the gallery.** Whether a drag belongs to the
image or to the gallery is decided once, when the gesture starts, from the current scale.
It is never re-decided mid-drag.

**Reduced motion is honoured everywhere**, not in three places out of five.

**Cropping that emits geometry, not pixels.** `<ImageCropper>` returns a rectangle in the
source image's own coordinates, in exactly the shape `expo-image-manipulator` and
`@react-native-community/image-editor` already accept — so the library itself still needs
no native code, and you can crop server-side if you'd rather. One optional import turns it
into a file in a single call.

**One required prop.** `images`, or `source`. Everything else has a working default and an
escape hatch.

---

## Install

```sh
npm install react-native-viewfinder
```

You also need the two peers, which most apps already have:

```sh
# Expo
npx expo install react-native-reanimated react-native-gesture-handler

# bare React Native
npm install react-native-reanimated react-native-gesture-handler
cd ios && pod install
```

Reanimated needs its Babel plugin. Expo's `babel-preset-expo` includes it; otherwise add it
to `babel.config.js`, **last in the list**:

```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['react-native-worklets/plugin'], // must be last
};
```

Finally, wrap your app once:

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  return <GestureHandlerRootView style={{ flex: 1 }}>{/* … */}</GestureHandlerRootView>;
}
```

### Supported versions

| | Supported |
| --- | --- |
| `react-native-gesture-handler` | `>=2.16` and `3.x` |
| `react-native-reanimated` | `>=3.10` and `4.x` |
| Architecture | New and old |
| Expo | SDK 50+, including Expo Go |
| `expo-image` | Optional. See [Using expo-image](#using-expo-image) |
| `expo-image-manipulator` | Optional. Only for [turning a crop into a file](#turning-a-crop-into-a-file) |

---

## 30-second quick start

A thumbnail grid that opens a full-screen gallery:

```tsx
import { useState } from 'react';
import { Image, Pressable, ScrollView } from 'react-native';
import { Gallery } from 'react-native-viewfinder';

const photos = [
  'https://example.com/1.jpg',
  'https://example.com/2.jpg',
  'https://example.com/3.jpg',
];

export function Album() {
  const [index, setIndex] = useState<number | null>(null);

  return (
    <>
      <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {photos.map((uri, i) => (
          <Pressable key={uri} onPress={() => setIndex(i)}>
            <Image source={{ uri }} style={{ width: 120, height: 120 }} />
          </Pressable>
        ))}
      </ScrollView>

      <Gallery
        images={photos}
        visible={index !== null}
        initialIndex={index ?? 0}
        onClose={() => setIndex(null)}
      />
    </>
  );
}
```

A single zoomable image:

```tsx
import { ZoomableImage } from 'react-native-viewfinder';

<ZoomableImage source="https://example.com/photo.jpg" />;
```

Cropping, with the result saved to a file:

```tsx
import { useRef } from 'react';
import { ImageCropper } from 'react-native-viewfinder';
import { applyCrop } from 'react-native-viewfinder/expo-image-manipulator';
import type { ImageCropperRef } from 'react-native-viewfinder';

const cropper = useRef<ImageCropperRef>(null);

<ImageCropper ref={cropper} source={uri} aspectRatio={1} />;

// when the user confirms
const result = cropper.current?.getResult();
if (result) {
  const { uri: croppedUri } = await applyCrop(uri, result);
}
```

---

## API

### `<Gallery>`

Only `images` is required.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `images` | `ImageInput[]` | — | URI strings, `require()` results, or `GalleryImage` objects. Mix freely. |
| `visible` | `boolean` | `true` | Whether the gallery is on screen. Omit it to render inline. |
| `initialIndex` | `number` | `0` | Page to open on. Read when the gallery becomes visible. |
| `index` | `number` | — | Makes the gallery **controlled**. Pair with `onIndexChange`. |
| `onIndexChange` | `(index: number) => void` | — | Fires on every page change. |
| `onClose` | `() => void` | — | Fires after the close transition. |
| `presentation` | `'modal' \| 'inline'` | `'modal'` | `'modal'` covers navigation chrome and handles Android back. |
| `renderHeader` | `(ctx) => ReactNode` | — | Replaces the built-in page indicator. |
| `renderFooter` | `(ctx) => ReactNode` | — | Rendered at the bottom. |
| `renderItem` | `(ctx) => ReactNode` | — | Replaces the image entirely, keeping zoom and paging. |
| `renderLoading` | `(ctx) => ReactNode` | spinner | Shown while an image loads. |
| `renderError` | `(ctx) => ReactNode` | message | Shown on failure. `ctx.retry()` re-requests. |
| `ImageComponent` | `ComponentType` | RN `Image` | e.g. `expo-image`'s `Image`, or `FastImage`. |
| `swipeToClose` | `boolean` | `true` | Drag down to dismiss. Only ever active at fitted size. |
| `swipeEnabled` | `boolean` | `true` | Horizontal paging. |
| `pageGap` | `number` | `24` | Gap between pages, in px. |
| `backdropColor` | `string` | `'#000000'` | Fades out as you drag to dismiss. |
| `showPageIndicator` | `boolean` | `true` | Ignored when `renderHeader` is set. Hidden for one image. |
| `windowSize` | `number` | `1` | Pages kept mounted either side of the current one. |
| `minScale` | `number` | `1` | |
| `maxScale` | `number` | `6` | Raised automatically for large images — see [Zoom limits](#zoom-limits). |
| `doubleTapScales` | `number[]` | `[2.5]` | Stops a double-tap cycles through. |
| `doubleTapToZoom` | `boolean` | `true` | |
| `pinchToZoom` | `boolean` | `true` | |
| `panEnabled` | `boolean` | `true` | |
| `reduceMotion` | `'system' \| 'always' \| 'never'` | `'system'` | `'system'` follows the OS setting. |
| `onTap` | `(index: number) => void` | — | Single tap; never fires as half a double-tap. |
| `onLongPress` | `(index: number) => void` | — | |
| `onZoomChange` | `(scale: number, index: number) => void` | — | On the JS thread, on settled values. |
| `style` | `StyleProp<ViewStyle>` | — | |
| `testID` | `string` | — | Pages get `${testID}-page-${index}`. |

**Ref** — `GalleryRef`:

```tsx
const ref = useRef<GalleryRef>(null);

ref.current?.goToIndex(3, { animated: true });
ref.current?.next();
ref.current?.previous();
ref.current?.reset();        // reset the current page's zoom
ref.current?.close();
ref.current?.getIndex();     // => number
```

### `<ZoomableImage>`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `source` | `ImageSource` | — | A URI string, `require()` result, or `{ uri, width?, height?, headers? }`. |
| `width` / `height` | `number` | — | Natural size, if known. Skips a measurement round-trip. |
| `placeholder` | `string` | — | Blurhash/thumbhash with `expo-image`, or a URI. |
| `ImageComponent` | `ComponentType` | RN `Image` | |
| `renderLoading` | `() => ReactNode` | spinner | |
| `renderError` | `(retry) => ReactNode` | message | |
| `onZoomChange` | `(scale: number) => void` | — | |
| `onTap` / `onDoubleTap` / `onLongPress` | function | — | |
| `onLoad` / `onError` | `() => void` | — | |
| `accessibilityLabel` | `string` | — | |
| `reduceMotion` | `'system' \| 'always' \| 'never'` | `'system'` | |
| `minScale` / `maxScale` / `doubleTapScales` | | | As for `Gallery`. |
| `style` | `StyleProp<ViewStyle>` | — | The container the image is fitted to. |

**Ref** — `ZoomableImageRef`:

```tsx
ref.current?.reset({ animated: true });
ref.current?.zoomTo(3, { focal: { x: 100, y: 200 } });
ref.current?.getTransform();  // => { scale, translateX, translateY }
```

### `<ImageCropper>`

Only `source` is required.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `source` | `ImageSource` | — | A URI string, `require()` result, or `{ uri, width?, height? }`. |
| `width` / `height` | `number` | — | Natural size, if known. Skips a measurement round-trip. |
| `aspectRatio` | `number \| 'free' \| 'original'` | `'free'` | Locked ratio as width ÷ height. |
| `framePadding` | `number` | `20` | Gap between the frame and the stage edge, leaving room to grab handles. |
| `maxScale` | `number` | `6` | Largest zoom, relative to the frame-covering size. |
| `minFrameSize` | `number` | `72` | Smallest the frame can be dragged to, per axis. |
| `resizableFrame` | `boolean` | `true` | Whether the frame has draggable handles. |
| `showToolbar` | `boolean` | `true` | Ignored when `renderToolbar` is set. |
| `aspectPresets` | `{ label, value }[]` | standard set | Ratio chips to offer. |
| `scrimColor` | `string` | `'rgba(0,0,0,0.6)'` | The dimmed area outside the frame. |
| `backgroundColor` | `string` | `'#000000'` | Behind the image. |
| `ImageComponent` | `ComponentType` | RN `Image` | e.g. `expo-image`'s `Image`. |
| `renderToolbar` | `(ctx) => ReactNode` | — | Replaces the built-in toolbar entirely. |
| `renderLoading` / `renderError` | function | defaults | As for `Gallery`. |
| `onCropChange` | `(result: CropResult) => void` | — | Fires when the framed region changes — not every frame. |
| `accessibilityLabel` | `string` | — | |
| `reduceMotion` | `'system' \| 'always' \| 'never'` | `'system'` | |
| `style` | `StyleProp<ViewStyle>` | — | |
| `testID` | `string` | — | |

**Ref** — `ImageCropperRef`:

```tsx
const ref = useRef<ImageCropperRef>(null);

ref.current?.getResult();          // => CropResult | null
ref.current?.rotate();             // a quarter turn clockwise; rotate(-1) for anticlockwise
ref.current?.flip('horizontal');
ref.current?.setAspectRatio(16 / 9);
ref.current?.reset();
```

**`CropResult`** — everything needed to reproduce what the user framed:

```tsx
type CropResult = {
  rotate: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  flipVertical: boolean;
  /** In the coordinates of the rotated image. */
  crop: { originX: number; originY: number; width: number; height: number };
  /** The source's natural size, before rotation. */
  sourceSize: { width: number; height: number };
};
```

The operations are **order-dependent — rotate, then flip, then crop** — because the
rectangle is expressed in the coordinates of the already-rotated, already-flipped image.
`applyCrop` handles that for you.

### Types

```tsx
type ImageSource =
  | string
  | number
  | { uri: string; width?: number; height?: number; headers?: Record<string, string> };

type GalleryImage = {
  source: ImageSource;
  width?: number;
  height?: number;
  placeholder?: string;
  accessibilityLabel?: string;
  key?: string;
  [key: string]: unknown;   // your own metadata, handed back to render slots
};
```

Every prop carries JSDoc, so hovering in your editor shows the same information as the
tables above.

---

## Recipes

### Declare image sizes to avoid a first-frame reflow

If you know the dimensions, pass them. The image lays out correctly on the first frame
instead of waiting for a decode.

```tsx
<Gallery
  images={photos.map((p) => ({ source: p.url, width: p.width, height: p.height }))}
/>
```

### A custom header with real safe-area insets

The built-in indicator uses a platform-default inset. For exact insets, take over the slot:

```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';

<Gallery
  images={photos}
  renderHeader={({ index, count, close }) => {
    const insets = useSafeAreaInsets();
    return (
      <View style={{ paddingTop: insets.top, flexDirection: 'row' }}>
        <Pressable onPress={close}><Text>Done</Text></Pressable>
        <Text>{index + 1} of {count}</Text>
      </View>
    );
  }}
/>;
```

### Captions from your own metadata

Anything extra on a `GalleryImage` comes back in the render slots:

```tsx
const photos = [{ source: uri, caption: 'Reykjavík, 2024', author: 'Jo' }];

<Gallery
  images={photos}
  renderFooter={({ item }) => <Text>{item?.caption as string}</Text>}
/>;
```

### Authenticated images

```tsx
<Gallery
  images={[{ uri: 'https://api.example.com/photo/1', headers: { Authorization: token } }]}
/>
```

Headers reach both the image component and the size-measurement call.

### Controlled index

```tsx
const [index, setIndex] = useState(0);

<Gallery images={photos} index={index} onIndexChange={setIndex} />;
```

A controlled gallery does not move itself — it reports the intent and waits for you.

### Video, PDFs, or anything else

`renderItem` keeps the zoom and paging behaviour but lets you draw whatever you like:

```tsx
<Gallery
  images={items}
  renderItem={({ item, isActive }) =>
    item.type === 'video' ? (
      <VideoPlayer source={item.source} paused={!isActive} />
    ) : null
  }
/>
```

### Zoom limits

`maxScale` defaults to `6`, but is raised automatically so that any image can be inspected
at its true pixel resolution — a 4000px-wide photo on a 400pt screen gets a ceiling of 10,
capped at 16×. Set `maxScale` explicitly to override.

```tsx
<Gallery images={photos} maxScale={3} doubleTapScales={[1.5, 3]} />
```

### Turning a crop into a file

The cropper deliberately does no image processing, so it adds no native dependency. To
produce an actual file, use the optional helper:

```sh
npx expo install expo-image-manipulator
```

```tsx
import { applyCrop } from 'react-native-viewfinder/expo-image-manipulator';

const result = cropperRef.current?.getResult();
if (result) {
  const { uri, width, height } = await applyCrop(sourceUri, result, {
    compress: 0.9,
    resize: { width: 1080 },
  });
}
```

Or apply the geometry yourself — with `@react-native-community/image-editor`, or by
sending the rectangle to your backend and never uploading the full image at all:

```tsx
const { crop, rotate, flipHorizontal } = result;
await fetch('/api/crop', {
  method: 'POST',
  body: JSON.stringify({ id: photoId, crop, rotate, flipHorizontal }),
});
```

### A crop screen with your own controls

`renderToolbar` replaces the built-in chrome while keeping every behaviour:

```tsx
<ImageCropper
  source={uri}
  showToolbar={false}
  renderToolbar={({ rotate, setAspectRatio, reset, getResult }) => (
    <MyBottomBar
      onRotate={() => rotate()}
      onSquare={() => setAspectRatio(1)}
      onReset={reset}
      onDone={() => save(getResult())}
    />
  )}
/>
```

### A fixed-ratio avatar cropper

Lock the ratio and turn off the handles, so only the image moves:

```tsx
<ImageCropper
  source={uri}
  aspectRatio={1}
  resizableFrame={false}
  showToolbar={false}
/>
```

### Using `expo-image`

Two ways. Pass the component:

```tsx
import { Image } from 'expo-image';

<Gallery images={photos} ImageComponent={Image} />;
```

or import the pre-wired entry point:

```tsx
import { Gallery } from 'react-native-viewfinder/expo-image';
```

Either gives you blurhash placeholders and progressive decoding. Without `expo-image`,
everything still works — placeholders are ignored and you get the default spinner.

`expo-image` is an optional peer, detected at *import* time rather than at runtime,
because Metro resolves imports when it bundles. See
[docs/DECISIONS.md](docs/DECISIONS.md) D-009 for why runtime detection cannot work.

---

## Compared to the alternatives

Factually, as of September 2026:

| | Viewfinder | [zoom-toolkit](https://github.com/Glazzes/react-native-zoom-toolkit) | [image-viewing](https://github.com/jobtoday/react-native-image-viewing) | [awesome-gallery](https://github.com/pavelbabenko/react-native-awesome-gallery) | [@likashefqet](https://github.com/likashefqet/react-native-image-zoom) |
| --- | --- | --- | --- | --- | --- |
| Last release | — | Aug 2026 | **May 2022** | Sep 2024 | Dec 2024 |
| Open issues | — | 2 | **129** | 24 | 0 |
| Gesture Handler 2 | ✅ | ✅ | n/a | ✅ | ✅ |
| Gesture Handler 3 | ✅ | ✅ | n/a | ❓ | ❓ |
| Reanimated 4 | ✅ | ✅ | n/a | ❌ open issue | ❓ |
| Gallery | ✅ | ✅ | ✅ | ✅ | ❌ |
| Cropping | ✅ | ✅ | ❌ | ❌ | ❌ |
| Crop UI (ratios, handles, rotate) | ✅ | ❌ build your own | ❌ | ❌ | ❌ |
| Zoom any component | ❌ | ✅ | ❌ | ✅ via `renderItem` | ✅ |
| Skia support | ❌ | ✅ | ❌ | ❌ | ❌ |

**Use `react-native-zoom-toolkit` instead** if you need to zoom arbitrary components or
Skia canvases. It is well maintained and broader in scope. Its `CropZoom` is a crop
*surface* — you supply the controls; Viewfinder's `<ImageCropper>` ships the whole screen
(ratio chips, handles, rotate, flip, thirds grid) and you can still replace the toolbar.
Viewfinder is deliberately narrower overall, and spends that focus on the image case being
one line and on the version range being wide.

**`react-native-image-viewing`** established the API shape everyone (including this
library) borrows. It has not shipped a release since May 2022.

---

## Troubleshooting

**`useAnimatedStyle was used without a dependency array or Babel plugin`**
The Reanimated Babel plugin is missing. Add `react-native-worklets/plugin` to
`babel.config.js` as the **last** plugin, then restart Metro with `--clear`.

**Gestures do nothing**
The tree is not inside a `GestureHandlerRootView`. Wrap your app root.

**`Reanimated 4 requires the New Architecture`**
Reanimated 4 is new-architecture-only. Either enable it (`newArchEnabled: true` in
`app.json`) or install Reanimated 3, which this library also supports.

**Images never leave the loading state**
The natural size could not be determined — usually a URL that `Image.getSize` cannot
reach, or a server without CORS on web. Pass `width` and `height` on the item to skip
measurement entirely.

**Dragging down while zoomed closes the gallery**
It should not — that is a bug. Please open an issue with your gesture handler version and
the output of `HAS_HOOK_GESTURE_API`:

```tsx
import { HAS_HOOK_GESTURE_API } from 'react-native-viewfinder';
console.log('RGH hook API:', HAS_HOOK_GESTURE_API);
```

**`resource fork, Finder information, or similar detritus not allowed` when building iOS**
Not this library — macOS has stamped extended attributes on a prebuilt framework, which
happens when the project lives in an iCloud-synced folder such as `~/Desktop`. Run
`xattr -cr node_modules`, or move the checkout somewhere that is not synced.

---

## Documentation

- [docs/RESEARCH.md](docs/RESEARCH.md) — the landscape survey this library was designed against
- [docs/DECISIONS.md](docs/DECISIONS.md) — notable choices and what they cost
- [docs/EDGE_CASES.md](docs/EDGE_CASES.md) — the full edge-case matrix, and the known limitations
- [docs/DEVICE_TESTING.md](docs/DEVICE_TESTING.md) — the QA plan
- [CONTRIBUTING.md](CONTRIBUTING.md)

## Known limitations

Stated plainly, in full in [docs/EDGE_CASES.md](docs/EDGE_CASES.md):

1. Built-in chrome uses approximate safe-area insets; use `renderHeader` for exact ones.
2. Swiping between pages requires the image to be at its fitted size (as in iOS Photos).
3. No hero / shared-element transition yet.
4. The cropper returns geometry, not a file — one extra call produces the image.
5. No filters or colour adjustment.
6. No built-in video item — use `renderItem`.
7. Web is untested.
8. Old-architecture support is by construction, not verified on hardware.

## License

MIT © Jourdan Catarina
