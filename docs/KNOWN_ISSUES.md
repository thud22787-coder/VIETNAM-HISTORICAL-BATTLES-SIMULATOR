# KNOWN ISSUES

Bugs, limitations, and technical debt. Kept honest per Master Prompt §108 — debt is recorded,
never hidden.

Nothing here is a secret. If it is broken, it is listed.

---

## Known bugs

None currently known.

(This is not a claim that none exist — only that none are known. The tests cover the implemented
surface; the unimplemented surface cannot have bugs yet.)

---

## Gaps between documentation and code

These are the dangerous ones, because a future reader could trust the wrong side.
GAP-01 is retained below, closed, as a record of what the failure looked like.

### GAP-01 — `fogOfWar` declared but not implemented — **CLOSED**

Closed by `state/observed.ts`. `observe(state, faction, scenario, rng, memory)` projects the true
state into what one side can legitimately perceive: sighting range modified by terrain, strength
as a bracketed estimate that tightens with proximity (INV-24), remembered contacts that go stale
and expire, obstacles known only to the side that placed them, and events filtered to what could
have been witnessed.

The projection returns types that are *structurally different* from the domain types — an
`ObservedUnit` is not a `Unit` — so consuming ground truth by accident is a type error rather
than an invisible cheat. `assertNoLeaks` enforces INV-23 and is checked at every tick of a real
battle in tests. The UI renders exclusively from `ObservedState`, and a test catches any attempt
to widen the render input back to `BattleState`.

Left deliberately: **the human player's own units are fully known to them**, which is correct —
they report in. Messenger delay and misinformation (§18) are not modelled; the architecture
allows them (memory is already per-commander and timestamped) but nothing needs them yet.

### GAP-02 — Terrain does not affect movement or combat

**Severity:** medium

`TerrainMap` is fully modelled and populated, and terrain is used to place obstacle fields. But
movement speed, visibility, defensive bonus and morale are **not** modified by terrain, despite
the terrain contract intent in [ARCHITECTURE.md](ARCHITECTURE.md) and §19.

**Impact:** the marsh, forest and tidal flats in the Bạch Đằng map are currently decorative.

---

## Technical debt

### TD-01 — Combat targeting is naive

Every unit engages every enemy within range simultaneously, splitting its attack. There is no
facing, no flanking bonus, no line of battle. `FLANK`, `AMBUSH`, `SCOUT` and `PURSUE` from the
§16 command list are not implemented; only `MOVE`, `ATTACK`, `HOLD` and `WITHDRAW` exist.

**Why:** the MVP needed a defensible combat model, not a complete one. Multi-factor resolution
was prioritised over tactical richness because §22 demands the former.

**Proposed fix:** add facing and relative position to `combatPower` before adding more command
verbs, or the verbs will have nothing to bite on.

### TD-02 — `O(n²)` combat resolution

Each tick compares every unit against every other. Fine at 14 units; will not hold at the
"thousands of units" §47 contemplates.

**Why:** premature optimisation is worse, and §74 says profile first.

**Proposed fix:** spatial partitioning (grid buckets keyed on the existing terrain cells) when a
scenario actually needs it. Do not do this speculatively.

### TD-03 — Scenario data is TypeScript, not a data file

`bach-dang-1288.ts` is code. §38 wants scenarios to be data.

**Why:** TypeScript gives compile-time checking of the scenario contract, which caught real
errors during development. A JSON file would have needed a schema validator to reach the same
place.

**Impact:** non-programmers cannot author scenarios; community scenarios (§79) are blocked.

**Proposed fix:** keep the TS contract as the source of truth, add a JSON loader that validates
against it. Not urgent until external authoring matters.

### TD-04 — Analysis findings are rule-based

`analyseBattle` produces findings from a fixed set of rules. It will not notice a novel cause.

**Why:** this is deliberate and probably correct. A more "intelligent" analyser risks generating
plausible narrative unsupported by the log, which §35 forbids. Rule-based findings can always be
traced to a count.

**Not planned for fix.** Recorded so the constraint is understood as a choice.

---

## Historical research debts

Tracked in full in [HISTORICAL_SOURCES.md](HISTORICAL_SOURCES.md). Summary:

| ID | Debt | Blocks |
|---|---|---|
| RD-01 | MUA archaeology paper not read in full (TLS + 403 blocked both routes) | exact stake counts, driving angle, paleo-channel |
| RD-02 | Taylor, *The Birth of Vietnam* not consulted directly | 938 and 1288 narrative detail |
| RD-03 | Đại Việt sử ký toàn thư not consulted in translation | what the chronicles actually say vs. modern retelling |
| RD-04 | No paleo-tidal reconstruction found | replacing the modern-tide proxy |

Until RD-01 and RD-04 close, stake **positions** and absolute depths in the scenario remain
`GAMEPLAY_ASSUMPTION` even though stake **construction** is archaeologically attested.

---

## Platform risks (unverified, not yet failures)

- **No desktop or Android build has been attempted.** Electron and Capacitor are chosen on
  paper. The Android SDK is present on the development machine but unconfigured
  (`ANDROID_HOME` unset).
- **Performance is unprofiled.** The current battle is 14 units; no measurement exists at scale.
- **The §72 extensibility claim is untested.** "Adding a battle is data + config" is an
  architectural intention that only a second battle can verify.
