# Publishing

Everything **you** have to do that I could not do for you — because it needs your npm
account, your GitHub account, your hardware, or your judgement.

Written for someone who has shipped apps but never published an npm package. Work through
it top to bottom. Each step says roughly how long it takes and whether it is one-time or
per-release.

Anything that could be automated already has been: the build, the tests, the lint, the git
hooks, the CI workflows, and the release script all exist and work. What is left is
genuinely yours.

---

## Part 1 — Before anything else

### ☐ 1.1 Decide the package name *(5 min, one-time)*

The package is **`react-native-image-viewfinder`**; the GitHub repo keeps its original name,
`react-native-viewfinder`. That shorter name was free on the registry, but `npm publish`
refused it: npm compares names with the punctuation stripped, so it counts as the same
name as the existing `react-native-view-finder`. A 404 from `npm view` only means a name
is unused, not that npm will accept it. Names get taken, so check again before publishing:

```sh
npm view react-native-image-viewfinder
```

- **`npm ERR! 404`** → available. Good, skip to 1.2.
- **Anything else** → taken. Pick another name, or scope it.

**Scoped or unscoped?**

| | Unscoped (`react-native-image-viewfinder`) | Scoped (`@jourdancatarina3/react-native-image-viewfinder`) |
| --- | --- | --- |
| Availability | First come, first served | Always available under your own scope |
| Discoverability | Better — matches how people search | Slightly worse |
| Publishing a public scoped package | — | Needs `--access public` on the **first** publish |

Unscoped is the better default for a library you want people to find. Scoped is a fine
fallback if the name is gone or refused: your own scope is always accepted.

**If you change the name**, these places reference it and all need updating:

```sh
# See everywhere it appears
grep -rn "react-native-image-viewfinder" --include="*.json" --include="*.md" --include="*.ts" \
  --include="*.tsx" --include="*.js" --include="*.mjs" --include="*.yml" \
  . | grep -v node_modules | grep -v "/lib/"
```

The ones that matter: `package.json` (`name`, the `react-native-image-viewfinder-source`
export condition, and every path inside `exports`), `tsconfig.json` (`paths` and
`customConditions`), `example/package.json`, the imports in `example/src/**`, and the
README.

### ☐ 1.2 Reserve the name *(5 min, one-time — optional but worth it)*

Names are first-come. If you are not ready to publish for real, park a placeholder:

```sh
# In a scratch directory, NOT this repo
mkdir /tmp/reserve && cd /tmp/reserve
npm init -y
# edit package.json: set "name" to your chosen name and "version" to "0.0.1-reserved"
npm publish
```

You can unpublish within 72 hours (`npm unpublish <name>@0.0.1-reserved`), and publishing
the real `0.1.0` later just supersedes it.

### ☐ 1.3 Confirm the license *(1 min, one-time)*

`LICENSE` is MIT, copyright "Jourdan Catarina". Change it now if you want something else —
after people depend on it, changing the license is a mess. MIT is the right default for a
library like this and is what every alternative uses.

---

## Part 2 — npm account

### ☐ 2.1 Create the account *(5 min, one-time)*

<https://www.npmjs.com/signup>. Your username becomes your scope if you go scoped.

### ☐ 2.2 Turn on two-factor authentication *(5 min, one-time — do not skip)*

<https://www.npmjs.com/settings/~/profile> → Two-Factor Authentication → **Authorization
and Publishing**.

This is the single most important security step. Compromised npm accounts are how supply
chain attacks start, and a package with any users is a target. Save your recovery codes
somewhere you will still have them in two years.

### ☐ 2.3 Log in locally *(2 min, one-time)*

```sh
npm login
npm whoami     # should print your username
```

### ☐ 2.4 Decide how CI will publish *(10 min, one-time)*

Two options. **Trusted publishing is strictly better** — pick it unless something stops you.

**Option A — Trusted publishing (OIDC), recommended.** No token exists to leak. npm
verifies the publish came from your specific GitHub Actions workflow.

1. Publish version `0.1.0` manually first (Part 6) — the package must exist.
2. <https://www.npmjs.com/package/react-native-image-viewfinder/access> → **Trusted Publisher**.
3. Add: organization `jourdancatarina3`, repository `react-native-viewfinder`,
   workflow `release.yml`.
4. The provided `.github/workflows/release.yml` already requests `id-token: write`, which
   is what makes this work.

**Option B — Automation token.** Simpler to set up, but it is a live credential.

1. <https://www.npmjs.com/settings/~/tokens> → Generate New Token → **Granular Access**.
2. Scope it to this package only, permission **Read and write**, expiry 90 days.
3. Copy it — it is shown once.
4. GitHub repo → Settings → Secrets and variables → Actions → New repository secret,
   named `NPM_TOKEN`.
5. **Put a calendar reminder to rotate it before it expires.** An expired token means a
   failed release at the worst moment.

---

## Part 3 — GitHub

### ☐ 3.1 Create the repository *(5 min, one-time)*

```sh
gh repo create react-native-viewfinder --public \
  --description "Zoom, browse and crop images in React Native. No native code." \
  --source . --remote origin
```

Or via the web UI, then:

```sh
git remote add origin git@github.com:jourdancatarina3/react-native-viewfinder.git
```

If you changed the package name or your username differs, update `repository`, `bugs` and
`homepage` in `package.json` to match. npm links to them from the package page.

### ☐ 3.2 Push *(2 min)*

```sh
git push -u origin main
```

Watch the Actions tab. The CI workflow should run and go green. **If it does not, stop and
fix it before publishing** — a broken CI badge on a new library is a bad first impression,
and the failure is usually real.

### ☐ 3.3 Add repository topics *(2 min, one-time)*

This is most of how people find libraries on GitHub:

```sh
gh repo edit --add-topic react-native,expo,image-zoom,pinch-to-zoom,gallery,lightbox,\
image-viewer,image-crop,cropper,reanimated,gesture-handler,typescript
```

### ☐ 3.4 Protect `main` *(5 min, one-time)*

Settings → Branches → Add branch ruleset, targeting `main`:

- ☑ Require a pull request before merging
- ☑ Require status checks to pass → select `lint`, `test`, `build-library`
- ☑ Require branches to be up to date before merging
- ☑ Block force pushes

**Important:** allow yourself to bypass, or add an exception for the release workflow.
Otherwise `release-it` cannot push the version-bump commit and every release will fail at
the last step. Ruleset → Bypass list → add your own account.

### ☐ 3.5 Enable Dependabot *(2 min, one-time)*

Settings → Code security → enable **Dependabot alerts** and **security updates**. For a
library, the dependency surface is tiny, but the example app has a large one.

---

## Part 4 — Verify it actually works

Do not skip this. It is the difference between a library people trust and one they file
issues against on day one.

### ☐ 4.1 Run the full local suite *(5 min)*

```sh
yarn typecheck && yarn lint && yarn test && yarn build
```

All four must be clean.

### ☐ 4.2 Check the tarball contents *(3 min)*

```sh
npm pack --dry-run
```

Confirm:

- ☐ `lib/commonjs`, `lib/module` and `lib/typescript` are all present
- ☐ `src/` is present (it is intentional — it makes source maps step into readable code)
- ☐ **No** `__tests__`, no `example/`, no `e2e/`, no `.github/`
- ☐ Packed size is roughly 185 KB. A sudden jump means something leaked into `files`

### ☐ 4.3 Run the example app on both platforms *(30 min)*

```sh
yarn example ios
yarn example android
```

Tap through all eight demo screens on each.

> **macOS note:** if the iOS build fails with *"resource fork, Finder information, or
> similar detritus not allowed"*, your checkout is inside an iCloud-synced folder
> (`~/Desktop` or `~/Documents` with Desktop & Documents sync on). macOS stamps extended
> attributes on files there and `codesign` rejects them. Move the checkout somewhere that
> is not synced — `~/dev/` — and prebuild again. This bit me during development; it is not
> a problem with the library.

### ☐ 4.4 Run the E2E suite *(15 min)*

```sh
yarn e2e
```

Maestro is already installed and eight flows are written. If `maestro` is not on your
PATH: `curl -fsSL https://get.maestro.mobile.dev | bash`.

### ☐ 4.5 Work through the manual QA checklist *(60–90 min — the important one)*

[docs/DEVICE_TESTING.md](docs/DEVICE_TESTING.md) §5, on **one physical iPhone and one
physical Android phone**. Simulators do not reproduce real multi-touch, so focal-point
correctness and gesture feel can only be judged on hardware.

The single most important line in that checklist:

> Zoom in, then drag up and down. The gallery must not close.

### ☐ 4.6 Test installing into a fresh app *(20 min)*

This catches packaging mistakes nothing else will — a wrong `exports` path, a missing
file, a peer dependency you forgot to declare.

```sh
# 1. Build a real tarball from the library
cd /path/to/react-native-viewfinder
yarn build && npm pack           # produces react-native-image-viewfinder-0.1.0.tgz

# 2. Brand new app somewhere else entirely
cd /tmp
npx create-expo-app@latest install-test --template blank-typescript
cd install-test
npx expo install react-native-reanimated react-native-gesture-handler

# 3. Install from the tarball, exactly as a user would
npm install /path/to/react-native-viewfinder/react-native-image-viewfinder-0.1.0.tgz
```

Replace `App.tsx` with:

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Gallery } from 'react-native-image-viewfinder';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Gallery
        images={[
          'https://picsum.photos/id/1015/2000/1333',
          'https://picsum.photos/id/1025/1400/1867',
          'https://picsum.photos/id/1039/2000/1333',
        ]}
      />
    </GestureHandlerRootView>
  );
}
```

```sh
npx expo run:ios
```

Check:

- ☐ It bundles with no "unable to resolve" errors
- ☐ Zoom, swipe and dismiss all work
- ☐ **Bundles without `expo-image` and `expo-image-manipulator` installed** — this is the
      whole point of them being optional subpath imports, and it is the easiest thing to
      break. Only add them in a second pass.
- ☐ With them installed, `react-native-image-viewfinder/expo-image` and
      `react-native-image-viewfinder/expo-image-manipulator` both resolve
- ☐ Autocomplete on `<Gallery ` shows the props with their JSDoc
- ☐ `npx tsc --noEmit` passes

Then clean up: `cd /tmp && rm -rf install-test` and delete the `.tgz`.

---

## Part 5 — Capture the demo media

The README already shows three **stills** (`docs/media/grid.png`, `gallery.png`,
`crop.png`), captured from the example app on an iPhone 17 Pro simulator. They are real,
so the README is not empty — but stills cannot show a pinch, and this library is mostly
about how things move. Replacing them with GIFs is worth the hour.

### ☐ 5.1 Record *(30 min)*

**iOS Simulator** — records straight to video:

```sh
xcrun simctl io booted recordVideo --codec h264 zoom.mov
# perform the interaction, then Ctrl-C
```

**Android emulator:**

```sh
adb shell screenrecord --time-limit 15 /sdcard/zoom.mp4
adb pull /sdcard/zoom.mp4
```

Record five, 5–8 seconds each, from the example app:

1. **zoom** — Single image screen. Pinch in, pan around, double-tap out.
2. **gallery** — Grid screen. Tap a thumbnail, swipe through three photos, close.
3. **dismiss** — Grid screen. Open a photo, drag down, watch the backdrop fade.
4. **crop** — Crop screen. Tap 1:1, drag a corner handle, rotate, then Crop. This one
   probably sells the library hardest; make sure the thirds grid is visible while dragging.
5. **aspect** *(optional)* — Aspect ratios screen, showing the panorama and the column.

### ☐ 5.2 Convert to GIF *(15 min)*

```sh
brew install ffmpeg gifsicle

ffmpeg -i zoom.mov -vf "fps=20,scale=480:-1:flags=lanczos,split[s0][s1];\
[s0]palettegen[p];[s1][p]paletteuse" -loop 0 zoom.gif
gifsicle -O3 --lossy=60 zoom.gif -o docs/media/zoom.gif
```

Keep each **under 2 MB** — GitHub is slow to load large GIFs and npm will not render them
at all beyond a point.

### ☐ 5.3 Put them in the README *(5 min)*

Drop the GIFs into `docs/media/` alongside the existing stills, then swap the `.png`
filenames in the table at the top of `README.md` for the `.gif` ones. Keep the stills for
anything you did not record.

**Use absolute URLs**, not relative paths — npm does not resolve relative image paths, so
your npm page would show broken images:

```md
<img src="https://raw.githubusercontent.com/jourdancatarina3/react-native-viewfinder/main/docs/media/zoom.gif" width="240">
```

---

## Part 6 — The first publish

### ☐ 6.1 Final pre-flight *(10 min)*

Everything in this list must be true:

- ☐ `yarn typecheck && yarn lint && yarn test && yarn build` — all clean
- ☐ `yarn test:coverage` — logic layer still above 90%
- ☐ CI green on `main`
- ☐ Example app runs on iOS **and** Android
- ☐ Manual QA checklist done on real hardware (4.5)
- ☐ Fresh-install test passed (4.6)
- ☐ README demo GIFs in place, with absolute URLs
- ☐ `package.json` → `name`, `repository`, `bugs`, `homepage` all correct
- ☐ `LICENSE` has the right name and year
- ☐ `CHANGELOG.md` has an entry for `0.1.0`
- ☐ `version` is `0.1.0` and you are logged in (`npm whoami`)
- ☐ Working tree clean, on `main`, pushed

### ☐ 6.2 Publish *(5 min)*

```sh
yarn build
npm publish
```

For a **scoped** package, the first publish needs:

```sh
npm publish --access public
```

Without that flag, a scoped package is published *private* and fails if you are not on a
paid plan. This trips up almost everyone the first time.

You will be prompted for your 2FA code.

### ☐ 6.3 Verify immediately *(5 min)*

```sh
npm view react-native-image-viewfinder
open https://www.npmjs.com/package/react-native-image-viewfinder
```

Check the README renders, the GIFs load, the version is `0.1.0`, and the repository link
works.

> **A 72-hour window:** you can `npm unpublish <pkg>@0.1.0` within 72 hours of publishing.
> After that it is permanent — you can only deprecate. If you spot something badly wrong,
> act inside that window.

### ☐ 6.4 Tag the release on GitHub *(5 min)*

```sh
git tag v0.1.0
git push origin v0.1.0
gh release create v0.1.0 --title "v0.1.0" --notes-file CHANGELOG.md
```

### ☐ 6.5 Set up trusted publishing *(5 min)*

Now that the package exists, go back and do Part 2.4 Option A.

---

## Part 7 — Every release after the first

The release script is already configured (`release-it` with conventional changelog).

```sh
git checkout main && git pull
yarn typecheck && yarn lint && yarn test && yarn build
yarn release
```

It will ask for the version bump, update `CHANGELOG.md` from your commit messages, commit,
tag, push, publish to npm, and create the GitHub release.

**Choosing the bump** — semver, and people rely on it:

| | When | Example |
| --- | --- | --- |
| **patch** `0.1.1` | Bug fix, no API change | Fixing a focal-point drift |
| **minor** `0.2.0` | New feature, nothing breaks | Adding a `hero` prop |
| **major** `1.0.0` | Anything that breaks existing code | Renaming or removing a prop |

While you are on `0.x`, minor bumps are allowed to break things — but say so loudly in the
changelog. Once you publish `1.0.0` you are committing to the API.

**Pre-releases**, for trying something out without affecting `npm install`:

```sh
npm version 0.2.0-beta.0
npm publish --tag beta        # users get it only via `npm install pkg@beta`
```

**Never** publish a pre-release without `--tag`; it would become the default `latest`.

### If you publish something broken

```sh
# Within 72 hours
npm unpublish react-native-image-viewfinder@0.2.0

# After 72 hours — mark it, and ship a fix
npm deprecate react-native-image-viewfinder@0.2.0 "Broken pan on Android; use 0.2.1"
```

---

## Part 8 — After it is out there

### ☐ 8.1 Announce *(30 min, optional)*

- **Reddit** — [r/reactnative](https://reddit.com/r/reactnative). Lead with the problem it
  solves (working across Gesture Handler 2/3 and Reanimated 3/4), not with "I made a thing".
- **X / Bluesky** — tag `#reactnative`. Attach the GIF; it is the whole post.
- **Expo Discord** — `#show-and-tell`.
- **[React Native Directory](https://reactnative.directory)** — submit a PR to
  [`react-native-community/directory`](https://github.com/react-native-community/directory).
  This is where people actually look for libraries. High value, ten minutes.
- **Dev.to / a blog post** — the compat-layer story (§D-003 in DECISIONS.md) is genuinely
  interesting to RN developers and is better content than a feature list.

### ☐ 8.2 Add issue templates *(5 min)*

`.github/ISSUE_TEMPLATE/` already has bug and feature templates from the scaffold. Skim
them and make sure the bug template asks for: RN version, Reanimated version, Gesture
Handler version, architecture (old/new), platform, and `HAS_HOOK_GESTURE_API`. Those five
answers resolve most reports.

### ☐ 8.3 Watch the first week

- Check the Issues tab daily at first — the first bugs are usually install and packaging
  problems, which are quick to fix and very visible.
- Set a weekly reminder to check for new Gesture Handler and Reanimated releases. This
  library's promise is version breadth, so a new major on either peer is something you
  should hear about from your own testing and not from an issue.

### ☐ 8.4 Keep the docs honest

`docs/EDGE_CASES.md` lists known limitations. When you fix one, move it out of that list.
When you find a new one, add it. A library that is candid about its limits gets better
bug reports.

---

## What I could not do, in one list

Everything below needs you specifically:

| | Why |
| --- | --- |
| npm account, 2FA, `npm login` | Your credentials |
| GitHub repo, branch protection, secrets | Your account |
| Physical-device QA | No hardware access; see DEVICE_TESTING.md §5 |
| Android emulator run | No emulator image booted in this environment |
| Demo GIF capture | Needs a running app and a human performing the gestures |
| Choosing the final package name | Your call |
| Announcing | Your voice |
| Deciding when `1.0.0` happens | Your judgement about API stability |
