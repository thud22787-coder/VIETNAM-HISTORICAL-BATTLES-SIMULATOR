# ROADMAP

Ordered by dependency, not by appeal. Each phase should leave the project in a state where the
next AI or developer can pick it up cleanly.

## Done

### Phase 0 — Foundation ✅
Toolchain, workspace, historical accuracy contract, source register, deterministic RNG.

### Phase 1 — Scenario system ✅
Versioned scenario contract, mechanics declared as data, scenario validator.

### Phase 2 — Domain and state ✅
Units, commanders, events, battle state, 24 invariants with an executable validator, immutable
historical baseline.

### Phase 3 — Simulation engine ✅
Pure reducer, fixed system order, multi-factor combat, tide, obstacle/draft interaction,
objectives and time-limit adjudication.

### Phase 4 — First historical battle ✅
Bạch Đằng 1288 as the vertical slice, with honest epistemic labelling and regression tests
asserting the tide is what decides it.

### Phase 5 — Replay, what-if, analysis ✅
Command-log replays, save/load with version refusal, declarative what-if variations, findings
labelled OBSERVED / INFERRED / SPECULATIVE.

---

## Next

### Phase 6 — Minimal UI ← **start here**

**Why first:** the core loop works but nobody can play it. Until a person can watch the tide fall
and feel the decision, we are guessing about whether the design is any good. A UI will surface
problems no test can.

Scope:
- battlefield render (canvas): terrain, units, obstacle field (only where the player should know
  it), tide indicator
- select unit → issue order
- play / pause / speed, because a tidal battle is about waiting for the right moment
- battle log panel (the data already exists)
- post-battle analysis screen with the epistemic labels visible
- scenario briefing with progressive disclosure (§44)

**Deliberate constraint:** the UI must not reach into simulation internals. It renders state and
sends commands. If it needs something the state does not expose, add it to the state.

### Phase 7 — Fog of war and the information model

**Why now:** GAP-01. The scenario already declares `fogOfWar: true` and nothing implements it.
That is a lie in the data, and it must be closed before an AI commander is written, or the AI
will read ground truth and nobody will notice.

Scope: an observed-state projection per faction; `KNOWN` / `ESTIMATED` / `UNKNOWN` enemy
information; obstacle fields visible only to the faction that placed them (the data already
records `knownToFaction`); enforcement of INV-23 and INV-24.

### Phase 8 — AI commander

Depends on Phase 7 — an AI that reads ground truth violates §32/§34 and would have to be
rewritten afterwards.

Scope: objectives → operational plan → tactical orders; decisions made from the observed view
only; a decision log so post-battle explanations reflect real decision data rather than plausible
narrative (§35).

### Phase 9 — Second battle

**Why it matters:** this is the test of §72. The architecture *claims* a new battle is data plus
config. That claim is currently unverified.

Recommended: **Bạch Đằng 938**, because it shares the tide/stake mechanic family and so directly
exercises the extensibility claim — and because it lets us present the 938 story honestly, with
its unsourced numbers labelled, alongside the better-evidenced 1288.

A land battle (Chi Lăng, Ngọc Hồi–Đống Đa) would be the stronger test of the terrain system, and
should follow.

### Phase 10 — Terrain effects

Close GAP-02: movement cost, visibility, defensive modifiers, morale effects. Currently the
marsh and forest are decorative.

### Phase 11 — Desktop and Android builds

Electron and Capacitor. Verify cross-platform determinism on a real device — the RNG was written
in uint32 arithmetic specifically to make this hold, but it has never been checked.

Touch input needs its own design; a shrunken desktop UI is not acceptable (§77).

### Phase 12 — Campaign system

Battles linked, with results carrying forward. Historical and player-altered campaign lines kept
distinct (§37).

---

## Not scheduled

- Community scenario authoring (blocked on TD-03: scenario data is TypeScript, not a data file)
- Cloud AI layer — optional by design; core must stay offline (§49, §50)
- Procedural scenarios

---

## Standing priorities

When choosing what to do next, prefer in this order (§98): gameplay correctness → simulation
correctness → historical data integrity → architecture → testing → UX → content quantity →
cosmetics. After the core is stable, UX rises.

And close research debts RD-01..RD-04 opportunistically — they are what would let stake positions
and tidal figures move from `GAMEPLAY_ASSUMPTION` toward properly sourced status.
