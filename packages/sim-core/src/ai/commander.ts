/**
 * AI Commander.
 *
 * Master Prompt §31 (a gameplay agent, not a chatbot), §32 (acts on observable
 * state), §33 (strategic → operational → tactical), §34 (obeys the rules like
 * any player), §35 (explanations must reflect real decision data).
 *
 * THE CONSTRAINT THAT SHAPES THIS FILE
 *
 * `decide()` takes an `ObservedState`. It has no parameter through which the
 * true `BattleState` could arrive, so the AI cannot read hidden information
 * even by mistake — §34's "AI is a player, not an admin" is enforced by the
 * signature rather than by discipline.
 *
 * That has real consequences for behaviour, and they are the interesting part.
 * The Yuan commander does not know where the stake field is, because nobody
 * told it and it cannot see underwater. It sails into the obstructions for the
 * same reason the historical fleet did: the route to the sea runs through them
 * and there is no visible reason not to take it. When ships start grounding, it
 * *infers* danger from what it can observe — vessels stopping dead in open
 * water — and reacts. That inference is recorded, so the post-battle
 * explanation can say what the AI actually believed rather than a plausible
 * story invented afterwards.
 *
 * THREE LAYERS (§33)
 *
 *   Strategic   — what am I trying to achieve? (break out / destroy / hold)
 *   Operational — what does that mean on this ground right now?
 *   Tactical    — what does each unit do this tick?
 *
 * Each layer records its reasoning into a decision log.
 */

import {
  type Unit,
  type UnitId,
  type FactionId,
  type Position,
  canAct,
  isWaterborne,
  distance,
} from '../domain/types.ts';
import type { BattleScenario } from '../scenario/scenario.ts';
import type { ObservedState, ObservedUnit } from '../state/observed.ts';
import { estimateOf } from '../state/observed.ts';
import type { Command } from '../sim/engine.ts';
import type { Rng } from '../sim/rng.ts';

/* ------------------------------------------------------------------ */
/* Decision record (§35, §89)                                          */
/* ------------------------------------------------------------------ */

export type DecisionLayer = 'STRATEGIC' | 'OPERATIONAL' | 'TACTICAL';

/**
 * One recorded decision.
 *
 * `basis` holds the observations the choice was actually made from. Post-battle
 * explanation reads these rather than composing a nice-sounding narrative, which
 * is what §35 requires: an explanation must reflect the decision data, not
 * decorate it.
 */
export interface Decision {
  readonly tick: number;
  readonly layer: DecisionLayer;
  readonly summary: string;
  readonly basis: Readonly<Record<string, string | number | boolean>>;
  readonly unitIds?: readonly UnitId[];
}

/* ------------------------------------------------------------------ */
/* Strategy                                                            */
/* ------------------------------------------------------------------ */

/**
 * What the commander is trying to do at the highest level.
 *
 * Derived from the scenario's own objectives, not hard-coded per battle — the
 * same discipline §38 applies to the engine applies here. A new scenario with
 * different objectives gets sensible AI behaviour without touching this file.
 */
export type Strategy =
  /** Get the force off the map / to a goal region. */
  | { readonly kind: 'BREAK_OUT'; readonly toward: Position }
  /** Destroy or neutralise a fraction of the enemy. */
  | { readonly kind: 'DESTROY_ENEMY' }
  /** Deny the enemy their objective and survive. */
  | { readonly kind: 'HOLD' };

export type Posture = 'RUN' | 'FIGHT' | 'CAUTIOUS' | 'REGROUP';

export interface AiState {
  /** Everything the commander has decided, in order. */
  readonly decisions: readonly Decision[];
  /**
   * Where each unit began the battle.
   *
   * A defending force that has driven off what it could see must go back to the
   * ground it is holding, not stand around where the last fight happened. At
   * Chi Lăng that distinction decides the battle: ambushers who wander down the
   * valley after a broken vanguard leave the defile open for the column behind
   * to walk through.
   */
  readonly stations: Readonly<Record<string, Position>>;
  /**
   * Positions where the commander has observed vessels inexplicably stop.
   * This is the AI *inferring* a hazard it cannot see — the closest it can
   * legitimately get to knowing about the stake field.
   */
  readonly suspectedHazards: readonly Position[];
  readonly posture: Posture;
}

export const initialAiState = (): AiState => ({
  decisions: [],
  stations: {},
  suspectedHazards: [],
  posture: 'RUN',
});

/* ------------------------------------------------------------------ */
/* Tuning                                                              */
/* ------------------------------------------------------------------ */

/** SIMULATION PARAMETERS (§42), gathered so they can be tuned in one place. */
export const AI_TUNING = {
  /** Below this fraction of starting strength, the commander stops pressing. */
  regroupStrengthFraction: 0.35,
  /** Force ratio above which the AI is willing to close and fight. */
  favourableRatio: 1.3,
  /** How far to steer around a suspected hazard, in metres. */
  hazardAvoidanceM: 500,
  /** Radius within which a new grounding is treated as the same hazard. */
  hazardClusterM: 400,
  /** Distance at which a unit is considered "at" its objective. */
  arrivalToleranceM: 250,
} as const;

/* ------------------------------------------------------------------ */
/* Layer 1: strategy                                                   */
/* ------------------------------------------------------------------ */

/**
 * Read the commander's own objective out of the scenario.
 *
 * The AI is told what it is trying to achieve by the same data that tells the
 * player, so it cannot be handed a secret goal.
 */
function chooseStrategy(
  observed: ObservedState,
  scenario: BattleScenario,
): { strategy: Strategy; basis: Record<string, string | number | boolean> } {
  const mine = scenario.objectives.filter((o) => o.faction === observed.faction);

  for (const objective of mine) {
    const c = objective.condition;

    if (c.kind === 'ESCAPE') {
      // The objective is to leave, not to win a fight. Reading this correctly
      // is what makes the AI sail for the sea -- and therefore into the
      // obstructions -- rather than turning to slug it out.
      return {
        strategy: {
          kind: 'BREAK_OUT',
          toward: { x: c.beyondX, y: 0 },
        },
        basis: { objective: objective.id, condition: c.kind, escapeBeyondX: c.beyondX },
      };
    }
    if (c.kind === 'ATTRITION' || c.kind === 'FLEET_NEUTRALISED') {
      return {
        strategy: { kind: 'DESTROY_ENEMY' },
        basis: { objective: objective.id, condition: c.kind },
      };
    }
    if (c.kind === 'SURVIVE_UNTIL') {
      return {
        strategy: { kind: 'HOLD' },
        basis: { objective: objective.id, untilHours: c.hours },
      };
    }
  }

  // No objective of our own that we can pursue directly. If the scenario's time
  // limit favours us, holding is enough; otherwise we must force a decision.
  // For a force whose objective is to leave, "leave" means the far edge of the
  // map from where it started — inferred, not hard-coded per battle.
  const own = observed.own.filter(canAct);
  const meanX = own.length
    ? own.reduce((s, u) => s + u.position.x, 0) / own.length
    : 0;
  const mapWidthM = scenario.terrain.widthCells * scenario.terrain.cellSizeM;
  const towardX = meanX > mapWidthM / 2 ? 0 : mapWidthM;

  return {
    strategy: {
      kind: 'BREAK_OUT',
      toward: { x: towardX, y: own.length ? own[0]!.position.y : 0 },
    },
    basis: {
      reason: 'no directly pursuable objective; withdrawing off the map',
      towardX,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Layer 2: operational                                                */
/* ------------------------------------------------------------------ */

interface Assessment {
  readonly ownStrength: number;
  readonly ownInitial: number;
  readonly enemyEstimate: number;
  readonly contacts: number;
  readonly staleContacts: number;
  readonly ownInTrouble: number;
  readonly enemyInTrouble: number;
}

function assess(observed: ObservedState): Assessment {
  const own = observed.own;
  const active = own.filter(canAct);

  const inContact = observed.enemies.filter((e) => e.inContact);
  const enemyEstimate = inContact.reduce(
    (sum, e) => sum + (estimateOf(e.strength) ?? 0),
    0,
  );

  return {
    ownStrength: active.reduce((s, u) => s + u.strength, 0),
    ownInitial: own.reduce((s, u) => s + u.initialStrength, 0),
    enemyEstimate,
    contacts: inContact.length,
    staleContacts: observed.enemies.length - inContact.length,
    ownInTrouble: own.filter((u) => u.status === 'IMMOBILISED').length,
    enemyInTrouble: inContact.filter((e) => e.apparentStatus === 'IN_TROUBLE').length,
  };
}

/**
 * Choose a posture from the assessment.
 *
 * Note what this reasons from: estimated enemy strength, counts of contacts,
 * and how many of one's own units have stopped moving. All observable. There is
 * no appeal to the true state anywhere, because there is nothing to appeal to.
 */
function choosePosture(
  strategy: Strategy,
  a: Assessment,
): { posture: Posture; reason: string } {
  const strengthFraction = a.ownInitial > 0 ? a.ownStrength / a.ownInitial : 0;

  if (strengthFraction < AI_TUNING.regroupStrengthFraction) {
    return { posture: 'REGROUP', reason: 'own force badly reduced' };
  }

  // Own vessels stopping dead is the signal that something is wrong here, even
  // though the commander cannot see what.
  if (a.ownInTrouble > 0) {
    return { posture: 'CAUTIOUS', reason: 'own vessels have stopped unexpectedly' };
  }

  if (strategy.kind === 'DESTROY_ENEMY') {
    // Enemies visibly in trouble are the opportunity worth taking.
    if (a.enemyInTrouble > 0) {
      return { posture: 'FIGHT', reason: 'enemy units observed to be in difficulty' };
    }
    const ratio = a.enemyEstimate > 0 ? a.ownStrength / a.enemyEstimate : Infinity;
    if (ratio >= AI_TUNING.favourableRatio) {
      return { posture: 'FIGHT', reason: 'estimated force ratio is favourable' };
    }
    return { posture: 'CAUTIOUS', reason: 'estimated force ratio is not favourable' };
  }

  if (strategy.kind === 'HOLD') {
    return { posture: 'FIGHT', reason: 'holding position against attack' };
  }

  return { posture: 'RUN', reason: 'breaking out' };
}

/* ------------------------------------------------------------------ */
/* Hazard inference — the interesting bit                              */
/* ------------------------------------------------------------------ */

/**
 * Infer hazards from observable evidence.
 *
 * The AI cannot see the stake field. What it CAN see is its own vessels coming
 * to a dead stop in open water. Recording those positions and steering around
 * them afterwards is legitimate inference from observation, and it is the
 * honest version of "the AI learns about the trap".
 *
 * Note it only learns by paying for it: the first ships still ground.
 */
function updateHazards(
  observed: ObservedState,
  previous: readonly Position[],
): { hazards: Position[]; discovered: Position[] } {
  const hazards = [...previous];
  const discovered: Position[] = [];

  for (const u of observed.own) {
    if (u.status !== 'IMMOBILISED') continue;

    const known = hazards.some(
      (h) => distance(h, u.position) <= AI_TUNING.hazardClusterM,
    );
    if (!known) {
      hazards.push(u.position);
      discovered.push(u.position);
    }
  }

  return { hazards, discovered };
}

/** Steer a destination clear of known hazards. */
function avoidHazards(
  from: Position,
  to: Position,
  hazards: readonly Position[],
): Position {
  for (const h of hazards) {
    // Does the straight line pass close to the hazard?
    const along = { x: to.x - from.x, y: to.y - from.y };
    const len = Math.hypot(along.x, along.y);
    if (len < 1) continue;

    const t = Math.max(
      0,
      Math.min(1, ((h.x - from.x) * along.x + (h.y - from.y) * along.y) / (len * len)),
    );
    const closest = { x: from.x + along.x * t, y: from.y + along.y * t };

    if (distance(closest, h) < AI_TUNING.hazardAvoidanceM) {
      // Offset perpendicular, away from the hazard.
      const away = { x: closest.x - h.x, y: closest.y - h.y };
      const awayLen = Math.hypot(away.x, away.y) || 1;
      return {
        x: to.x + (away.x / awayLen) * AI_TUNING.hazardAvoidanceM,
        y: to.y + (away.y / awayLen) * AI_TUNING.hazardAvoidanceM,
      };
    }
  }
  return to;
}

/* ------------------------------------------------------------------ */
/* Layer 3: tactical                                                   */
/* ------------------------------------------------------------------ */

/** Nearest observed enemy to a unit, preferring ones in contact. */
function nearestEnemy(unit: Unit, enemies: readonly ObservedUnit[]): ObservedUnit | null {
  let best: ObservedUnit | null = null;
  let bestScore = Infinity;

  for (const e of enemies) {
    if (e.apparentStatus === 'BROKEN') continue;
    // A stale sighting is worth pursuing, but less than a live one.
    const penalty = e.inContact ? 1 : 1.5;
    const score = distance(unit.position, e.position) * penalty;
    if (score < bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

function tacticalOrders(
  observed: ObservedState,
  strategy: Strategy,
  posture: Posture,
  hazards: readonly Position[],
  stations: Readonly<Record<string, Position>>,
): Command[] {
  const commands: Command[] = [];
  const active = observed.own.filter(canAct);
  if (active.length === 0) return commands;

  // Enemies worth attacking: prefer those visibly in difficulty.
  const targets = observed.enemies.filter((e) => e.apparentStatus !== 'BROKEN');
  const troubled = targets.filter((e) => e.apparentStatus === 'IN_TROUBLE');

  for (const unit of active) {
    // A unit that cannot move has nothing useful to be ordered.
    if (unit.status === 'IMMOBILISED') {
      commands.push({ kind: 'HOLD', unitId: unit.id });
      continue;
    }

    if (posture === 'FIGHT') {
      const pool = troubled.length > 0 ? troubled : targets;
      const target = nearestEnemy(unit, pool);
      if (target) {
        commands.push({
          kind: 'MOVE',
          unitId: unit.id,
          to: avoidHazards(unit.position, target.position, hazards),
        });
        continue;
      }

      // Nothing worth attacking in sight. A force whose objective is to deny
      // ground returns to the ground it is denying rather than idling where the
      // last fight ended.
      const station = stations[unit.id];
      if (station && strategy.kind !== 'BREAK_OUT') {
        if (distance(unit.position, station) > AI_TUNING.arrivalToleranceM) {
          commands.push({
            kind: 'MOVE',
            unitId: unit.id,
            to: avoidHazards(unit.position, station, hazards),
          });
        } else {
          commands.push({ kind: 'HOLD', unitId: unit.id });
        }
        continue;
      }
    }

    if (posture === 'REGROUP') {
      // Fall back toward the mean position of the surviving force.
      const meanX = active.reduce((s, u) => s + u.position.x, 0) / active.length;
      const meanY = active.reduce((s, u) => s + u.position.y, 0) / active.length;
      commands.push({
        kind: 'MOVE',
        unitId: unit.id,
        to: avoidHazards(unit.position, { x: meanX, y: meanY }, hazards),
      });
      continue;
    }

    if (strategy.kind === 'BREAK_OUT' || posture === 'RUN' || posture === 'CAUTIOUS') {
      // A force whose objective is to leave keeps pressing for the exit even
      // when cautious -- caution means steering around what it has learned is
      // dangerous, not stopping. Halting in a channel that is still draining is
      // the worst of both worlds: it neither escapes nor avoids the trap.
      const goal =
        strategy.kind === 'BREAK_OUT'
          ? { x: strategy.toward.x, y: unit.position.y }
          : { x: unit.position.x, y: unit.position.y };

      // A break-out line must be CROSSED, not approached. Using the general
      // arrival tolerance here made units stop just short of the escape line
      // and hold there for the rest of the battle -- they got within 155m of
      // safety and then sat still. An objective expressed as a threshold needs
      // to be satisfied exactly.
      const arrived =
        strategy.kind === 'BREAK_OUT'
          ? (strategy.toward.x <= unit.position.x
              ? unit.position.x <= strategy.toward.x
              : unit.position.x >= strategy.toward.x)
          : distance(unit.position, goal) <= AI_TUNING.arrivalToleranceM;

      if (arrived) {
        commands.push({ kind: 'HOLD', unitId: unit.id });
      } else {
        commands.push({
          kind: 'MOVE',
          unitId: unit.id,
          to: avoidHazards(unit.position, goal, hazards),
        });
      }
      continue;
    }

    commands.push({ kind: 'HOLD', unitId: unit.id });
  }

  return commands;
}

/* ------------------------------------------------------------------ */
/* The commander                                                       */
/* ------------------------------------------------------------------ */

export interface AiDecision {
  readonly commands: readonly Command[];
  readonly state: AiState;
}

/**
 * Decide what this faction does on this tick.
 *
 * Pure and deterministic: the same observed state, AI state and RNG produce the
 * same orders, so an AI-driven battle is as replayable as a played one (§23).
 *
 * Takes `ObservedState` — NOT `BattleState`. There is no parameter through
 * which ground truth could arrive.
 */
export function decide(
  observed: ObservedState,
  scenario: BattleScenario,
  ai: AiState,
  _rng: Rng,
): AiDecision {
  const decisions: Decision[] = [...ai.decisions];
  const tick = observed.tick;

  // Record where each unit was first seen under this commander. Done here
  // rather than at construction so the AI needs no separate initialisation
  // step and can be attached to a battle already in progress.
  const stations: Record<string, Position> = { ...ai.stations };
  for (const u of observed.own) {
    if (!(u.id in stations)) stations[u.id] = u.position;
  }

  const record = (
    layer: DecisionLayer,
    summary: string,
    basis: Record<string, string | number | boolean>,
    unitIds?: readonly UnitId[],
  ): void => {
    decisions.push({
      tick,
      layer,
      summary,
      basis,
      ...(unitIds === undefined ? {} : { unitIds }),
    });
  };

  /* --- Hazard inference from observation --- */

  const { hazards, discovered } = updateHazards(observed, ai.suspectedHazards);
  for (const h of discovered) {
    record(
      'OPERATIONAL',
      'Vessels stopped without visible cause; treating this water as hazardous',
      {
        atX: Math.round(h.x),
        atY: Math.round(h.y),
        inference: 'own units immobilised with no enemy contact explaining it',
      },
    );
  }

  /* --- Layer 1: strategy --- */

  const { strategy, basis: strategyBasis } = chooseStrategy(observed, scenario);

  /* --- Layer 2: operational --- */

  const assessment = assess(observed);
  const { posture, reason } = choosePosture(strategy, assessment);

  // Only log a strategic/operational decision when something changed, so the
  // log records decisions rather than a per-tick heartbeat.
  if (posture !== ai.posture || decisions.length === 0) {
    record('STRATEGIC', `Strategy: ${strategy.kind}`, strategyBasis);
    record('OPERATIONAL', `Posture: ${posture} — ${reason}`, {
      ownStrength: Math.round(assessment.ownStrength),
      estimatedEnemyStrength: Math.round(assessment.enemyEstimate),
      contactsInSight: assessment.contacts,
      staleContacts: assessment.staleContacts,
      ownImmobilised: assessment.ownInTrouble,
      enemyInDifficulty: assessment.enemyInTrouble,
      previousPosture: ai.posture,
    });
  }

  /* --- Layer 3: tactical --- */

  const commands = tacticalOrders(observed, strategy, posture, hazards, stations);

  if (commands.length > 0 && (posture !== ai.posture || discovered.length > 0)) {
    record(
      'TACTICAL',
      `Issued ${commands.length} order(s) under ${posture} posture`,
      {
        moveOrders: commands.filter((c) => c.kind === 'MOVE').length,
        holdOrders: commands.filter((c) => c.kind === 'HOLD').length,
        knownHazards: hazards.length,
      },
      commands.map((c) => c.unitId),
    );
  }

  return {
    commands,
    state: { decisions, stations, suspectedHazards: hazards, posture },
  };
}

/* ------------------------------------------------------------------ */
/* Explanation (§35)                                                   */
/* ------------------------------------------------------------------ */

/**
 * Explain what the AI did, from the recorded decisions.
 *
 * Every line comes from a `Decision` that was actually taken at the time, with
 * the observations it was based on. Nothing here is composed after the fact —
 * §35 forbids generating a reason that reads well but does not correspond to
 * the decision data.
 */
export function explainDecisions(ai: AiState, limit = 20): string[] {
  return ai.decisions.slice(-limit).map((d) => {
    const basis = Object.entries(d.basis)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    return `t${d.tick} [${d.layer}] ${d.summary}${basis ? ` (${basis})` : ''}`;
  });
}

/** Decisions of one layer, for inspection tooling (§92, §93). */
export const decisionsOfLayer = (ai: AiState, layer: DecisionLayer): readonly Decision[] =>
  ai.decisions.filter((d) => d.layer === layer);
