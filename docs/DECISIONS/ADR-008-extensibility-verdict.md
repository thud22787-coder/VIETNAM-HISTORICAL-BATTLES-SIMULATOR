# ADR-008 — What the second battle cost: the §72 extensibility verdict

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

Master Prompt §72 states that after the first battle, adding a second should be

> new data + new scenario config + optional special mechanics

rather than an engine rewrite. §73 extends this to 5, 20, 100 battles without the codebase
becoming a pile of `if (battle === X)`.

Until this ADR that was an **architectural intention with no evidence behind it**. Every previous
`PROJECT_STATE` recorded it as the largest untested assumption in the project.

## What was done to test it

Chi Lăng 1427 was chosen deliberately to be as *unlike* Bạch Đằng 1288 as possible:

| | Bạch Đằng 1288 | Chi Lăng 1427 |
|---|---|---|
| Domain | naval, tidal estuary | land, mountain defile |
| Decisive mechanic | tide + submerged obstacles vs. draft | terrain vs. unit type |
| Attacker's problem | timing against a falling tide | choosing a route through bad ground |
| Unit types | heavy ships, junks, light boats, infantry | cavalry, infantry, archers, elite |
| Victory | neutralise a fleet / escape to sea | destroy a column / force a pass |
| Period | 13th century | 15th century |

Picking a second naval battle sharing the tide/stake mechanic (Bạch Đằng 938, the roadmap's
original suggestion) would have been a much weaker test — it would mostly have re-run code paths
the first battle already exercised.

## Verdict

**Substantially confirmed, with one honest qualification.**

### What was pure data

The scenario file itself — map, units, commanders, factions, objectives, historical phases,
sources, gameplay assumptions — is data. No engine file names Chi Lăng. No `if (battle === ...)`
exists anywhere. The AI commander, fog of war, replay, save/load, what-if, analysis, invariant
validation and the UI all worked on the new battle without modification.

The UI needed a scenario *list* and had two hard-coded faction names generalised. That is a
one-line-per-battle registry, not surgery, and both battles now boot in the shell under test.

### What was not: one general capability had to be added

**Terrain affecting movement and combat did not exist.** It was documented as GAP-02 and
unimplemented — the first battle never needed it, because its mechanic was water depth rather
than ground.

This is the qualification, and it should be stated plainly rather than explained away: a battle
whose decisive mechanic is terrain could not be built until the engine could express terrain
effects at all.

But the shape of the addition matters:

- It is **generic**: `mechanics.terrainEffects` maps terrain kinds to movement and combat
  multipliers, with optional per-unit-kind overrides. Nothing in it mentions marshes, cavalry,
  or Chi Lăng.
- It is **declared as scenario data**, exactly like `tide` and `obstacleFields`.
- It is **inert where unused**: Bạch Đằng declares no terrain effects and is bit-for-bit
  unchanged, which a test asserts.
- It closed a **pre-existing, already-documented gap**. This was work the project owed anyway,
  surfaced by a battle that needed it.

That is the difference between "the architecture failed" and "the architecture had a hole we had
already written down". A third battle needing, say, fortifications would be the same story again.

### What the second battle also bought

Building it exposed real defects that one battle had hidden:

1. **The scenario validator caught a unit placed off the map** (x=12100 on a 12000 m map) the
   first time the new scenario ran. The validator was written for exactly this and had never
   previously fired on new content.
2. **The AI had no concept of holding ground.** With nothing visible to attack, defenders stopped
   wherever the last fight ended, and the Ming column walked past the abandoned defile. Defending
   forces now return to station — a general fix, not a Chi Lăng one.

Both are the kind of thing only a *second* instance can reveal.

## Consequences

- §72 is **evidence-backed** rather than aspirational, for the first time.
- GAP-02 is closed; terrain is a real mechanic.
- `SIMULATION_VERSION` moved to 0.4.0, because terrain affects results for any scenario declaring
  it. Bạch Đằng replays are unaffected in behaviour but still refuse to load across the version
  boundary, which is the contract working as designed (INV-18).
- The honest expectation for battle three: **mostly data, plus whatever general capability its
  mechanic needs if the engine cannot yet express it.** Adding capabilities is expected and fine.
  Adding battle-specific branches is not, and still has not happened.
