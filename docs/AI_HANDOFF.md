# AI HANDOFF

Session notes for whoever picks this up next. Factual, evidence-based (§64) — claims here were
verified by running things, not by remembering them.

---

## SESSION 1 — 2026-08-30

**AI / MODEL:** Claude Opus 5 (Claude Code)

**CURRENT PHASE:** Phases 0-5 complete. Simulation core + one battle, no UI.

### WHAT WAS DONE

Started from an empty repository (git initialised, no commits, remote configured). Built:

1. Historical research and source register, with evidence classes and conflict records
2. Historical accuracy contract, made executable in `history/epistemic.ts`
3. Deterministic seeded RNG with forkable streams
4. Tide model grounded in peer-reviewed estuary measurements
5. Domain model with four-layer data separation
6. 24 state invariants + executable validator
7. Immutable historical baseline (deep-freeze)
8. Scenario contract, validator, and the Bạch Đằng 1288 scenario
9. Simulation engine (pure reducer)
10. Replay, save/load, what-if, battle analysis
11. Full documentation set

### WHAT WAS VERIFIED

Run, not assumed:

- `npm test` → **138 tests, 41 suites, all passing**
- `npm run typecheck` → **clean** under `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`
- Full MVP loop executed end to end: scenario validates → battle runs → resolves as a Đại Việt
  victory matching history → analysis produces labelled findings → replay reproduces the battle
  bit-for-bit (`rngState` identical) → what-if flips the result (4 → 8 vessels escaping) while
  leaving the baseline untouched
- The `Math.random` ban test was checked adversarially: a real violation was planted, the test
  failed as intended, the violation was removed

### THE MOST IMPORTANT FINDING

**The excavated, radiocarbon-dated Bạch Đằng stake fields belong to the 1288 battle, not the
famous 938 one.** The 938 troop figures are unsourced — the Wikipedia figure for the Vietnamese
side has no attribution at all, and a widely repeated ship-complement figure is internally
inconsistent (its parts sum to 47 against a stated total of 50).

This changed the choice of first battle. See [ADR-007](DECISIONS/ADR-007-first-vertical-slice.md).
Do not "correct" the vertical slice back to 938 without reading it.

### THREE DESIGN BUGS FOUND BY RUNNING, NOT BY TESTING

Worth knowing about, because they show what unit tests miss:

1. Stakes were lethal even at high water (needed 3.3 m of water, high water is 3.0 m), so the
   tide decided nothing. Fixed by lowering the obstacle top to 1.0 m.
2. Grounded vessels re-struck the same obstacle every tick.
3. **The timescales did not match.** The fleet crossed the 6 km map in ~2 h while the tide took
   ~12 h to fall, so it always escaped before the ebb. Fixed by opening play on an ebb already
   underway (`highWaterAtHour: -1.5`) and slowing the fleet to a fighting withdrawal.
   Additionally, defenders were repositioned upstream — sitting on the stake field, they simply
   intercepted the fleet by melee before it ever reached the trap.

A fourth was found by running the full loop: battles could end `ONGOING` because no objective was
met. Scenarios now declare a `TimeLimit`.

**Lesson for the next session: run the thing. The tests were green through all four bugs.**

### FILES CHANGED

All of them — the repository was empty. See `git log`.

### BRANCH

`feature/foundation` — **not yet merged to `main`, not yet pushed.**

### COMMITS

```
945fbb2  Establish project foundation: accuracy contract, deterministic RNG, tide model
29270c6  Add domain model, state invariants and immutable historical baseline
316f680  Add simulation engine, scenario system and the Bach Dang 1288 vertical slice
78aca01  Complete the MVP core loop: replay, save/load, what-if and analysis
(+ documentation commit)
```

### TESTS RUN / RESULTS

`npm test` — 138 passed, 0 failed. `npm run typecheck` — clean.
No skipped or todo tests. No known flakes (the engine is deterministic, so flakes would indicate
a real bug).

### CURRENT WORK

None in progress. Tree is clean, everything committed.

### KNOWN BUGS

None known. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for gaps, limitations and debt.

### KNOWN RISKS

- **GAP-01 is the big one.** `fogOfWar: true` is declared in scenario data and **no code reads
  it**. INV-23/INV-24 are documented and unenforced. Fix this before writing the AI commander, or
  the AI will read ground truth and violate §32/§34 invisibly.
- The §72 extensibility claim ("a new battle is data + config") is **unverified** — there is only
  one battle.
- No build has ever been attempted for desktop or Android.
- Cross-platform determinism is designed for (uint32 arithmetic) but unverified on a device.

### ARCHITECTURAL DECISIONS

- ADR-001 — TypeScript + Node core, Electron + Capacitor targets
- ADR-002 — pure-reducer simulation
- ADR-007 — Bạch Đằng 1288 as the first vertical slice (read this one)

### OPEN QUESTIONS

1. Should the UI be React, or plain canvas + TypeScript? React buys structure for panels; the
   battlefield itself is canvas either way. Not yet decided.
2. How much of the historical apparatus should be visible during play versus after? Current
   instinct: minimal during, full afterwards (§44 progressive disclosure).
3. Should Balanced Mode exist at all (§7, §107)? It is specified but nothing needs it yet.

### NEXT STEPS

1. **Build a minimal UI** (Phase 6). The loop works but is unplayable; this will surface design
   problems tests cannot.
2. Implement fog of war (Phase 7) to close GAP-01.
3. AI commander (Phase 8), reading observed state only.
4. Second battle (Phase 9) to test the extensibility claim.

### DO NOT CHANGE

- `step()` must stay pure
- no `Math.random` in `sim-core` (there is a test; do not weaken it)
- the historical baseline stays immutable
- bump `SIMULATION_VERSION` whenever the algorithm changes results
- Bạch Đằng force sizes stay `UNKNOWN` (a test enforces this; no reliable source exists)
- no battle-specific branches in the engine
- invariant violations throw; never self-repair

### NOTES FOR NEXT AI

The unusual thing about this project is that **historical honesty is enforced by tests**, not by
good intentions. Several tests exist specifically to stop a future contributor from making the
project dishonest — filling in plausible troop numbers, promoting a gameplay assumption to a
fact, letting the analyser generate satisfying narrative. If one of those tests blocks you, the
test is probably right. Read [HISTORICAL_ACCURACY_CONTRACT.md](HISTORICAL_ACCURACY_CONTRACT.md)
before working around it.

Also: the scenario numbers in `bach-dang-1288.ts` look arbitrary but are not. The relationship
between stake height, vessel draft, clearance margin and tidal range is what makes the battle
work. Change one and the others need rechecking — the regression tests will tell you.
