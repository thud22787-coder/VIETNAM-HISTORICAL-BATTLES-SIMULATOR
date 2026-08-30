# GAME STATE INVARIANTS

Rules that must hold for any `BattleState` the engine produces. Enforced by
`src/state/validator.ts` and asserted by tests.

**Philosophy (§95, §96):** violations `fail loudly` in development. We never silently repair
state — a silent repair hides the bug that produced the bad state and produces a plausible-looking
but wrong simulation. Better a crash with a precise message than a battle whose result cannot be
trusted.

Each invariant has an ID. Validator problems carry that ID so a failure points straight here.

---

## A. Identity and existence

| ID | Invariant |
|----|-----------|
| **INV-01** | Every unit id is unique within a state. |
| **INV-02** | A unit occupies exactly one position. It cannot be in two places at once. |
| **INV-03** | A unit belongs to exactly one faction, and that faction exists in the scenario. |
| **INV-04** | Every unit's `commanderId`, if set, refers to a commander present in the state. |
| **INV-05** | Unit counts are non-negative. Strength never exceeds the unit's initial strength unless a scenario rule explicitly permits reinforcement. |

## B. Life cycle and commands

| ID | Invariant |
|----|-----------|
| **INV-06** | A destroyed/routed unit does not execute normal commands (§25.3, §25.4). |
| **INV-07** | A command only takes effect if its unit still exists and is capable of acting. |
| **INV-08** | A unit's status is consistent with its numbers: strength 0 implies `DESTROYED`; morale 0 implies `ROUTED` or `DESTROYED`. |
| **INV-09** | Commands reference only units the issuing side actually controls. |

## C. Simulation integrity

| ID | Invariant |
|----|-----------|
| **INV-10** | Game state changes only through simulation rules — never by ambient mutation (§25.5). |
| **INV-11** | The tick counter is monotonically non-decreasing. |
| **INV-12** | Bounded stats (morale, fatigue, cohesion, supply) stay within [0, 1]. |
| **INV-13** | Every unit sits on a valid map position within bounds. |
| **INV-14** | An event is recorded exactly once (§25.13). Event ids are unique. |
| **INV-15** | Victory conditions evaluate consistently: a state is not simultaneously a win for both sides. |

## D. Historical integrity — the ones that matter most

| ID | Invariant |
|----|-----------|
| **INV-16** | **The historical baseline is immutable.** What-if simulation clones; it never mutates the baseline (§26, §83). Enforced by deep-freeze, not convention. |
| **INV-17** | A simulation result is bound to a scenario version. A result without one is unusable for comparison (§25.7). |
| **INV-18** | A replay runs against the simulation version it was recorded with (§25.8). Version mismatch is refused, not "attempted anyway". |
| **INV-19** | If a simulation needs reproducibility, its seed is stored (§25.9). |
| **INV-20** | Historical events and simulation events are distinguishable in storage and display (§25.15, §11). |
| **INV-21** | Units and equipment must be legal for the scenario's period and faction — no anachronism (§25.11, §25.12, §14). |
| **INV-22** | A save restores to a state that passes every invariant here (§25.10). A save that restores an invalid state is a corrupt save. |

## E. Information model

Enforced by `state/observed.ts`; `assertNoLeaks()` is the executable form, and is asserted at
every tick of a real battle in `tests/observed.test.ts`.

| ID | Invariant |
|----|-----------|
| **INV-23** | A side's observed view never contains knowledge it has no legitimate source for. The AI reads its own view, never ground truth, when fog of war is on (§32, §34). |
| **INV-24** | Observed enemy strength is an estimate carrying its own uncertainty, not a copy of the true number (§17). |

Note on INV-23: an enemy that has never been seen is **absent** from the observed state rather
than present as an `UNKNOWN` placeholder. Knowing that an unseen enemy exists is itself
information the observer has not earned.

---

## Validation levels

- `STRICT` — development and tests. Any violation throws.
- `WARN` — reports without throwing. For tooling and content authoring.
- `OFF` — production hot paths only, and only after profiling shows a need.

Default is `STRICT` outside production builds. `OFF` must never be the default anywhere, because
an invariant that is not checked is a comment.
