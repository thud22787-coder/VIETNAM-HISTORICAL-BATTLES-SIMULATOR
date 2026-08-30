# AI COMMANDER CONTRACT

Master Prompt §31-35. Implemented in `packages/sim-core/src/ai/commander.ts`.

## 1. The AI is a player, not an admin (§34)

`decide()` takes an `ObservedState`. There is **no parameter through which the true
`BattleState` could arrive**, so the AI cannot read hidden information even by mistake.

This is enforced by the type system rather than by discipline, because the classic failure mode —
an AI that quietly consults what it should not — is nearly invisible in review. An `ObservedUnit`
is not a `Unit`; passing ground truth where an observation is expected does not compile.

The AI therefore may not:

- teleport or spawn units
- read enemy morale, fatigue, supply, orders or exact strength
- see obstacle fields it did not place
- know about enemies it has never observed
- act outside the scenario's rules

It receives exactly what a human player receives.

## 2. Three layers (§33)

```
STRATEGIC    what am I trying to achieve?   ← read from scenario objectives
OPERATIONAL  what does that mean here, now? ← posture from observed assessment
TACTICAL     what does each unit do?        ← orders, steered around known hazards
```

Strategy is **derived from the scenario's own objectives**, never hard-coded per battle. The same
discipline §38 applies to the engine applies here: a new scenario gets sensible behaviour without
touching the AI.

| Objective condition | Strategy |
|---|---|
| `ESCAPE` | `BREAK_OUT` toward the escape line |
| `ATTRITION`, `FLEET_NEUTRALISED` | `DESTROY_ENEMY` |
| `SURVIVE_UNTIL` | `HOLD` |

Postures: `RUN`, `FIGHT`, `CAUTIOUS`, `REGROUP`. Chosen from observed quantities only —
estimated enemy strength, contact counts, and how many of one's own units have stopped moving.

## 3. Hazard inference — learning by paying for it

The AI cannot see the stake field. What it *can* see is its own vessels coming to a dead stop in
open water with no enemy alongside to explain it. It records those positions as suspected hazards
and steers around them afterwards.

This is the honest version of "the AI learns about the trap":

- it starts knowing nothing
- it only learns by losing ships
- the inference is recorded with the observation that produced it

A commander who has not yet paid for the knowledge does not have it.

## 4. Explainability (§35)

Every decision is recorded as a `Decision` carrying:

- the tick and layer
- a summary of what was chosen
- **`basis`** — the observations the choice was actually made from

`explainDecisions()` reads these. It never composes a plausible-sounding reason after the fact,
which is exactly what §35 forbids. A test asserts that logged enemy strengths are *estimates*,
because a logged figure matching the truth exactly would prove the AI had access to it.

## 5. Determinism (§23)

`decide()` is pure. Same observed state, AI state and RNG give the same orders, so an AI-driven
battle replays exactly like a played one. `decide()` does not mutate the `AiState` handed to it.

## 6. Known limitations

Recorded honestly rather than hidden:

- **Tactics are simple.** Units move toward targets or the objective; there is no formation
  handling, no flanking, no coordinated timing between groups.
- **No modelling of the opponent.** The AI does not reason about what the enemy is trying to do.
- **Hazard avoidance is geometric**, not a route planner. A hazard spanning the whole channel is
  steered around unhelpfully rather than reasoned about.
- **No use of the tide.** The Yuan commander does not understand that waiting makes things worse,
  which is a genuine gap — a competent 13th-century sailor would have known the state of the tide.
  Closing it needs the AI to read `mechanics.tide`, which is legitimate (the tide is observable to
  anyone on the water) but is not yet done.
