# Decisions

A running log of choices that were not obvious, and what they cost.

---

## D-001 — Scaffold with `create-react-native-library`, JS-only + Expo example

**Choice:** `--type library --languages js --example expo --tools eslint jest lefthook release-it`.

The CLI (v0.63.1) accepted all four `--tools` values but only persisted `eslint` into
the generated config. Jest, Lefthook and release-it were therefore configured by hand
afterwards. Recorded here because the generated `create-react-native-library.tools` field
in `package.json` under-reports what the project actually uses.

---

## D-002 — Emit CJS as well as ESM, against the current default

`react-native-builder-bob` 0.43.1 scaffolds **ESM-only** (`module` target with
`esm: true`). Metro handles that fine, so for a pure React Native consumer it is
sufficient.

CJS was added back anyway (`commonjs` target, plus `require`/`import` conditions in
`exports`). The reason is tooling rather than apps: Jest in a consumer's repo, older Metro
configurations, and any Node-based script that `require()`s the package all still land on
CJS. The cost is a second copy of the compiled output in the tarball — a few tens of KB
for a library this size — which is a good trade for not having to answer "why does my test
suite fail to import this" issues.

`sideEffects: false` is set so bundlers can drop the unused half.

---

## D-003 — Support Gesture Handler 2 *and* 3 through an internal adapter

This is the library's headline differentiator, so the reasoning is recorded in full.

**The problem.** RGH 3.0 (May 2026) replaced the `Gesture.Pan()` builder with hooks
(`usePanGesture()`), and renamed callbacks (`onStart` → `onActivate`, `onEnd` →
`onDeactivate`). Meanwhile:

- RGH 2.x is still actively maintained — `2.33.0` shipped on 2026-09-14, *three days after*
  `3.3.0`.
- **Expo SDK 57 pins `react-native-gesture-handler@~2.32.0`**, so the single largest
  population of React Native apps is on v2 by default.
- RGH 3.3.0 still exports the v2 builder (`export { GestureObjects as Gesture }`), and the
  deprecation is JSDoc-only — verified by grepping the compiled `gestureObjects.js`, where
  all 14 matches of `deprecat` are comments, with no runtime warning.

So there are three possible strategies:

| Strategy | RGH 2 apps | RGH 3 apps | Future |
| --- | --- | --- | --- |
| Builder API only | ✅ | ✅ (deprecated path) | ❌ breaks when the builder is removed |
| Hook API only | ❌ breaks Expo's default | ✅ | ✅ |
| **Adapter** | ✅ | ✅ (native path) | ✅ |

**The choice:** an adapter in `src/compat/gestures.ts`. It picks the hook implementation
when `usePanGesture` is exported and the builder otherwise.

**The hook-order hazard, and why it is safe.** Rules of Hooks forbid conditionally calling
hooks. The adapter resolves *which implementation to use* once, at module evaluation time,
from a property check on the imported RGH namespace. The installed version cannot change
during a session, so the binding is constant for the lifetime of the app and React sees an
identical hook sequence on every render — the same reasoning that makes `Platform.OS`
branching at module scope safe. The branch is never re-evaluated per render.

**Cost:** one indirection layer, and the adapter's own surface has to be kept narrow —
only the four gestures this library actually needs (pan, pinch, tap, long-press) plus
composition. It is not a general-purpose RGH shim and should not grow into one.

---

## D-004 — No Reanimated adapter is needed

Checked rather than assumed: every Reanimated API this library uses —
`useSharedValue`, `useAnimatedStyle`, `useDerivedValue`, `withTiming`, `withSpring`,
`withDecay`, `runOnJS`, `runOnUI`, `cancelAnimation`, `useAnimatedReaction`, `interpolate`,
`Extrapolation`, `clamp`, `makeMutable`, `useAnimatedRef`, `measure`, `ReduceMotion` — is
present and identically shaped in **both 3.19.5 and 4.6.0**.

So the peer range is simply `>=3.10.0 || >=4.0.0` with no shim. Since Reanimated 4 is
New-Architecture-only and Reanimated 3 works on both, this range is also what gives the
library old- *and* new-architecture support without any architecture-specific code.

---

## D-005 — All zoom/pan maths lives in `src/core`, free of React and Reanimated

Every function in `src/core` is pure, synchronous, and imports nothing from React, React
Native or Reanimated. They carry `'worklet'` directives so they can be called from the UI
thread, but that is just a Babel annotation — in Jest they are ordinary functions.

This is what makes the correctness claim testable: 141 unit tests run against the real
implementation with no mocking, no renderer, and no UI thread. The alternative — maths
inlined into gesture callbacks — is why competing libraries keep shipping focal-point
regressions that only reproduce on a device.

**Cost:** the hooks layer has to marshal shared values in and out of plain objects at the
call boundary. Measured at a handful of property reads per frame, which is not where the
time goes.

---

## D-006 — Rubber-band curve chosen for its endpoint behaviour

First implementation used `f(x) = (1 − 1/(xc/d + 1)) · d · c`. A test asserting that the
content keeps tracking the finger as it crosses a boundary failed: that curve has
`f'(0) = c² ≈ 0.30`, so the image abruptly drops to a third of finger speed at the edge —
a perceptible "stick".

Replaced with `f(x) = (x · d · c) / (x + d)`, derived to satisfy both endpoints:
`f'(0) = c` (no discontinuity in *felt* speed at the boundary) and `f(∞) = d · c` (never
more than ~55% of a container past the edge).

Worth noting as the kind of bug that ships unnoticed: both curves look correct in a
screenshot and behave plausibly under a finger. Only the explicit derivative assertion
caught it.

---

## D-007 — `clamp` passes infinities through, and only collapses `NaN`

`clamp(Infinity, 0, 10)` returns `10`, not `0`. An infinity has a well-defined ordering,
so clamping it to the bound it runs into is the useful answer. `NaN` has no ordering and
would poison every subsequent frame if returned, so it collapses to `min`.

---

## D-008 — Gallery pages reset their zoom when they leave the window

The brief listed "resumable zoom" as a candidate differentiator. For a *gallery* that is
the wrong behaviour: both the iOS and Android system photo viewers reset a photo to fit
when you swipe away from it and back. Preserving per-page zoom across swipes is also the
direct cause of a recurring complaint against existing libraries ("image is zoomed to the
max when previously zoomed it and get back to it", "the image is in a zoom-in state when
swiping back").

`ZoomableImage` used standalone keeps its zoom, since there is nothing to swipe away from.

---

## D-009 — `expo-image` is opted into explicitly, not detected at runtime

The obvious implementation of "use `expo-image` when it is installed" is a guarded
require:

```ts
try { ExpoImage = require('expo-image').Image; } catch { ExpoImage = null; }
```

This does not work under Metro, and the failure mode is the bad one. Metro resolves
`require()` calls **statically, at bundle time**, and a `try`/`catch` around one does not
make it optional: an app without `expo-image` fails to bundle with *"Unable to resolve
module expo-image"* — a build error, in the consumer's app, that the `catch` never sees.
Making the specifier dynamic (`require(name)`) inverts the problem: Metro then cannot
resolve it *ever*, so the module is never bundled and the import fails even for apps that
do have `expo-image`.

There is no variant that is both automatic and safe. So the library does it explicitly,
two ways:

1. **An `ImageComponent` prop**, defaulting to React Native's `Image`:

   ```tsx
   import { Image } from 'expo-image';
   <Gallery images={images} ImageComponent={Image} />
   ```

2. **A pre-wired subpath export** for people who want no configuration at all:

   ```tsx
   import { Gallery } from 'react-native-viewfinder/expo-image';
   ```

   That module statically imports `expo-image`, which is safe precisely because you only
   reach it by importing the subpath — an app without `expo-image` never pulls it into the
   graph.

This is also a better answer to the long-running *"Custom Image Component"* request
(15 comments on `react-native-image-viewing`) than auto-detection would have been: the
same prop accepts `expo-image`, `FastImage`, or a CDN-aware wrapper of the user's own,
and it is typed.

---

## D-010 — `ImageComponent` is typed loosely, on purpose

The first version typed the prop as `ComponentType<ImageComponentProps>`. That is the
honest contract, and it does not work: passing `expo-image`'s `Image` fails to typecheck.

Two independent reasons, both from the other library's types being *broader* than ours:

- `expo-image` types `style` as `ImageStyle`, which narrows `overflow` to
  `visible | hidden`, while `ViewStyle` also allows `scroll`. (Fixed properly — the style
  really should have been `ImageStyle`.)
- `expo-image` types `source` as a union of ~9,000 members including `undefined` and a
  long list of SF Symbol string literals. Nothing narrow is assignable to it.

`FastImage` has its own third shape. So an exact prop type means every real image library
needs a cast at the call site — and an escape hatch that demands a cast is not much of an
escape hatch. The prop is therefore `ImageRenderer = ComponentType<any>`, with
`ImageComponentProps` still exported and documented as the contract to implement.

What is lost: passing a component that could not possibly render an image is not a type
error. What is kept: anyone writing their own renderer against `ImageComponentProps` gets
full checking on it, and every real image library assigns with no ceremony.

---

## D-011 — A test that reads its own source, to guard the `'worklet'` directive

`src/core/__tests__/worklets.test.ts` parses `geometry.ts`, `zoom.ts` and `pan.ts` and
fails if any exported function is missing a `'worklet'` directive. Asserting on source text
is normally a smell. It earns its place here.

`isUsableSize` shipped without its directive. Every worklet that called it — the pinch
handler, the pan bounds, the double-tap transform — threw
*"Tried to synchronously call a Remote Function"* on the UI thread and died part-way
through. Double-tap zoom simply did nothing, with no error surfaced to the user.

**All 243 unit tests passed the whole time**, and they always would have: Jest has one
thread, so a plain function called from a "worklet" is just a function call. There is no
behavioural assertion that can catch this, because in the test environment there is no
misbehaviour. The only observable difference is a Babel directive in the source, so the
source is what the test reads.

The failure was found by running the app on a simulator and driving it with Maestro. The
guard means the next one is found in a second instead.

---

## D-012 — `doubleTapMaxDelay`, and why the default did not change

Gesture Handler's double-tap window is 500ms. Maestro's synthetic taps — and, empirically,
any XCTest-driven tap — take longer than that to arrive, so no UI test runner could
exercise the double-tap path at all. Measured here: 500ms fails, 700ms and 1000ms both
work.

The tempting fix is to raise the library's default. That was rejected: when `onTap` is also
supplied, the single tap has to wait the full window to be sure no second tap is coming, so
a 700ms default would make every single tap feel sluggish for apps that use both.

Instead the window is a prop, defaulting to Gesture Handler's own. The example app sets
700ms so the E2E suite can drive the real gesture. That does mean the E2E suite tests a
non-default configuration — an honest caveat, noted in DEVICE_TESTING.md — but the gesture
path is identical; only the recognition window differs.

There is a second, better reason for the prop to exist: people with motor impairments
often cannot double-tap inside 500ms.

---

## D-013 — `flex: 1` was not enough to give the overlays a size

The loading and error overlays are absolutely positioned inside the image surface. That
surface originally shrink-wrapped the image, which collapses to nothing when the image has
no size — and an image that failed to load never reports one. So the overlays were
unusable exactly when they mattered: on device, the retry button rendered as a 40px pill
containing invisible text, and the error message did not appear in the view hierarchy at
all.

The first fix, `flex: 1`, was not enough and is worth recording because the reason is easy
to miss: `flex` governs the **main** axis. The parent centres its children
(`alignItems: 'center'`), so the cross axis stayed content-sized — still zero.
`alignSelf: 'stretch'` is what actually gives the box a width.

Scaling behaviour is unchanged: the transform origin is the centre either way, so a
full-page box and a tight box around a centred image scale identically.

---

## D-014 — The cropper emits geometry, not pixels

`<ImageCropper>` performs no image processing. `getResult()` returns a rectangle in the
source image's own pixel coordinates, plus a rotation and two flip flags — and nothing
else happens until the caller does something with it.

That is the only design that keeps the library's central promise. Actually producing a
cropped file requires decoding and re-encoding an image, which on React Native means a
native module. Taking a hard dependency on one would end "two peers, no config plugin,
installable in any Expo project" — the property the whole library is built around.

Emitting geometry costs the caller one extra line and buys three things:

- **It works with whatever they already have.** The returned shape
  (`{ originX, originY, width, height }`) is what `expo-image-manipulator`,
  `@react-native-community/image-editor` and most native croppers already accept.
- **It works server-side.** Plenty of apps would rather send the rectangle to a backend
  than ship a full-resolution image up and a cropped one back down.
- **It is testable.** The entire crop model is pure functions over numbers, covered by 66
  unit tests, with no image decoding anywhere in the suite.

`react-native-viewfinder/expo-image-manipulator` closes the one-line gap for people who do
want a file, as an optional subpath import — the same pattern, and for the same Metro
reason, as `react-native-viewfinder/expo-image` (D-009).

---

## D-015 — Cover the frame, never fit it

The cropper lays the image out so it **covers** the crop frame at scale 1, which means the
image can only ever be zoomed further in.

The alternative — fitting the image and letting the frame be dragged anywhere over it —
has to answer a question that has no good answer: what does it mean when the crop frame
includes area outside the image? Every product that allows it ends up picking one of
letterboxing, transparent padding, or silently shrinking the crop, and all three surprise
people.

Making the state unreachable removes the question. It is also what the iOS and Android
photo editors do, so it needs no explanation to users.

The cost is that `minScaleToCover` has to be recomputed and the image pushed back out
whenever the frame changes shape — on a ratio change, a handle drag, or a rotation. That
is one function and one settle animation, and it is where a good deal of the crop tests
are aimed.

---

## D-016 — Crop handles are 44pt targets around much smaller graphics

Each handle draws a 22pt bracket inside a 44pt touch target. Sizing the target to the
graphic is the single most common reason crop handles feel fiddly: the corner marker is
about the size of a fingernail, and fingers are not. 44pt is Apple's minimum and matches
Google's 48dp closely enough.

The handles are also plain views in the tree *after* the image's gesture detector, so they
take priority over the image pan underneath them without needing an explicit gesture
relation — one less thing to get wrong across two Gesture Handler versions.
