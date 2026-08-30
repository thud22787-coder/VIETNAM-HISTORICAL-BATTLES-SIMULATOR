# PROJECT STATE

**Last updated:** 2026-08-30
**Last verified commit:** `78aca01` (branch `feature/foundation`)

Everything below was verified by running it, not by remembering it. Where something is untested
or unbuilt, it says so plainly (§64).

---

## PROJECT

Vietnam Historical Battles Simulator — a historical battle simulation and strategy platform.

## CURRENT VERSION

`0.1.0` — simulation core with one complete battle. Pre-alpha. No UI.

## CURRENT PHASE

Phase 0-5 complete (foundation through first historical battle). Next is a UI, then the AI
commander. See [ROADMAP.md](ROADMAP.md).

## COMPLETED

Verified by `npm test` (138 tests, 41 suites, all passing) and `npm run typecheck` (clean under
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

## IN PROGRESS

Nothing is half-finished. The tree is clean and all tests pass.

## NOT STARTED

- **User interface.** This is the biggest gap. The core is currently driven only from tests.
- **AI commander** (§31-35). No implementation. The engine accepts commands from any source, so
  the seam exists, but nothing fills it.
- **Fog of war / information model.** `mechanics.fogOfWar` is declared in the Bạch Đằng scenario
  and *validated*, but **no code reads it**. INV-23 and INV-24 are specified and unenforced. This
  is the most important documentation-vs-reality gap in the project.
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
138 tests, 41 suites — all passing
tsc --noEmit — clean
```

Covered: epistemic model, RNG determinism, tide physics, invariants, baseline immutability,
scenario validation, engine determinism and purity, commands, combat factors, victory
evaluation, replay reproduction, save round-trip, what-if isolation, analysis honesty, and
Bạch Đằng historical regression checks.

Not covered: anything with no implementation (UI, AI, fog of war), and performance/scale.

## CURRENT BUILD STATUS

`npm test` and `npm run typecheck` both pass on Windows with Node 24.14.1.
**No desktop or Android build has been attempted.** Do not claim these work.

## LAST VERIFIED COMMIT

`78aca01` — "Complete the MVP core loop: replay, save/load, what-if and analysis"

## NEXT RECOMMENDED WORK

In dependency order:

1. **A minimal UI.** The core loop works but nobody can *play* it. This is the highest-value next
   step and will surface design problems that tests cannot.
2. **Fog of war**, to close the gap between the declared mechanic and the code. Either implement
   it or remove the flag — a declared-but-ignored mechanic is a lie in the data.
3. **AI commander** reading only observed state.
4. **A second battle**, to test the extensibility claim in §72 before more is built on it.

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
