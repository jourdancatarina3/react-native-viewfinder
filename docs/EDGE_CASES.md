# Edge cases

No library can promise "no edge cases". What it can do is name them, say how each is
handled, and say which ones it does *not* handle. That is what this file is.

**Status key**

| | Meaning |
| --- | --- |
| ✅ | Handled, with an automated test that would fail if it regressed |
| 🟡 | Handled, verified by hand or by reasoning — no automated test |
| ⚠️ | Partially handled; the limitation is stated |
| ❌ | Not handled. Known limitation |

`unit` = Jest test in `src/**/__tests__`. `e2e` = Maestro flow in `e2e/`.
`manual` = checked by hand in the example app; see
[DEVICE_TESTING.md](./DEVICE_TESTING.md).

---

## Aspect ratios

| Case | Status | How | Evidence |
| --- | --- | --- | --- |
| Square (1:1) | ✅ | `fitSize` constrains on the tighter axis | unit `geometry.test.ts` |
| Widescreen (16:9) | ✅ | Same | unit, e2e `05-aspect-ratios` |
| Ultra-wide panorama (5:1, 12000×1000) | ✅ | Fits to container width; height stays > 0 | unit, e2e |
| Ultra-tall column (1:5, 600×3000) | ✅ | Fits to container height; width stays > 0 | unit, e2e |
| Very large (8000×6000) | ✅ | `resolveMaxScale` raises the zoom ceiling so 1:1 inspection is reachable | unit `resolveMaxScale` |
| 1×1 pixel | ✅ | Scales up to fit rather than dividing by zero | unit, e2e |
| Zero-sized image (0×0) | ✅ | `isUsableSize` rejects it; treated as "not measured yet" | unit |
| Negative or `NaN` dimensions | ✅ | Same guard; never reaches a shared value | unit |
| `Infinity` dimensions | ✅ | Same guard | unit |
| Image larger than the 1:1 cap (>16× fit) | ⚠️ | Capped at 16× by default. Raise `maxScale` if you need more | unit |

At every aspect ratio, the fitted size is asserted never to exceed the container on
either axis, and the translation bounds are asserted never to go negative.

## Loading and network

| Case | Status | How | Evidence |
| --- | --- | --- | --- |
| Slow image | ✅ | Loading slot shown until decode; `renderLoading` overrides | unit, e2e `06-errors` |
| 404 / broken URL | ✅ | Error slot with a `retry` callback | unit, e2e |
| Host that does not resolve | ✅ | Same path | e2e |
| Offline | 🟡 | Same as a failed request — error slot, retry works when back online | manual |
| Retry after failure | ✅ | `retry()` clears the error and re-requests | unit |
| Success *after* a failure | ✅ | Last event wins; the stale error clears | unit — this was a real bug, see commit history |
| Authenticated URLs (headers) | ✅ | Forwarded to the image component and to `getSizeWithHeaders` | unit |
| Source changes while mounted | ✅ | Per-source state reset; a stale measurement cannot land on the new image | unit |
| `getSize` resolving after unmount | ✅ | Guarded by a liveness ref; no "setState on unmounted component" | unit |
| Image with no declared size | ✅ | Measured via `Image.getSize`, or from the component's `onLoad` | unit |
| Bundled `require()` asset | ✅ | Size read synchronously from `resolveAssetSource` | unit, manual |

## Gestures

| Case | Status | How | Evidence |
| --- | --- | --- | --- |
| Focal-point-correct pinch | ✅ | `scaleAround`; tested as an invariant (the anchored point must not move) across a sweep of scales and focals | unit `zoom.test.ts` |
| Pinch past `maxScale` | ✅ | Elastic overshoot during the gesture, springs back on release | unit, manual |
| Pinch below `minScale` | ✅ | Same | unit, manual |
| Double-tap zoom to point | ✅ | Anchors on the tap going in, recentres coming out | unit, e2e `01-single-image` |
| Double-tap cycling multiple levels | ✅ | `nextDoubleTapScale` steps and wraps | unit |
| Rapid repeated double-taps | ✅ | 12 consecutive taps asserted to stay in bounds and in scale range | unit |
| Pan past an edge | ✅ | Rubber-band with continuous felt speed at the boundary | unit `pan.test.ts` |
| Fling / decay on release | ✅ | `withDecay` clamped to bounds with a gentle bounce | manual |
| **Pan while zoomed must not dismiss** | ✅ | Ownership of the pan is decided once, at gesture start, from the scale | unit, e2e `03-swipe-to-close` |
| Swipe between pages | ✅ | Distance or velocity threshold; capped at one page per gesture | unit, e2e `02-gallery-swipe` |
| Very fast swipe | ✅ | Cannot skip a page | unit `resolvePageIndex` |
| Swipe past the first/last page | ✅ | Clamped; rubber-bands at the ends | unit, e2e `04-stress` |
| Diagonal drag | ✅ | Axis decided after 6px of travel, then committed for the gesture | unit |
| Single vs double tap | ✅ | Exclusive composition; a double-tap is never two single taps | manual |
| Gesture during a transition | 🟡 | Running animations are cancelled at gesture start | manual |
| Two-finger pan during pinch | ✅ | Simultaneous composition, `averageTouches` so lifting a finger does not jump | manual |
| Double-open / double-close | ✅ | A `closing` flag makes `onClose` fire exactly once; a reopen cancels a pending close | unit |
| Gesture on an unmeasured container | ✅ | All maths guards on zero sizes | unit |

## Layout and device

| Case | Status | How | Evidence |
| --- | --- | --- | --- |
| Rotation while fitted | ✅ | `onLayout` refits | unit, e2e `07-rotation` |
| Rotation while zoomed | ✅ | Transform re-clamped to the new bounds | unit, e2e |
| Container resize (split view, foldable) | ✅ | Same `onLayout` path | 🟡 foldables not tested on hardware |
| Tablet / large screens | 🟡 | Fits the same way; the example grid switches to 4 columns above 600pt | manual |
| Small phones | 🟡 | No fixed pixel assumptions in the layout | manual |
| Notches and safe areas | ⚠️ | The **built-in** page indicator uses a platform-default inset, not a real safe-area measurement. Custom `renderHeader`/`renderFooter` is where you apply `useSafeAreaInsets`. See the limitation below |
| Android edge-to-edge (Android 15+) | ⚠️ | The modal is `statusBarTranslucent` and the backdrop fills the screen; chrome insets are the caller's, as above |
| RTL layout | ✅ | Sign flip at two boundaries — slot position and gesture direction | unit, 🟡 needs a hardware pass |
| Dark mode | ✅ | The backdrop is black by default and `backdropColor` overrides it |

## Accessibility

| Case | Status | How | Evidence |
| --- | --- | --- | --- |
| Per-image screen-reader labels | ✅ | `accessibilityLabel` on each item | unit |
| Page indicator readable | ✅ | Announces "3 of 12", not three nodes | unit |
| Reduced motion | ✅ | Threaded into **every** animation config, not just some | unit, e2e `08-accessibility` |
| Forcing motion on/off regardless of OS | ✅ | `reduceMotion="always" \| "never"` | e2e |
| Modal focus containment | ✅ | `accessibilityViewIsModal` on the modal presentation |
| Android hardware back | ✅ | Closes the gallery, not the screen; returns `true` so the event is consumed | unit |

## Versions and architecture

| Case | Status | How | Evidence |
| --- | --- | --- | --- |
| Gesture Handler 2.x | ✅ | Builder path in the compat adapter | unit + the example app runs on 2.32 |
| Gesture Handler 3.x | ✅ | Hook path | unit; see the CI matrix note below |
| Reanimated 3.x | ✅ | No shim needed — identical API surface | verified by inspection of both packages |
| Reanimated 4.x | ✅ | Same | example app runs on 4.5.1 |
| New Architecture | ✅ | Example app runs with `newArchEnabled: true` | manual |
| Old Architecture | 🟡 | Nothing in the library is arch-specific; requires Reanimated 3, which supports both. Not exercised on hardware |
| `expo-image` present | ✅ | `ImageComponent` prop, or the `/expo-image` entry point | unit, manual |
| `expo-image` absent | ✅ | Falls back to RN `Image`; placeholders are ignored, spinner shown | unit (the Jest setup makes `expo-image` unresolvable by default) |

---

## Known limitations

These are real, and stated rather than hidden.

### 1. Safe-area insets in the built-in chrome are approximate

The default page indicator positions itself with a platform-constant inset
(60pt on iOS, 40pt on Android) instead of measuring the real safe area. Adding
`react-native-safe-area-context` as a dependency would fix it precisely but would break
the "two peers, no config" promise, and adding it as an *optional* peer runs into the same
Metro bundling problem described in DECISIONS.md D-009.

**If you care about exact insets** — and on a device with a notch or on Android 15+
edge-to-edge you probably do — supply `renderHeader` and `renderFooter` and use
`useSafeAreaInsets()` inside them. That path is fully supported and is what the example
app's grid screen does.

### 2. Swiping between pages requires the image to be at its fitted size

While zoomed in, a horizontal drag pans the image and rubber-bands at the edge; it does
not hand off to the pager. This matches iOS Photos and Google Photos, and it is what makes
the "panning a zoomed image cannot dismiss the gallery" guarantee simple enough to be
reliable. Zoom out — or double-tap — to swipe on.

### 3. No hero / shared-element transition

The open and close transitions are a fade plus a scale. A true thumbnail-to-fullscreen
hero transition needs the source thumbnail's measured frame threaded through, and a
render-time handoff that is difficult to make robust across the windowing. It is a
candidate for a later release rather than something half-built now.

### 4. No video support

`renderItem` lets you render anything you like for an item — including a video component —
and it keeps the zoom and paging behaviour. But the library ships no video item of its own,
because doing it properly means a peer dependency on a video library and a second playback
lifecycle, which would undercut the zero-native-linking promise.

### 5. Web is untested

Nothing here is deliberately native-only, and `react-native-web` is in the example app's
dependency tree, but no web testing has been done and no web behaviour is claimed.

### 6. Old Architecture is supported by construction, not by testing

The library contains no architecture-specific code, and its peer range permits
Reanimated 3, which supports both architectures. That reasoning is sound but is not the
same as having run it. Treat old-arch support as expected-to-work rather than verified.

### 7. The CI version matrix is narrower than the support claim

CI runs the unit suite against the installed peer set (RGH 2.32 / Reanimated 4.5) and a
second job against RGH 3.x. It does not run the E2E suite against every combination of
{RGH 2, RGH 3} × {Reanimated 3, Reanimated 4} × {old arch, new arch}, which is eight
device configurations. The compat layer's *branch selection* is unit-tested; the full
cross-product is a manual pass. See DEVICE_TESTING.md.
