# HISTORICAL ACCURACY CONTRACT

The most important contract in this project (Master Prompt §4). Everything else can be
refactored; violating this makes the product dishonest.

## 1. The epistemic ladder

Every historical statement carries exactly one `EpistemicStatus`:

```
VERIFIED_FACT          Supported by strong sources. Safe to state plainly.
SUPPORTED_INTERPRETATION  Scholarly reading of evidence; reasonable, not certain.
UNCERTAIN              Sources conflict, or evidence is thin. Must show the doubt.
GAMEPLAY_ASSUMPTION    Invented because the simulation needs a value. NOT history.
FICTIONAL              What-if / player-authored. Explicitly counterfactual.
```

**Rules:**

- A claim may never be *promoted* silently. Promotion requires a source added to
  [HISTORICAL_SOURCES.md](HISTORICAL_SOURCES.md) and a scenario version bump.
- Demotion (finding out we were overconfident) is always allowed and always logged.
- Anything not explicitly classified defaults to `GAMEPLAY_ASSUMPTION`. **Absence of a
  classification never means "fact".** The scenario validator enforces this.
- UI must visually distinguish at minimum: fact / uncertain / gameplay / fictional.

## 2. Numeric uncertainty

Historical quantities are NOT plain numbers (§6). The domain type is:

```
EXACT      { value }                      a genuinely known count
ESTIMATED  { value, plusMinus }           a scholarly central estimate
RANGE      { min, max }                   sources bracket it
DISPUTED   { candidates[], each sourced } sources actively disagree
UNKNOWN    { }                            we do not know
```

Every one carries `confidence: HIGH | MEDIUM | LOW | UNKNOWN` and `sources[]`.

A `RANGE` must never be silently collapsed to its midpoint for display. The simulation may
*sample* a range to get a runnable number — but the sampled value is a
`SIMULATION_PARAMETER`, and the UI must be able to show the range it came from.

## 3. Forbidden

Directly from Master Prompt §43, §86, §87:

- **No fabricated quotes.** No line may be attributed to Tran Hung Dao, Ngo Quyen, Le Loi,
  Quang Trung or any historical person without a cited source. Flavour text must be authored
  in the game's own narrator voice, never in a historical figure's mouth.
- **No fabricated numbers presented as history.** Troop counts, casualties, dates, distances
  invented for gameplay are labelled `GAMEPLAY_ASSUMPTION` or `SIMULATION_PARAMETER`.
- **No balance-motivated history edits.** If the historical situation is lopsided, Historical
  Mode keeps it lopsided (§7). Balance belongs in Balanced Mode, explicitly.
- **No anachronism.** Equipment and unit types are constrained by the scenario's period (§14).
- **No AI-generated claim entering Historical Mode unreviewed** (§40, §85).

## 4. Commander and unit statistics are abstractions

`leadership: 88` is a **game system variable**, not a historical measurement (§15, §42, §88).

The UI must never render such a number in a way implying historical consensus. These are
presented as game ratings, visibly separated from sourced historical content. We do not publish
a numeric ranking of real people's competence and call it history.

## 5. Historical vs. simulated events

Four distinct kinds, never merged in storage or display (§11):

```
HISTORICAL_EVENT      recorded as having happened, with sources
PLAYER_TRIGGERED      the player did this in a session
SIMULATION_EVENT      emerged from the engine
FICTIONAL_EVENT       what-if content
```

A simulation event is never written into the historical record. The historical baseline is
immutable at runtime (§26, §81).

## 6. Analysis language

Post-battle analysis (§29) must mark each statement `OBSERVED` / `INFERRED` / `SPECULATIVE`,
and must not claim a single certain cause. `OBSERVED` statements must be derivable from the
battle log; `INFERRED` may combine observations; `SPECULATIVE` is explicitly flagged as such.

## 7. Respect

Historical figures are treated as real people, in context, with uncertainty acknowledged (§88).
Honouring them through gameplay is welcome; inventing history to flatter them is not. A player
should leave the game *more* curious about the real history and better equipped to tell
evidence from story.

## 8. Enforcement

This contract is executable, not aspirational:

- Scenario validator rejects claims lacking `EpistemicStatus` (§94).
- Claims marked `VERIFIED_FACT` with zero sources are a validation **error**.
- The historical baseline is deep-frozen at load; mutation attempts throw (§26, §95).
- Tests assert the freeze and the classification rules.

> If a future change makes it easier to state something as fact than to state it honestly,
> the change is wrong.
