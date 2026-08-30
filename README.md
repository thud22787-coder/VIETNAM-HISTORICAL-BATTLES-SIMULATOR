# Vietnam Historical Battles Simulator

A historical battle simulation and strategy platform for Vietnamese history.

Play a historical battle, command the forces, watch the simulation resolve, see why it turned
out that way — then change a variable and find out what the model does differently.

> **Status: early but playable.** Two battles, a browser UI that works with mouse or touch, and a
> desktop app that launches and is tested. The Android project builds to a valid APK; no physical
> device has been tested. See [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) for an honest account.

---

## What this is (and is not)

This is **not** a game that takes Vietnamese generals and has them fight. It is a simulation
platform built on a strict rule: *the game must never invent history and present it as fact.*

That rule shapes everything. Troop numbers for these battles are, in the sources, unreliable or
entirely unattributed — so the game says `UNKNOWN` rather than making one up. Commander ratings
exist because the simulation needs numbers, and they are labelled as game abstractions, never as
historical assessments of real people. Every claim carries where it came from and how confident
we are.

See [docs/HISTORICAL_ACCURACY_CONTRACT.md](docs/HISTORICAL_ACCURACY_CONTRACT.md).

## The battles

**Bạch Đằng, 1288** — a naval trap in a tidal estuary, decided by timing against the ebb.
**Tốt Động – Chúc Động, 1426** — an ambush in flooded rice paddy, decided by whether the column
can be talked off the road.
**Chi Lăng, 1427** — a land ambush in a mountain defile, decided by which ground the column
crosses.

The last two form a playable **operational campaign**: winning the first is why the relief column
marches into the second.

They were chosen to be structurally unalike, because the second battle's real job was to test
whether the architecture could take one. See
[ADR-008](docs/DECISIONS/ADR-008-extensibility-verdict.md).

### Why Bạch Đằng 1288 came first

The vertical slice is the 1288 battle, **not** the more famous 938 one. That choice was driven
by evidence, and the reasoning is worth reading:
[ADR-007](docs/DECISIONS/ADR-007-first-vertical-slice.md).

Briefly — the excavated, radiocarbon-dated stake fields in the Bạch Đằng estuary belong to 1288.
For 938, the celebrated troop figures turn out to be unsourced (the Wikipedia figure for the
Vietnamese side carries no attribution at all, and a widely repeated ship-complement figure is
internally inconsistent). Building the engine's showcase on 938 would have meant inventing nearly
every number. 1288 is the battle where the decisive mechanic rests on physical evidence.

The result is a battle decided by **timing against the tide**, which is the part we have real
evidence for, rather than by troop counts, which we do not.

## Quick start

```bash
npm install
npm test          # 328 tests
npm run typecheck

npm run dev   -w @vhbs/game-ui   # play in a browser at http://localhost:5173
npm start     -w @vhbs/desktop   # play in the desktop app
```

Requires Node 20+ (developed on Node 24). The simulation core runs TypeScript natively with no
build step.

## Repository layout

```
packages/game-ui/         browser UI (canvas battlefield, orders, analysis)
packages/desktop/         Electron shell (thin — opens a window on the UI)
packages/android/         Capacitor shell (packages the same built UI)
packages/sim-core/        platform-independent simulation core
  src/history/            epistemic status, uncertain quantities, baseline, what-if
  src/domain/             units, commanders, events, battle state
  src/scenario/           scenario contract, validator, battle data
  src/sim/                RNG, tide, engine, replay
  src/state/              invariant validator
  src/ai/                 AI commander
  src/campaign/           campaign linking and divergence tracking
  src/analysis/           post-battle analysis
docs/                     contracts, decisions, project state
```

`sim-core` has **no platform dependencies** — no DOM, filesystem, network or clock. Desktop and
Android will share it exactly, and everything in it is a pure function of its inputs.

## Documentation

Start here if you are picking this project up:

| Document | Purpose |
|---|---|
| [PROJECT_STATE.md](docs/PROJECT_STATE.md) | What is built, what works, what does not |
| [AI_HANDOFF.md](docs/AI_HANDOFF.md) | Session handoff notes |
| [PRODUCT_VISION.md](docs/PRODUCT_VISION.md) | What we are building and why |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it is put together |
| [HISTORICAL_ACCURACY_CONTRACT.md](docs/HISTORICAL_ACCURACY_CONTRACT.md) | The rules on historical claims |
| [HISTORICAL_SOURCES.md](docs/HISTORICAL_SOURCES.md) | Source register and research debts |
| [GAME_STATE_INVARIANTS.md](docs/GAME_STATE_INVARIANTS.md) | Rules the state must always satisfy |
| [AI_COMMANDER_CONTRACT.md](docs/AI_COMMANDER_CONTRACT.md) | What the AI may and may not know |
| [CAMPAIGN_CONTRACT.md](docs/CAMPAIGN_CONTRACT.md) | How campaigns keep history and what-if apart |
| [ADR-008](docs/DECISIONS/ADR-008-extensibility-verdict.md) | What the second battle cost |
| [BUILD.md](docs/BUILD.md) | How to build each target, and what is verified |
| [TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) | What is tested and why |
| [ROADMAP.md](docs/ROADMAP.md) | Where this goes next |
| [KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Bugs, limitations and technical debt |
| [DECISIONS/](docs/DECISIONS/) | Architecture decision records |

## A note on the history

Historical figures here are treated as real people, in context, with uncertainty acknowledged.
Game statistics are game statistics. Where the sources disagree, the disagreement is recorded
rather than quietly resolved. Where we invented something because the simulation needed a number,
it says so.

If you find a historical error, that is a bug — please report it as one.
