# ADR-002 — Simulation Model: Pure Reducer with Seeded Randomness

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

The simulation must satisfy several requirements that are usually in tension:

- deterministic and reproducible (§23, §24)
- replayable (§28)
- saveable and restorable (§27)
- comparable across runs for what-if analysis (§30)
- explainable after the fact (§35, §89)
- testable (§52, §53)

## Problem

Most game simulations are built as mutable object graphs advanced by an update loop that reads a
global clock and calls a global RNG. That design makes every requirement above hard: replays
need frame capture, saves need careful serialisation of live objects, tests need clock control
and RNG stubbing, and reproducing a bug means reproducing an entire session.

## Options

**A. Mutable entity graph + update loop.** Conventional; familiar to game developers.
*Against:* determinism becomes a discipline rather than a property. Replays require either frame
dumps or extreme care. Aliasing bugs (two references to one unit) are easy and hard to find.

**B. Event-sourced simulation.** Store events, derive state.
*Against:* correct but heavier than needed. Adds indirection to every read, and we would still
need deterministic reduction — so it solves a problem we can solve more cheaply.

**C. Pure reducer.** `step(state, commands, scenario) -> state`, with RNG state carried inside
the state.
*Against:* allocates a new state per tick; requires discipline about not mutating inputs.

## Decision

**Option C.** `step` is a pure function. Randomness comes from a seeded generator whose state
lives inside `BattleState`. Subsystems draw from **named forked streams**.

## Reason

1. **Every listed requirement becomes a consequence rather than a feature.**
   - Replay = seed + command log. Nothing else needs storing.
   - Save = serialise a plain object.
   - What-if comparison is meaningful, because two runs differ only by what was changed.
   - Tests need no mocks, no clock control, no fixtures.
   - A bug reproduces from seed + commands, exactly.
2. **Determinism becomes structural.** There is no ambient clock or global RNG to accidentally
   consult. `Math.random` is banned outright and the ban is tested.
3. **Named forked streams solve a subtle problem.** If every subsystem drew from one stream,
   adding a die roll in combat would shift every subsequent draw and break unrelated replays.
   Forking by name (`combat`, `obstacles`, …) isolates them, so subsystems can evolve
   independently.
4. **Explainability follows.** Because outcome is a function of (state, commands, seed, version),
   any result can be traced back to its inputs (§89). Post-battle analysis derives findings from
   the recorded log rather than inventing plausible narrative.

## Trade-offs

- **Allocation per tick.** A new state object each step. Accepted: at formation granularity the
  unit count is small, and `structuredClone` is only used at scenario-fork boundaries, not per
  tick. If profiling ever shows a problem, spread-copying can be replaced with structural sharing
  without changing the interface.
- **Requires discipline about mutation.** Mitigated by a test asserting `step()` does not mutate
  its input, and by `readonly` throughout the domain types.
- **Fixed system order is load-bearing.** Movement → obstacles → combat → morale → victory.
  Changing the order changes results and therefore requires a `SIMULATION_VERSION` bump. This is
  documented in the engine, because it is the kind of thing someone would otherwise reorder
  innocently.

## Consequences

- `SIMULATION_VERSION` must be bumped whenever the algorithm changes results. Replays and saves
  refuse to load across a mismatch (INV-18) rather than attempting a best effort — a replay run
  against changed rules produces a plausible battle that never happened, which is worse than no
  replay.
- Combat damage is computed from a **pre-damage power snapshot**, so resolution does not depend
  on array iteration order. This was a deliberate guard: order-dependent resolution is a
  determinism trap that would only surface as an inexplicable replay divergence.
- Any future parallelism must preserve deterministic ordering, or it is not permitted.
