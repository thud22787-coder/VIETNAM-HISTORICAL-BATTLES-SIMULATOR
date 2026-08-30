# TESTING STRATEGY

## Why the tests look like this

The simulation core is a pure function, so almost everything is directly testable without mocks,
fake clocks or fixtures. The strategy exploits that: test real behaviour on the real scenario
rather than constructing elaborate doubles.

Current state: **138 tests, 41 suites, all passing.** `node:test`, zero dependencies.

```bash
npm test          # all workspaces
npm run typecheck # tsc --noEmit, strict
```

## What each layer is for

| Test file | Guards |
|---|---|
| `epistemic.test.ts` | the accuracy contract — unsourced facts fail, uncertainty survives display |
| `rng.test.ts` | determinism, stream forking, state restore, the `Math.random` ban |
| `tide.test.ts` | tidal physics, and the draft/clearance asymmetry the battle depends on |
| `validator.test.ts` | each invariant, individually, with a case that violates it |
| `baseline.test.ts` | immutability under direct attack |
| `engine.test.ts` | purity, determinism, commands, combat factors, victory |
| `replay-whatif.test.ts` | replay reproduction, save round-trip, what-if isolation, analysis honesty |
| `bach-dang-1288.test.ts` | historical regression + the scenario's design properties |

## Principles we actually follow

### Test the property, not the implementation

`assert.equal(combatPower(u), 372.4)` would break on every tuning change and guard nothing worth
guarding. Instead: *demoralised units fight worse than fresh ones*. That survives tuning and
still catches real regressions.

### A guard that cannot fail is not a guard

The `Math.random` ban test was verified by **planting a real violation** and confirming it
failed, then removing it. Its first version had a false positive (it matched the comment
explaining the ban), which is exactly the kind of thing that gets a test quietly weakened until
it catches nothing.

Any test asserting "X never happens" should be checked this way.

### Invariants are checked continuously, not once

The engine tests assert every invariant at **every tick** of a full battle, not just on the
initial state. Bad states usually appear mid-simulation.

### Historical honesty is a test, not a convention

Some tests exist purely to stop a well-meaning future contributor from making the project
dishonest:

- Bạch Đằng force sizes must stay `UNKNOWN` — no reliable source exists
- the stake field must stay labelled `GAMEPLAY_ASSUMPTION` (construction is archaeological,
  placement on our map is not)
- `VERIFIED_FACT` phases must cite sources
- gameplay assumptions must be declared to the player
- commander notes must never claim `VERIFIED_FACT`
- analysis findings must carry OBSERVED / INFERRED / SPECULATIVE, and OBSERVED counts must match
  the event log exactly

These will look pedantic to someone in a hurry. They are the product.

### Scenario design properties are regression tests

The Bạch Đằng tests assert that the *tide actually decides the battle*: that ships strike the
obstacles at all, that departing immediately saves ships while delaying loses them, and that
friendly shallow-draft craft are never trapped by their own obstacles.

Those properties were broken during development — the trap was initially lethal even at high
water, and the fleet initially outran the tide entirely. The tests exist because the bugs did.

## Determinism testing (§53)

The contract: same seed + same initial state + same commands + same simulation version = same
result. Tested three ways:

1. two full runs with the same seed produce identical state, RNG position and event log
2. different seeds diverge — run *with actual orders*, because with no commands nothing draws
   from the RNG, which is why the first version of this test was wrong
3. replaying from a mid-battle state reproduces the tail exactly

Version mismatch is tested as a **refusal**: a replay recorded under different rules must throw,
not attempt a best effort.

## What is not tested

Listed honestly, because unlisted gaps are the dangerous kind:

- **UI** — does not exist
- **AI commander** — does not exist
- **Fog of war** — declared in scenario data, unimplemented (GAP-01)
- **Terrain effects** — modelled but inert (GAP-02)
- **Performance at scale** — 14 units today; no measurement beyond that
- **Desktop/Android builds** — never attempted
- **Cross-platform determinism** — the RNG uses uint32 arithmetic specifically so desktop and
  Android agree bit-for-bit, but this has not been verified on an actual device

## Adding tests

When fixing a bug, write the failing test first — §55 requires bugs become regression tests.
When adding a scenario, copy the historical-honesty block from `bach-dang-1288.test.ts`; those
checks should apply to every battle.
