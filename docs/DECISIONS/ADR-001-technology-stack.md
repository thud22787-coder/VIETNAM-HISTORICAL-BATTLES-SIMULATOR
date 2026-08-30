# ADR-001 — Technology Stack

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

A historical battle simulator targeting **desktop + Android** (§48), which must work **offline**
(§49), be **deterministic and reproducible** (§23), and remain **testable and maintainable**
across many AI sessions (§101).

Environment inspection of the development machine found:

| Available | Not available |
|---|---|
| Node 24.14.1, npm 11 | Godot |
| Python 3.13 | Unity |
| Java 21 | Rust / cargo |
| .NET 8 | Gradle (CLI) |
| Android SDK (platform-tools, build-tools, platforms) | — |

`ANDROID_HOME` is unset but the SDK directory exists.

## Problem

Pick a stack that can produce a desktop app and an Android APK from **one shared simulation
core**, without duplicating game logic across platforms (§48), and without requiring an engine
that is not installed.

## Options

**A. Godot + GDScript/C#.** Purpose-built for games, exports to desktop and Android.
*Against:* not installed. Determinism requires care around engine-driven float behaviour and the
scene tree. Testing simulation logic in isolation is harder — logic tends to entangle with nodes.

**B. Unity.** Mature Android pipeline.
*Against:* not installed, heavyweight, licensing considerations, and the same
logic/engine-entanglement problem.

**C. TypeScript core + web UI, wrapped for desktop and Android.**
Node runs it; Electron wraps desktop; Capacitor wraps Android using the SDK already present.
*Against:* not a "real game engine"; performance ceiling for very large unit counts; canvas
rendering must be written rather than inherited.

**D. C# / .NET + MAUI or Avalonia.** .NET 8 is installed.
*Against:* Android tooling for MAUI is heavier to set up; weaker fit for the canvas-style
battlefield rendering we want.

## Decision

**Option C — TypeScript.** A dependency-free simulation core (`packages/sim-core`) running on
Node, with a web UI, Electron for desktop and Capacitor for Android.

## Reason

1. **The core is the product, and it must be trivially testable.** The simulation is where all
   correctness risk lives — determinism, invariants, historical integrity. A plain TypeScript
   module with no engine dependency can be tested as pure functions with no harness, no scene
   tree and no mocking. That single property outweighs everything a game engine would give us at
   this stage.
2. **Genuine logic sharing.** Desktop and Android import the *same* module. §48 forbids
   duplicating core logic; with C the duplication is structurally impossible rather than merely
   discouraged.
3. **It runs on the machine we have.** Options A, B and D all require installing and configuring
   an engine or SDK path that is not currently set up. C uses Node (present) and the Android SDK
   (present).
4. **Determinism is easier to guarantee.** We control every arithmetic operation in the core.
   No engine physics step, no frame-rate coupling, no hidden float behaviour. The RNG is written
   in uint32 arithmetic specifically so desktop and Android agree bit-for-bit.
5. **Node runs TypeScript natively** (verified on Node 24), so the core has *no build step* at
   all. Tests execute against source. Fewer moving parts for the next AI session to understand.
6. **Offline by construction.** No runtime service dependency anywhere in the core.

## Trade-offs

- **We write our own rendering.** Accepted: §76 explicitly prioritises battlefield clarity over
  graphical sophistication, and a 2D tactical map is well within canvas.
- **Performance ceiling is lower than a native engine.** Accepted for now: units are formations,
  not individual soldiers (§47), so counts stay in the tens-to-hundreds. TD-02 records the
  O(n²) combat loop; §74 says profile before optimising.
- **Electron desktop builds are large.** Accepted; not a gameplay concern.
- **Capacitor Android performance is unproven for this workload.** This is a real risk, recorded
  in KNOWN_ISSUES. Mitigated by keeping the core free of DOM dependencies, so if Capacitor proves
  inadequate the core can be re-hosted (React Native, native shell, or a rewrite of only the UI)
  without touching the simulation.

## Consequences

- `packages/sim-core` must never import a platform API — no DOM, filesystem, network or clock.
  This is enforced by the module's own discipline and by tests that would fail if it were broken.
- `Math.random` is banned in the core; a test scans for it.
- Rendering and input are UI concerns and must not leak into the simulation.
- Android and desktop builds are Phase 11 work and are currently **unverified**.
