/**
 * What-if scenarios and historical comparison.
 *
 * Master Prompt §3 (what-if mode), §26/§83 (baseline is cloned, never mutated),
 * §30 (historical comparison), §37 (altered vs historical).
 *
 * The rule that governs this whole module: a what-if is a SIMULATION SCENARIO,
 * never a claim about what would have happened. Language matters here, so the
 * comparison output is deliberately phrased as "in this simulation" rather than
 * "history would have gone differently".
 */

import type { BattleScenario } from '../scenario/scenario.ts';
import type { BattleState, FactionId, Unit } from '../domain/types.ts';
import { HistoricalBaseline } from './baseline.ts';
import { canAct } from '../domain/types.ts';

/* ------------------------------------------------------------------ */
/* Variations                                                          */
/* ------------------------------------------------------------------ */

/**
 * A declared change from the historical baseline.
 *
 * Variations are described declaratively rather than applied as arbitrary
 * mutations so that the UI can always state exactly what the player changed
 * (§3: "yếu tố nào thay đổi"), and so the comparison can attribute differences
 * to specific alterations.
 */
export type Variation =
  | {
      readonly kind: 'FORCE_SCALE';
      readonly faction: FactionId;
      /** 1.2 = 20% more strength. */
      readonly multiplier: number;
    }
  | {
      readonly kind: 'TIDE_SHIFT';
      /** Hours to shift high water by. Positive delays the ebb. */
      readonly shiftHours: number;
    }
  | {
      readonly kind: 'REMOVE_OBSTACLES';
      readonly fieldId: string;
    }
  | {
      readonly kind: 'UNIT_DRAFT';
      readonly faction: FactionId;
      readonly multiplier: number;
    };

export function describeVariation(v: Variation): string {
  switch (v.kind) {
    case 'FORCE_SCALE':
      return `${v.faction} strength ×${v.multiplier}`;
    case 'TIDE_SHIFT':
      return `high water shifted by ${v.shiftHours >= 0 ? '+' : ''}${v.shiftHours}h`;
    case 'REMOVE_OBSTACLES':
      return `obstacle field "${v.fieldId}" removed`;
    case 'UNIT_DRAFT':
      return `${v.faction} vessel draft ×${v.multiplier}`;
  }
}

/**
 * Build a what-if scenario by cloning the baseline and applying variations.
 *
 * The baseline is never touched (INV-16). The result is marked with a derived
 * id and version so that any state or replay produced from it can never be
 * confused with the historical scenario (INV-17).
 */
export function createWhatIf(
  baseline: HistoricalBaseline<BattleScenario>,
  variations: readonly Variation[],
): BattleScenario {
  const scenario = baseline.fork();

  const units: Unit[] = scenario.initialUnits.map((u) => ({ ...u }));
  let mechanics = { ...scenario.mechanics };

  for (const v of variations) {
    switch (v.kind) {
      case 'FORCE_SCALE': {
        for (let i = 0; i < units.length; i++) {
          const u = units[i]!;
          if (u.faction !== v.faction) continue;
          const strength = Math.max(1, Math.round(u.strength * v.multiplier));
          units[i] = { ...u, strength, initialStrength: strength };
        }
        break;
      }
      case 'UNIT_DRAFT': {
        for (let i = 0; i < units.length; i++) {
          const u = units[i]!;
          if (u.faction !== v.faction || u.draftM === undefined) continue;
          units[i] = { ...u, draftM: u.draftM * v.multiplier };
        }
        break;
      }
      case 'TIDE_SHIFT': {
        if (mechanics.tide) {
          mechanics = {
            ...mechanics,
            tide: {
              ...mechanics.tide,
              highWaterAtHour: mechanics.tide.highWaterAtHour + v.shiftHours,
            },
          };
        }
        break;
      }
      case 'REMOVE_OBSTACLES': {
        mechanics = {
          ...mechanics,
          obstacleFields: (mechanics.obstacleFields ?? []).filter((f) => f.id !== v.fieldId),
        };
        break;
      }
    }
  }

  return {
    ...scenario,
    // A what-if is NOT the historical scenario, and its id says so. Anything
    // derived from it carries the marker into saves, replays and comparisons.
    id: `${scenario.id}__WHATIF`,
    version: `${scenario.version}+whatif`,
    initialUnits: units,
    mechanics,
    gameplayAssumptions: [
      ...scenario.gameplayAssumptions,
      `WHAT-IF: this scenario is counterfactual. Changes from history: ${variations
        .map(describeVariation)
        .join('; ')}.`,
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Comparison (§30)                                                    */
/* ------------------------------------------------------------------ */

export interface ForceSummary {
  readonly faction: FactionId;
  readonly survivingStrength: number;
  readonly initialStrength: number;
  readonly lossFraction: number;
  readonly unitsLost: number;
  readonly unitsTotal: number;
}

export function summariseForces(state: BattleState): ForceSummary[] {
  const byFaction = new Map<FactionId, Unit[]>();
  for (const u of state.units) {
    const list = byFaction.get(u.faction) ?? [];
    list.push(u);
    byFaction.set(u.faction, list);
  }

  return [...byFaction.entries()].map(([faction, units]) => {
    const initialStrength = units.reduce((s, u) => s + u.initialStrength, 0);
    const survivingStrength = units.filter(canAct).reduce((s, u) => s + u.strength, 0);
    return {
      faction,
      survivingStrength,
      initialStrength,
      lossFraction: initialStrength === 0 ? 0 : 1 - survivingStrength / initialStrength,
      unitsLost: units.filter((u) => !canAct(u)).length,
      unitsTotal: units.length,
    };
  });
}

export interface HistoricalComparison {
  /** Who history records as the victor. */
  readonly historicalVictor: FactionId;
  /** Who won in this simulation, if anyone. */
  readonly simulatedVictor: FactionId | null;
  readonly matchesHistory: boolean;
  readonly variations: readonly string[];
  readonly forces: readonly ForceSummary[];
  readonly durationHours: number;
  /**
   * Plain-language summary. Deliberately hedged: a simulation result is not a
   * historical counterfactual claim (§3).
   */
  readonly summary: string;
}

export function compareWithHistory(
  state: BattleState,
  scenario: BattleScenario,
  variations: readonly Variation[] = [],
): HistoricalComparison {
  const historicalVictor = scenario.historicalOutcome.victor;
  const simulatedVictor = state.outcome.kind === 'DECIDED' ? state.outcome.victor : null;
  const matchesHistory = simulatedVictor === historicalVictor;

  const variationText = variations.map(describeVariation);

  let summary: string;
  if (simulatedVictor === null) {
    summary =
      'This simulation ended without a decision. History records a different, decisive result. ' +
      'A simulation that does not resolve tells you about the model and the orders given, not about the past.';
  } else if (matchesHistory && variations.length === 0) {
    summary =
      'This simulation reached the same victor as the historical record. That is consistent with ' +
      'the historical account, but it is not evidence for any particular explanation of it.';
  } else if (matchesHistory) {
    summary =
      `Despite the changes made (${variationText.join('; ')}), this simulation still ended with the ` +
      'same victor as history. Within this model the alteration was not decisive.';
  } else {
    summary =
      `In this simulation the outcome differed from the historical record (${variationText.join('; ')}). ` +
      'This shows how the model responds to that change. It is not a claim about what would actually ' +
      'have happened.';
  }

  return {
    historicalVictor,
    simulatedVictor,
    matchesHistory,
    variations: variationText,
    forces: summariseForces(state),
    durationHours: state.elapsedHours,
    summary,
  };
}
