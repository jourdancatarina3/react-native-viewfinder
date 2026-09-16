## What this changes

<!-- One or two sentences. If it fixes an issue, say "Fixes #123". -->

## Why

<!-- What was wrong, or what became possible. -->

## How it was verified

- [ ] `yarn test` passes
- [ ] `yarn typecheck` passes
- [ ] `yarn lint` passes
- [ ] Ran the example app on iOS
- [ ] Ran the example app on Android
- [ ] `yarn e2e` passes

<!-- If you changed gesture or layout behaviour, say what you checked on a real
     device. Neither Jest nor a simulator reproduces multi-touch fidelity, and
     several bugs in this repo's history were invisible until a real finger
     touched them. -->

## Checklist

- [ ] New maths lives in `src/core` as a pure function, with tests covering the
      degenerate inputs (zero sizes, extreme aspect ratios, `NaN`)
- [ ] Any new exported function in `core/geometry.ts`, `core/zoom.ts` or
      `core/pan.ts` carries a `'worklet'` directive
- [ ] Public props have JSDoc, so they show up in editor autocomplete
- [ ] `docs/EDGE_CASES.md` updated if this fixes or introduces a limitation
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
