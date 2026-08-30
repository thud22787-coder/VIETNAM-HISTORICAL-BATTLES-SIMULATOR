# ADR-007 — First Vertical Slice: Bach Dang 1288, not 938

- **Status:** Accepted
- **Date:** 2026-08-30
- **Supersedes:** nothing (initial choice)

## Context

Master Prompt §71 requires selecting a first battle as the engine proof, on these criteria:
historical significance, sufficient data, interesting mechanics, ability to exercise the
simulation, and not excessively complex for an MVP. §71 explicitly says the most famous battle
is not automatically the right one.

The obvious candidate was **Bach Dang 938** (Ngo Quyen vs. Southern Han) — the most famous
battle in Vietnamese history and the one a naive pick would land on.

## Problem

Research (see [HISTORICAL_SOURCES.md](../HISTORICAL_SOURCES.md)) surfaced a decisive asymmetry
in the *evidence base* between the two Bach Dang battles:

1. The excavated, radiocarbon-dated stake fields — Yen Giang, Dong Van Muoi, Dong Ma Ngua —
   date to **c. 700 BP**, i.e. the **1288** battle. Timber analysis was done by the Forestry and
   Forest Products Research Institute (Japan) and Vietnam Forestry University; C14 dating at the
   University of Waikato. This is peer-reviewed, physical, `ARCHAEOLOGICAL` evidence (S-001).
2. For **938**, no comparable dated physical evidence for the stakes was located. The battle is
   securely attested as an *event*, but its tactical detail reaches us only through late
   chronicle tradition and modern retelling (S-004).
3. Troop figures for 938 are `UNSOURCED`. The Wikipedia figure for the Vietnamese side
   (5,000-10,000) carries **no attribution at all**; the Southern Han figure traces to a tourism
   site. One widely repeated ship-complement figure is internally inconsistent — the stated roles
   sum to 47 against a stated total of 50 (S-005).

So the *most famous* battle is also the one where almost every number a simulation needs would
have to be invented. Master Prompt §87 forbids fabricating troop counts and presenting them as
historical fact, and §7 forbids quietly bending history for gameplay. Building the engine's
proof case on 938 would mean the vertical slice is mostly `GAMEPLAY_ASSUMPTION` wearing a
`HISTORICAL` label — precisely the failure mode §4 and §43 exist to prevent.

## Options

**A. Bach Dang 938 (Ngo Quyen).** Most famous; strongest narrative hook.
*Against:* weakest evidence base. Stake positions, force sizes and choreography would all be
invented. The headline scenario would carry the lowest confidence data in the project.

**B. Bach Dang 1288 (Tran Hung Dao vs. Yuan fleet).** Same iconic mechanic (tide + stakes +
withdrawal), same river, comparable significance — but the stakes are *physically excavated,
measured, species-identified and radiocarbon dated*, and the tidal regime is measured in
peer-reviewed marine-science literature.
*Against:* larger, more complex battle; slightly less globally famous than 938.

**C. A land battle (e.g. Chi Lang, Ngoc Hoi-Dong Da).** Simpler terrain model.
*Against:* exercises far less of the engine — no environment-driven state, no timing mechanic.
Would not prove the parts of the architecture most at risk.

## Decision

**Option B — Bach Dang 1288 is the first vertical slice.**

## Reason

1. **Evidence quality drives the choice.** 1288 is the one battle where the *decisive mechanic
   itself* rests on physical evidence rather than narrative. We can state stake dimensions and
   wood species with an archaeological citation. That makes the flagship scenario an
   advertisement for the accuracy contract instead of a stress test of it.
2. **It exercises the whole engine.** Tide as a scheduled environmental variable, depth-vs-draft
   interaction, a timing window, hidden terrain features under fog of war, and asymmetric force
   composition. §71 asks for a battle that proves the simulation, and a battle whose outcome
   turns on *environmental timing* proves far more than one that turns on melee resolution.
3. **The hard mechanic is the honest one.** The tide is measurable (S-002); the troop counts are
   not (S-005). Designing the slice so that *the tide, not the troop count, decides the battle*
   aligns gameplay weight with evidence weight. The simulation leans hardest on what we actually
   know.
4. **938 is not abandoned.** It becomes the second scenario. Because it shares the tide/stake
   mechanic family with 1288, it is the ideal test of §72 — adding it should be new data plus
   scenario config, not an engine rewrite. It will ship with its uncertainty labelled honestly.

## Trade-offs

- We lead with the less globally famous battle. Accepted: §71 explicitly permits this, and 1288
  is not obscure — it is a major battle with a national heritage site.
- 1288 is a larger engagement, so force-scale abstraction matters earlier. Mitigated by modelling
  formations/squadrons rather than individual soldiers (§47).
- We still cannot state 1288 force sizes as fact. Chronicle army sizes are unreliable across the
  board. These remain `RANGE` or `SIMULATION_PARAMETER` — the difference is that in 1288 they are
  not load-bearing for the outcome.

## Consequences

- Scenario `BACH_DANG_1288_v1` is the reference implementation of the scenario contract.
- Research debts RD-01 and RD-04 are on the critical path to `VERIFIED_FACT` status for the stake
  and tide data, and are tracked in HISTORICAL_SOURCES.md. Until RD-01 closes, stake *positions*
  in the scenario are `GAMEPLAY_ASSUMPTION` even though stake *existence and construction* is
  `ARCHAEOLOGICAL`. This distinction must survive into the data.
- The engine must support scenario-specific environmental mechanics as data from day one (§21),
  since the slice depends on one. No `if battle == bach_dang` anywhere.
