/**
 * Simulation engine.
 *
 * Master Prompt §22 (combat is not `hp -= damage`), §23 (determinism),
 * §38 (no battle special-casing), §90 (battle log), §89 (traceability).
 *
 * Design notes:
 *
 * - Pure reducer. `step(state, commands) -> state`. No I/O, no clock, no
 *   ambient randomness. This is what makes replay, save/load and testing work
 *   (INV-10).
 * - Every random draw comes from a named forked stream, so adding a roll in one
 *   subsystem does not shift results in another and break unrelated replays.
 * - Systems run in a fixed order, documented below, because order affects
 *   results and determinism requires it be stable.
 */

import {
  type BattleState,
  type Unit,
  type UnitId,
  type BattleEvent,
  type FactionId,
  type Position,
  eventId,
  canAct,
  isWaterborne,
  distance,
} from '../domain/types.ts';
import type { BattleScenario, ObstacleField } from '../scenario/scenario.ts';
import { evaluateTide, type TideState } from './tide.ts';
import { createRng, restoreRng, type Rng } from './rng.ts';

/**
 * Simulation version. MUST be bumped whenever the algorithm changes in a way
 * that alters results (§53). Replays record it and refuse to run against a
 * different one (INV-18).
 */
export const SIMULATION_VERSION = '0.3.0';

/** In-world minutes advanced per tick. */
export const MINUTES_PER_TICK = 5;
const HOURS_PER_TICK = MINUTES_PER_TICK / 60;

/* ------------------------------------------------------------------ */
/* Commands (§16)                                                      */
/* ------------------------------------------------------------------ */

export type Command =
  | { readonly kind: 'MOVE'; readonly unitId: UnitId; readonly to: Position }
  | { readonly kind: 'ATTACK'; readonly unitId: UnitId; readonly targetId: UnitId }
  | { readonly kind: 'HOLD'; readonly unitId: UnitId }
  | { readonly kind: 'WITHDRAW'; readonly unitId: UnitId; readonly to: Position };

/* ------------------------------------------------------------------ */
/* Tuning constants                                                    */
/* ------------------------------------------------------------------ */

/**
 * These are SIMULATION PARAMETERS, not historical measurements (§42, §87).
 * They are gathered here rather than scattered so they can be tuned and
 * documented in one place.
 */
export const TUNING = {
  /**
   * Engagement range in metres.
   *
   * Sized against the map, not against intuition: the Bach Dang map is 6km
   * across with 100m terrain cells, so a 150m range meant units had to almost
   * collide before they could fight, and trapped vessels were never finished
   * off. 400m is roughly four cells -- close enough to still require the player
   * to actually manoeuvre onto the enemy, wide enough that closing on a
   * grounded ship works.
   */
  engagementRangeM: 400,
  /** Base fraction of strength lost per tick by a unit in combat. */
  baseCasualtyRate: 0.04,
  /** How strongly a numerical advantage tells. */
  strengthRatioExponent: 1.5,
  /** Morale lost per tick while taking casualties. */
  moraleLossPerTick: 0.05,
  /** Morale recovered per tick when unengaged and rested. */
  moraleRecoveryPerTick: 0.01,
  /** Fatigue gained per tick while moving or fighting. */
  fatiguePerTick: 0.015,
  /** Fatigue recovered per tick while holding. */
  fatigueRecoveryPerTick: 0.01,
  /** Below this morale a unit routs. */
  routMoraleThreshold: 0.15,
  /** Fatigue's maximum penalty to combat effectiveness. */
  maxFatiguePenalty: 0.4,
  /** Commander bonus at full leadership, within command range. */
  maxCommanderBonus: 0.25,
  /** Safety clearance required over an obstacle, in metres. */
  obstacleClearanceM: 0.2,
  /**
   * Multiplier on damage taken while immobilised.
   *
   * A ship held fast on obstructions, listing as the water leaves it, cannot
   * manoeuvre, cannot present its own weapons well, and cannot withdraw. This
   * is deliberately punishing: in this battle, being caught IS the defeat, and
   * the attacking force's job is to convert that into a result.
   */
  immobilisedVulnerability: 4.0,
  /** Fraction of strength a held-fast vessel loses each tick to its own plight. */
  immobilisedAttritionPerTick: 0.02,
} as const;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

interface StepContext {
  readonly scenario: BattleScenario;
  readonly tide: TideState | null;
  readonly rng: Rng;
  readonly events: BattleEvent[];
  readonly tick: number;
}

const record = (
  ctx: StepContext,
  message: string,
  unitIds?: readonly UnitId[],
  position?: Position,
): void => {
  // SIMULATION_EVENT: emergent engine output. Never carries historical sources
  // (INV-20) — the validator rejects any that does.
  ctx.events.push({
    id: eventId(`t${ctx.tick}-e${ctx.events.length}`),
    kind: 'SIMULATION_EVENT',
    tick: ctx.tick,
    message,
    ...(unitIds === undefined ? {} : { unitIds }),
    ...(position === undefined ? {} : { position }),
  });
};

/** Cell coordinates for a world position. */
const cellOf = (scenario: BattleScenario, p: Position): { x: number; y: number } => ({
  x: Math.floor(p.x / scenario.terrain.cellSizeM),
  y: Math.floor(p.y / scenario.terrain.cellSizeM),
});

const fieldCoversPosition = (
  scenario: BattleScenario,
  field: ObstacleField,
  p: Position,
): boolean => {
  const c = cellOf(scenario, p);
  return field.cells.some((fc) => fc.x === c.x && fc.y === c.y);
};

/**
 * Combat effectiveness: what a unit actually brings to a fight.
 *
 * Deliberately multi-factor (§22): strength alone must not decide battles, or
 * the simulation would just be arithmetic on troop counts — the very numbers
 * we know to be least reliable (HISTORICAL_SOURCES S-005).
 */
export function combatPower(
  unit: Unit,
  scenario: BattleScenario,
): number {
  if (!canAct(unit)) return 0;

  const fatiguePenalty = 1 - unit.fatigue * TUNING.maxFatiguePenalty;
  const commander = scenario.commanders.find((c) => c.id === unit.commanderId);
  const commanderBonus =
    commander === undefined
      ? 1
      : 1 + (commander.ratings.tactical / 100) * TUNING.maxCommanderBonus;

  const immobilisedPenalty = unit.status === 'IMMOBILISED' ? 0.35 : 1;

  return (
    unit.strength *
    unit.morale *
    unit.cohesion *
    fatiguePenalty *
    commanderBonus *
    immobilisedPenalty
  );
}

/* ------------------------------------------------------------------ */
/* Systems                                                             */
/* ------------------------------------------------------------------ */

/** 1. Movement. Units advance toward ordered destinations. */
function applyMovement(
  units: Unit[],
  orders: Map<UnitId, Command>,
  ctx: StepContext,
): void {
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    const cmd = orders.get(u.id);
    if (!cmd || !canAct(u)) continue;
    if (cmd.kind !== 'MOVE' && cmd.kind !== 'WITHDRAW') continue;
    // A grounded ship cannot move, whatever it is ordered to do (INV-06/07).
    if (u.status === 'IMMOBILISED') continue;

    const target = cmd.to;
    const d = distance(u.position, target);
    if (d < 1) continue;

    const speed = u.baseSpeedMPerHour * (1 - u.fatigue * 0.3);
    const travel = Math.min(d, speed * HOURS_PER_TICK);
    const ratio = travel / d;

    units[i] = {
      ...u,
      position: {
        x: u.position.x + (target.x - u.position.x) * ratio,
        y: u.position.y + (target.y - u.position.y) * ratio,
      },
      fatigue: clamp01(u.fatigue + TUNING.fatiguePerTick),
    };
  }
}

/**
 * 2. Obstacles. Vessels drawing more water than is available over an obstacle
 *    field risk striking it.
 *
 * This is the Bach Dang mechanic, expressed with no reference to Bach Dang.
 * The scenario supplies the field, the tide supplies the water level, and the
 * unit supplies its draft. The engine only knows the rule.
 */
function applyObstacles(units: Unit[], ctx: StepContext): void {
  const fields = ctx.scenario.mechanics.obstacleFields;
  if (!fields || fields.length === 0 || ctx.tide === null) return;

  const obstacleRng = ctx.rng.fork('obstacles');

  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (!canAct(u) || !isWaterborne(u.kind) || u.draftM === undefined) continue;
    // A vessel already held fast has struck; it does not strike again every
    // tick. Its destruction from here is the business of the combat system,
    // which treats an immobilised target as highly vulnerable.
    if (u.status === 'IMMOBILISED') continue;

    for (const field of fields) {
      if (!fieldCoversPosition(ctx.scenario, field, u.position)) continue;

      const clearance = ctx.tide.levelM - field.topHeightM;
      const safe = clearance >= u.draftM + TUNING.obstacleClearanceM;
      if (safe) continue;

      // The vessel is in the field with insufficient water over the obstacles.
      if (!obstacleRng.chance(field.strikeChancePerTick)) continue;

      const damage = Math.ceil(u.strength * field.strikeDamageFraction);
      const newStrength = Math.max(0, u.strength - damage);
      const destroyed = newStrength === 0;

      units[i] = {
        ...u,
        strength: newStrength,
        status: destroyed ? 'DESTROYED' : 'IMMOBILISED',
        morale: destroyed ? 0 : clamp01(u.morale - TUNING.moraleLossPerTick * 2),
        cohesion: clamp01(u.cohesion - 0.1),
      };

      record(
        ctx,
        destroyed
          ? `${u.name} struck ${field.name} and was destroyed`
          : `${u.name} struck ${field.name} and is held fast (water ${clearance.toFixed(2)}m over obstacles, draft ${u.draftM.toFixed(2)}m)`,
        [u.id],
        u.position,
      );
      break;
    }
  }
}

/** 3. Combat. Units in range of an enemy exchange casualties. */
function applyCombat(units: Unit[], ctx: StepContext): void {
  const combatRng = ctx.rng.fork('combat');

  // Snapshot power before anyone takes damage, so resolution is simultaneous
  // and not dependent on array order (which would be a hidden determinism trap).
  const powerById = new Map<UnitId, number>();
  for (const u of units) powerById.set(u.id, combatPower(u, ctx.scenario));

  const damageById = new Map<UnitId, number>();

  for (const attacker of units) {
    if (!canAct(attacker)) continue;

    const enemies = units.filter(
      (e) => e.faction !== attacker.faction && canAct(e) &&
        distance(attacker.position, e.position) <= TUNING.engagementRangeM,
    );
    if (enemies.length === 0) continue;

    const attackerPower = powerById.get(attacker.id) ?? 0;
    if (attackerPower <= 0) continue;

    // Spread the attack across engaged enemies.
    for (const target of enemies) {
      const targetPower = powerById.get(target.id) ?? 0;
      const ratio = targetPower <= 0 ? 4 : attackerPower / targetPower;
      const advantage = Math.min(4, Math.pow(ratio, TUNING.strengthRatioExponent));

      const vulnerability =
        target.status === 'IMMOBILISED' ? TUNING.immobilisedVulnerability : 1;

      // A small stochastic component; the bulk of the result is deterministic
      // so that outcomes remain explainable (§35, §89).
      const variance = 0.85 + combatRng.next() * 0.3;

      const casualties =
        target.strength *
        TUNING.baseCasualtyRate *
        advantage *
        vulnerability *
        variance /
        enemies.length;

      damageById.set(target.id, (damageById.get(target.id) ?? 0) + casualties);
    }
  }

  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    const dmg = damageById.get(u.id);
    if (dmg === undefined || dmg <= 0) continue;

    const newStrength = Math.max(0, u.strength - dmg);
    const lostFraction = u.strength > 0 ? dmg / u.strength : 0;

    units[i] = {
      ...u,
      strength: newStrength,
      // Morale loss must scale with how badly the unit is actually being hurt.
      // A flat per-tick penalty meant a formation taking trivial scratches
      // routed on a timer regardless of its losses, which produced heavy ships
      // breaking at ~93% strength. The floor term keeps contact meaningful;
      // the lostFraction term is what does the work.
      morale: clamp01(
        u.morale - TUNING.moraleLossPerTick * (0.15 + lostFraction * 12),
      ),
      fatigue: clamp01(u.fatigue + TUNING.fatiguePerTick),
      cohesion: clamp01(u.cohesion - lostFraction * 0.5),
      status: newStrength === 0 ? 'DESTROYED' : u.status === 'IMMOBILISED' ? 'IMMOBILISED' : 'ENGAGED',
    };
  }
}

/**
 * 4. Immobilised attrition. A vessel held fast on obstructions is progressively
 *    wrecked by its own weight and the falling water, independently of whether
 *    an enemy is alongside. Without this, a trapped ship that nobody reaches
 *    simply sits intact for the rest of the battle, which is neither historical
 *    nor interesting.
 */
function applyImmobilisedAttrition(units: Unit[], ctx: StepContext): void {
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (u.status !== 'IMMOBILISED') continue;

    const loss = Math.ceil(u.strength * TUNING.immobilisedAttritionPerTick);
    const strength = Math.max(0, u.strength - loss);
    const destroyed = strength === 0;

    units[i] = {
      ...u,
      strength,
      status: destroyed ? 'DESTROYED' : 'IMMOBILISED',
      morale: destroyed ? 0 : clamp01(u.morale - TUNING.moraleLossPerTick * 0.5),
      cohesion: clamp01(u.cohesion - 0.02),
    };

    if (destroyed) {
      record(ctx, `${u.name} broke up on the obstructions`, [u.id], u.position);
    }
  }
}

/** 5. Morale and recovery. Unengaged units recover; broken units rout. */
function applyMorale(units: Unit[], orders: Map<UnitId, Command>, ctx: StepContext): void {
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (u.status === 'DESTROYED' || u.status === 'ROUTED') continue;

    const engaged = u.status === 'ENGAGED';
    let morale = u.morale;
    let fatigue = u.fatigue;

    if (!engaged) {
      morale = clamp01(morale + TUNING.moraleRecoveryPerTick);
      const holding = orders.get(u.id)?.kind === 'HOLD' || orders.get(u.id) === undefined;
      if (holding) fatigue = clamp01(fatigue - TUNING.fatigueRecoveryPerTick);
    }

    // A commander within range steadies the unit.
    const commander = ctx.scenario.commanders.find((c) => c.id === u.commanderId);
    if (commander) {
      const anchor = units.find((x) => x.commanderId === commander.id && canAct(x));
      if (anchor && distance(u.position, anchor.position) <= commander.ratings.commandRangeM) {
        morale = clamp01(morale + (commander.ratings.leadership / 100) * 0.005);
      }
    }

    let status: Unit['status'] = u.status;
    if (morale <= TUNING.routMoraleThreshold && u.status !== 'IMMOBILISED') {
      status = 'ROUTED';
      morale = 0;
      record(ctx, `${u.name} broke and routed`, [u.id], u.position);
    } else if (status === 'ENGAGED') {
      // Engagement is re-established each tick by applyCombat.
      status = 'ACTIVE';
    }

    units[i] = { ...u, morale, fatigue, status };
  }
}

/* ------------------------------------------------------------------ */
/* Victory evaluation (INV-15)                                         */
/* ------------------------------------------------------------------ */

function factionStrength(units: readonly Unit[], faction: FactionId): number {
  return units
    .filter((u) => u.faction === faction && canAct(u))
    .reduce((sum, u) => sum + u.strength, 0);
}

function factionInitialStrength(scenario: BattleScenario, faction: FactionId): number {
  return scenario.initialUnits
    .filter((u) => u.faction === faction)
    .reduce((sum, u) => sum + u.initialStrength, 0);
}

export function evaluateVictory(
  units: readonly Unit[],
  scenario: BattleScenario,
  elapsedHours: number,
): BattleState['outcome'] {
  for (const objective of scenario.objectives) {
    const cond = objective.condition;

    if (cond.kind === 'ATTRITION') {
      const initial = factionInitialStrength(scenario, cond.targetFaction);
      if (initial === 0) continue;
      const current = factionStrength(units, cond.targetFaction);
      if (current / initial < cond.strengthFractionBelow) {
        return {
          kind: 'DECIDED',
          victor: objective.faction,
          reason: `${objective.description} (enemy reduced to ${((current / initial) * 100).toFixed(0)}% strength)`,
        };
      }
    }

    if (cond.kind === 'FLEET_NEUTRALISED') {
      const fleet = scenario.initialUnits.filter(
        (u) => u.faction === cond.targetFaction && isWaterborne(u.kind),
      );
      if (fleet.length === 0) continue;
      // By default a held-fast vessel is not yet neutralised: it has to be
      // finished. Scenarios may opt in to counting it via countImmobilised.
      const countStuck = cond.countImmobilised ?? false;
      const neutralised = fleet.filter((iu) => {
        const now = units.find((u) => u.id === iu.id);
        if (!now || !canAct(now)) return true;
        return countStuck && now.status === 'IMMOBILISED';
      }).length;
      if (neutralised / fleet.length >= cond.fractionNeutralised) {
        return {
          kind: 'DECIDED',
          victor: objective.faction,
          reason: `${objective.description} (${neutralised}/${fleet.length} vessels neutralised)`,
        };
      }
    }

    if (cond.kind === 'ESCAPE') {
      const force = scenario.initialUnits.filter((u) => u.faction === objective.faction);
      if (force.length === 0) continue;

      const escaped = force.filter((iu) => {
        const now = units.find((u) => u.id === iu.id);
        if (!now || !canAct(now) || now.status === 'IMMOBILISED') return false;
        return cond.direction === 'BELOW'
          ? now.position.x <= cond.beyondX
          : now.position.x >= cond.beyondX;
      }).length;

      if (escaped / force.length >= cond.fractionEscaped) {
        return {
          kind: 'DECIDED',
          victor: objective.faction,
          reason: `${objective.description} (${escaped}/${force.length} units reached open water)`,
        };
      }
    }

    if (cond.kind === 'SURVIVE_UNTIL' && elapsedHours >= cond.hours) {
      // Only a faction that still exists can win by surviving.
      if (factionStrength(units, objective.faction) > 0) {
        return {
          kind: 'DECIDED',
          victor: objective.faction,
          reason: `${objective.description} (held until hour ${cond.hours})`,
        };
      }
    }
  }

  // No objective met. Adjudicate on the scenario's own time limit rather than
  // leaving the battle hanging: an unresolved simulation tells the player
  // nothing, and INV-15 requires victory to be evaluated consistently.
  const limit = scenario.timeLimit;
  if (elapsedHours >= limit.hours) {
    if (factionStrength(units, limit.favours) > 0) {
      return { kind: 'DECIDED', victor: limit.favours, reason: limit.reason };
    }
    return { kind: 'DRAW', reason: `${limit.reason} (but no force remained to claim it)` };
  }

  return { kind: 'ONGOING' };
}

/* ------------------------------------------------------------------ */
/* The step function                                                   */
/* ------------------------------------------------------------------ */

/**
 * Advance the battle by one tick.
 *
 * Pure: same (state, commands, scenario) always yields the same next state.
 * System order is fixed and load-bearing for determinism:
 *   movement -> obstacles -> combat -> immobilised attrition -> morale -> victory
 *
 * Obstacles resolve before combat so that a ship grounded this tick is already
 * vulnerable when blows are exchanged — which is precisely the historical
 * dynamic being modelled.
 */
export function step(
  state: BattleState,
  commands: readonly Command[],
  scenario: BattleScenario,
): BattleState {
  if (state.outcome.kind !== 'ONGOING') return state;

  const rng = restoreRng(state.rngState);
  const tick = state.tick + 1;
  const elapsedHours = state.elapsedHours + HOURS_PER_TICK;

  const tide = scenario.mechanics.tide
    ? evaluateTide(scenario.mechanics.tide, elapsedHours)
    : null;

  const ctx: StepContext = { scenario, tide, rng, events: [], tick };

  // Only commands for units that can actually act (INV-06, INV-07).
  const orders = new Map<UnitId, Command>();
  for (const cmd of commands) {
    const unit = state.units.find((u) => u.id === cmd.unitId);
    if (unit && canAct(unit)) orders.set(cmd.unitId, cmd);
  }

  const units = [...state.units];

  applyMovement(units, orders, ctx);
  applyObstacles(units, ctx);
  applyCombat(units, ctx);
  applyImmobilisedAttrition(units, ctx);
  applyMorale(units, orders, ctx);

  const outcome = evaluateVictory(units, scenario, elapsedHours);
  if (outcome.kind === 'DECIDED') {
    record(ctx, `Battle decided: ${outcome.reason}`);
  }

  // Advance the parent stream once per tick so the next tick differs even when
  // no subsystem drew from it.
  rng.next();

  return {
    ...state,
    tick,
    elapsedHours,
    units,
    events: [...state.events, ...ctx.events],
    outcome,
    rngState: rng.getState(),
  };
}

/** Build the initial runtime state for a scenario (§82: scenario -> runtime). */
export function createInitialState(scenario: BattleScenario, seed: string): BattleState {
  const rng = createRng(seed);
  return {
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    simulationVersion: SIMULATION_VERSION,
    tick: 0,
    elapsedHours: 0,
    units: scenario.initialUnits.map((u) => ({ ...u })),
    commanders: [...scenario.commanders],
    events: [],
    outcome: { kind: 'ONGOING' },
    rngState: rng.getState(),
    seed,
  };
}

/** Run a battle to completion or a tick limit. Used by tests, replay and AI. */
export function runBattle(
  scenario: BattleScenario,
  seed: string,
  commandsForTick: (state: BattleState) => readonly Command[],
  maxTicks = 500,
): BattleState {
  let state = createInitialState(scenario, seed);
  for (let i = 0; i < maxTicks && state.outcome.kind === 'ONGOING'; i++) {
    state = step(state, commandsForTick(state), scenario);
  }
  return state;
}
