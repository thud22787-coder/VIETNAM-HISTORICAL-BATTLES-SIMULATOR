/**
 * Fog of war: the observed-state projection.
 *
 * Master Prompt §17 (fog of war), §18 (information model), §32 (AI reads
 * observable state), §34 (AI is a player, not an admin).
 * Invariants: INV-23, INV-24.
 *
 * THE POINT OF THIS MODULE
 *
 * Historical commanders did not have omniscient information. Ngô Quyền did not
 * know the Yuan fleet's exact strength, and the Yuan did not know the channel
 * had been prepared. A simulation where both sides read the true state is not
 * modelling a battle; it is modelling a chess game.
 *
 * So `observe(state, faction, scenario)` produces what ONE side can legitimately
 * perceive. Its output types are deliberately *different* from the ground-truth
 * domain types — an `ObservedUnit` is not a `Unit` and cannot be passed where
 * one is expected. That is what stops an AI commander from accidentally
 * consuming ground truth: the mistake becomes a type error rather than an
 * invisible cheat.
 *
 * Enemy strength is never copied through. It arrives as a bracketed estimate
 * that degrades with distance and conditions (INV-24), because a commander
 * squinting across an estuary counts hulls, not men.
 */

import {
  type BattleState,
  type Unit,
  type UnitId,
  type FactionId,
  type Position,
  type UnitKind,
  type UnitStatus,
  type BattleEvent,
  type BattleOutcome,
  canAct,
  distance,
} from '../domain/types.ts';
import type { BattleScenario, ObstacleField, TerrainKind } from '../scenario/scenario.ts';
import { terrainAtPosition } from '../scenario/scenario.ts';
import type { Rng } from '../sim/rng.ts';

/* ------------------------------------------------------------------ */
/* Knowledge levels (§17)                                              */
/* ------------------------------------------------------------------ */

export type Knowledge = 'KNOWN' | 'ESTIMATED' | 'UNKNOWN';

/**
 * A quantity as one side believes it to be.
 *
 * Note there is no plain `value` field for `ESTIMATED`: callers must engage
 * with the bracket. This is the same discipline the historical layer applies to
 * source uncertainty, for the same reason — a single confident number invites
 * false precision.
 */
export type ObservedQuantity =
  | { readonly knowledge: 'KNOWN'; readonly value: number }
  | { readonly knowledge: 'ESTIMATED'; readonly min: number; readonly max: number }
  | { readonly knowledge: 'UNKNOWN' };

/** Midpoint of an estimate, for code that must act on a single number. */
export function estimateOf(q: ObservedQuantity): number | null {
  switch (q.knowledge) {
    case 'KNOWN':
      return q.value;
    case 'ESTIMATED':
      return (q.min + q.max) / 2;
    case 'UNKNOWN':
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Observed entities                                                   */
/* ------------------------------------------------------------------ */

/**
 * An enemy unit as seen from outside.
 *
 * Deliberately missing, compared with `Unit`: exact strength, morale, fatigue,
 * cohesion, supply, commander, and orders. A distant observer sees hulls and
 * rough behaviour, not a readout.
 */
export interface ObservedUnit {
  readonly id: UnitId;
  readonly faction: FactionId;
  /** Position as last observed — may be stale if contact was lost. */
  readonly position: Position;
  /** Tick at which this was last seen. */
  readonly lastSeenTick: number;
  /** True if in contact right now; false means this is a remembered sighting. */
  readonly inContact: boolean;
  /** Vessel or foot — discernible at range. */
  readonly kind: UnitKind | 'UNIDENTIFIED';
  readonly strength: ObservedQuantity;
  /**
   * Gross condition, inferable from behaviour: a routing formation looks
   * routed, and a grounded ship is obviously in trouble. Fine-grained status
   * is not observable.
   */
  readonly apparentStatus: 'ACTIVE' | 'IN_TROUBLE' | 'BROKEN' | 'UNKNOWN';
}

/** One's own unit — fully known, because it reports to you. */
export interface OwnUnit extends Unit {}

/**
 * The battle as one faction perceives it.
 *
 * An AI commander (or a UI) is given this and nothing else. There is no route
 * from here back to the true `BattleState`.
 */
export interface ObservedState {
  readonly faction: FactionId;
  readonly tick: number;
  readonly elapsedHours: number;

  /** Your own forces, in full. */
  readonly own: readonly OwnUnit[];
  /** What you can see or remember of the enemy. */
  readonly enemies: readonly ObservedUnit[];

  /** Obstacle fields this side placed, and therefore knows about. */
  readonly knownObstacles: readonly ObstacleField[];

  /** Events this side could plausibly have witnessed. */
  readonly events: readonly BattleEvent[];

  /**
   * Outcome is visible to both sides once decided — a battle that has ended is
   * not a secret.
   */
  readonly outcome: BattleOutcome;
}

/* ------------------------------------------------------------------ */
/* Visibility rules                                                    */
/* ------------------------------------------------------------------ */

/**
 * How far a unit can see, in metres, before terrain and conditions.
 *
 * A SIMULATION PARAMETER (§42, §87), not a measured historical figure. Sized
 * against this map: the Bạch Đằng channel is a few hundred metres wide and the
 * map is 6 km long, so a base of 1200 m means a commander sees a useful slice
 * of the estuary but never the whole of it.
 */
export const VISIBILITY = {
  baseRangeM: 1200,
  /** Multiplier applied when the *observer* sits in concealing terrain. */
  observerTerrainBonus: 1.15,
  /** Multipliers applied when the *target* sits in concealing terrain. */
  concealment: {
    FOREST: 0.45,
    MARSH: 0.7,
    RIVERBANK: 0.85,
    HILL: 1.0,
    PLAIN: 1.0,
    TIDAL_FLAT: 1.0,
    SHALLOW_WATER: 1.0,
    DEEP_WATER: 1.0,
  } satisfies Record<TerrainKind, number>,
  /**
   * How long a sighting is remembered before it is dropped entirely, in ticks.
   * A commander does not forget instantly, but a two-hour-old report of a
   * moving fleet is worthless.
   */
  memoryTicks: 24,
  /** Fractional width of a strength estimate at point-blank range. */
  minEstimateError: 0.15,
  /** Fractional width at the limit of vision. */
  maxEstimateError: 0.6,
} as const;

/** Effective sighting range from `observer` toward a point. */
function sightRange(scenario: BattleScenario, observer: Unit, target: Position): number {
  let range = VISIBILITY.baseRangeM;

  const observerCell = terrainAtPosition(scenario.terrain, observer.position);
  if (observerCell && (observerCell.kind === 'HILL' || observerCell.kind === 'RIVERBANK')) {
    range *= VISIBILITY.observerTerrainBonus;
  }

  const targetCell = terrainAtPosition(scenario.terrain, target);
  if (targetCell) {
    range *= VISIBILITY.concealment[targetCell.kind];
  }

  return range;
}

/** Can any unit of `faction` currently see `target`? Returns the best observer. */
function bestObserver(
  scenario: BattleScenario,
  own: readonly Unit[],
  target: Unit,
): { observer: Unit; distanceM: number; rangeM: number } | null {
  let best: { observer: Unit; distanceM: number; rangeM: number } | null = null;

  for (const observer of own) {
    if (!canAct(observer)) continue;
    const d = distance(observer.position, target.position);
    const range = sightRange(scenario, observer, target.position);
    if (d > range) continue;
    // Prefer the closest sighting — it yields the tightest estimate.
    if (best === null || d < best.distanceM) {
      best = { observer, distanceM: d, rangeM: range };
    }
  }
  return best;
}

/**
 * Bracket an enemy's strength.
 *
 * Error grows with the fraction of maximum sighting range, so a ship alongside
 * is counted well and one on the horizon is guessed at. The bracket is widened
 * by a *deterministic* per-unit offset rather than a fresh random draw, so that
 * repeated observation of a stationary enemy does not let a caller average away
 * the uncertainty by sampling it repeatedly.
 */
function estimateStrength(
  trueStrength: number,
  distanceM: number,
  rangeM: number,
  rng: Rng,
): ObservedQuantity {
  if (trueStrength <= 0) return { knowledge: 'KNOWN', value: 0 };

  const t = rangeM <= 0 ? 1 : Math.min(1, distanceM / rangeM);
  const error =
    VISIBILITY.minEstimateError +
    t * (VISIBILITY.maxEstimateError - VISIBILITY.minEstimateError);

  // Bias the bracket slightly, so estimates are not always neatly centred on
  // the truth — real reports run high or low.
  const bias = (rng.next() - 0.5) * error * trueStrength;
  const centre = trueStrength + bias;
  const halfWidth = error * trueStrength;

  return {
    knowledge: 'ESTIMATED',
    min: Math.max(0, Math.round(centre - halfWidth)),
    max: Math.round(centre + halfWidth),
  };
}

/** Gross condition inferable from watching a formation. */
function apparentStatus(status: UnitStatus): ObservedUnit['apparentStatus'] {
  switch (status) {
    case 'ACTIVE':
    case 'ENGAGED':
      return 'ACTIVE';
    case 'IMMOBILISED':
      // A ship held fast and listing is unmistakable.
      return 'IN_TROUBLE';
    case 'ROUTED':
    case 'DESTROYED':
      return 'BROKEN';
  }
}

/* ------------------------------------------------------------------ */
/* Sighting memory                                                     */
/* ------------------------------------------------------------------ */

/**
 * Remembered sightings, carried between ticks.
 *
 * Kept OUTSIDE `BattleState` on purpose. Memory is a property of a commander,
 * not of the battlefield, and baking it into the shared state would mean each
 * side's beliefs were stored where the other could read them — precisely the
 * confusion this module exists to prevent.
 *
 * It is serialisable, so a save can restore what a side believed.
 */
export interface SightingMemory {
  readonly [unitId: string]: {
    readonly position: Position;
    readonly tick: number;
    readonly kind: UnitKind | 'UNIDENTIFIED';
    readonly strength: ObservedQuantity;
    readonly apparentStatus: ObservedUnit['apparentStatus'];
  };
}

export const emptyMemory = (): SightingMemory => ({});

/* ------------------------------------------------------------------ */
/* The projection                                                      */
/* ------------------------------------------------------------------ */

export interface ObserveResult {
  readonly observed: ObservedState;
  /** Updated memory to carry into the next tick. */
  readonly memory: SightingMemory;
}

/**
 * Project the true state into what `faction` can perceive.
 *
 * Pure and deterministic given the same RNG state, so fog of war does not break
 * replay (§23). When the scenario does not declare `fogOfWar`, everything is
 * visible and estimates collapse to exact values — the projection still runs,
 * so callers have one code path either way.
 */
export function observe(
  state: BattleState,
  faction: FactionId,
  scenario: BattleScenario,
  rng: Rng,
  previousMemory: SightingMemory = emptyMemory(),
): ObserveResult {
  const fogEnabled = scenario.mechanics.fogOfWar === true;

  const own = state.units.filter((u) => u.faction === faction);
  const enemyUnits = state.units.filter((u) => u.faction !== faction);

  /* --- No fog: full information, but still through this type --- */

  if (!fogEnabled) {
    const enemies: ObservedUnit[] = enemyUnits.map((u) => ({
      id: u.id,
      faction: u.faction,
      position: u.position,
      lastSeenTick: state.tick,
      inContact: true,
      kind: u.kind,
      strength: { knowledge: 'KNOWN', value: u.strength },
      apparentStatus: apparentStatus(u.status),
    }));

    return {
      observed: {
        faction,
        tick: state.tick,
        elapsedHours: state.elapsedHours,
        own,
        enemies,
        knownObstacles: scenario.mechanics.obstacleFields ?? [],
        events: state.events,
        outcome: state.outcome,
      },
      memory: previousMemory,
    };
  }

  /* --- Fog on --- */

  const sightingRng = rng.fork('observation');
  const memory: Record<string, SightingMemory[string]> = {};
  const enemies: ObservedUnit[] = [];

  for (const enemy of enemyUnits) {
    const sighting = bestObserver(scenario, own, enemy);

    if (sighting) {
      // In contact now.
      const record = {
        position: enemy.position,
        tick: state.tick,
        kind: enemy.kind,
        strength: estimateStrength(
          enemy.strength,
          sighting.distanceM,
          sighting.rangeM,
          sightingRng,
        ),
        apparentStatus: apparentStatus(enemy.status),
      };
      memory[enemy.id] = record;
      enemies.push({
        id: enemy.id,
        faction: enemy.faction,
        position: record.position,
        lastSeenTick: record.tick,
        inContact: true,
        kind: record.kind,
        strength: record.strength,
        apparentStatus: record.apparentStatus,
      });
      continue;
    }

    // Not in contact: fall back to memory, if it is recent enough.
    const remembered = previousMemory[enemy.id];
    if (remembered && state.tick - remembered.tick <= VISIBILITY.memoryTicks) {
      memory[enemy.id] = remembered;
      enemies.push({
        id: enemy.id,
        faction: enemy.faction,
        position: remembered.position,
        lastSeenTick: remembered.tick,
        inContact: false,
        kind: remembered.kind,
        strength: remembered.strength,
        // A stale report says nothing about current condition.
        apparentStatus: 'UNKNOWN',
      });
    }
    // Otherwise the unit is simply absent from this side's picture (INV-23):
    // we do not emit an UNKNOWN placeholder, because knowing that an unseen
    // enemy exists is itself information the observer has not earned.
  }

  /* --- Obstacles: only what this side placed (§17) --- */

  const knownObstacles = (scenario.mechanics.obstacleFields ?? []).filter(
    (f) => f.knownToFaction === faction,
  );

  /* --- Events: only those this side could have witnessed --- */

  const events = state.events.filter((e) => canWitness(e, state, faction, scenario, own));

  return {
    observed: {
      faction,
      tick: state.tick,
      elapsedHours: state.elapsedHours,
      own,
      enemies,
      knownObstacles,
      events,
      outcome: state.outcome,
    },
    memory,
  };
}

/**
 * Whether `faction` could have witnessed an event.
 *
 * Events about one's own units are always known — they report in. Events about
 * the enemy require someone to have been within sight of where it happened.
 * Events with no position or units attached (battle-level announcements such as
 * the outcome) are visible to all.
 */
function canWitness(
  event: BattleEvent,
  state: BattleState,
  faction: FactionId,
  scenario: BattleScenario,
  own: readonly Unit[],
): boolean {
  if (!event.unitIds || event.unitIds.length === 0) return true;

  const involved = event.unitIds
    .map((id) => state.units.find((u) => u.id === id))
    .filter((u): u is Unit => u !== undefined);

  if (involved.length === 0) return true;
  if (involved.some((u) => u.faction === faction)) return true;

  const where = event.position ?? involved[0]!.position;
  return own.some(
    (o) =>
      canAct(o) &&
      distance(o.position, where) <= sightRange(scenario, o, where),
  );
}

/* ------------------------------------------------------------------ */
/* Guard (INV-23)                                                      */
/* ------------------------------------------------------------------ */

/**
 * Assert that an observed state contains nothing the faction should not know.
 *
 * Used by tests and by the AI harness. This is the executable form of INV-23:
 * it is easy to write a projection that leaks, and much harder to notice the
 * leak by reading the output.
 */
export function assertNoLeaks(
  observed: ObservedState,
  state: BattleState,
  scenario: BattleScenario,
): void {
  const problems: string[] = [];

  for (const u of observed.own) {
    if (u.faction !== observed.faction) {
      problems.push(`own[] contains a unit of faction ${u.faction}`);
    }
  }

  for (const e of observed.enemies) {
    if (e.faction === observed.faction) {
      problems.push(`enemies[] contains an own unit ${e.id}`);
    }

    if (scenario.mechanics.fogOfWar === true) {
      const truth = state.units.find((u) => u.id === e.id);
      if (truth && e.strength.knowledge === 'KNOWN' && truth.strength > 0) {
        problems.push(
          `enemy ${e.id} strength is KNOWN exactly (${e.strength.value}) — fog of war requires an estimate (INV-24)`,
        );
      }
    }
  }

  if (scenario.mechanics.fogOfWar === true) {
    for (const f of observed.knownObstacles) {
      if (f.knownToFaction !== observed.faction) {
        problems.push(
          `obstacle field ${f.id} is visible to ${observed.faction} but was placed by ${f.knownToFaction}`,
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Observed state leaks information to ${observed.faction} (INV-23):\n` +
        problems.map((p) => `  ${p}`).join('\n'),
    );
  }
}
