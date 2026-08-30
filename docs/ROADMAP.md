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

### Phase 11 — Desktop and Android builds ✅

Electron desktop shell and Capacitor Android project, both deliberately thin — see
[ADR-009](DECISIONS/ADR-009-platform-shells.md). Cross-platform determinism is now **verified by
an automated test** rather than assumed: the simulation fingerprint is byte-identical between Node
and headless Chromium, which is the engine Android WebView runs.

Building it caught a real packaging bug that every existing test passed through: Vite default
absolute asset paths break `file://` loading, so the desktop app rendered an empty shell.

Still outstanding: **touch input design** (§77) — the UI is mouse-oriented and a shrunken desktop
layout is explicitly not acceptable. And verification on a physical handset, as opposed to the
same Chromium engine on desktop.

---

## Next

### Phase 12 — Touch input and mobile UX ✅

Input rewritten around Pointer Events, so mouse, touch and stylus arrive on one code path.
The interaction model was redesigned rather than patched: a finger has no right button and no
shift key, so **tapping empty ground orders a move** on every platform, drag box-selects, and
long-press toggles a unit in the selection.

Layout is genuinely different on a narrow screen rather than merely smaller — the controls move
*below* the battlefield, within thumb reach, and every button meets the 44px touch minimum. Four
browser tests measure the rendered geometry to prove it.

Not done: **pinch zoom and pan**. Both battles are designed to fit one screen, so a camera would
add state and a class of bugs for no gameplay gain today. `Viewport` already carries a scale, so
adding one later touches the input module and the renderer, not the simulation.

---

## Next

### Phase 13 — Campaign system ✅

Battles linked, with results able to carry forward, and — the part that mattered — historical and
player-altered lines kept permanently distinct. See
[CAMPAIGN_CONTRACT.md](CAMPAIGN_CONTRACT.md).

Divergence is one-way and has no reset: a campaign that departs from the record is relabelled
`WHAT-IF CAMPAIGN` for the rest of its life, because winning a later battle "correctly" does not
undo the one that was actually lost.

The shipped `RESISTANCE` campaign is deliberately **thematic, not operational** — its two battles
are 139 years apart, so it carries nothing forward and says so. The carry-forward machinery is
tested against a synthetic operational campaign instead.

---

## Next

### Phase 14 — A third battle, or an operational campaign ← **start here**

An operational campaign (the engagements of a single Lam Sơn year, say) would exercise
carry-forward against real history rather than a synthetic fixture. A third battle would add
content; ADR-008 sets the expectation — mostly data, plus whatever general capability its mechanic
needs.

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
