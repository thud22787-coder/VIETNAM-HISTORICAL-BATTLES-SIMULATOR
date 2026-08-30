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
- ~~**No use of the tide.**~~ **Closed.** The commander now reads the tide from `ObservedState`
  and will not freeze in a draining channel. See §7 for why that is not a cheat, and for what
  finding this gap turned up.

## 7. The tide, and why reading it is not cheating

The commander reads the state of the tide. That is deliberate and it is honest.

Anyone on the water can see the water: whether it is rising or falling, and roughly how far it has
dropped from the marks on the bank. A 13th-century sailor read it better than this models it.
Withholding it would not make the AI more constrained, it would make it *stupid* in a way no real
commander was — and §34 asks for a player, not a handicapped one.

The boundary that matters is different: **the tide is observable, and what lies under it is not.**
The commander knows the water is leaving. It still does not know what it is leaving the hull on.
`ObservedState.tide` is populated for both sides; `knownObstacles` is not.

### What it changed

One thing, and it is the right thing: a fleet that has lost ships to an unseen obstruction used to
turn `CAUTIOUS` and stop — in a channel that was still draining, which is the worst available
choice. It neither escapes nor avoids the danger, and every minute makes the water shallower. The
commander now keeps running for open water, which is the judgement a sailor would have made
without thinking about it.

### What finding this gap turned up

Closing it was more instructive than the fix. Three attempts at the "the water is running out"
threshold made no measurable difference at all in an A/B test, and the reason was not in the AI:

**The scenario was mistimed.** High water sat at hour −1.5, which closed the channel to deep hulls
at 1.03h — but the heavy squadrons could not physically reach the obstructions before 1.35h even
sailing flat out from tick zero. Their loss was *predetermined*, not decided. No amount of tide
awareness can help a commander who never had a choice.

Retimed to −0.8, the channel closes at about 1.8h against a 1.62h transit. Sailing at once now
gets three heavy squadrons and three junks out; waiting two hours loses every deep-draft hull and
only the shallow escorts escape. That half-hour margin is the decision the battle is supposed to
be about, and it did not exist before.

The lesson is the one the project keeps relearning: **an A/B test that shows no difference is
evidence about the world, not a reason to tune harder.** Both earlier thresholds were also wrong
on their own terms — they compared water level against a hull plus a flat margin, and fired only
after the fleet had already grounded. What actually strands a ship is shallow water *over an
obstruction*, so once the commander has learned where one is, that is what the margin is measured
against.
