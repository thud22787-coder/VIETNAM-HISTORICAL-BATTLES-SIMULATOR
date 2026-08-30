# AI HANDOFF

Session notes for whoever picks this up next. Factual, evidence-based (§64) — claims here were
verified by running things, not by remembering them.

Most recent session first.

---

## SESSION 9 — 2026-08-30

**AI / MODEL:** Claude Opus 5 (Claude Code)

**CURRENT PHASE:** Phases 0-14 complete. **Every roadmap phase is now built.** See ROADMAP.md for
the honest list of what remains.

### WHAT WAS DONE

Added **Tốt Động – Chúc Động (1426)** as the third battle, and **LAM_SON_1426** as the first
genuinely operational campaign. Together they close the gap the last handoff recorded: carry-
forward existed but only a synthetic fixture exercised it.

**Why this battle.** It is the one that *causes* Chi Lăng. Wang Tong is beaten in the delta →
withdraws to Đông Quan → is besieged → the Ming send Liễu Thăng's relief column → that column
marches into Chi Lăng. Eleven months, one war, one leader, a causal chain. That is what makes
carrying losses forward defensible here and indefensible in `RESISTANCE`, whose battles are 139
years apart.

### ADR-008'S PREDICTION HELD

The third battle cost **no engine change at all**. Its mechanic — a heavy column bogged in worked
paddy while local levies move freely — is Chi Lăng's marsh with different numbers in
`mechanics.terrainEffects`. That is the second confirmation of §72, and this time with nothing
owed.

### THE BEST-SOURCED BATTLE IN THE PROJECT

Unusually, **both traditions' figures survive and both are attributed** (S-012): Ming strength
54,000 (Ming Shi-lu, via Geoff Wade) against 100,000 (Vietnamese sources); casualties 20–30,000
against 50,000. Roughly a factor of two apart, running in the direction such disagreements usually
do — the victor's tradition reports a larger enemy and heavier enemy losses.

That is carried through as `DISPUTED` with both candidates and their attributions intact. It is
the clearest teaching case the project has for §106.

### TWO THINGS THE TOOLING CAUGHT

Both were my errors, and both were caught by machinery built in earlier sessions:

1. **The scenario validator** rejected Lam Sơn strength typed `EXACT` while marked `UNCERTAIN` —
   a contradiction. A figure reported once by the losing side's own record is an estimate,
   whatever precision it is written with. Changed to `ESTIMATED` with a wide ±.
2. **A campaign test** caught carry-forward applying to *both* sides. Both battles use the faction
   id `lam-son`, so an unscoped rule silently carried Lam Sơn losses into Chi Lăng — the opposite
   of what the campaign's own notes claimed. The prose and the behaviour disagreed and the
   behaviour was wrong. `CarryForward.appliesTo` now scopes it; measured, the Ming carry at ×0.76
   after a 40% loss while Lam Sơn stay at ×1.00.

### WHAT WAS VERIFIED

- `npm test` → **328 tests passing** across four packages, **zero skipped**
- Both campaigns run end to end. `LAM_SON_1426` produced a historical result with the Ming
  arriving at Chi Lăng at ×0.80 after ending Tốt Động at 49% strength.
- Carry-forward scales smoothly (0.96 → 0.88 → 0.80 → 0.72) and clamps at the 0.70 floor
- All three battles boot in the UI shell under test
- The fingerprint passed unchanged, confirming the new battle did not perturb existing results —
  no `SIMULATION_VERSION` bump needed. The APK was stale again and was rebuilt.

### BRANCH

`feature/operational-campaign`, branched from `main`.

### KNOWN RISKS

- **Still no physical Android device.** Now the last wholly unverified platform claim.
- **Sieges are not modelled.** `LAM_SON_1426` narrates the siege of Đông Quan between its two
  battles because it is the causal join, but cannot play it.
- The AI has no model of its opponent.
- TD-07: nothing drives input all the way into the simulation.
- Performance is unprofiled; battles are 14–17 units.

### NEXT STEPS

There is no unbuilt phase. In rough order of value:

1. **A physical Android device pass.**
2. **A siege scenario**, which would need a genuinely new mechanic rather than data.
3. **Research debts**, especially RD-08 (the Ming Shi-lu via Geoff Wade) — it is the source behind
   several DISPUTED figures and is currently reached only through Wikipedia's citation of it.
4. **AI opponent modelling.**

### DO NOT CHANGE

Everything in the earlier sessions still applies, plus:

- **Carry-forward must stay faction-scoped where the history is asymmetric.** Lam Sơn were
  reinforcing through 1427; carrying their losses forward gets the campaign backwards.
- **Tốt Động's figures must stay DISPUTED.** Both traditions are attributed and they disagree by
  a factor of two. Reconciling them into one number would destroy the most useful thing about the
  scenario.

---

## SESSION 8 — 2026-08-30

**AI / MODEL:** Claude Opus 5 (Claude Code)

**PHASE AT THE TIME:** Phases 0-13 complete. Campaign system done.

### WHAT WAS DONE

Phase 13, the campaign system. See [CAMPAIGN_CONTRACT.md](CAMPAIGN_CONTRACT.md).

Linking battles is the easy half. The half worth building carefully is §37: **a campaign that
departs from the historical record must say so, and keep saying so.** A player who wins a battle
history records as a defeat has not corrected the record — they have started a counterfactual, and
every battle after it is downstream of a fiction.

So `divergence` is one-way, `HISTORICAL → DIVERGED`, with no route back and no API for one.
Winning the *next* battle correctly does not restore the historical line, because the campaign
that was actually played still went the other way. A diverged campaign is relabelled
`WHAT-IF CAMPAIGN` permanently.

### THE HONESTY PROBLEM IN THE SHIPPED CAMPAIGN

The two battles we have are **139 years apart** — Bạch Đằng 1288 and Chi Lăng 1427, different
dynasties, different invaders, no shared army or commander. Calling that an operational campaign
would be a lie about the history.

`RESISTANCE` is therefore explicitly **thematic, not operational**: battles that pose the same
tactical problem, presented in order, with the briefing and assumptions saying plainly that no
army marched from one to the other. `lossPersistence` is 0 at every step, and a test asserts it
stays that way.

The carry-forward machinery still exists and is fully tested — against a *synthetic* operational
campaign in the test file. It is the right shape for a real one; we just do not have the content
for it yet. An operational campaign (the engagements of a single Lam Sơn year, say) is the obvious
next piece of work and would exercise it against real history.

### A GUARD THAT ASKED A GOOD QUESTION

The `no-battle-branches` test failed on `campaigns/resistance.ts`, which names both battles.

That needed thought rather than a reflexive exclusion. The answer: a *campaign* naming its battles
is its entire content, exactly as a scenario naming its terrain is. The campaign **engine**
(`campaign.ts`) must stay generic, and it does — I verified the guard still catches a planted
`scenario.id ===` inside the engine after narrowing it to exempt only the content directory.

### WHAT WAS VERIFIED

- `npm test` → **294 tests passing** across four packages, **zero skipped**
- A full AI-vs-AI campaign runs end to end. It diverged at the first battle and was correctly
  relabelled `WHAT-IF CAMPAIGN` with hedged language about what that means.
- The historical path also verified: matching both battles keeps the `HISTORICAL CAMPAIGN` label,
  and the completion text stays hedged ("consistent with the account, but not evidence for any
  particular explanation").
- The narrowed guard was re-checked against a planted violation in the campaign engine.

The simulation was untouched, so the fingerprint and APK stayed valid — no version bump needed.

### BRANCH

`feature/campaign`, branched from `main`.

### KNOWN RISKS

- **Carry-forward is tested only against a synthetic campaign.** The shipped one deliberately
  carries nothing, so that code path has no real content exercising it.
- **Still no physical Android device.**
- The AI has no model of its opponent and no formation tactics.
- TD-07: nothing drives input all the way into the simulation.
- Performance is unprofiled; both battles are 14 units.

### NEXT STEPS

1. **An operational campaign or a third battle** (Phase 14). An operational campaign would give
   carry-forward real content to work against.
2. A physical device pass, if hardware becomes available.

### DO NOT CHANGE

Everything in the earlier sessions still applies, plus:

- **Campaign divergence must stay one-way.** A reset would let a counterfactual campaign present
  itself as the historical one, which is exactly what §37 forbids.
- **`applyCarryForward` must keep returning a new scenario.** Mutating the shared battle
  definition would make a second playthrough start from the first one's damage.
- **RESISTANCE must keep carrying nothing forward** while its battles are a century apart.

---

## SESSION 7 — 2026-08-30

**AI / MODEL:** Claude Opus 5 (Claude Code)

**PHASE AT THE TIME:** Phases 0-12 complete plus AI tide awareness.

### WHAT WAS DONE

Closed the last standing item in AI_COMMANDER_CONTRACT §6: the commander now reads the tide.

`ObservedState` gained a `tide` field, populated for both sides even under fog. That is not a
cheat — anyone on the water can see the water. The honest boundary is that **the tide is
observable and what lies under it is not**: the commander knows the water is leaving, and still
does not know what it is leaving the hull on.

The behavioural change is small and correct: a fleet that has lost ships to an unseen obstruction
used to turn CAUTIOUS and *stop*, in a channel that was still draining. It now keeps running for
open water. Measured: 9 cautious ticks became 0.

### THE PART WORTH READING

**Three attempts at this made no measurable difference, and the reason was not in the AI.**

An A/B test (tide visible vs. blinded) showed byte-identical outcomes across eight seeds. Rather
than tuning harder, I measured why — and found the **scenario was mistimed**:

- High water sat at hour −1.5, closing the channel to deep hulls at **1.03h**
- The heavy squadrons could not physically reach the obstructions before **1.35h**, even sailing
  flat out from tick zero

Their loss was *predetermined*, not decided. No tide awareness can help a commander who never had
a choice, and the "escape window" the tests claimed to protect did not exist for the ships it
mattered for.

Retimed to −0.8: the channel now closes at ~1.8h against a 1.62h transit. Sailing at once gets
**3 heavy squadrons + 3 junks** out; waiting two hours loses **every deep-draft hull**. That
half-hour margin is the decision the battle was always supposed to be about.

**The lesson: an A/B test showing no difference is evidence about the world, not a reason to keep
tuning.** Two of my three thresholds were also wrong on their own terms — they compared water
level against a hull plus a flat margin and fired only after the fleet had already grounded. What
strands a ship is shallow water *over an obstruction*, so once the commander has learned where one
is, that is what the margin is measured against.

### TESTS THAT ASSERTED THE WORSE BEHAVIOUR

Two failed after the fix and both were the test's fault, not the code's:

- `discovering a hazard changes the posture` demanded CAUTIOUS specifically. Freezing in a
  draining channel is the *worse* of the two available responses; it now accepts either reaction.
- `the escape window is real` asserted a delayed fleet escapes with **nobody**. That was only true
  because of the mistiming. It now asserts the real gradient, and measures **which** ships get out
  rather than how many — shallow-draft junks clear at almost any tide, so a hull count hides the
  actual decision.

### WHAT WAS VERIFIED

- `npm test` → **263 tests passing** across four packages, **zero skipped**
- `SIMULATION_VERSION` 0.4.0 → 0.5.0 with the golden fingerprint regenerated in the same commit,
  per the documented process
- The Android test correctly caught a **stale APK** twice during this session — once after the
  input work, once after the simulation change. Rebuilt both times.
- Browser determinism re-verified against the new golden

### BRANCH

`feature/ai-tide`, branched from `main`.

### KNOWN RISKS

- **Still no physical Android device.**
- The AI has no model of the opponent and no formation tactics (AI_COMMANDER_CONTRACT §6).
- TD-07: nothing drives input all the way into the simulation.
- Performance is unprofiled; both battles are 14 units.

### NEXT STEPS

1. **A third battle, or the campaign system** (Phase 13). ADR-008 sets the expectation: mostly
   data, plus whatever general capability its mechanic needs.
2. A physical device pass, if hardware becomes available.

### DO NOT CHANGE

Everything in the earlier sessions still applies, plus:

- **The tide is observable to both sides; obstacles are not.** That is the line that keeps the AI
  honest. `ObservedState.tide` is populated for everyone; `knownObstacles` is filtered.
- **Bạch Đằng's `highWaterAtHour` is load-bearing arithmetic, not feel.** A heavy hull needs 1.62h
  to clear the stake field; the channel must stay open slightly longer than that or the battle
  stops being a decision. The scenario comment shows the working.

---

## SESSION 6 — 2026-08-30

**AI / MODEL:** Claude Opus 5 (Claude Code)

**PHASE AT THE TIME:** Phases 0-12 complete. Touch input done.

### WHAT WAS DONE

Phase 12: touch input and mobile UX (§77).

The important decision was **not to bolt `touchstart` onto the existing handlers**. The old UI
used `mousedown` + `shiftKey` to select and `contextmenu` to order — a finger has neither a right
button nor a shift key, so adding touch events would have produced a mouse interface you poke at.

Instead `src/input.ts` is a new module built on Pointer Events, so mouse, touch and stylus arrive
through the same handlers. The model was redesigned around what a pointer can express:

- tap a unit → select; tap empty ground → **order a move**
- drag → box-select
- long-press a unit → toggle it in the selection (the shift-click of touch)
- right-click → still orders a move, for mouse players

The consequence worth understanding: **tapping empty ground orders a move on every platform**, not
just mobile. On desktop it reads as a shortcut, but it is the only way a finger can give an order,
so making it primary means one code path is exercised by every player rather than a mobile branch
nobody runs.

Layout is genuinely different below 820px rather than merely smaller: controls move *below* the
battlefield within thumb reach, buttons meet the 44px minimum, and `touch-action: none` stops a
drag from panning the page instead of selecting.

### WHAT WAS VERIFIED

- `npm test` → **262 tests passing** across four packages, **zero skipped**
- 24 gesture tests drive real pointer sequences through the handlers, covering `touch`, `mouse`
  and `pen` — a test that only exercised mouse would pass while touch was broken
- 4 browser tests **measure the rendered geometry** at wide and narrow widths, rather than
  asserting that a media query exists. Confirmed: desktop keeps controls above the map
  (topbar top 0, canvas top 65); mobile inverts it (canvas top 0, topbar top 415).
- The layout guard was checked against a deliberately reintroduced regression
- APK rebuilt; its bundle is byte-identical to the desktop one (SHA-256)

### A GOOD FAILURE WORTH NOTING

After the input changes, the Android test failed with "the APK ships the same bundle the desktop
shell loads". That was correct: the APK was **stale**, built before the rewrite. The test caught a
real staleness problem rather than a code problem, which is what it was written for. Rebuilding
fixed it.

Also: the CSP added in Session 5 blocked my first attempt at measuring the layout via an inline
script. The CSP was right and the probe was wrong — the layout test now uses a separate script
file. Worth knowing if you write browser tooling against this app.

### BRANCH

`feature/touch-input`, branched from `main`.

### KNOWN RISKS

- **Still no physical Android device.** Gesture logic, layout geometry and determinism are all
  verified against desktop Chromium, which is the same engine, but real hardware is untested.
- **No test drives input all the way into the simulation** (TD-07). Gestures are tested, the
  layout is measured, but nothing asserts end-to-end that tap-tap actually moves a unit.
- Pinch zoom and pan are deliberately absent — both battles fit one screen.
- The AI still does not read the tide (AI_COMMANDER_CONTRACT §6).
- Performance is unprofiled; both battles are 14 units.

### NEXT STEPS

1. **A third battle, or the campaign system** (Phase 13). ADR-008 sets the expectation for a
   battle: mostly data, plus whatever general capability its mechanic needs.
2. **AI tide awareness**.
3. A physical device pass, if hardware becomes available.

### DO NOT CHANGE

Everything in the earlier sessions still applies, plus:

- **Input stays on one code path.** Pointer Events serve mouse and touch together. A
  touch-specific branch would be a path most players never exercise, which is how mobile support
  rots.
- **`touch-action: none` on the canvas.** Without it, dragging a selection box pans the page.
- **The 44px touch minimum.** A button sized to look neat on a desktop is genuinely hard to hit
  while holding a phone; a browser test enforces it.

---

## SESSION 5 — 2026-08-30

**AI / MODEL:** Claude Opus 5 (Claude Code)

**PHASE AT THE TIME:** Phases 0-11 complete. Desktop and Android both build.

### WHAT WAS DONE

Built the platform shells and, more importantly, **verified the two claims that had been carried
as assumptions since Session 1**: that desktop and Android would agree bit-for-bit, and that the
app could actually be packaged at all.

- `src/testing/fingerprint.ts` — a pure fingerprint of the simulation: 32 RNG draws at 17 decimal
  places, forked stream states, and both battles' complete end state at nine decimal places.
- Two tests compare it against one golden file: one under Node, one in **headless Chromium** after
  a real Vite build. Byte-identical. Chromium is what Android WebView runs, so this is the closest
  check available without a handset.
- `packages/desktop` — Electron shell, deliberately thin. A test launches the real shell and
  asserts the game renders.
- `packages/android` — Capacitor project. **A 3.6 MB debug APK was built** (BUILD SUCCESSFUL,
  82 Gradle tasks), and a test asserts the bundle inside it is byte-identical to the desktop one.

See [ADR-009](DECISIONS/ADR-009-platform-shells.md) and [BUILD.md](BUILD.md).

### THE BUG THIS PHASE EXISTED TO CATCH

**Vite defaults to absolute asset paths** (`/assets/index-xxx.js`). Under `file://` — which is how
both platform shells load the app — that resolves to the filesystem root, so the bundle never
loads and the page renders as an empty shell.

Every browser test passed straight through it, because a dev server serves absolute paths happily.
Only launching the desktop app revealed it. Fixed with `base: './'`, and now guarded twice: a fast
assertion that the built HTML contains no absolute paths, and the Electron launch test that would
catch any other cause of the same symptom. Both were checked against a deliberately reintroduced
regression.

A second finding: the app had no Content Security Policy. It now declares one matching what it
actually does (`default-src 'none'`, no `connect-src` at all), so an accidental network dependency
would fail loudly instead of working silently.

### A TRAP WORTH KNOWING ABOUT

`ELECTRON_RUN_AS_NODE=1` is set in this environment — Claude Code is itself an Electron app. With
it set, the Electron binary runs your script as **plain Node** and silently never starts the app,
producing a baffling `Cannot read properties of undefined (reading 'whenReady')`. The desktop test
unsets it. If Electron ever behaves as though it is not Electron, check that variable first.

### WHAT WAS VERIFIED

- `npm test` → **233 tests passing** across four packages, **zero skipped**
- `npm run typecheck` → clean; `vite build` → clean
- Determinism: byte-identical between Node and headless Chromium
- Desktop: the real Electron shell launches, renders the briefing, lists both battles, sizes the
  canvas, and logs no console errors
- Android: 3.6 MB APK with valid manifest and dex; its bundle SHA-256 matches the desktop bundle

### BRANCH

`feature/productisation`, branched from `main`.

### KNOWN RISKS

- **No physical Android device has been tested.** The engine is the same Chromium the determinism
  test exercises, but device behaviour, performance and touch are untested on real hardware.
- **Touch input is not designed** (§77). The UI is mouse-oriented; a shrunken desktop layout is
  explicitly not acceptable, so this is real design work.
- The packaged desktop installer (`npm run dist`) has config written but has **not been run**.
- The AI still does not read the tide (AI_COMMANDER_CONTRACT §6).
- Performance is unprofiled; both battles are 14 units.

### NEXT STEPS

1. **Touch input and mobile UX** (Phase 12). The simulation needs no changes — it already accepts
   commands from any source.
2. **AI tide awareness**.
3. A third battle, if more content is wanted.

### DO NOT CHANGE

Everything in the earlier sessions still applies, plus:

- **The built UI must use relative asset paths.** Absolute paths break both platform shells and
  the app renders blank. Two tests guard it.
- **Regenerate `fingerprint.golden.txt` alongside any `SIMULATION_VERSION` bump**, in the same
  commit, so the diff shows which numbers moved.
- **Platform shells stay thin.** No game logic in Electron or Capacitor; if a shell seems to need
  it, it belongs in `sim-core`.

---

## SESSION 4 — 2026-08-30

**AI / MODEL:** Claude Opus 5 (Claude Code)

**PHASE AT THE TIME:** Phases 0-10 complete. Two battles, terrain effects.

### WHAT WAS DONE

Added **Chi Lăng 1427** as the second battle, and with it closed GAP-02 (terrain effects).

The point of this phase was not content. It was to test the §72 extensibility claim, which every
previous handoff recorded as the project's largest untested assumption. The verdict is written up
in [ADR-008](DECISIONS/ADR-008-extensibility-verdict.md).

**Chi Lăng was chosen to be as unlike Bạch Đằng as possible** — land instead of naval, terrain
instead of tide, cavalry instead of ships, 15th century instead of 13th. The roadmap had suggested
Bạch Đằng 938, which shares the tide/stake mechanic; that would have been a much weaker test,
mostly re-running code the first battle already exercised.

### THE VERDICT, HONESTLY

**Substantially confirmed, with one qualification.**

The scenario file is data. No engine file names either battle, nothing branches on scenario
identity, and a test now enforces both — verified against a planted violation. Fog of war, the AI
commander, replay, save/load, what-if, analysis and invariant checking all worked on a
structurally different battle with no modification.

**But one general capability had to be added**: terrain affecting movement and combat did not
exist, because the first battle never needed it. It was already documented as GAP-02. The
addition is generic (`mechanics.terrainEffects`, declared as scenario data like `tide`), inert
where unused (Bạch Đằng is unchanged, asserted by test), and closed a debt the project already
owed. That is the difference between an architecture failing and an architecture having a hole
someone had already written down.

The honest expectation for battle three: mostly data, plus whatever general capability its
mechanic needs. Adding capabilities is fine; adding battle-specific branches is not, and still
has not happened.

### TWO DEFECTS ONE BATTLE HAD HIDDEN

1. **The scenario validator caught a unit placed off the map** (x=12100 on a 12000m map) the very
   first time the new scenario ran. It was written for exactly this and had never fired on new
   content before.
2. **The AI had no concept of holding ground.** With nothing visible to attack, defenders stopped
   wherever the last fight ended — so the Ming column simply walked past the abandoned defile.
   Fixed generally: a defending force now returns to station.

### SCENARIO TUNING — WHAT I LEARNED THE HARD WAY

The first several attempts at balancing Chi Lăng were wrong in instructive ways:

- Strengthening the ambush made Lam Sơn win regardless of play, which is not a game.
- Sweeping Lam Sơn strength from 55% to 100% changed nothing, which was the clue that force size
  was not the lever at all.
- The actual problem was that **marsh spanned the entire valley floor**, so the column paid the
  toll no matter what it did. A trap that cannot be routed around is not a trap.

Leaving firm ground along the northern edge made the route choice the decision, which is the
historical logic. Marsh routes cost the column badly; the firm lane gets it through but runs under
the flanking high ground.

I also had to rewrite one test: it compared final strength between lanes and was unstable, because
units start spread across the valley and a straight march keeps most of them near their own
latitude whatever destination is named. The property that is *actually* true and measurable is
marsh exposure, so that is what it asserts now.

### WHAT WAS VERIFIED

- `npm test` → **224 tests passing** (212 sim-core, 12 game-ui), 0 failed
- `npm run typecheck` → clean in both packages; `vite build` clean (56 KB)
- Cavalry combat power measured at **528 on plain, 185 in marsh** — the mechanic is load-bearing,
  not decorative
- Both battles boot in the real shell under test, including the fallback for an unknown
  `?battle=` parameter
- The no-battle-branches guard was checked adversarially against a planted `scenario.id ===` test

### BRANCH

`feature/second-battle`, branched from `main`.

### KNOWN RISKS

- **No desktop or Android build has ever been attempted.** This is now the last wholly unverified
  area of the project.
- Cross-platform determinism is designed for (uint32 arithmetic) but unchecked on a device.
- The AI still does not read the tide (AI_COMMANDER_CONTRACT §6).
- New: TD-05 — visibility concealment and terrain effects are declared in two separate places.

### NEXT STEPS

1. **Desktop and Android builds** (Phase 11). Electron and Capacitor; the Android SDK is present
   on this machine but unconfigured (`ANDROID_HOME` unset).
2. **AI tide awareness**.
3. A third battle, if more content is wanted.

### DO NOT CHANGE

Everything in the earlier sessions still applies, plus:

- **No engine file may name a battle or branch on scenario identity.** The whole §72 argument
  rests on this and a test enforces it.
- **Terrain effects must stay scenario-declared.** A hard-coded terrain table would reintroduce
  exactly the coupling the mechanic was designed to avoid.

---

## SESSION 3 — 2026-08-30

**AI / MODEL:** Claude Opus 5 (Claude Code)

**PHASE AT THE TIME:** Phases 0-8 complete. AI commander built.

### WHAT WAS DONE

Built the AI commander (`src/ai/commander.ts`) — three layers, reading only `ObservedState`.
See [AI_COMMANDER_CONTRACT.md](AI_COMMANDER_CONTRACT.md).

The interesting part is what fog of war made possible. The Yuan commander is not told where the
stake field is, so it sails into the obstructions for the same reason the historical fleet did.
It then *infers* the hazard from watching its own ships stop dead in open water, records that
inference with the observation behind it, and steers around the area afterwards. It starts
knowing nothing and only learns by losing vessels.

### TWO SCENARIO BUGS THE AI EXPOSED

Both were found by running the AI and reading its decision log — not by tests, which stayed green.

1. **The Yuan objective contradicted its own description.** It read "Break out to sea with the
   fleet intact" but its condition was `ATTRITION` against Đại Việt. The AI read the mechanics
   honestly and charged the defenders instead of running, winning by attrition in 2.3h without
   ever approaching the stakes. Added an `ESCAPE` victory condition so the mechanics match the
   words.

2. **The escape threshold was unattainable.** Only the three shallow-draft junks (38% of the
   fleet) can reliably clear the obstructions once the tide falls, so a 50% threshold meant the
   Yuan could not win by their own stated objective no matter how well they played. But setting it
   *below* 38% was worse — it handed them a victory for saving nothing but the light escorts while
   the whole battle fleet lay wrecked, which is the outcome history records as a catastrophe.
   Kept at 0.5, which now means "at least some heavy squadrons got through", with the reasoning
   written into the scenario.

A third bug was in the AI itself: units stopped 155m short of the escape line and held there,
because `arrivalToleranceM` (250m) was larger than the margin they needed. A threshold objective
has to be satisfied exactly, not approximately.

### WHAT WAS VERIFIED

- `npm test` → **194 tests passing** (186 sim-core, 8 game-ui), 0 failed
- `npm run typecheck` → clean in both packages; `vite build` clean (46 KB)
- The leak guard runs for **both factions at every tick** of AI-vs-AI battles
- The UI guard was checked adversarially: a ground-truth read was planted inside the AI path,
  the guard failed as intended, and it was removed
- Outcome variety across six seeds: **3 Đại Việt wins, 3 Yuan wins**, with 1-3 hazards inferred
  per run. Both sides make real decisions and neither dominates.

### BRANCH

`feature/ai-commander`, branched from `main`.

### KNOWN RISKS

- **The §72 extensibility claim is still unverified.** One battle. This is now the largest
  untested architectural assumption, and Phase 9 exists to settle it.
- The AI does not read the tide, so the Yuan commander does not understand that waiting makes its
  position worse — a competent 13th-century sailor would have. Legitimate to fix (the tide is
  observable to anyone on the water) but not done.
- No desktop or Android build has ever been attempted.
- Cross-platform determinism is designed for but unverified on a device.

### NEXT STEPS

1. **Second battle** (Phase 9). Bạch Đằng 938 is the recommended candidate — it shares the
   tide/stake mechanic family, so it directly tests whether a new battle really is data plus
   config, and it lets the 938 story be told honestly with its unsourced numbers labelled.
2. **Terrain effects** (GAP-02).
3. **AI tide awareness**.

### DO NOT CHANGE

Everything in the earlier sessions still applies, plus:

- **`decide()` must keep taking `ObservedState`.** It is the only thing preventing the AI from
  reading hidden state, and it is enforced by the signature rather than by care.
- **Objectives must match their descriptions and be attainable.** Both failed once; tests now
  assert both.

---

## SESSION 2 — 2026-08-30

**AI / MODEL:** Claude Opus 5 (Claude Code)

**PHASE AT THE TIME:** Phases 0-7 complete. Fog of war implemented.

### WHAT WAS DONE

Closed **GAP-01**, which the previous session flagged as the most important
documentation-vs-reality gap in the project: `mechanics.fogOfWar` was declared `true` in the
Bạch Đằng scenario and no code read it.

Built `packages/sim-core/src/state/observed.ts`:

- `observe(state, faction, scenario, rng, memory)` projects true state into one side's view
- sighting range from a base of 1200 m, modified by terrain (forest conceals to 45%, marsh 70%);
  observers on hills and riverbanks see slightly further
- enemy strength arrives as a **bracketed estimate** that tightens with proximity (INV-24),
  never as the true number
- sighting memory: lost contacts are remembered at their last known position, flagged stale,
  and expire after 24 ticks (two in-world hours)
- obstacle fields are visible only to the faction that placed them — the data already recorded
  `knownToFaction`, nothing had used it
- events are filtered to those a side could plausibly have witnessed
- `assertNoLeaks()` is the executable form of INV-23

Wired it through the UI: the renderer now takes `ObservedState` and never `BattleState`, and the
scripted opponent reads its own observed view.

### THE DESIGN DECISION WORTH KNOWING

The observed types are **structurally different** from the domain types. An `ObservedUnit` has no
morale, fatigue, cohesion, supply or commander, and its strength is a bracket rather than a
number. So passing ground truth where an observation is expected is a *type error*.

That was deliberate. The classic failure mode for fog of war is an AI that quietly reads what it
should not, and it is nearly invisible in review because the code looks reasonable. Making the
types incompatible means the mistake cannot be made by accident.

A second decision: an enemy never seen is **absent** from the observed state, not present as an
`UNKNOWN` placeholder. Knowing that an unseen enemy exists is itself unearned information.

Third: sighting memory lives *outside* `BattleState`, in the caller. Memory belongs to a
commander, not to the battlefield; storing both sides' beliefs in shared state would put each
side's picture where the other could read it.

### WHAT WAS VERIFIED

- `npm test` → **171 tests passing** (164 sim-core, 7 game-ui), 0 failed
- `npm run typecheck` → clean in both packages
- `vite build` → clean, 40 KB bundle
- A leak scan runs `assertNoLeaks` for **both factions at every tick** of a real battle
- The UI fog guards were checked adversarially: a real ground-truth leak was planted into the
  render input, the guard failed as intended, and the leak was removed
- Probed a live battle and confirmed fog behaves: contact is lost at tick 9 (all eight ships go
  stale) and regained at tick 17; estimates diverge from truth (3807 vs 4015 in contact, 909 vs
  2509 when half the fleet is unobserved); the Yuan never learn the stake positions

### BRANCH

`feature/fog-of-war`, branched from `main`.

### KNOWN RISKS

- The §72 extensibility claim ("a new battle is data + config") is **still unverified** — there
  is only one battle. This is now the biggest untested architectural assumption.
- No desktop or Android build has ever been attempted.
- Cross-platform determinism is designed for (uint32 arithmetic) but unverified on a device.
- Fog of war adds an RNG consumer. Observation uses a *separate* seed derived per tick rather
  than drawing from the battle's own stream, so it cannot shift simulation results — but if
  anyone moves observation into `step()`, that must be rechecked or replays will break.

### OPEN QUESTIONS

1. Should the player see a strength estimate *range* rather than the midpoint? Currently the UI
   shows `~N`. The bracket is available and arguably more honest.
2. Messenger delay and misinformation (§18) are unmodelled. The architecture allows them —
   memory is per-commander and timestamped — but nothing needs them yet.
3. Should the human player's own units be fully known? Currently yes, which seems right (they
   report in), but a stricter model would degrade reports from distant detachments.

### NEXT STEPS

1. **AI commander** (Phase 8). Fog of war now makes this honest by construction: the AI is handed
   an `ObservedState` and there is no route back to ground truth. Replace `enemyCommands` in
   `main.ts`.
2. **Second battle** (Phase 9) — the extensibility claim needs testing before more is built on it.
3. **Terrain effects** (GAP-02).

### DO NOT CHANGE

Everything in Session 1's list still applies, plus:

- **Nothing may render or decide from ground truth when fog is on.** The UI takes `ObservedState`;
  tests catch any attempt to widen that back to `BattleState`.
- **Observation must stay pure and outside `step()`**, or it will perturb the simulation RNG and
  break replay.

---

## SESSION 1 — 2026-08-30

**AI / MODEL:** Claude Opus 5 (Claude Code)

**PHASE AT THE TIME:** Phases 0-6 complete. Simulation core, one battle, and a playable browser UI.

### WHAT WAS DONE

Started from an empty repository (git initialised, no commits, remote configured). Built:

1. Historical research and source register, with evidence classes and conflict records
2. Historical accuracy contract, made executable in `history/epistemic.ts`
3. Deterministic seeded RNG with forkable streams
4. Tide model grounded in peer-reviewed estuary measurements
5. Domain model with four-layer data separation
6. 24 state invariants + executable validator
7. Immutable historical baseline (deep-freeze)
8. Scenario contract, validator, and the Bạch Đằng 1288 scenario
9. Simulation engine (pure reducer)
10. Replay, save/load, what-if, battle analysis
11. Full documentation set
12. Playable browser UI (canvas battlefield, orders, tide readout, post-battle analysis)
13. Gameplay rebalancing driven by actually playing it — see below

### WHAT WAS VERIFIED

Run, not assumed:

- `npm test` → **140 tests, all passing** (138 sim-core, 2 game-ui)
- `npm run typecheck` → **clean** in both packages, under `strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- `vite build` → clean, 35 KB bundle; the built page was served and its assets fetched over HTTP
- Full MVP loop executed end to end: scenario validates → battle runs → resolves as a Đại Việt
  victory matching history → analysis produces labelled findings → replay reproduces the battle
  bit-for-bit (`rngState` identical) → what-if flips the result (4 → 8 vessels escaping) while
  leaving the baseline untouched
- The `Math.random` ban test was checked adversarially: a real violation was planted, the test
  failed as intended, the violation was removed

### THE MOST IMPORTANT FINDING

**The excavated, radiocarbon-dated Bạch Đằng stake fields belong to the 1288 battle, not the
famous 938 one.** The 938 troop figures are unsourced — the Wikipedia figure for the Vietnamese
side has no attribution at all, and a widely repeated ship-complement figure is internally
inconsistent (its parts sum to 47 against a stated total of 50).

This changed the choice of first battle. See [ADR-007](DECISIONS/ADR-007-first-vertical-slice.md).
Do not "correct" the vertical slice back to 938 without reading it.

### THE DESIGN BUGS FOUND BY RUNNING, NOT BY TESTING

This is the most transferable lesson from the session. **The test suite was green through every
one of these.** They were found by executing the battle and looking at the numbers.

Round one, found by probing the simulation:

1. Stakes were lethal even at high water (needed 3.3 m, high water is 3.0 m), so the tide decided
   nothing. Obstacle top lowered to 1.0 m.
2. Grounded vessels re-struck the same obstacle every tick.
3. The timescales did not match: the fleet crossed the 6 km map in ~2 h while the tide took ~12 h
   to fall, so it always escaped before the ebb.
4. Battles could end `ONGOING` because no objective was met. Scenarios now declare a `TimeLimit`.

Round two, found by building the UI and playing it — the player turned out to be almost a
spectator, with near-identical outcomes whether they attacked, blocked or did nothing:

5. Engagement range was 150 m on a 6 km map with 100 m cells, so units had to nearly collide to
   fight and trapped vessels were never finished off. Widened to 400 m.
6. Morale fell a flat amount per tick on *any* damage, so formations routed on a timer regardless
   of losses — heavy ships broke at ~93% strength. Morale loss now scales with strength actually
   lost.
7. Trapped vessels sat intact forever if nobody reached them. Added immobilised attrition.
8. The stake field sat where the fleet crossed it in the first 1.3 h, while the channel did not
   close until ~2 h. Obstacles moved downstream, fleet speed retuned: the fleet now needs ~1.6 h
   to reach a channel that closes at ~2 h.
9. Victory was awarded on the time limit regardless of play. `FLEET_NEUTRALISED` no longer counts
   merely-immobilised vessels by default, and the time limit now favours the Yuan — so trapping
   is not winning, and the player must finish the grounded ships.

Measured result across six seeds: passive play wins 0/6, active play wins 5/6 and always destroys
more of the fleet.

**Lesson: run the thing, and look at the numbers rather than the pass/fail.**

### FILES CHANGED

All of them — the repository was empty. See `git log`.

### BRANCH

`main` — pushed to origin, along with `feature/foundation` and `feature/ui`.

Note: the repository had no commits at all when this session began, so `main` was created from
the feature work rather than merged into. History is linear.

### COMMITS

```
945fbb2  Establish project foundation: accuracy contract, deterministic RNG, tide model
29270c6  Add domain model, state invariants and immutable historical baseline
316f680  Add simulation engine, scenario system and the Bach Dang 1288 vertical slice
78aca01  Complete the MVP core loop: replay, save/load, what-if and analysis
66c2b84  Add documentation architecture: contracts, state, roadmap and handoff
73bf827  Add playable browser UI, and fix the gameplay problems it exposed
```

### TESTS RUN / RESULTS

`npm test` — 140 passed (138 sim-core, 2 game-ui), 0 failed. `npm run typecheck` — clean in
both packages. `vite build` — clean. The built page was served and its assets fetched over HTTP.
No skipped or todo tests. No known flakes (the engine is deterministic, so flakes would indicate
a real bug).

### CURRENT WORK

None in progress. Tree is clean, everything committed.

### KNOWN BUGS

None known. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for gaps, limitations and debt.

### KNOWN RISKS

- **GAP-01 is the big one.** `fogOfWar: true` is declared in scenario data and **no code reads
  it**. INV-23/INV-24 are documented and unenforced. Fix this before writing the AI commander, or
  the AI will read ground truth and violate §32/§34 invisibly.
- The §72 extensibility claim ("a new battle is data + config") is **unverified** — there is only
  one battle.
- No build has ever been attempted for desktop or Android.
- Cross-platform determinism is designed for (uint32 arithmetic) but unverified on a device.

### ARCHITECTURAL DECISIONS

- ADR-001 — TypeScript + Node core, Electron + Capacitor targets
- ADR-002 — pure-reducer simulation
- ADR-007 — Bạch Đằng 1288 as the first vertical slice (read this one)

### OPEN QUESTIONS

1. The UI is currently plain TypeScript + canvas with no framework, which has been comfortable at
   this size. If the panels get much richer, revisit — but do not add a framework speculatively.
2. How much historical apparatus belongs during play versus after? Current answer: minimal during
   (briefing + assumptions note), full afterwards (§44 progressive disclosure). Seems right so
   far but has not been tested on a real player.
3. Should Balanced Mode exist at all (§7, §107)? Specified, nothing needs it yet.
4. The scripted opponent in `main.ts` reads full state. That is fine for a placeholder but must
   not survive contact with fog of war — delete it when the AI commander lands.

### NEXT STEPS

1. **Fog of war** (Phase 7), closing GAP-01. Either implement it or remove the flag — a declared
   but ignored mechanic is a lie in the data. Must land before the AI commander.
2. **AI commander** (Phase 8) reading only observed state, replacing the scripted placeholder.
3. **Second battle** (Phase 9) to test the §72 extensibility claim, which is still unverified.
4. **Terrain effects** (Phase 10, GAP-02), so the marsh and tidal flats stop being decorative.

### DO NOT CHANGE

- `step()` must stay pure
- no `Math.random` in `sim-core` (there is a test; do not weaken it)
- the historical baseline stays immutable
- bump `SIMULATION_VERSION` whenever the algorithm changes results
- Bạch Đằng force sizes stay `UNKNOWN` (a test enforces this; no reliable source exists)
- no battle-specific branches in the engine
- invariant violations throw; never self-repair
- passive play must not win Bạch Đằng — the trap holds ships, the player finishes them

### NOTES FOR NEXT AI

The unusual thing about this project is that **historical honesty is enforced by tests**, not by
good intentions. Several tests exist specifically to stop a future contributor from making the
project dishonest — filling in plausible troop numbers, promoting a gameplay assumption to a
fact, letting the analyser generate satisfying narrative. If one of those tests blocks you, the
test is probably right. Read [HISTORICAL_ACCURACY_CONTRACT.md](HISTORICAL_ACCURACY_CONTRACT.md)
before working around it.

Also: the scenario numbers in `bach-dang-1288.ts` look arbitrary but are not. Stake height,
vessel draft, clearance margin, fleet speed, obstacle position and tidal range form one
interlocking system — the fleet needs ~1.6 h to reach a channel that closes at ~2 h, and that gap
*is* the game. Change any one and the others need rechecking. The regression tests will tell you,
but read the comments in that file first; they explain what each number is holding up.

One more thing worth internalising: the tests passed through every design bug listed above. They
are good tests, and they still could not tell that the battle was boring or that the player had
no agency. Build something you can run, run it, and look at the numbers.
