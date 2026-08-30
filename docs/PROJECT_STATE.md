# PROJECT STATE

**Last updated:** 2026-08-30
**Last verified commit:** see `git log` (branch `feature/ai-tide`)

Everything below was verified by running it, not by remembering it. Where something is untested
or unbuilt, it says so plainly (§64).

---

## PROJECT

Vietnam Historical Battles Simulator — a historical battle simulation and strategy platform.

## CURRENT VERSION

`0.1.0` — simulation core with one complete battle, plus a playable browser UI. Pre-alpha.

## CURRENT PHASE

Phases 0-12 complete (foundation through touch input and mobile UX). Next is the campaign
system, or a third battle. See [ROADMAP.md](ROADMAP.md).

## COMPLETED

Verified by `npm test` (263 tests across four packages, all passing) and `npm run typecheck` (clean under
`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`).

- **Historical accuracy layer** — `EpistemicStatus` ladder, `UncertainQuantity` (EXACT /
  ESTIMATED / RANGE / DISPUTED / UNKNOWN), source references, claim validation. No default
  status, so an unclassified claim cannot read as fact.
- **Deterministic RNG** — seeded mulberry32, forkable named streams, restorable mid-stream state.
  `Math.random` is banned in `sim-core` and the ban is enforced by a test that was adversarially
  checked against a planted violation.
- **Tide model** — scenario-configured harmonic tide grounded in peer-reviewed measurements of
  the Bạch Đằng estuary (diurnal, ~3 m spring range). Pure and deterministic.
- **Domain model** — units as formations (not individual soldiers), commanders with explicitly
  abstracted ratings, four distinct event kinds, battle state bound to scenario + simulation
  version.
- **State invariants** — 24 documented invariants with an executable validator. Asserted at every
  tick of a full battle, not just at the start.
- **Historical baseline immutability** — deep-freeze enforced, defensive input cloning, no update
  path on the type at all.
- **Scenario system** — versioned scenario contract, mechanics declared as data, validator that
  rejects both structural breakage and historical dishonesty (unsourced facts, anachronistic
  units, undeclared assumptions).
- **Simulation engine** — pure reducer, fixed system order, multi-factor combat (strength,
  morale, cohesion, fatigue, commander, immobilisation), obstacle/tide/draft interaction,
  objectives and time-limit adjudication.
- **Replay and save/load** — command-log replays (not frame dumps), hard version-mismatch
  refusal, JSON round-trip verified to restore a valid state that continues identically.
- **What-if** — declarative variations, baseline never mutated, derived scenarios re-identified
  so they cannot be confused with history.
- **Battle analysis** — findings labelled OBSERVED / INFERRED / SPECULATIVE, counts derived from
  the event log and asserted to match it.
- **Bạch Đằng 1288 scenario** — the vertical slice, with honest epistemic labelling throughout.
- **Fog of war** — observed-state projection per faction (`state/observed.ts`). Terrain-modified
  sighting range, strength as a bracketed estimate that tightens with proximity, sighting memory
  that goes stale and expires, obstacles known only to the side that placed them, event filtering
  by witnessability. Enforces INV-23/INV-24; `assertNoLeaks` is checked at every tick of a real
  battle. Observed types are structurally distinct from domain types, so consuming ground truth
  is a type error rather than a silent cheat.
- **AI commander** — three-layer (strategic → operational → tactical), reading only
  `ObservedState`. Strategy derived from scenario objectives, not hard-coded. Infers the obstacle
  field from its own ships stopping, having started with no knowledge of it. Every decision
  recorded with its basis, so explanations reflect real decision data (§35). Runs the Yuan fleet
  in the UI.
- **ESCAPE victory condition** — for a force whose objective is to leave rather than to win a
  fight.
- **Terrain effects** — scenario-declared movement and combat multipliers per terrain kind, with
  per-unit-kind overrides (closing GAP-02).
- **Chi Lăng 1427** — the second battle: a land ambush in a mountain defile, structurally unlike
  the first. Its purpose was to test §72; the verdict is in ADR-008.
- **Cross-platform determinism, verified.** `src/testing/fingerprint.ts` computes a pure
  fingerprint (32 RNG draws at 17 decimal places, forked stream states, both battles' complete end
  state). Two tests compare it against one golden file — one under Node, one in headless Chromium
  after a real Vite build. Byte-identical. This is what ADR-001 claimed and no session had checked.
- **Desktop shell (Electron)** — thin by design: opens a window on the built UI, no game logic.
  `contextIsolation` on, `nodeIntegration` off, `sandbox` on. A test launches the real shell and
  asserts the game actually renders.
- **Android shell (Capacitor)** — native project generates; packages the *same* `game-ui/dist`
  bytes the desktop shell loads, so all targets ship identical application code.
- **AI tide awareness** — the commander reads the tide from `ObservedState` (legitimate: anyone
  on the water can see the water) and no longer freezes in a draining channel. Closing this gap
  exposed that the Bạch Đằng tide was mistimed so badly the heavy squadrons could not reach the
  obstructions before the channel shut, even sailing flat out — their loss was predetermined
  rather than decided. Retimed; the timing decision is now real.
- **Touch and mouse input** — one Pointer Events code path for both. The interaction model was
  redesigned rather than patched: tapping empty ground orders a move (the only way to order by
  touch, so it is the primary path everywhere), drag box-selects, long-press toggles selection.
  Mobile layout puts controls below the battlefield within thumb reach, with 44px touch targets;
  four browser tests measure the rendered geometry to prove the layout genuinely differs.
- **Content Security Policy** — the app declares one matching what it actually does
  (`default-src 'none'`, no `connect-src` at all), so an accidental network dependency would fail
  loudly rather than work silently.
- **Playable browser UI** — canvas battlefield with tide-aware terrain shading, unit selection
  and move orders, play/pause/speed, live tide and "channel closes in…" countdown, battle log,
  and a post-battle screen showing findings with their OBSERVED / INFERRED / SPECULATIVE labels
  plus the scenario's declared assumptions. Builds to a 35 KB bundle.

## IN PROGRESS

Nothing is half-finished. The tree is clean and all tests pass.

## NOT STARTED

- **Messenger delay and misinformation** (§18). The architecture allows them — sighting memory is
  per-commander and timestamped — but neither is modelled.
- **Pinch zoom and pan.** Deliberately skipped: both battles fit one screen, so a camera would
  add state and bugs for no gameplay gain. The input module and `Viewport` are shaped to allow it.
- **Verification on a physical Android handset.** The engine is the same Chromium that the
  determinism test exercises, but device behaviour, performance and touch are untested on real
  hardware.
- **Campaign system** (§36-37).

## KNOWN BUGS

None currently known. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for limitations and technical debt,
which is a different thing.

## KNOWN LIMITATIONS

- Combat is an abstraction over formations, not a physical model. Deliberate (§47).
- The tide is a single harmonic. Real estuarine tides are asymmetric (flood usually runs faster
  than ebb); we did not model that because we have no source for the asymmetry and inventing one
  would be fabricated precision.
- Force sizes for Bạch Đằng are `UNKNOWN` because no reliable figures exist. The simulation uses
  gameplay values, labelled as such.
- The Bạch Đằng map is schematic, not a survey of the real estuary.
- Four research debts remain open (RD-01..RD-04) in [HISTORICAL_SOURCES.md](HISTORICAL_SOURCES.md).

## CURRENT ARCHITECTURE

TypeScript monorepo. `packages/sim-core` is a platform-independent, dependency-free simulation
core (~4,800 lines including tests) that runs TypeScript natively with no build step. Four-layer
data model: historical truth → scenario definition → runtime state, with what-if as a cloned
branch. See [ARCHITECTURE.md](ARCHITECTURE.md).

## CURRENT TEST STATUS

```
sim-core   217 tests — all passing
game-ui     42 tests — all passing   (gestures, browser determinism, real layout geometry)
desktop      2 tests — all passing   (launches the real Electron shell)
android      2 tests — all passing   (APK is valid and ships identical bytes)
tsc --noEmit — clean
vite build  — clean (59 KB bundle)
```

No tests are skipped: Chromium and Electron are both present on this machine, so the platform
tests actually run rather than reporting a skip.

Covered: epistemic model, RNG determinism, tide physics, invariants, baseline immutability,
scenario validation, engine determinism and purity, commands, combat factors, victory
evaluation, replay reproduction, save round-trip, what-if isolation, analysis honesty, and
Bạch Đằng historical regression checks.

The UI smoke test boots the real shell against a fake DOM, which catches the failure class
typechecking cannot see: an element id referenced in code but missing from the HTML.

Fog of war is covered by a leak scan across a full battle, plus adversarial checks: the UI guards
were verified by planting a real ground-truth leak into the render input and confirming they
failed.

Not covered: AI strategy, actual pixel rendering, and performance at scale.

## CURRENT BUILD STATUS

`npm test`, `npm run typecheck` and the Vite production build all pass on Windows with
Node 24.14.1.

**Desktop:** the Electron shell launches and renders the game; asserted by a test, not by
inspection. **Android:** the Capacitor native project generates and Gradle runs — see
[BUILD.md](BUILD.md) for the current APK status. **Determinism:** byte-identical between Node and
headless Chromium.

Not verified: a physical Android device.

## LAST VERIFIED COMMIT

See `git log` on branch `feature/ui` — the UI commit is the latest verified state.

## NEXT RECOMMENDED WORK

In dependency order:

1. **A third battle, or the campaign system** (Phase 13). ADR-008 sets the honest expectation for
   a battle: mostly data, plus whatever general capability its mechanic needs.

## DO NOT BREAK

- **`step()` must stay pure.** Replay, save/load, testing and what-if all rest on it.
- **`Math.random` must never enter `sim-core`.** There is a test; do not weaken it.
- **The historical baseline must stay immutable.** Deep-freeze, defensive clone, no update path.
- **`SIMULATION_VERSION` must be bumped when the algorithm changes results**, or replays will
  silently fabricate battles that never happened.
- **Force sizes for Bạch Đằng must stay `UNKNOWN`.** A test enforces this. Do not "helpfully"
  fill them in — no reliable source exists.
- **The engine must contain no battle-specific branches.** Mechanics are declared as scenario
  data.
- **Invariant violations must throw, never self-repair.**
- **Passive play must not win Bạch Đằng.** The obstacles only hold vessels fast; converting that
  into a result is the player's job. A test asserts this across several seeds.
- **Nothing may render or decide from ground truth when fog is on.** The UI takes `ObservedState`,
  and so does the AI's `decide()`; tests catch any attempt to widen either back to `BattleState`.
- **Objectives must match their own descriptions and be attainable.** Tests assert both, because
  both failed once: the Yuan objective said "break out to sea" while rewarding attrition, and its
  escape threshold was briefly set to a figure no amount of good play could reach.
- **No engine file may name a battle or branch on scenario identity.** A test enforces this and
  was verified against a planted violation. It is what the whole §72 argument rests on.
- **The built UI must use relative asset paths.** Absolute `/assets/...` breaks `file://` loading
  in both platform shells, and the app renders as an empty page. Two tests guard it.
- **The determinism golden file must be regenerated alongside any `SIMULATION_VERSION` bump**, in
  the same commit, so the diff shows which numbers moved.
- **Platform shells stay thin.** No game logic in Electron or Capacitor; if a shell seems to need
  it, it belongs in `sim-core`.
- **Input stays on one code path.** Pointer Events serve mouse and touch together; a
  touch-specific branch would be a path most players never exercise, which is how mobile support
  rots.
- **`touch-action: none` on the canvas.** Without it a drag pans the page instead of selecting.
