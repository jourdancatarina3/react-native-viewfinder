# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the
version is `0.x`, minor releases may contain breaking changes — they will always be called
out here.

Entries after `0.1.0` are generated from conventional commit messages by `release-it`.

## [0.1.0] — 2026-10-03

First release.

### Added

- **`<Gallery>`** — a full-screen, swipeable image gallery. `images` is the only required
  prop. Independent zoom per page, swipe-to-dismiss, page indicator, custom header, footer,
  item, loading and error slots, and an imperative ref (`goToIndex`, `next`, `previous`,
  `reset`, `close`, `getIndex`).
- **`<ZoomableImage>`** — a single image with pinch, pan and double-tap-to-point zoom, plus
  a ref (`reset`, `zoomTo`, `getTransform`).
- **`<ImageCropper>`** — a complete crop screen: aspect-ratio presets, draggable handles
  with 44pt touch targets, quarter-turn rotation, flips, a rule-of-thirds overlay that
  appears only while you interact, and a replaceable toolbar. It behaves like the Photos
  app: the photo stays put while you drag a handle, a handle cannot be pulled past the
  photo's edge, and after a short pause the frame grows back to fill the screen while the
  photo zooms to keep exactly the same crop. Pulling a handle out past the edge opens a
  zoomed-in crop back up, zooming the photo out under it. Quarter turns and flips keep the
  crop and move the photo and its frame together as one piece. Handle drags and the
  re-centring run entirely on the UI thread. `getResult()` returns a rectangle in the
  source image's own pixels plus rotation and flip flags, in the shape native manipulators
  already accept.
- **`react-native-image-viewfinder/expo-image-manipulator`** — an optional one-call helper
  (`applyCrop`) that turns a crop result into a file, applying rotate, flip and crop in the
  correct order.
- **Gesture Handler 2 *and* 3 support** from one install, via an internal adapter that
  picks the hook API when it exists and the builder otherwise. Reanimated 3 and 4 both
  work with no shim, which also means both React Native architectures are supported.
- **`react-native-image-viewfinder/expo-image`** — a pre-wired entry point giving blurhash
  placeholders and progressive decoding, for projects that have `expo-image`. Any image
  component can also be supplied through `ImageComponent`.
- **Accessibility** — per-image screen-reader labels, a page indicator that announces
  "3 of 12" as one phrase, `accessibilityViewIsModal` on the modal presentation, Android
  hardware-back handling, and reduced-motion support threaded into every animation.
- **RTL support**, as a sign flip on slot position and gesture direction rather than a
  parallel code path.
- **`doubleTapMaxDelay`** to widen the double-tap window, for people who cannot tap
  quickly and for UI test runners whose synthetic taps are slower than a finger.

### Notes

- Panning a zoomed-in image can never dismiss the gallery: which gesture owns a drag is
  decided once, at gesture start, from the current scale, and is never re-decided mid-drag.
- Pages reset their zoom when you swipe away from them, matching the iOS and Android
  system photo viewers.
- The zoom ceiling is raised automatically for large images so any photo can be inspected
  at its true pixel resolution without the caller knowing its dimensions.

### Known limitations

Documented in full in [docs/EDGE_CASES.md](docs/EDGE_CASES.md): approximate safe-area
insets in the built-in chrome, no hero transition, the cropper returning geometry rather
than a file, no filters, no built-in video item, web untested, and old-architecture support
verified by construction rather than on hardware.
