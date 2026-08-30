# ARCHITECTURE

## The shape of the thing

```
        ┌──────────────────────────────────────────┐
        │  HISTORICAL TRUTH                        │
        │  docs/HISTORICAL_SOURCES.md              │  prose + citations
        │  (not code — humans and sources)         │  never executed
        └────────────────┬─────────────────────────┘
                         │  research, with provenance
        ┌────────────────▼─────────────────────────┐
        │  SCENARIO DEFINITION                     │  immutable data
        │  BattleScenario — frozen at load         │  versioned
        └────────────────┬─────────────────────────┘
              clone ─────┼───── clone
        ┌────────────────▼──────┐  ┌───────────────▼──────────┐
        │  RUNTIME GAME STATE   │  │  WHAT-IF SCENARIO        │
        │  BattleState          │  │  modified copy           │
        │  advanced by step()   │  │  → its own runtime state │
        └───────────────────────┘  └──────────────────────────┘
```

These four layers are never mixed (Master Prompt §82, §83). The runtime state references its
scenario by **id + version** rather than embedding it, so a running battle can never quietly
become the historical record.

## Technology

| Choice | What | Why |
|---|---|---|
| Language | TypeScript | Structural typing expresses the epistemic model well; one language across core, desktop and mobile |
| Core runtime | Node (native TS) | No build step for `sim-core`; tests run directly on source |
| Testing | `node:test` | Zero dependencies, ships with the runtime |
| Desktop | Electron *(planned)* | Available toolchain, shares the web UI |
| Android | Capacitor *(planned)* | Android SDK is present on the dev machine; wraps the same UI |

The machine this was started on has Node, Python, Java and an Android SDK, but no Godot, Unity or
Rust. See ADR-001.

### `sim-core` has no platform dependencies

No DOM, no filesystem, no network, no clock, no `Math.random`. This is enforced, not merely
intended — a test scans the source for `Math.random(` calls and fails the build if one appears.

The payoff: desktop and Android share the simulation *exactly* (§48), the core works offline by
construction (§49), and every behaviour is testable without a harness.

## The central design decision: purity

```ts
step(state, commands, scenario) -> state
```

`step` is a pure function. Same inputs, same output, always. Nothing else in the architecture
matters as much, because purity is what makes the rest possible:

- **Replay** is seed + command log. Nothing else needs storing (§28).
- **Save/load** is serialising a plain object.
- **Determinism** (§23) is structural rather than something to be maintained by discipline.
- **Testing** needs no mocks, no clock control, no fixtures beyond data.
- **What-if comparison** is meaningful, because two runs differ only by what you changed.

Randomness comes from a seeded generator whose state lives *in* the battle state, and subsystems
draw from **named forked streams** so that adding a die roll in combat does not shift the results
of the morale system and break unrelated replays.

## Keeping content out of the engine

The engine contains no battle-specific code. It cannot: there is no mechanism by which it would
know which battle it is running.

Scenarios *declare* mechanics as data:

```ts
mechanics: {
  tide: { periodHours: 24.8, lowWaterM: 0, highWaterM: 3.0, highWaterAtHour: -1.5 },
  obstacleFields: [ /* ... */ ],
  fogOfWar: true,
}
```

The engine runs whichever systems are declared. So the obstacle system is written entirely in
terms of *draft*, *clearance* and *water level* — never "stakes". Bạch Đằng's iron-tipped stakes
are one instance of a general rule that equally covers booms, sunken hulks or caltrops.

This is what makes §72 achievable: the second battle should be new data plus config, not an
engine rewrite.

## System order (load-bearing)

Within a tick, systems run in a fixed order:

```
movement → obstacles → combat → immobilised attrition → morale → victory
```

The order is not arbitrary. **Obstacles resolve before combat** so a vessel grounded this tick is
already vulnerable when blows are exchanged — which is exactly the historical dynamic being
modelled. And because order affects results, determinism requires the order be stable; changing
it changes outcomes and therefore requires a `SIMULATION_VERSION` bump.

Combat computes damage from a **pre-damage power snapshot**, so resolution does not depend on
array iteration order. That was a deliberate guard against a subtle determinism trap.

## Enforcement, not intention

Three contracts are executable rather than aspirational:

1. **Historical accuracy** — `EpistemicStatus` has no default value, so an unclassified claim
   cannot silently read as fact. `VERIFIED_FACT` without a source fails validation.
2. **State invariants** — 24 documented invariants, checked by `state/validator.ts`, asserted at
   *every tick* of a full battle in tests. Violations throw; state is never silently repaired,
   because a silent repair hides the bug that caused it and yields an untrustworthy result.
3. **Baseline immutability** — enforced by deep-freeze, not convention. `HistoricalBaseline`
   exposes no update path at all; only `fork()`. It also defensively clones its input so a caller
   holding the original reference cannot edit the baseline afterwards.

## Versioning

| Version | Bump when | Effect |
|---|---|---|
| `scenario.version` | historical data changes | replays and saves for the old version refuse to load |
| `SIMULATION_VERSION` | the algorithm changes results | same |
| `REPLAY_FORMAT_VERSION` | the replay schema changes | old replays refuse to load |

These refusals are hard failures by design. A replay run against changed rules produces a
plausible battle that never happened — worse than no replay at all.

## Layers

```
  ┌─────────────────────────────────────┐
  │  UI (web)     — canvas, BUILT       │
  ├─────────────────────────────────────┤
  │  AI Commander — observed state only │  ← next
  ├─────────────────────────────────────┤
  │  sim-core     — BUILT               │
  └─────────────────────────────────────┘
       ↓                    ↓
   Electron            Capacitor
   (desktop)           (Android)
```

## Fog of war: the observation boundary

`observe(state, faction, scenario, rng, memory)` projects the true state into what one side can
perceive. Everything that makes a decision — the UI, and in future the AI commander — consumes
`ObservedState` and never `BattleState`.

The enforcement is structural rather than disciplinary. `ObservedUnit` is not a `Unit`: it has no
morale, fatigue, cohesion, supply or commander, and its strength is a bracketed estimate rather
than a number. Passing ground truth where an observation is expected is a **type error**, so the
usual failure mode — an AI that quietly reads what it should not — cannot happen by accident.

Sighting memory lives outside `BattleState`, in the caller. Memory belongs to a commander, not to
the battlefield, and putting both sides’ beliefs into shared state would store each side’s picture
where the other could read it.
