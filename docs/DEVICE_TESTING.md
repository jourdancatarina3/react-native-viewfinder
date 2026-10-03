# Device testing

What was run in this environment, what could not be, and a checklist you can execute on
real hardware before publishing.

---

## 1. What has actually been run

| Check | Where | Result |
| --- | --- | --- |
| Unit + integration suite (347 tests) | Node / Jest | ✅ pass |
| TypeScript strict typecheck | `tsc` | ✅ clean |
| ESLint + Prettier | `eslint` | ✅ clean |
| Library build (ESM + CJS + types) | `bob build` | ✅ clean, 111 KB packed |
| Example app Metro bundle | `expo export --platform ios` | ✅ 1065 modules, no resolution errors |
| Example app native build (iOS) | `expo run:ios`, iOS 26.5 | ✅ built, installed, ran |
| Maestro E2E suite (10 flows) | iPhone 17 Pro simulator, iOS 26.5 | ✅ **10/10 passed** |
| Android emulator | — | not run here; see §3 |
| Physical devices | — | cannot be automated; see §5 |

Logic-layer coverage (`src/core` — all the zoom, pan and crop maths) is **99.58% of
statements, 98.38% of branches, 100% of functions**. Overall project coverage is 78.7%;
the gap is almost entirely the worklet bodies in `useZoomable.ts` and `useCropper.ts`,
which execute on Reanimated's UI thread and cannot run under Jest at all. Those are
covered by the E2E suite instead.

### What the E2E run covers

| Flow | Covers |
| --- | --- |
| `01-single-image` | Ref API (`zoomTo`, `reset`), real double-tap in and out, anchored zoom |
| `02-gallery-swipe` | Open from a grid, page forward and back, close, reopen at another index |
| `03-swipe-to-close` | Drag-to-dismiss, **and that a zoomed image cannot be dismissed by dragging** |
| `04-stress` | 120 images, jumping to first/middle/last, five rapid swipes, boundary clamping |
| `05-aspect-ratios` | Zoom in and out of a panorama, a column, an 8000px image and a 1×1 pixel |
| `06-errors` | Dead host, 404, slow response, error slot, retry, swiping off a failed page |
| `07-rotation` | Rotating mid-zoom, paging in landscape, returning to portrait |
| `08-accessibility` | Reduced motion on, every interaction still working, screen-reader labels |
| `09-expo-image` | The `react-native-image-viewfinder/expo-image` subpath resolves and behaves identically |
| `10-crop` | Ratio presets, rotate, flip, reset, handle drag, and producing a real output file |

### Six bugs this found that the unit suite could not

Worth reading before trusting any RN library's test count:

1. **`isUsableSize` was missing its `'worklet'` directive.** Every worklet calling it threw
   on the UI thread, so double-tap zoom silently did nothing. Jest has one thread, so all
   243 tests passed. There is now a guard test that reads the source and fails if any
   exported function in the UI-thread modules lacks the directive.
2. **`onZoomChange` never reported the settled value**, leaving consumers with a stale
   scale forever.
3. **`initialIndex` was only read on first mount**, so reopening a gallery from a grid
   showed the previously viewed page.
4. **The loading and error overlays collapsed to zero width**, because `flex: 1` sets only
   the main axis and the parent centres its children. They were unusable exactly when they
   mattered.
5. **Reading the load event tripped an `expo-image` deprecation warning** in every
   consumer's console, because the handler checked `event.nativeEvent` before the flat
   `event.source` that `expo-image` actually provides.
6. **A free crop defaulted to the stage's shape rather than the image's**, so opening the
   cropper on a landscape photo in a portrait app proposed discarding a third of it before
   the user touched anything. Correct arithmetic, wrong product behaviour — the kind of
   thing only looking at it catches.

Re-run everything in the first group with:

```sh
yarn typecheck && yarn lint && yarn test && yarn build
```

## 2. Running the example app and the E2E suite

```sh
# From the repo root
yarn                          # install
yarn example ios              # build + run on the iOS Simulator
yarn example android          # build + run on an Android emulator

# E2E (requires a booted simulator/emulator with the app installed)
yarn e2e                      # runs every flow in e2e/
maestro test e2e/02-gallery-swipe.yaml   # or one at a time
```

### A macOS gotcha that cost real time here

The first two `expo run:ios` attempts in this environment failed with:

```
ExpoModulesJSI.framework: resource fork, Finder information, or similar detritus
not allowed
❌ Command PhaseScriptExecution failed with a nonzero exit code
```

This is not a problem with this library. macOS had stamped `com.apple.FinderInfo` and
`com.apple.fileprovider.fpfs#P` extended attributes onto Expo's prebuilt framework —
which happens when the project lives under a sync-backed folder such as Desktop or
Documents with iCloud Drive enabled. The fix:

```sh
xattr -cr example/node_modules/expo-modules-jsi
```

Clearing the attributes is **not enough on its own**: Expo's build script regenerates that
framework on every run, and macOS immediately re-stamps it. The build only succeeded after
the checkout was moved out of the synced folder entirely (to `/private/tmp`). If you keep
your projects in `~/Desktop` or `~/Documents` with iCloud Drive sync on, move this one
somewhere else — `~/dev/` — before building for iOS. It is in the README's troubleshooting
section and in CONTRIBUTING.md for the same reason.

### Maestro's `setOrientation` can silently stop working

Twice in this environment, `setOrientation` reported `COMPLETED` while the simulator did
not rotate at all — the screenshot stayed 1206×2622 and every subsequent assertion in that
flow failed. It is not a modal problem: it happened on an inline screen too, and it
happened after a `prebuild --clean` and reinstall.

Rebooting the simulator fixes it:

```sh
xcrun simctl shutdown "iPhone 17 Pro"
xcrun simctl boot "iPhone 17 Pro"
```

Worth knowing because the failure looks exactly like a rotation bug in the library. Check
the screenshot's dimensions before believing one: if it is still portrait-shaped, the
device never rotated and the test told you nothing.

## 3. Android

Android was not exercised in this environment — no emulator image was booted. The SDK,
platform tools and JDK 17 are present, so this should work locally:

```sh
# List available images, then create one if you have none
$ANDROID_HOME/emulator/emulator -list-avds
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "system-images;android-35;google_apis;arm64-v8a"
$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager create avd \
    -n pixel8 -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_8

$ANDROID_HOME/emulator/emulator -avd pixel8 &
yarn example android
maestro test e2e/
```

Android-specific things to look at, because they are where the platforms diverge:

- **Edge-to-edge.** Android 15 (API 35) forces edge-to-edge. Check that the backdrop
  reaches behind the status and navigation bars and that the built-in page indicator is
  not under the status bar. See the safe-area limitation in
  [EDGE_CASES.md](./EDGE_CASES.md).
- **Hardware back button.** Must close the gallery, not the screen behind it.
- **Focal-point drift on pinch.** Historically the most common Android-only zoom bug in
  this category of library. Pinch slowly around a corner and check nothing creeps.
- **Fling deceleration.** Android's scroller feel differs from iOS; a fling on a zoomed
  image should settle inside the bounds, not snap.

## 4. Simulator / emulator matrix

Run the E2E suite on at least one from each row. The point is to cover screen geometry and
OS behaviour, not to be exhaustive.

| Class | iOS | Android |
| --- | --- | --- |
| Small phone | iPhone SE (3rd gen) | Pixel 4a (API 30) |
| Standard phone | iPhone 17 | Pixel 8 (API 35) |
| Large phone / notch | iPhone 17 Pro Max | Pixel 9 Pro XL (API 36) |
| Tablet | iPad Pro 13-inch (M5) | Pixel Tablet (API 35) |
| Small tablet | iPad mini (A17 Pro) | — |

Available in this environment right now (`xcrun simctl list devices available`):
iPhone 17, 17 Pro, 17 Pro Max, 17e, iPhone Air, iPad Pro 11"/13" (M5), iPad Air 11"/13"
(M4), iPad mini (A17 Pro), iPad (A16) — all on iOS 26.5.

Switch device with:

```sh
yarn example ios --device "iPhone SE (3rd generation)"
maestro test --udid <simulator-udid> e2e/
```

## 5. Manual QA checklist — run this on real hardware before publishing

Simulators do not reproduce multi-touch fidelity, real GPU timing, or accessibility
services properly. Everything below needs a physical device. Tick each on **one iPhone and
one Android phone** at minimum.

### Gestures — the things a simulator cannot tell you

- [ ] Pinch with two fingers and watch the point between your fingers. It must stay under
      them, with no creep, at every scale.
- [ ] Pinch slowly near a corner of the image. Same check — this is where focal-point bugs
      show up first.
- [ ] Pinch past maximum zoom. It should stretch elastically and spring back on release.
- [ ] Pinch below minimum. Same.
- [ ] Lift one finger at the end of a pinch. The image must not jump.
- [ ] Fling a zoomed image. It should coast and settle inside the edges, not stop dead.
- [ ] Drag a zoomed image past an edge. Resistance should build smoothly with no "stick"
      at the moment you cross the boundary.
- [ ] Double-tap a specific detail. That detail should be what you end up looking at.
- [ ] Double-tap again. It should return to fitted and centred.
- [ ] Single-tap. It must not be misread as half a double-tap (no lag, no double-fire).
- [ ] **Zoom in, then drag up and down.** The gallery must not close. This is the headline
      correctness claim.
- [ ] Zoom out, then drag down. It must close.
- [ ] Swipe rapidly left five times. The index must land exactly five pages on.
- [ ] Swipe at the first and last page. It should rubber-band, not tear.
- [ ] Start a swipe and reverse it mid-drag. It should follow your finger and settle
      sensibly.

### Frame rate

- [ ] Enable the FPS overlay (iOS: Perf Monitor in the dev menu; Android: `adb shell dumpsys gfxinfo`).
- [ ] Pinch continuously for 10 seconds on the 120-image screen. Look for dropped frames.
- [ ] On a 120 Hz device (iPhone Pro, Pixel Pro), confirm gestures run at 120 fps and not
      capped at 60.

### Layout

- [ ] Rotate to landscape while zoomed in. The image must re-fit, not strand off-screen.
- [ ] Rotate back. Same.
- [ ] Rotate while mid-swipe between pages.
- [ ] On a notched device, check the page indicator is not under the notch.
- [ ] On Android 15+, check the backdrop goes edge to edge and chrome is not under the
      system bars.
- [ ] On a tablet, check the image is centred rather than pinned to a corner.
- [ ] In split view / multi-window, resize the app while a gallery is open.
- [ ] On a foldable, fold and unfold with a gallery open.

### Content

- [ ] Open the Aspect ratios screen and zoom into all six. The panorama and the column are
      the interesting ones.
- [ ] Open the Loading & errors screen offline (airplane mode). Error slots should appear
      and retry should work once you reconnect.
- [ ] On the 120-image screen, jump to the last image. It should be as fast as the first.
- [ ] Watch memory in Xcode Instruments / Android Studio Profiler while swiping through 50
      images. It should plateau, not climb.

### Accessibility

- [ ] Turn on VoiceOver (iOS) / TalkBack (Android). Swipe through the gallery. Each image
      should announce its label; the indicator should say "3 of 6".
- [ ] Turn on Reduce Motion in system settings. Transitions should stop animating while
      every interaction still works.
- [ ] Turn on the largest Dynamic Type / font scale. Check custom headers and footers still
      fit.

### Cropping

- [ ] Drag each of the eight handles. They should be easy to grab first time — if you find
      yourself aiming, the touch targets are wrong.
- [ ] With a locked ratio, drag a corner. The frame must keep its ratio and pivot about the
      opposite corner, not slide.
- [ ] Drag a handle until it hits the stage edge. It should stop cleanly, keeping its ratio.
- [ ] Change the ratio while zoomed in. The image should scale back out just enough to
      cover the new frame, never leaving a gap.
- [ ] Rotate four times. You should arrive exactly where you started.
- [ ] Rotate while zoomed and panned.
- [ ] Flip horizontally and vertically, then crop. Check the saved file is actually mirrored
      the way the preview showed.
- [ ] Crop a very large photo (8000px+) and confirm the output dimensions match the readout.
- [ ] Crop with no changes at all — the output should match the source dimensions.
- [ ] Check the thirds grid fades in when you start moving and out when you stop.

### RTL

- [ ] Force RTL and restart:
      ```js
      import { I18nManager } from 'react-native';
      I18nManager.forceRTL(true); // then reload the app
      ```
- [ ] The first image should be on the right.
- [ ] Swiping right should advance to the next image.
- [ ] The page indicator should count in the right order.

### Version matrix

The compat layer's branch selection is unit-tested, but the full cross-product is not. Run
the E2E suite once per row, at minimum on the two bold ones:

| Gesture Handler | Reanimated | Architecture | |
| --- | --- | --- | --- |
| **2.32** | **4.5** | **New** | the Expo SDK 57 default — highest priority |
| **3.3** | **4.6** | **New** | the npm `latest` default — highest priority |
| 2.33 | 3.19 | Old | the legacy path |
| 3.3 | 3.19 | Old | |

To switch, in `example/`:

```sh
yarn add react-native-gesture-handler@3.3.0     # or @2.33.0
yarn add react-native-reanimated@3.19.5         # or @4.6.0
npx expo prebuild --clean && yarn example ios
```

The demo list screen prints which Gesture Handler API is active, so you can confirm the
adapter picked the right branch at a glance.

## 6. What cannot be automated here, and is therefore yours

- **Physical devices.** Everything in §5.
- **Real multi-touch.** Maestro's `doubleTapOn` and `swipe` are reliable; a genuine
  two-finger pinch is not scriptable with fidelity, so focal-point correctness is verified
  by unit test plus the manual checks above.
- **Instrumented frame-rate measurement.** Needs Instruments or the Android profiler
  attached to a device.
- **Screen-reader behaviour.** VoiceOver and TalkBack have to be driven by hand.
- **App Store / Play Store review behaviour**, if you later ship the example app.
- **Demo GIFs for the README.** The capture commands are in
  [../PUBLISHING.md](../PUBLISHING.md) §8.
