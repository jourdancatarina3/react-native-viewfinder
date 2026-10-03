# Contributing

Thanks for taking a look. This is a small library with a deliberately narrow scope, so the
most useful contributions are bug reports with a reproduction, and fixes with a test.

## Getting set up

```sh
git clone https://github.com/jourdancatarina3/react-native-viewfinder
cd react-native-viewfinder
yarn
```

> **macOS:** do not put the checkout in `~/Desktop` or `~/Documents` if you have iCloud
> Drive's Desktop & Documents sync on. macOS stamps extended attributes on files there and
> `codesign` rejects them, so the iOS build fails with *"resource fork, Finder information,
> or similar detritus not allowed"*. Use `~/dev/` or run `xattr -cr node_modules`.

## The loop

```sh
yarn test           # unit + integration, ~250 tests, about a second
yarn test:watch
yarn typecheck
yarn lint
yarn build          # ESM + CJS + type declarations

yarn example ios
yarn example android
yarn e2e            # Maestro, against a running simulator/emulator
```

Lefthook runs lint, typecheck and the related tests on commit, and the full suite on push.

## How the code is arranged

```
src/
  core/         Pure maths. No React, no React Native, no Reanimated imports.
  compat/       The Gesture Handler 2/3 adapter.
  hooks/        The zoom engine, wiring core/ to shared values and gestures.
  components/   What consumers import.
```

Two rules matter more than the rest:

**1. Maths belongs in `src/core`.** Every function there is pure and synchronous, which is
what makes it testable without a renderer or a UI thread. If you find yourself writing
arithmetic inside a gesture callback, it probably wants to be a function in `core` with
tests, called from the callback.

**2. Every exported function in `core/geometry.ts`, `core/zoom.ts` and `core/pan.ts` needs
a `'worklet'` directive.** These run on the UI thread. Miss one and *nothing fails in
Jest* — there is only one thread there — but on a device the worklet throws
"Tried to synchronously call a Remote Function" and the gesture silently dies. This has
happened once already. `src/core/__tests__/worklets.test.ts` guards it.

## Tests

- **Maths** → a unit test in `src/core/__tests__`. Include the degenerate inputs: zero
  sizes, extreme aspect ratios, `NaN`, negative deltas. That is where the bugs are.
- **Component behaviour** → `src/__tests__`. Note that `render` is async in this version of
  `@testing-library/react-native`, and the `screen` singleton resolves to a different
  module instance than `render` does — use the object `render` returns.
- **Interaction** → a Maestro flow in `e2e/`. Every flow sets `PORTRAIT` after launching,
  because flows share one device session.

Assert on accessibility labels rather than visible text where a component sets one — the
page indicator exposes "1 of 6" while displaying "1 / 6", and the label is what a screen
reader (and Maestro) reads.

## Reporting a bug

The five things that resolve most reports:

1. React Native version
2. `react-native-reanimated` version
3. `react-native-gesture-handler` version
4. Architecture — new or old
5. The value of `HAS_HOOK_GESTURE_API`:
   ```tsx
   import { HAS_HOOK_GESTURE_API } from 'react-native-image-viewfinder';
   console.log(HAS_HOOK_GESTURE_API);
   ```

A reproduction in a fresh Expo app beats a description of the problem.

## Scope

Deliberately out of scope, with reasons in [docs/DECISIONS.md](docs/DECISIONS.md):
cropping, zooming arbitrary non-image components, Skia, and native code of any kind.
`react-native-zoom-toolkit` covers the first three well.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) — the changelog is generated
from them. `fix:`, `feat:`, `docs:`, `test:`, `refactor:`, `chore:`.
