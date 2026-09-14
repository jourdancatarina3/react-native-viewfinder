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
