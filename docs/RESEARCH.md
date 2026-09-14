# Research

Everything below was verified against live sources on **2026-09-14**. Versions were read
from the npm registry and the packages' own `package.json` / type definitions, not from
memory. Issue counts and dates come from the GitHub API.

---

## 1. Ecosystem baseline (verified 2026-09-14)

| Package | `latest` | Notes |
| --- | --- | --- |
| `react-native` | **0.87.1** | |
| `react` | **19.3.0** | |
| `react-native-reanimated` | **4.6.0** | `3.19.5` still published under the `reanimated-3` tag |
| `react-native-worklets` | **0.12.2** | Split out of Reanimated; required peer of Reanimated 4 |
| `react-native-gesture-handler` | **3.3.0** | `2.33.0` still shipping under the `legacy` tag |
| `expo` | **57.0.22** | SDK 57 |
| `expo-image` | **57.0.5** | |
| `react-native-builder-bob` | **0.43.1** | |
| `create-react-native-library` | **0.63.1** | |

### The two constraints that shape this library

**Reanimated 4 is New-Architecture-only.** Its docs state plainly: *"Reanimated 4.x works
only with the React Native New Architecture (Fabric)."* Apps on the old architecture must
stay on Reanimated 3. Reanimated 4.6.0's declared peers are `react-native: 0.83 - 0.87`
and `react-native-worklets: 0.12.x`.

**Gesture Handler 3 replaced the gesture API.** v3 moved from the `Gesture.Pan()` builder
to hooks (`usePanGesture()`), and renamed callbacks (`onStart` → `onActivate`, `onEnd` →
`onDeactivate`, `onTouchesCancelled` → `onTouchesCancel`). Composition changed too
(`Gesture.Simultaneous()` → `useSimultaneousGestures()`, `Gesture.Race()` →
`useCompetingGestures()`).

Both facts are load-bearing and are revisited in §4.

---

## 2. Competitive landscape

### Maintenance signals

Pulled from the GitHub API and npm on 2026-09-14:

| Library | Stars | Open issues | Last npm publish | Last commit | Verdict |
| --- | --- | --- | --- | --- | --- |
| `react-native-zoom-toolkit` | 401 | 2 | 2026-08-30 (v5.1.1) | 2026-08-30 | **Actively maintained** |
| `react-native-image-viewing` | 953 | **129** | **2022-05-14** (v0.2.2) | 2022-04-18 | **Abandoned** (4+ years) |
| `@likashefqet/react-native-image-zoom` | 516 | 0 | 2024-12-20 (v4.3.0) | 2026-08-04 | Dormant (~21 months no release) |
| `react-native-awesome-gallery` | 611 | 24 | 2024-09-28 (v0.4.3) | 2024-09-28 | **Stalled** (2 years) |

The single most-starred option, `react-native-image-viewing`, has not shipped a release in
over four years and has 129 open issues — one of which is literally titled *"Is this
repository dead?"* (10 reactions, one reply). Its last five commits are all Dependabot
bumps to the example app.

Only **`react-native-zoom-toolkit`** is genuinely alive, and it is the real competitor.

### What each one does

**`react-native-zoom-toolkit` (v5.1.1)** — the most capable. Exports `SnapbackZoom`,
`ResumableZoom`, `CropZoom`, `Gallery`, and `Mirror`. Its framing is "zoom *any* component,
not just images," which is a genuine strength for Skia/video/custom content. The cost of
that generality is that the image case — by far the most common — is not one-line: you
assemble it. Its `Gallery` needs `renderItem` and explicit sizing for most real usage.
Recent issue traffic shows churn against new Reanimated versions: *"Pinch in/out crashes
with 'Maximum call stack size exceeded' under Reanimated 4.5"* (closed), *"Gallery's
setIndex sets scale to 0 instead of 1, blanking the target item"* (closed), and an open
bug from 2026-09-07 about double-tap zoom being reset by redundant `rootSize` writes.

**`react-native-image-viewing` (v0.2.2)** — the API everyone imitates, and the right shape:
`images` / `imageIndex` / `visible` / `onRequestClose` plus `HeaderComponent` /
`FooterComponent`. Built on the pre-Reanimated `Animated` API, which is the root of its
top complaints. Abandoned.

**`@likashefqet/react-native-image-zoom` (v4.3.0)** — a clean, focused single-image
zoomer. `ImageZoom` and a `Zoomable` wrapper, a well-judged prop set (`minScale`,
`maxScale`, `doubleTapScale`), rich callbacks, and a `reset`/`zoom` ref. No gallery at all
— that is explicitly out of scope for it.

**`react-native-awesome-gallery` (v0.4.3)** — closest in spirit to what I am building:
Reanimated-based gallery with rubber-band edges, decay on pan, RTL, both orientations, and
an infinite list. Good `onSwipeToClose` / `onTap` / `onDoubleTap` callbacks and a
`setIndex`/`reset` ref. Stalled since Sept 2024.

### What users actually complain about

Aggregated from the open issues of all four repos, ordered by signal strength:

1. **Version lock-in.** `awesome-gallery`'s single most-reacted issue is *"reanimated v4"*
   (30 reactions, opened 2025-09-19, still open a year later). Users are stuck: upgrade
   Reanimated and the gallery breaks. This is the loudest unmet need in the space.
2. **Android pinch-to-zoom bugs.** `image-viewing`'s top issue (23 reactions, open since
   2020) and `awesome-gallery`'s *"[Android] Problem with pinch-to-zoom"* (10 reactions).
   Focal-point math that is subtly wrong on Android shows up repeatedly —
   zoom-toolkit closed a *"ResumableZoom focal point calculation wrong on Android"* too.
3. **No rotation / orientation support.** Four separate `image-viewing` issues
   (*"Add support for landscape mode"*, *"no orientation support for android and ios"*,
   *"Need Support for Device Rotate Orientations"*, *"Orientation problem"*).
4. **Broken RTL.** *"Breaks in RTL"* (7 reactions). `awesome-gallery` shipped an RTL fix in
   2024; zoom-toolkit added an `inverted` prop after a feature request.
5. **Zoom state leaking between pages.** *"Image is zoomed to the max when previously
   zoomed it and get back to it"*, *"The image is in a zoom-in state when swiping back"*,
   *"Image keeps top after zoom in/out (Android)"*.
6. **Swipe-to-close fighting pan.** *"When zoomed in panning up and down triggers
   onSwipeToClose"* — dismissal should not be reachable while zoomed past fit.
7. **Flicker on index change.** *"Change imageIndex after initialization causes
   flickering"* (9 reactions, 10 comments).
8. **Reduced motion ignored.** `awesome-gallery`: *"Reduced motion causes snapping"* — an
   accessibility bug nobody has fixed.
9. **Edge-to-edge.** `awesome-gallery`: *"Edge-to-edge support"*. Android 15+ forces
   edge-to-edge, so backdrop and safe-area handling has to be right by default.
10. **No custom image component.** *"Custom Image Component"* (15 comments) — people want
    `expo-image`, FastImage, or their own CDN-aware component, and cannot get it in.

---

## 3. Library-authoring best practices for 2026

Confirmed by scaffolding with `create-react-native-library@0.63.1` and reading what it
produced, rather than by assumption:

- **Scaffold choice.** `--type library --languages js --example expo` produces a JS-only
  package with an Expo example app in a Yarn 4 workspace, driven by Turbo. This is the
  "no native module" path the brief asked for. (Recorded in DECISIONS.md: the CLI accepted
  `--tools eslint jest lefthook release-it` but only persisted `eslint`, so Jest, Lefthook
  and release-it were configured by hand.)
- **Build.** `react-native-builder-bob` 0.43.1. The current default it emits is
  **ESM-only** (`module` target with `esm: true`) plus a `typescript` target. See
  DECISIONS.md for why this library additionally emits CJS.
- **`exports` map.** The scaffold emits a custom source condition
  (`react-native-viewfinder-source`) pointing at `src/`, which lets the example app and
  TypeScript resolve straight to source in the monorepo while consumers get built output.
  `tsconfig` opts in via `customConditions`.
- **TypeScript.** Strict, plus `noUncheckedIndexedAccess`, `noUnusedLocals`,
  `noUnusedParameters`, `noImplicitReturns`, `verbatimModuleSyntax`, and
  `moduleResolution: "bundler"`.
- **`files` whitelist** rather than `.npmignore`, so the tarball stays lean.
- **Peer-dependency hygiene.** Animation and gesture libraries must be peers, never
  dependencies — two copies of Reanimated in one app is a hard crash. `expo-image` must be
  an *optional* peer so non-Expo users are not nagged.
- **New Architecture.** A pure-JS library inherits architecture support from its peers;
  there is nothing arch-specific to compile. What matters is not pinning peers so tightly
  that one architecture becomes unreachable.

---

## 4. What makes this 10x better — the differentiation plan

The research points at one dominant, unclaimed advantage and several strong supporting
ones. Committing to five:

### D1. Runs on both Gesture Handler 2 *and* 3, both Reanimated 3 *and* 4 — one install

This is the headline, and it is a direct answer to the loudest complaint in the space
(`awesome-gallery`'s year-old "reanimated v4" issue).

I verified the mechanism rather than assuming it:

- Reanimated **3.19.5 and 4.6.0 expose an identical surface** for every API this library
  needs — `useSharedValue`, `useAnimatedStyle`, `useDerivedValue`, `withTiming`,
  `withSpring`, `withDecay`, `runOnJS`, `runOnUI`, `cancelAnimation`,
  `useAnimatedReaction`, `interpolate`, `Extrapolation`, `clamp`, `makeMutable`,
  `useAnimatedRef`, `measure`, `ReduceMotion`. All 17 present in both. **No shim needed.**
- Gesture Handler **3.3.0 still exports the v2 builder**: its `index.d.ts` has
  `export { GestureObjects as Gesture }` *and* `export * from './v3'`. The builder is
  marked `@deprecated` in JSDoc only — I grepped the compiled `gestureObjects.js` and all
  14 matches are comments, **no runtime warnings**. So the builder works on v3 today, but
  it *will* be removed, which makes authoring against it alone a trap.

So: a small internal adapter picks the hook API when `usePanGesture` is present and the
builder otherwise, resolved **once at module load** (the installed version cannot change
mid-session), which keeps React's hook order stable. Consumers get a library that spans
RGH 2↔3 and Reanimated 3↔4, and therefore old *and* new architecture, from one install.
No competitor does this.

### D2. A genuinely one-line API for the common case

`image-viewing`'s prop shape (`images` / `visible` / `onClose`) is the one developers
already know; its problem was the engine underneath, not the API. zoom-toolkit has the
better engine but makes you assemble the gallery. Taking the best of both: `<Gallery>`
works with nothing but `images`, and `<ZoomableImage source={{ uri }} />` needs nothing
else — while every escape hatch stays available.

### D3. Correctness on the things everyone gets wrong

Not a feature so much as a promise backed by tests. The zoom/pan math is extracted into
pure functions and unit-tested exhaustively, targeting exactly the recurring bug classes
found above: focal-point-correct pinch (complaint #2), per-page zoom isolation
(complaint #5), pan that cannot trigger dismissal while zoomed (complaint #6), rotation
and container-resize handling (complaint #3), and true RTL (complaint #4).

### D4. Any image component, `expo-image` when you have it

Answers complaint #10 directly. The renderer is pluggable; `expo-image` is detected at
runtime and used when installed (for blurhash/placeholder and progressive decode), with a
clean fall back to RN `Image`. No config, no hard dependency, optional peer.

### D5. Accessibility that is actually wired up

Reduced-motion is honored for every transition (complaint #8 is an open bug in a
competitor), screen-reader labels per image, and correct safe-area/edge-to-edge behavior
for Android 15+ (complaint #9).

### Explicitly out of scope

- **Video items.** Would require a peer on a video library and a second playback lifecycle;
  it dilutes the "zero native linking" promise. `renderItem` lets users bring their own.
- **Cropping.** zoom-toolkit's `CropZoom` covers it well; duplicating it adds surface area
  without advantage.
- **Skia / arbitrary-component zoom.** zoom-toolkit's genuine differentiator. Competing
  there would trade away the focus that makes D2 possible.
- **Native code of any kind.** Per the brief, and it is what keeps the library installable
  in any Expo project without a config plugin.
