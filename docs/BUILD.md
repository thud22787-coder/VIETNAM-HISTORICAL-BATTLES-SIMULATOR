# BUILD

How to build and run the project on each target. Master Prompt §51.

**Read the status column before trusting anything here.** Where a step has not been executed on
this machine, it says so rather than implying it works.

| Target | Status |
|---|---|
| Tests + typecheck | **Verified** — run continuously |
| Web UI (`vite build`) | **Verified** |
| Cross-platform determinism (Node vs Chromium) | **Verified** — automated test |
| Desktop (Electron, run from source) | **Verified** — automated launch test |
| Desktop (packaged installer) | Config written, **not run** on this machine |
| Android (APK) | **Verified** — 3.6 MB debug APK built |

---

## Prerequisites

- **Node 20+** (developed on 24.14.1). The simulation core runs TypeScript natively, so there is
  no build step for `sim-core`.
- **A Chromium browser**, for the cross-platform determinism test. Skipped with a visible message
  if absent; set `CHROME_PATH` to point at a non-standard install.
- **For Android only:** JDK 17+ and an Android SDK with platform 35 and build-tools 35.

```bash
npm install
```

## Everything, verified

```bash
npm test          # simulation core + UI, including the determinism check
npm run typecheck # strict, both packages
```

## Web UI

```bash
npm run dev   -w @vhbs/game-ui   # http://localhost:5173
npm run build -w @vhbs/game-ui   # → packages/game-ui/dist
```

`?battle=CHI_LANG_1427` selects the second battle; the briefing screen lists all of them.

## Desktop (Electron)

```bash
npm start   -w @vhbs/desktop   # builds the UI, then opens the window
npm run package -w @vhbs/desktop   # unpacked build → packages/desktop/dist
npm run dist    -w @vhbs/desktop   # installer for the current platform
```

The shell (`packages/desktop/src/main.cjs`) is deliberately thin: it opens a window on the built
web UI and does nothing else. No game logic, no scenario data, no simulation. §48 requires
desktop and Android to *share* the core rather than duplicate it, and the cheapest way to
guarantee that is for the platform shells to contain nothing worth duplicating.

`contextIsolation` is on, `nodeIntegration` off, `sandbox` on. The UI needs no privileged APIs;
if it ever seems to, the logic belongs in `sim-core` instead.

## Android (Capacitor)

```bash
npm run sync      -w @vhbs/android   # build UI → copy to www/ → cap sync
npm run open      -w @vhbs/android   # open in Android Studio
npm run build:apk -w @vhbs/android   # debug APK via Gradle
```

The first `cap sync` generates the native `android/` project. It is **not** committed — it is
generated output, and committing it would create two places where platform config lives.

`scripts/copy-www.mjs` copies the *same* `game-ui/dist` artefact that the desktop shell loads, so
all three targets ship byte-identical application code. That is what makes the determinism
guarantee below meaningful across platforms.

### Verified result

A debug APK was built on this machine: **3.6 MB**, `BUILD SUCCESSFUL in 1m 42s`, 82 Gradle tasks.
It contains a valid `AndroidManifest.xml`, `classes.dex`, and the game bundle.

The bundle inside the APK is **byte-identical** to the one the desktop shell loads (same SHA-256),
with the CSP and relative asset paths intact. That is the check that turns "desktop and Android
share the core" from an intention into a fact.

**Not verified: installing and running it on a physical handset.** The engine is the same Chromium
the determinism test exercises, but device behaviour, performance and touch handling are untested
on real hardware, and the UI is still mouse-oriented (§77).

### Environment

`ANDROID_HOME` is commonly unset even when the SDK is installed. Point it at the SDK root, e.g.

```bash
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"     # Windows (Git Bash)
export ANDROID_HOME="$HOME/Android/Sdk"             # Linux
```

---

## Cross-platform determinism

This is the property that makes saves and replays portable between desktop and Android, and it is
now **verified rather than assumed**.

`packages/sim-core/src/testing/fingerprint.ts` computes a fingerprint of the simulation: raw RNG
draws at full float precision, forked stream states, and the complete end state of both battles.
It is a pure function with no platform dependencies.

Two tests compare it against the same golden file:

- `packages/sim-core/tests/fingerprint.test.ts` — under Node.
- `packages/game-ui/tests/determinism-browser.test.mjs` — builds it with Vite, serves it, runs it
  in headless Chromium, and diffs the output byte-for-byte.

Chromium is what Android WebView runs, so this is the closest check available without a handset.
It passes: every RNG draw to 17 decimal places, both battle end states, and all unit strengths
and morale values are identical.

**If a simulation change is deliberate**, bump `SIMULATION_VERSION` and regenerate the golden file
in the same commit, so the diff shows exactly which numbers moved:

```bash
cd packages/sim-core
node --experimental-strip-types -e "import('./src/testing/fingerprint.ts').then(async m => \
  (await import('node:fs')).writeFileSync('tests/fingerprint.golden.txt', m.computeFingerprint()+'\n'))"
```

**If the same code produces different numbers**, that is a real bug: replays and saves are not
reproducible and the §23 contract is broken.

## Offline

The core works offline by construction (§49, §78). No scenario load, simulation, save, replay or
AI decision touches the network, and `sim-core` has no network code at all. The Electron shell
loads from the filesystem; the Capacitor shell packages the same files.
