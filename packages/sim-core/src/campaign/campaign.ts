/**
 * Campaign system.
 *
 * Master Prompt §36 (single battle → campaign), §37 (historical vs.
 * player-altered campaign lines kept distinct), §9 (versioning), §27 (save),
 * §82/§83 (layer discipline).
 *
 * WHAT A CAMPAIGN IS HERE
 *
 * A sequence of battles where the result of one can affect the next. That is
 * the easy half. The hard half is §37, and it is the reason this module exists
 * rather than being a loop in the UI:
 *
 *   **The moment a campaign diverges from history, it must say so, and it must
 *   keep saying so for the rest of its life.**
 *
 * A player who wins a battle history records as a defeat has not corrected the
 * record; they have started a counterfactual. Every battle after that point is
 * downstream of a fiction, and presenting the sequence as though it were the
 * historical campaign would be exactly the dishonesty §43 and §85 forbid.
 *
 * So `CampaignState` carries a `divergence` that can only ever move one way —
 * `HISTORICAL` → `DIVERGED` — and records the battle where it happened. There
 * is deliberately no way to reset it. Replaying the offending battle and
 * winning "correctly" does not restore the historical line, because the
 * campaign that was actually played still went the other way.
 *
 * WHAT CARRIES FORWARD
 *
 * Deliberately little, and only what is defensible. Casualties reduce the
 * strength a faction brings to the next battle, capped so that one bad result
 * cannot make a later scenario unplayable. We do NOT carry morale, supply or
 * commander state between battles: the gap between engagements is months in
 * some campaigns, the sources say nothing about how forces recovered, and
 * inventing a recovery model would be fabricated precision (§87).
 */

import type { FactionId } from '../domain/types.ts';
import type { EpistemicStatus, SourceRef } from '../history/epistemic.ts';
import type { BattleScenario } from '../scenario/scenario.ts';

/* ------------------------------------------------------------------ */
/* Divergence (§37)                                                    */
/* ------------------------------------------------------------------ */

/**
 * Whether the campaign is still following the historical line.
 *
 * One-way. See the module comment for why there is no route back.
 */
export type Divergence =
  | { readonly kind: 'HISTORICAL' }
  | {
      readonly kind: 'DIVERGED';
      /** The battle whose result first departed from the record. */
      readonly atBattleId: string;
      /** What history records for that battle. */
      readonly historicalVictor: FactionId;
      /** What actually happened in this campaign. */
      readonly actualVictor: FactionId | null;
      readonly atStep: number;
    };

export const isDiverged = (d: Divergence): boolean => d.kind === 'DIVERGED';

/* ------------------------------------------------------------------ */
/* Campaign definition                                                 */
/* ------------------------------------------------------------------ */

/**
 * How a battle's result feeds the next one.
 *
 * Kept explicit per step rather than implicit, so a campaign author must state
 * what carries forward instead of inheriting a hidden rule.
 */
export interface CarryForward {
  /**
   * Fraction of losses that persists into later battles, 0..1.
   *
   * 0 means each battle starts fresh (reinforcements arrived, the gap was long).
   * 1 means losses are fully carried. Anything between is a judgement, and the
   * campaign must say why in `note`.
   */
  readonly lossPersistence: number;
  /**
   * Which factions this applies to. Omit to apply it to everyone.
   *
   * Rarely symmetric, and the asymmetry is usually the historically
   * interesting part. In the Lam Sơn campaign the Ming carry losses forward
   * (a beaten position commits its relief force under pressure) while Lam Sơn
   * do not (they were recruiting and reinforcing throughout 1427). Applying
   * one rule to both sides would get the direction of that campaign backwards.
   *
   * This field exists because a test caught exactly that: both battles use the
   * faction id `lam-son`, so an unscoped rule silently carried Lam Sơn losses
   * into Chi Lăng while the campaign's own notes said it did not.
   */
  readonly appliesTo?: readonly FactionId[];
  /**
   * Floor on a faction's strength multiplier, so a bad result degrades the next
   * battle without making it unwinnable. A campaign that can become impossible
   * two steps in is a worse simulation, not a more realistic one.
   */
  readonly minStrengthFraction: number;
  readonly note: string;
}

export interface CampaignStep {
  readonly battleId: string;
  /** Shown before the battle; sets up why this engagement follows the last. */
  readonly linkText: string;
  readonly linkStatus: EpistemicStatus;
  readonly linkSources: readonly SourceRef[];
  readonly carryForward: CarryForward;
}

export interface Campaign {
  readonly id: string;
  /** Bumped whenever the campaign's historical content changes (§9). */
  readonly version: string;
  readonly title: string;
  readonly period: string;
  readonly briefing: string;
  readonly steps: readonly CampaignStep[];
  readonly sources: readonly SourceRef[];
  /** What the campaign as a whole invents. Required, like a scenario's (§4). */
  readonly gameplayAssumptions: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Runtime state                                                       */
/* ------------------------------------------------------------------ */

export interface CampaignBattleResult {
  readonly battleId: string;
  readonly step: number;
  readonly victor: FactionId | null;
  readonly reason: string;
  /** Fraction of starting strength each faction had left. */
  readonly survivingFraction: Readonly<Record<string, number>>;
  /** Seed the battle ran with, so the campaign is reproducible (§23, §27). */
  readonly seed: string;
  readonly simulationVersion: string;
}

export interface CampaignState {
  readonly campaignId: string;
  readonly campaignVersion: string;
  /** Index of the next battle to fight. Equals steps.length when finished. */
  readonly step: number;
  readonly results: readonly CampaignBattleResult[];
  readonly divergence: Divergence;
}

export function startCampaign(campaign: Campaign): CampaignState {
  return {
    campaignId: campaign.id,
    campaignVersion: campaign.version,
    step: 0,
    results: [],
    divergence: { kind: 'HISTORICAL' },
  };
}

export const isComplete = (campaign: Campaign, state: CampaignState): boolean =>
  state.step >= campaign.steps.length;

export function currentStep(campaign: Campaign, state: CampaignState): CampaignStep | null {
  return campaign.steps[state.step] ?? null;
}

/* ------------------------------------------------------------------ */
/* Recording a result                                                  */
/* ------------------------------------------------------------------ */

export class CampaignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CampaignError';
  }
}

/**
 * Record the outcome of the current battle and advance.
 *
 * Pure: returns a new state. The campaign is as replayable as a battle, which
 * matters because a campaign is a longer chain of exactly the same reasoning
 * (§23).
 *
 * `historicalVictor` comes from the scenario, not from the caller's opinion of
 * what should have happened.
 */
export function recordResult(
  campaign: Campaign,
  state: CampaignState,
  scenario: BattleScenario,
  result: Omit<CampaignBattleResult, 'step'>,
): CampaignState {
  if (state.campaignId !== campaign.id) {
    throw new CampaignError(
      `State belongs to campaign ${state.campaignId}, not ${campaign.id}.`,
    );
  }
  if (state.campaignVersion !== campaign.version) {
    // Same reasoning as INV-17: a result is only meaningful against the version
    // of the content it was produced from.
    throw new CampaignError(
      `State was made against campaign version ${state.campaignVersion}, but this build has ${campaign.version}.`,
    );
  }
  if (isComplete(campaign, state)) {
    throw new CampaignError('The campaign is already complete.');
  }

  const step = campaign.steps[state.step]!;
  if (step.battleId !== result.battleId) {
    throw new CampaignError(
      `Step ${state.step} expects battle ${step.battleId}, got ${result.battleId}.`,
    );
  }
  if (scenario.id !== result.battleId) {
    throw new CampaignError(
      `Scenario ${scenario.id} does not match the recorded battle ${result.battleId}.`,
    );
  }

  const recorded: CampaignBattleResult = { ...result, step: state.step };

  // §37: the first departure from the record is permanent.
  const divergence: Divergence =
    state.divergence.kind === 'DIVERGED'
      ? state.divergence
      : result.victor === scenario.historicalOutcome.victor
        ? { kind: 'HISTORICAL' }
        : {
            kind: 'DIVERGED',
            atBattleId: result.battleId,
            historicalVictor: scenario.historicalOutcome.victor,
            actualVictor: result.victor,
            atStep: state.step,
          };

  return {
    ...state,
    step: state.step + 1,
    results: [...state.results, recorded],
    divergence,
  };
}

/* ------------------------------------------------------------------ */
/* Carrying results forward                                            */
/* ------------------------------------------------------------------ */

/**
 * Strength multiplier a faction brings to the current step.
 *
 * Applied to the scenario's units when the battle is set up. Returns 1 when
 * nothing carries forward, so a campaign whose steps declare `lossPersistence:
 * 0` behaves exactly like a sequence of independent battles.
 */
export function strengthMultiplier(
  campaign: Campaign,
  state: CampaignState,
  faction: FactionId,
): number {
  const step = campaign.steps[state.step];
  if (!step) return 1;

  const previous = state.results[state.results.length - 1];
  if (!previous) return 1;

  const surviving = previous.survivingFraction[faction];
  if (surviving === undefined) return 1;

  const { lossPersistence, minStrengthFraction, appliesTo } = step.carryForward;

  // A rule scoped to particular factions leaves everyone else untouched.
  if (appliesTo !== undefined && !appliesTo.includes(faction)) return 1;
  // Interpolate between "fully recovered" (1) and "as depleted as they ended".
  const carried = 1 - (1 - surviving) * lossPersistence;
  return Math.max(minStrengthFraction, Math.min(1, carried));
}

/**
 * Apply carried-forward strength to a scenario.
 *
 * Returns a NEW scenario. The original is untouched, exactly as what-if does —
 * a campaign must not mutate the shared battle definition, or the second
 * playthrough would start from the first one's damage (§26, §81).
 *
 * The result is re-identified so nothing produced from it can be mistaken for
 * the standalone battle (INV-17).
 */
export function applyCarryForward(
  campaign: Campaign,
  state: CampaignState,
  scenario: BattleScenario,
): BattleScenario {
  const multipliers = new Map<string, number>();
  for (const faction of scenario.factions) {
    multipliers.set(faction.id, strengthMultiplier(campaign, state, faction.id));
  }

  const unchanged = [...multipliers.values()].every((m) => m === 1);
  if (unchanged) return scenario;

  const units = scenario.initialUnits.map((u) => {
    const m = multipliers.get(u.faction) ?? 1;
    if (m === 1) return u;
    const strength = Math.max(1, Math.round(u.strength * m));
    return { ...u, strength, initialStrength: strength };
  });

  const applied = [...multipliers.entries()]
    .filter(([, m]) => m !== 1)
    .map(([f, m]) => `${f} ×${m.toFixed(2)}`)
    .join('; ');

  return {
    ...scenario,
    id: `${scenario.id}__CAMPAIGN`,
    version: `${scenario.version}+campaign`,
    initialUnits: units,
    gameplayAssumptions: [
      ...scenario.gameplayAssumptions,
      `CAMPAIGN: forces carried forward from the previous battle (${applied}).`,
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Presentation (§37, §45)                                             */
/* ------------------------------------------------------------------ */

export interface CampaignSummary {
  readonly title: string;
  readonly battlesFought: number;
  readonly battlesTotal: number;
  readonly complete: boolean;
  /** True only while every result has matched the historical record. */
  readonly followsHistory: boolean;
  /**
   * How the campaign must be described to the player. The wording is the point:
   * a diverged campaign is a counterfactual and has to be labelled as one.
   */
  readonly label: string;
  readonly summary: string;
}

export function summariseCampaign(
  campaign: Campaign,
  state: CampaignState,
): CampaignSummary {
  const complete = isComplete(campaign, state);
  const diverged = isDiverged(state.divergence);

  let summary: string;
  if (state.divergence.kind === 'DIVERGED') {
    const d = state.divergence;
    summary =
      `This campaign left the historical record at ${d.atBattleId}, where history records ` +
      `${d.historicalVictor} as the victor and this campaign produced ` +
      `${d.actualVictor ?? 'no decision'}. Everything after that point is a simulation of what ` +
      `this model does with that change — not an account of what would have happened.`;
  } else if (complete) {
    summary =
      'Every battle in this campaign reached the victor the historical record names. That is ' +
      'consistent with the account, but it is not evidence for any particular explanation of it.';
  } else {
    summary =
      `${state.results.length} of ${campaign.steps.length} battles fought, all matching the ` +
      'historical record so far.';
  }

  return {
    title: campaign.title,
    battlesFought: state.results.length,
    battlesTotal: campaign.steps.length,
    complete,
    followsHistory: !diverged,
    // §37: the label is not decoration. A player must never be shown a
    // counterfactual campaign under the name of the historical one.
    label: diverged ? 'WHAT-IF CAMPAIGN' : 'HISTORICAL CAMPAIGN',
    summary,
  };
}

/* ------------------------------------------------------------------ */
/* Validation (§94)                                                    */
/* ------------------------------------------------------------------ */

export interface CampaignProblem {
  readonly severity: 'ERROR' | 'WARNING';
  readonly code: string;
  readonly message: string;
}

/**
 * A campaign must not run if it is structurally broken or historically
 * dishonest — the same bar the scenario validator applies.
 */
export function validateCampaign(
  campaign: Campaign,
  knownBattleIds: readonly string[],
): CampaignProblem[] {
  const problems: CampaignProblem[] = [];
  const err = (code: string, message: string): void => {
    problems.push({ severity: 'ERROR', code, message });
  };
  const warn = (code: string, message: string): void => {
    problems.push({ severity: 'WARNING', code, message });
  };

  if (!campaign.id) err('MISSING_ID', 'Campaign has no id.');
  if (!campaign.version) err('MISSING_VERSION', 'Campaign has no version (§9).');
  if (campaign.steps.length === 0) {
    err('NO_STEPS', 'A campaign needs at least one battle.');
  }

  const known = new Set(knownBattleIds);
  const seen = new Set<string>();

  for (const [i, step] of campaign.steps.entries()) {
    if (!known.has(step.battleId)) {
      err('UNKNOWN_BATTLE', `Step ${i} references unknown battle ${step.battleId}.`);
    }
    if (seen.has(step.battleId)) {
      warn(
        'REPEATED_BATTLE',
        `Battle ${step.battleId} appears more than once; results will overwrite each other in the log.`,
      );
    }
    seen.add(step.battleId);

    const cf = step.carryForward;
    if (cf.lossPersistence < 0 || cf.lossPersistence > 1) {
      err('INVALID_LOSS_PERSISTENCE', `Step ${i} lossPersistence must be in [0,1].`);
    }
    if (cf.minStrengthFraction <= 0 || cf.minStrengthFraction > 1) {
      err('INVALID_MIN_STRENGTH', `Step ${i} minStrengthFraction must be in (0,1].`);
    }
    if (cf.appliesTo !== undefined && cf.appliesTo.length === 0) {
      err(
        'EMPTY_CARRY_FORWARD_SCOPE',
        `Step ${i} declares appliesTo as an empty list, which silently disables carry-forward. Omit it to apply to everyone.`,
      );
    }
    if (cf.lossPersistence > 0 && !cf.note) {
      warn(
        'UNEXPLAINED_CARRY_FORWARD',
        `Step ${i} carries losses forward without saying why. That is a modelling choice and should be stated.`,
      );
    }

    if (step.linkStatus === 'VERIFIED_FACT' && step.linkSources.length === 0) {
      err(
        'LINK_FACT_WITHOUT_SOURCE',
        `Step ${i} claims its connection to the previous battle as fact without citing anything.`,
      );
    }
  }

  if (campaign.sources.length === 0) {
    err('NO_SOURCES', 'Campaign cites no sources (§5).');
  }
  if (campaign.gameplayAssumptions.length === 0) {
    warn(
      'NO_DECLARED_ASSUMPTIONS',
      'Campaign declares no gameplay assumptions. Linking battles is itself a modelling choice; say what it assumes.',
    );
  }

  return problems;
}

export const campaignErrors = (
  problems: readonly CampaignProblem[],
): readonly CampaignProblem[] => problems.filter((p) => p.severity === 'ERROR');

export function assertCampaignValid(
  campaign: Campaign,
  knownBattleIds: readonly string[],
): void {
  const errors = campaignErrors(validateCampaign(campaign, knownBattleIds));
  if (errors.length > 0) {
    throw new CampaignError(
      `Campaign "${campaign.id}" is invalid:\n` +
        errors.map((e) => `  [${e.code}] ${e.message}`).join('\n'),
    );
  }
}
