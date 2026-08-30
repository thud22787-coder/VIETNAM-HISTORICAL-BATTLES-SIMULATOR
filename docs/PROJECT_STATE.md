# PROJECT STATE

**Last updated:** 2026-08-30
**Last verified commit:** see `git log` (branch `feature/fog-of-war`)

Everything below was verified by running it, not by remembering it. Where something is untested
or unbuilt, it says so plainly (§64).

---

## PROJECT

Vietnam Historical Battles Simulator — a historical battle simulation and strategy platform.

## CURRENT VERSION

`0.1.0` — simulation core with one complete battle, plus a playable browser UI. Pre-alpha.

## CURRENT PHASE

Phases 0-7 complete (foundation through fog of war). Next is the AI commander.
See [ROADMAP.md](ROADMAP.md).

## COMPLETED

Verified by `npm test` (171 tests across both packages, all passing) and `npm run typecheck` (clean under
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
- **Playable browser UI** — canvas battlefield with tide-aware terrain shading, unit selection
  and move orders, play/pause/speed, live tide and "channel closes in…" countdown, battle log,
  and a post-battle screen showing findings with their OBSERVED / INFERRED / SPECULATIVE labels
  plus the scenario's declared assumptions. Builds to a 35 KB bundle.

## IN PROGRESS

Nothing is half-finished. The tree is clean and all tests pass.

## NOT STARTED

- **AI commander** (§31-35). The Yuan fleet is run by a deliberately simple scripted opponent in
  the UI (`enemyCommands` in `main.ts`). It already reads only its own observed view, so the
  constraint is in place; what is missing is any actual strategy or tactical reasoning.
- **Messenger delay and misinformation** (§18). The architecture allows them — sighting memory is
  per-commander and timestamped — but neither is modelled.
- **Terrain effects on movement and combat.** Terrain is modelled in the scenario and used for
  obstacle placement, but does not yet modify movement speed, visibility or defence.
- **Second battle.** The architecture claims adding one is data + config (§72). That claim is
  **untested** until a second battle exists.
- **Desktop and Android builds.** Toolchain chosen (Electron + Capacitor), nothing built.
  Android SDK is present on the dev machine; no build has been attempted.
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
sim-core   164 tests — all passing
game-ui      7 tests — all passing
tsc --noEmit — clean in both packages
vite build  — clean (40 KB bundle)
```

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
Node 24.14.1. The built page was served and its assets fetched over HTTP.
**No desktop or Android build has been attempted.** Do not claim these work.

## LAST VERIFIED COMMIT

See `git log` on branch `feature/ui` — the UI commit is the latest verified state.

## NEXT RECOMMENDED WORK

In dependency order:

1. **AI commander** (Phase 8), replacing the scripted opponent. Fog of war now makes this honest
   by construction — the AI is handed an `ObservedState` with no route back to ground truth.
2. **A second battle**, to test the extensibility claim in §72 before more is built on it.
3. **Terrain effects** (GAP-02), so the marsh and tidal flats stop being decorative.

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
- **Nothing may render or decide from ground truth when fog is on.** The UI takes `ObservedState`;
  tests catch any attempt to widen that back to `BattleState`.
