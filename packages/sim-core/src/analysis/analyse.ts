/**
 * Post-battle analysis.
 *
 * Master Prompt §29 (analysis must distinguish observed / inferred /
 * speculative), §35 (explanations must reflect real decision data), §90 (log).
 *
 * The hard rule here: every finding must be DERIVED FROM THE BATTLE LOG, not
 * generated as plausible narrative. An `OBSERVED` finding must be a fact about
 * what the engine recorded; `INFERRED` may combine observations with the
 * model's own rules; `SPECULATIVE` is explicitly marked as conjecture.
 *
 * It is much easier to write a system that produces satisfying prose than one
 * that produces true statements. This module is built so that every claim can
 * be traced back to a counted event or a measured quantity.
 */

import type { BattleState, FactionId, Unit } from '../domain/types.ts';
import type { BattleScenario } from '../scenario/scenario.ts';
import { canAct, isWaterborne } from '../domain/types.ts';
import { evaluateTide } from '../sim/tide.ts';

export type FindingConfidence = 'OBSERVED' | 'INFERRED' | 'SPECULATIVE';

export interface Finding {
  readonly confidence: FindingConfidence;
  readonly text: string;
  /** Supporting numbers, so a reader can check the claim. */
  readonly evidence?: Readonly<Record<string, number | string>>;
}

export interface BattleAnalysis {
  readonly outcome: string;
  readonly durationHours: number;
  readonly findings: readonly Finding[];
  /** Full simulation log for inspection (§90, §92). */
  readonly keyEvents: readonly string[];
}

const factionUnits = (state: BattleState, f: FactionId): Unit[] =>
  state.units.filter((u) => u.faction === f);

const lossFraction = (units: readonly Unit[]): number => {
  const initial = units.reduce((s, u) => s + u.initialStrength, 0);
  if (initial === 0) return 0;
  const surviving = units.filter(canAct).reduce((s, u) => s + u.strength, 0);
  return 1 - surviving / initial;
};

/**
 * Analyse a finished (or abandoned) battle.
 *
 * Every finding below is computed from state and the event log. Nothing is
 * asserted that cannot be recomputed from them.
 */
export function analyseBattle(state: BattleState, scenario: BattleScenario): BattleAnalysis {
  const findings: Finding[] = [];

  /* --- Outcome (OBSERVED) --- */

  const outcomeText =
    state.outcome.kind === 'DECIDED'
      ? `Victory: ${state.outcome.victor} — ${state.outcome.reason}`
      : state.outcome.kind === 'DRAW'
        ? `Draw — ${state.outcome.reason}`
        : 'Undecided when the simulation ended';

  /* --- Obstacle strikes (OBSERVED, counted from the log) --- */

  const strikeEvents = state.events.filter((e) => /struck/.test(e.message));
  if (strikeEvents.length > 0) {
    findings.push({
      confidence: 'OBSERVED',
      text: `${strikeEvents.length} vessel strike(s) on obstacles were recorded.`,
      evidence: { strikes: strikeEvents.length, firstAtTick: strikeEvents[0]!.tick },
    });

    // INFERRED: the engine's own rule says a strike requires insufficient
    // clearance, so we can state the mechanism — but it is a statement about
    // the model, not about 1288.
    const tideConfig = scenario.mechanics.tide;
    if (tideConfig) {
      const firstStrikeTick = strikeEvents[0]!.tick;
      const hoursPerTick = state.tick > 0 ? state.elapsedHours / state.tick : 0;
      const tideAtStrike = evaluateTide(tideConfig, firstStrikeTick * hoursPerTick);
      findings.push({
        confidence: 'INFERRED',
        text:
          'Vessels struck because falling water left insufficient clearance over the obstacles ' +
          'for their draft. In this model that is the mechanism, by rule.',
        evidence: {
          waterLevelAtFirstStrike: Number(tideAtStrike.levelM.toFixed(2)),
          tidePhase: tideAtStrike.phase,
        },
      });
    }
  } else if (scenario.mechanics.obstacleFields?.length) {
    findings.push({
      confidence: 'OBSERVED',
      text: 'No vessel struck the obstacle field during this battle.',
    });
  }

  /* --- Routs (OBSERVED) --- */

  const routEvents = state.events.filter((e) => /routed/.test(e.message));
  if (routEvents.length > 0) {
    findings.push({
      confidence: 'OBSERVED',
      text: `${routEvents.length} unit(s) broke and routed.`,
      evidence: { routs: routEvents.length },
    });
  }

  /* --- Losses per faction (OBSERVED) --- */

  for (const faction of scenario.factions) {
    const units = factionUnits(state, faction.id);
    if (units.length === 0) continue;
    const loss = lossFraction(units);
    findings.push({
      confidence: 'OBSERVED',
      text: `${faction.name} lost ${(loss * 100).toFixed(0)}% of its starting strength.`,
      evidence: {
        lossPercent: Number((loss * 100).toFixed(1)),
        unitsDestroyed: units.filter((u) => u.status === 'DESTROYED').length,
        unitsImmobilised: units.filter((u) => u.status === 'IMMOBILISED').length,
      },
    });
  }

  /* --- Immobilisation as a decisive factor (INFERRED) --- */

  for (const faction of scenario.factions) {
    const fleet = factionUnits(state, faction.id).filter((u) => isWaterborne(u.kind));
    if (fleet.length === 0) continue;
    const stuck = fleet.filter((u) => u.status === 'IMMOBILISED').length;
    const lost = fleet.filter((u) => u.status === 'DESTROYED').length;
    if (stuck + lost === 0) continue;

    if ((stuck + lost) / fleet.length >= 0.5) {
      findings.push({
        confidence: 'INFERRED',
        text:
          `Most waterborne units of ${faction.name} were immobilised or destroyed. Immobilised ` +
          'vessels take ' +
          'greatly increased damage in this model, so being caught was likely decisive here.',
        evidence: { immobilised: stuck, destroyed: lost, fleetSize: fleet.length },
      });
    }
  }

  /* --- Timing (SPECULATIVE — clearly marked) --- */

  if (strikeEvents.length > 0 && scenario.mechanics.tide) {
    findings.push({
      confidence: 'SPECULATIVE',
      text:
        'Had the fleet moved earlier in the tidal cycle it might have cleared the obstacles. ' +
        'This is conjecture about this simulation — run a what-if to test it rather than assuming it.',
    });
  }

  return {
    outcome: outcomeText,
    durationHours: state.elapsedHours,
    findings,
    keyEvents: state.events.map((e) => `t${e.tick}: ${e.message}`),
  };
}
