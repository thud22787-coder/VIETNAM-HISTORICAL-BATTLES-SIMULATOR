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
GAP-01 and GAP-02 are retained below, closed, as a record of what the failures looked like.

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

### GAP-02 — Terrain does not affect movement or combat — **CLOSED**

Closed by `mechanics.terrainEffects`: a scenario-declared table mapping terrain kinds to movement
and combat multipliers, with optional per-unit-kind overrides. Nothing in it is battle-specific.

It was closed because Chi Lăng needed it — a defile ambush whose decisive mechanic is cavalry
being crippled in marsh cannot be expressed without it. See
[ADR-008](DECISIONS/ADR-008-extensibility-verdict.md).

Still not modelled: terrain affecting **visibility** or **morale**. The observation layer applies
its own concealment multipliers (`VISIBILITY.concealment`) separately from
`mechanics.terrainEffects`, which is a small duplication worth unifying if a third battle needs
scenario-specific visibility rules.

Bạch Đằng declares no terrain effects and is unchanged; a test asserts it.

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

### TD-07 — No test drives the full input-to-simulation path

`input.test.mjs` covers gesture interpretation thoroughly, and the layout tests measure real
geometry, but nothing asserts end-to-end that "tap a unit, tap the ground" actually moves a unit
in the simulation. The two halves are each tested; the seam between them is not.

**Why:** it needs a browser harness that can synthesise pointer events against the live shell,
which is more machinery than the seam currently justifies.

**Proposed fix:** if the input model grows (a command menu, unit stances), add one Playwright-style
test rather than expanding the fake-canvas harness to simulate the whole app.

### TD-06 — The Android APK build depends on machine-local SDK configuration

`ANDROID_HOME` is commonly unset even where the SDK is installed, and the generated `android/`
project is not committed (deliberately — it is build output).

**Impact:** `npm run build:apk -w @vhbs/android` will fail on a fresh machine until the
environment is set up. BUILD.md documents the steps.

**Proposed fix:** none needed unless CI is added, at which point the SDK setup becomes a CI
concern rather than a documentation one.

### TD-05 — Visibility and terrain effects are declared in two places

`VISIBILITY.concealment` in the observation layer and `mechanics.terrainEffects` in the scenario
both describe how terrain modifies things, but only the latter is scenario-configurable.

**Why:** fog of war landed before terrain effects existed, so it grew its own table.

**Impact:** a scenario cannot currently say "forest conceals unusually well here". Low priority
until a battle needs it.

**Proposed fix:** move concealment into `TerrainEffect` as a third multiplier and have the
observation layer read it, falling back to the current defaults.

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

## Platform status

- **Desktop (Electron): built and verified.** A test launches the real shell, loads the built UI,
  and asserts the briefing renders, both battles list, the canvas sizes, and the console is clean.
- **Android (Capacitor): native project generates and Gradle builds.** See BUILD.md for the
  current APK status.
- **Cross-platform determinism: verified.** The simulation fingerprint is byte-identical between
  Node and headless Chromium (the engine Android WebView runs). See
  [ADR-009](DECISIONS/ADR-009-platform-shells.md).
- **Not verified: a physical Android handset.** The engine is the same Chromium, but
  device-specific behaviour, performance and touch handling are untested on real hardware.
- **Touch input: done.** Pointer Events throughout, so mouse and touch share one code path.
  Tap to select, tap ground to order, drag to box-select, long-press to add. Layout reorders on
  narrow screens so controls sit under the thumb; browser tests measure the geometry.
- **Not done: pinch zoom and pan.** Deliberate — both battles fit one screen, so a camera would
  add state and bugs for no gain. See Phase 12 in [ROADMAP.md](ROADMAP.md).
- **Performance is unprofiled.** The battles are 14 units each; no measurement exists at scale.
- **The §72 extensibility claim is now evidence-backed**, not merely intended — see
  [ADR-008](DECISIONS/ADR-008-extensibility-verdict.md). Two battles exist with entirely
  different decisive mechanics, no engine file names either, and a test enforces that. The
  qualification recorded there: one *general* capability (terrain effects) had to be added,
  because the first battle never needed it.
