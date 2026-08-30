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

### Phase 8 — AI commander ✅

Three-layer commander (strategic → operational → tactical) reading only `ObservedState`. Strategy
is derived from the scenario's own objectives rather than hard-coded. The AI infers the stake
field from watching its own ships stop dead — it starts knowing nothing and only learns by losing
vessels. Every decision is recorded with the observations it was based on, so the post-battle
explanation reflects real decision data (§35).

See [AI_COMMANDER_CONTRACT.md](AI_COMMANDER_CONTRACT.md).

---

### Phase 9 — Second battle ✅

**Chi Lăng 1427** — a land ambush in a mountain defile, chosen deliberately to be as unlike the
first battle as possible so that it tested the architecture rather than re-running it. The
verdict on §72 is written up in
[ADR-008](DECISIONS/ADR-008-extensibility-verdict.md): substantially confirmed, with the honest
qualification that one general capability (terrain effects, the already-documented GAP-02) had to
be added because the first battle never needed it.

Building it also exposed two real defects one battle had hidden: the scenario validator caught a
unit placed off the map, and the AI turned out to have no concept of holding ground.

### Phase 10 — Terrain effects ✅

Closed as part of Phase 9. `mechanics.terrainEffects` maps terrain kinds to movement and combat
multipliers with per-unit-kind overrides. Visibility and morale effects are still outstanding —
see TD-05 in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

---

## Next

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
