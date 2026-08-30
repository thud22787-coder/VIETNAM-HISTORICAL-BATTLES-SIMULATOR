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

### Phase 6 — Minimal UI ✅

Canvas battlefield, unit selection and orders, play/pause/speed, a tide gauge with a
"channel closes in…" countdown, battle log, and a post-battle analysis screen carrying the
epistemic labels.

Building it did exactly what was hoped: it exposed that the player had almost no agency, which
drove the combat-scale, morale, obstacle-placement and objective fixes recorded in the git log.

Delivered:
- battlefield render (canvas): terrain, units, obstacle field (only where the player should know
  it), tide indicator
- select unit → issue order
- play / pause / speed, because a tidal battle is about waiting for the right moment
- battle log panel (the data already exists)
- post-battle analysis screen with the epistemic labels visible
- scenario briefing with progressive disclosure (§44)

**Deliberate constraint:** the UI must not reach into simulation internals. It renders state and
sends commands. If it needs something the state does not expose, add it to the state.

### Phase 7 — Fog of war and the information model ✅

Observed-state projection per faction, closing GAP-01. Sighting range modified by terrain,
strength as a bracketed estimate that tightens with proximity, sighting memory that goes stale
and expires, obstacles known only to the side that placed them, and event filtering by
witnessability. INV-23 and INV-24 are now enforced rather than merely documented.

The UI renders exclusively from the observed state, so contact is genuinely lost and regained
during play, and the Yuan never learn where the stake field is — they sail into it for the same
reason the historical fleet did.

---

## Next

### Phase 8 — AI commander ← **start here**

Phase 7 is done, so the constraint that makes this honest is now structural: the AI is handed an
`ObservedState` and there is no route from it back to ground truth. The scripted placeholder in
`main.ts` already reads its own observed view; replace it.

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
