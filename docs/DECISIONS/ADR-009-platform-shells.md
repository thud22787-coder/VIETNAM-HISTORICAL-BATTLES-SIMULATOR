# ADR-009 — Platform shells stay thin, and determinism is verified rather than assumed

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

ADR-001 chose Electron for desktop and Capacitor for Android, and wrote the RNG in uint32
arithmetic specifically so the two platforms would agree bit-for-bit. Master Prompt §48 requires
shared game logic rather than duplicated logic; §49 and §78 require the core to work offline.

None of it had ever been built. Every handoff since Session 1 recorded "no desktop or Android
build has been attempted" and "cross-platform determinism is designed for but unverified".

## Decision

Two things, taken together:

1. **The platform shells contain nothing worth duplicating.** `packages/desktop/src/main.cjs`
   opens a window on the built web UI and does nothing else. The Android shell packages the same
   `game-ui/dist` artefact via a copy script. Neither contains game logic, scenario data, or
   simulation code.
2. **Cross-platform determinism is an automated test, not a design claim.**

## Reason

### Thin shells

§48 forbids duplicating core logic across platforms. The cheapest way to guarantee that is
structural: if a shell contains nothing, there is nothing to drift. The Electron window runs with
`contextIsolation: true`, `nodeIntegration: false` and `sandbox: true` — the UI needs no
privileged APIs, and if it ever appears to, the logic belongs in `sim-core` instead.

Android and desktop load the **same bytes**. `scripts/copy-www.mjs` copies `game-ui/dist` rather
than rebuilding, so there is no possibility of the two targets shipping subtly different code.
That is what makes the determinism guarantee meaningful across platforms rather than merely
plausible.

### Determinism as a test

`src/testing/fingerprint.ts` computes a pure fingerprint of the simulation: 32 raw RNG draws at
17 decimal places, forked stream states, and the complete end state of both battles including
every unit's strength and morale at nine decimal places. Two tests compare it against one golden
file — one under Node, one in headless Chromium after a real Vite build.

Chromium is what Android WebView runs, so this is the closest check available without a handset.
It passes: the output is byte-identical.

Full precision is deliberate. Rounding would hide exactly the last-bit divergence the test exists
to catch, and a last-bit divergence is enough to make a replay diverge into a different battle.

## What building it actually caught

The value of doing this was not the shells. It was a **real packaging bug that every existing
test passed straight through**:

Vite defaults to absolute asset paths (`/assets/index-xxx.js`). Under `file://` — which is how
both the desktop and Android shells load the app — that resolves to the filesystem root, so the
bundle never loads and the page renders as an empty shell. The dev server and every browser test
served absolute paths happily. Only launching the desktop app revealed it.

Fixed with `base: './'` in the Vite config, and now guarded two ways: a fast assertion that the
built HTML contains no absolute asset paths, and the slower Electron launch test that would catch
any other cause of the same symptom.

A second, smaller finding: the app had no Content Security Policy. It now declares one that
matches what it actually does — `default-src 'none'`, no `connect-src` at all — which both
silences Electron's warning honestly and makes any future accidental network dependency fail
loudly instead of working silently.

## Trade-offs

- **Electron desktop builds are large** (~150MB packaged). Accepted; not a gameplay concern, and
  §75 leaves the choice open.
- **The generated `android/` project is not committed.** It is build output, and committing it
  would create two places where platform configuration lives. `npm run sync -w @vhbs/android`
  regenerates it.
- **The determinism test needs a Chromium browser.** It skips visibly when absent rather than
  failing, so a developer without one can still run the suite — but a skip is reported, so the
  gap is never silent.
- **Verification is against desktop Chromium, not a physical Android device.** That is an honest
  limitation: the engine is the same Chromium, but device-specific behaviour is untested. Running
  the fingerprint on a handset remains the only way to close that fully.

## Consequences

- `ELECTRON_RUN_AS_NODE=1` in the environment makes the Electron binary behave as plain Node and
  silently skip the app. The desktop test unsets it. This bit me during development and is worth
  knowing: it is set by default inside other Electron apps, including some editors.
- Any change to simulation results now requires regenerating `fingerprint.golden.txt` alongside
  the `SIMULATION_VERSION` bump, which makes "what numbers changed" visible in the diff.
