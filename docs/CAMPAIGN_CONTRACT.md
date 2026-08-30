# CAMPAIGN CONTRACT

Master Prompt §36 (single battle → campaign), §37 (historical vs. player-altered lines kept
distinct). Implemented in `packages/sim-core/src/campaign/campaign.ts`.

## 1. The rule that matters

**The moment a campaign departs from the historical record, it must say so — and keep saying so.**

A player who wins a battle history records as a defeat has not corrected the record. They have
started a counterfactual, and every battle after that point is downstream of a fiction.

`CampaignState.divergence` is therefore one-way:

```
HISTORICAL ──(a result contradicts the record)──▶ DIVERGED
```

There is **no route back**, and no API for one. Winning the *next* battle "correctly" does not
restore the historical line, because the campaign that was actually played still went the other
way. A test asserts the state exposes nothing resembling a reset.

The divergence record keeps the battle where it happened, what history says, and what actually
occurred — so the player can be told precisely where the line was crossed.

## 2. Labelling

| Divergence | Label shown |
|---|---|
| `HISTORICAL` | `HISTORICAL CAMPAIGN` |
| `DIVERGED` | `WHAT-IF CAMPAIGN` |

A counterfactual campaign is never shown under the historical one's name (§43, §85). The summary
text is hedged the same way what-if comparisons are: it describes what *this model* did, never
what would have happened.

Completing a fully historical campaign is also hedged — reaching the same victors is "consistent
with the account", not evidence for any particular explanation of it.

## 3. What carries forward

Deliberately little, and each step must say what and why.

```ts
carryForward: {
  lossPersistence: 0..1,      // how much of the losses persist
  minStrengthFraction: 0..1,  // floor, so a bad result cannot make a battle unwinnable
  appliesTo?: FactionId[],    // which sides it applies to; omit for everyone
  note: string,               // required when persistence > 0
}
```

`appliesTo` matters more than it looks. Carry-forward is **rarely symmetric**, and the asymmetry
is usually the historically interesting part: in the Lam Sơn campaign the Ming carry losses
forward while Lam Sơn do not, because Lam Sơn were recruiting and reinforcing throughout 1427.

It exists because a test caught the absence of it. Both battles of that campaign use the faction
id `lam-son`, so an unscoped rule silently carried Lam Sơn losses into Chi Lăng — the opposite of
what the campaign's own notes claimed. The prose and the behaviour disagreed, and the behaviour
was wrong.

Only **strength** carries. Morale, supply and commander state do not: the gap between engagements
is months or centuries, the sources say nothing about how forces recovered, and inventing a
recovery model would be fabricated precision (§87).

The floor exists because a campaign that becomes impossible two steps in is a worse simulation,
not a more realistic one.

`applyCarryForward` returns a **new** scenario, re-identified as `..._CAMPAIGN` / `...+campaign`,
and never mutates the shared battle definition — the same rule what-if follows (§26, §81).
Otherwise a second playthrough would begin from the first one's damage.

## 4. Validation (§94)

A campaign will not run if it references an unknown battle, has out-of-range carry-forward values,
claims a link between battles as `VERIFIED_FACT` without citing anything, or declares no sources.
Carrying losses forward without explaining why is a warning: it is a modelling choice and should
be stated.

## 5. The shipped campaign is honest about what it is not

`RESISTANCE` links Bạch Đằng (1288) and Chi Lăng (1427) — **139 years apart**, different
dynasties, different invaders, no shared army or commander.

Calling that an operational campaign would be a lie about the history. It is explicitly
**thematic**: battles that pose the same tactical problem, presented in order, with `briefing` and
`gameplayAssumptions` saying plainly that no army marched from one to the other.

Consequently `lossPersistence` is **0** at every step. The carry-forward machinery exists and is
tested against a synthetic operational campaign, but the shipped one does not use it, and a test
asserts it never starts to.

## 6. The operational campaign

`LAM_SON_1426` is the counterpart: **Tốt Động – Chúc Động (Nov 1426) → Chi Lăng (Oct 1427)**,
eleven months apart in one war, under one leader, with a **causal** link rather than a thematic
one:

> Wang Tong is beaten at Tốt Động → he withdraws to Đông Quan → Lê Lợi besieges him → the Ming
> send Liễu Thăng's relief column to break the siege → that column marches into Chi Lăng.

Chi Lăng happens *because* Tốt Động happened, which is what makes carrying losses forward
defensible here and indefensible in `RESISTANCE`.

**The limit of what is claimed.** The Chi Lăng column was a fresh army from Guangxi, not the force
beaten at Tốt Động. So persistence is **partial (0.4) with a 0.7 floor**, applied to the Ming
only, and the step note says exactly why: a Ming position that collapsed more badly in 1426 is one
committing its relief force under more pressure in 1427. That is a gameplay judgement about
strategic pressure, labelled as one — not a claim about logistics.

Measured behaviour: a Ming force ending Tốt Động at 90% strength arrives at Chi Lăng at ×0.96;
at 30% it arrives at ×0.72; below that the floor holds it at ×0.70 so the second battle stays
winnable. Lam Sơn stay at ×1.00 regardless.
