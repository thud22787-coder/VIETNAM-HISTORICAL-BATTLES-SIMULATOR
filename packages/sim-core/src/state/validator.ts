/**
 * Game state validator — the executable form of docs/GAME_STATE_INVARIANTS.md.
 *
 * Master Prompt §95 (state validator), §96 (fail early, clearly, debuggably).
 *
 * We never silently repair state. A silent repair hides the bug that produced
 * the bad state and yields a plausible-looking but untrustworthy battle result.
 */

import {
  type BattleState,
  type Unit,
  type Position,
  canAct,
  isWaterborne,
} from '../domain/types.ts';

export type ValidationLevel = 'STRICT' | 'WARN' | 'OFF';

export interface InvariantViolation {
  /** Invariant id from GAME_STATE_INVARIANTS.md, e.g. 'INV-02'. */
  readonly id: string;
  readonly message: string;
  readonly detail?: string;
}

export class InvariantViolationError extends Error {
  readonly violations: readonly InvariantViolation[];

  constructor(violations: readonly InvariantViolation[]) {
    const summary = violations
      .map((v) => `  [${v.id}] ${v.message}${v.detail ? ` (${v.detail})` : ''}`)
      .join('\n');
    super(`Game state violates ${violations.length} invariant(s):\n${summary}`);
    this.name = 'InvariantViolationError';
    this.violations = violations;
  }
}

export interface MapBounds {
  readonly width: number;
  readonly height: number;
}

const inBounds = (p: Position, b: MapBounds): boolean =>
  p.x >= 0 && p.y >= 0 && p.x <= b.width && p.y <= b.height;

const isNormalised = (v: number): boolean => Number.isFinite(v) && v >= 0 && v <= 1;

/**
 * Check every invariant. Returns violations rather than throwing, so callers
 * choose the policy (tooling wants a report, the engine wants a crash).
 */
export function checkInvariants(
  state: BattleState,
  options: { readonly bounds?: MapBounds; readonly allowReinforcement?: boolean } = {},
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const push = (id: string, message: string, detail?: string): void => {
    violations.push({ id, message, ...(detail === undefined ? {} : { detail }) });
  };

  /* --- A. Identity and existence --- */

  const seenUnitIds = new Set<string>();
  for (const u of state.units) {
    if (seenUnitIds.has(u.id)) {
      push('INV-01', 'Duplicate unit id', u.id);
    }
    seenUnitIds.add(u.id);
  }

  // INV-02: a unit holds exactly one Position by construction, so the failure
  // mode we can actually detect is a malformed/non-finite position.
  for (const u of state.units) {
    if (!Number.isFinite(u.position.x) || !Number.isFinite(u.position.y)) {
      push('INV-02', 'Unit position is not a finite point', `${u.id} (${u.position.x}, ${u.position.y})`);
    }
  }

  const commanderIds = new Set(state.commanders.map((c) => c.id));
  for (const u of state.units) {
    if (u.commanderId !== undefined && !commanderIds.has(u.commanderId)) {
      push('INV-04', 'Unit references a commander not present in state', `${u.id} -> ${u.commanderId}`);
    }
  }

  for (const u of state.units) {
    if (u.strength < 0) {
      push('INV-05', 'Negative unit strength', `${u.id} = ${u.strength}`);
    }
    if (!options.allowReinforcement && u.strength > u.initialStrength) {
      push(
        'INV-05',
        'Unit strength exceeds initial strength without reinforcement rule',
        `${u.id}: ${u.strength} > ${u.initialStrength}`,
      );
    }
  }

  /* --- B. Life cycle --- */

  for (const u of state.units) {
    // INV-08: status must agree with the numbers.
    if (u.strength === 0 && u.status !== 'DESTROYED') {
      push('INV-08', 'Unit at zero strength is not marked DESTROYED', `${u.id} status=${u.status}`);
    }
    if (u.strength > 0 && u.status === 'DESTROYED') {
      push('INV-08', 'DESTROYED unit still has strength', `${u.id} strength=${u.strength}`);
    }
    if (u.morale === 0 && u.status !== 'ROUTED' && u.status !== 'DESTROYED') {
      push('INV-08', 'Unit at zero morale is neither ROUTED nor DESTROYED', `${u.id} status=${u.status}`);
    }
  }

  /* --- C. Simulation integrity --- */

  if (!Number.isFinite(state.tick) || state.tick < 0) {
    push('INV-11', 'Tick must be a non-negative finite number', String(state.tick));
  }
  if (!Number.isFinite(state.elapsedHours) || state.elapsedHours < 0) {
    push('INV-11', 'elapsedHours must be non-negative and finite', String(state.elapsedHours));
  }

  for (const u of state.units) {
    for (const [stat, value] of [
      ['morale', u.morale],
      ['fatigue', u.fatigue],
      ['cohesion', u.cohesion],
      ['supply', u.supply],
    ] as const) {
      if (!isNormalised(value)) {
        push('INV-12', `Unit ${stat} outside [0,1]`, `${u.id} ${stat}=${value}`);
      }
    }
  }

  if (options.bounds) {
    for (const u of state.units) {
      if (!inBounds(u.position, options.bounds)) {
        push('INV-13', 'Unit is outside map bounds', `${u.id} at (${u.position.x}, ${u.position.y})`);
      }
    }
  }

  const seenEventIds = new Set<string>();
  for (const e of state.events) {
    if (seenEventIds.has(e.id)) {
      push('INV-14', 'Duplicate event id — event recorded twice', e.id);
    }
    seenEventIds.add(e.id);
  }

  /* --- D. Historical integrity --- */

  if (!state.scenarioVersion) {
    push('INV-17', 'State is not bound to a scenario version', state.scenarioId);
  }
  if (!state.simulationVersion) {
    push('INV-18', 'State is not bound to a simulation version');
  }
  if (!state.seed) {
    push('INV-19', 'State has no seed; the battle would not be reproducible');
  }

  // INV-20: historical events must be sourced; the engine must never emit one.
  for (const e of state.events) {
    if (e.kind === 'HISTORICAL_EVENT' && (!e.sources || e.sources.length === 0)) {
      push('INV-20', 'HISTORICAL_EVENT without sources', e.id);
    }
    if (e.kind === 'SIMULATION_EVENT' && e.sources && e.sources.length > 0) {
      push(
        'INV-20',
        'SIMULATION_EVENT carries historical sources — simulation output must not be dressed as history',
        e.id,
      );
    }
  }

  /* --- Waterborne consistency (supports the tide mechanic) --- */

  for (const u of state.units) {
    if (isWaterborne(u.kind) && u.draftM === undefined) {
      push('INV-21', 'Waterborne unit has no draft; tide interaction is undefined', u.id);
    }
    if (u.draftM !== undefined && u.draftM <= 0) {
      push('INV-21', 'Draft must be positive', `${u.id} draftM=${u.draftM}`);
    }
  }

  /* --- INV-15: outcome consistency --- */

  if (state.outcome.kind === 'DECIDED') {
    const { victor } = state.outcome;

    if (!victor) {
      push('INV-15', 'DECIDED outcome without a victor');
    } else {
      // A faction declared victorious must actually be present in the battle.
      const factionsPresent = new Set(state.units.map((u) => u.faction));
      if (!factionsPresent.has(victor)) {
        push('INV-15', 'Victor is a faction with no units in this battle', victor);
      }

      // A faction that has been wiped out cannot be the victor. This catches
      // victory-condition logic that credits the wrong side.
      const victorStillFighting = state.units.some(
        (u) => u.faction === victor && canAct(u) && u.strength > 0,
      );
      if (!victorStillFighting) {
        push(
          'INV-15',
          'Declared victor has no surviving units able to act',
          victor,
        );
      }
    }
  }

  return violations;
}

/**
 * Assert invariants according to the configured level.
 * STRICT throws; WARN reports; OFF does nothing.
 */
export function assertInvariants(
  state: BattleState,
  level: ValidationLevel = 'STRICT',
  options: { readonly bounds?: MapBounds; readonly allowReinforcement?: boolean } = {},
): void {
  if (level === 'OFF') return;

  const violations = checkInvariants(state, options);
  if (violations.length === 0) return;

  if (level === 'STRICT') {
    throw new InvariantViolationError(violations);
  }
  for (const v of violations) {
    console.warn(`[invariant ${v.id}] ${v.message}${v.detail ? ` (${v.detail})` : ''}`);
  }
}

/** Units that are legally able to receive a command right now (INV-06, INV-07). */
export function commandableUnits(state: BattleState): readonly Unit[] {
  return state.units.filter(canAct);
}
