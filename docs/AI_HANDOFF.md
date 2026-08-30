# AI HANDOFF

Session notes for whoever picks this up next. Factual, evidence-based (§64) — claims here were
verified by running things, not by remembering them.

---

## SESSION 1 — 2026-08-30

**AI / MODEL:** Claude Opus 5 (Claude Code)

**CURRENT PHASE:** Phases 0-6 complete. Simulation core, one battle, and a playable browser UI.

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
12. Playable browser UI (canvas battlefield, orders, tide readout, post-battle analysis)
13. Gameplay rebalancing driven by actually playing it — see below

### WHAT WAS VERIFIED

Run, not assumed:

- `npm test` → **140 tests, all passing** (138 sim-core, 2 game-ui)
- `npm run typecheck` → **clean** in both packages, under `strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- `vite build` → clean, 35 KB bundle; the built page was served and its assets fetched over HTTP
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

### THE DESIGN BUGS FOUND BY RUNNING, NOT BY TESTING

This is the most transferable lesson from the session. **The test suite was green through every
one of these.** They were found by executing the battle and looking at the numbers.

Round one, found by probing the simulation:

1. Stakes were lethal even at high water (needed 3.3 m, high water is 3.0 m), so the tide decided
   nothing. Obstacle top lowered to 1.0 m.
2. Grounded vessels re-struck the same obstacle every tick.
3. The timescales did not match: the fleet crossed the 6 km map in ~2 h while the tide took ~12 h
   to fall, so it always escaped before the ebb.
4. Battles could end `ONGOING` because no objective was met. Scenarios now declare a `TimeLimit`.

Round two, found by building the UI and playing it — the player turned out to be almost a
spectator, with near-identical outcomes whether they attacked, blocked or did nothing:

5. Engagement range was 150 m on a 6 km map with 100 m cells, so units had to nearly collide to
   fight and trapped vessels were never finished off. Widened to 400 m.
6. Morale fell a flat amount per tick on *any* damage, so formations routed on a timer regardless
   of losses — heavy ships broke at ~93% strength. Morale loss now scales with strength actually
   lost.
7. Trapped vessels sat intact forever if nobody reached them. Added immobilised attrition.
8. The stake field sat where the fleet crossed it in the first 1.3 h, while the channel did not
   close until ~2 h. Obstacles moved downstream, fleet speed retuned: the fleet now needs ~1.6 h
   to reach a channel that closes at ~2 h.
9. Victory was awarded on the time limit regardless of play. `FLEET_NEUTRALISED` no longer counts
   merely-immobilised vessels by default, and the time limit now favours the Yuan — so trapping
   is not winning, and the player must finish the grounded ships.

Measured result across six seeds: passive play wins 0/6, active play wins 5/6 and always destroys
more of the fleet.

**Lesson: run the thing, and look at the numbers rather than the pass/fail.**

### FILES CHANGED

All of them — the repository was empty. See `git log`.

### BRANCH

`main` — pushed to origin, along with `feature/foundation` and `feature/ui`.

Note: the repository had no commits at all when this session began, so `main` was created from
the feature work rather than merged into. History is linear.

### COMMITS

```
945fbb2  Establish project foundation: accuracy contract, deterministic RNG, tide model
29270c6  Add domain model, state invariants and immutable historical baseline
316f680  Add simulation engine, scenario system and the Bach Dang 1288 vertical slice
78aca01  Complete the MVP core loop: replay, save/load, what-if and analysis
66c2b84  Add documentation architecture: contracts, state, roadmap and handoff
73bf827  Add playable browser UI, and fix the gameplay problems it exposed
```

### TESTS RUN / RESULTS

`npm test` — 140 passed (138 sim-core, 2 game-ui), 0 failed. `npm run typecheck` — clean in
both packages. `vite build` — clean. The built page was served and its assets fetched over HTTP.
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

1. The UI is currently plain TypeScript + canvas with no framework, which has been comfortable at
   this size. If the panels get much richer, revisit — but do not add a framework speculatively.
2. How much historical apparatus belongs during play versus after? Current answer: minimal during
   (briefing + assumptions note), full afterwards (§44 progressive disclosure). Seems right so
   far but has not been tested on a real player.
3. Should Balanced Mode exist at all (§7, §107)? Specified, nothing needs it yet.
4. The scripted opponent in `main.ts` reads full state. That is fine for a placeholder but must
   not survive contact with fog of war — delete it when the AI commander lands.

### NEXT STEPS

1. **Fog of war** (Phase 7), closing GAP-01. Either implement it or remove the flag — a declared
   but ignored mechanic is a lie in the data. Must land before the AI commander.
2. **AI commander** (Phase 8) reading only observed state, replacing the scripted placeholder.
3. **Second battle** (Phase 9) to test the §72 extensibility claim, which is still unverified.
4. **Terrain effects** (Phase 10, GAP-02), so the marsh and tidal flats stop being decorative.

### DO NOT CHANGE

- `step()` must stay pure
- no `Math.random` in `sim-core` (there is a test; do not weaken it)
- the historical baseline stays immutable
- bump `SIMULATION_VERSION` whenever the algorithm changes results
- Bạch Đằng force sizes stay `UNKNOWN` (a test enforces this; no reliable source exists)
- no battle-specific branches in the engine
- invariant violations throw; never self-repair
- passive play must not win Bạch Đằng — the trap holds ships, the player finishes them

### NOTES FOR NEXT AI

The unusual thing about this project is that **historical honesty is enforced by tests**, not by
good intentions. Several tests exist specifically to stop a future contributor from making the
project dishonest — filling in plausible troop numbers, promoting a gameplay assumption to a
fact, letting the analyser generate satisfying narrative. If one of those tests blocks you, the
test is probably right. Read [HISTORICAL_ACCURACY_CONTRACT.md](HISTORICAL_ACCURACY_CONTRACT.md)
before working around it.

Also: the scenario numbers in `bach-dang-1288.ts` look arbitrary but are not. Stake height,
vessel draft, clearance margin, fleet speed, obstacle position and tidal range form one
interlocking system — the fleet needs ~1.6 h to reach a channel that closes at ~2 h, and that gap
*is* the game. Change any one and the others need rechecking. The regression tests will tell you,
but read the comments in that file first; they explain what each number is holding up.

One more thing worth internalising: the tests passed through every design bug listed above. They
are good tests, and they still could not tell that the battle was boring or that the player had
no agency. Build something you can run, run it, and look at the numbers.
