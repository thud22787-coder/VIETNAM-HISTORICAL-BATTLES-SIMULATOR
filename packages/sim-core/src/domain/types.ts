/**
 * Core domain types.
 *
 * Layer discipline (Master Prompt §82, §83):
 *
 *   HISTORICAL TRUTH  -> docs/HISTORICAL_SOURCES.md (prose + citations)
 *   SCENARIO DEFINITION -> Scenario (immutable, frozen at load)
 *   RUNTIME GAME STATE  -> BattleState (mutable via reducers only)
 *   WHAT-IF             -> a cloned+modified Scenario, never a mutated one
 *
 * These layers are never mixed. A BattleState references its scenario by id and
 * version rather than embedding it, so a runtime state can never quietly
 * "become" the historical record.
 */

import type { EpistemicStatus, SourceRef, UncertainQuantity } from '../history/epistemic.ts';

/* ------------------------------------------------------------------ */
/* Identifiers                                                         */
/* ------------------------------------------------------------------ */

export type UnitId = string & { readonly __brand: 'UnitId' };
export type FactionId = string & { readonly __brand: 'FactionId' };
export type CommanderId = string & { readonly __brand: 'CommanderId' };
export type EventId = string & { readonly __brand: 'EventId' };

export const unitId = (s: string): UnitId => s as UnitId;
export const factionId = (s: string): FactionId => s as FactionId;
export const commanderId = (s: string): CommanderId => s as CommanderId;
export const eventId = (s: string): EventId => s as EventId;

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/** Position in scenario map units (metres). */
export interface Position {
  readonly x: number;
  readonly y: number;
}

export const distance = (a: Position, b: Position): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

/**
 * Unit categories are open-ended by design (§13): scenarios declare which
 * types are legal for their period, so the engine never assumes a fixed roster
 * and cannot admit an anachronism it was not told about.
 */
export type UnitKind =
  | 'INFANTRY'
  | 'CAVALRY'
  | 'ARCHERS'
  | 'LIGHT_BOAT'
  | 'WAR_JUNK'
  | 'HEAVY_SHIP'
  | 'MILITIA'
  | 'ELITE'
  | 'SIEGE'
  | 'SUPPORT';

export type UnitStatus = 'ACTIVE' | 'ENGAGED' | 'ROUTED' | 'DESTROYED' | 'IMMOBILISED';

/**
 * A unit is a formation (a squadron, a company), never an individual soldier.
 * Master Prompt §47: simulating individuals would cost performance without
 * changing any decision the player makes.
 */
export interface Unit {
  readonly id: UnitId;
  readonly faction: FactionId;
  readonly kind: UnitKind;
  readonly name: string;

  /** Effective fighting strength (men or vessels, per unit kind). */
  readonly strength: number;
  readonly initialStrength: number;

  /** Normalised 0..1 stats. See INV-12. */
  readonly morale: number;
  readonly fatigue: number;
  readonly cohesion: number;
  readonly supply: number;

  readonly position: Position;
  readonly status: UnitStatus;
  readonly commanderId?: CommanderId;

  /**
   * Draft in metres for waterborne units. This is what interacts with the tide
   * and submerged obstacles — the mechanism behind Bach Dang.
   */
  readonly draftM?: number;

  /** Metres per hour on open ground/water, before terrain modifiers. */
  readonly baseSpeedMPerHour: number;
}

export const isWaterborne = (kind: UnitKind): boolean =>
  kind === 'LIGHT_BOAT' || kind === 'WAR_JUNK' || kind === 'HEAVY_SHIP';

export const canAct = (u: Unit): boolean =>
  u.status !== 'DESTROYED' && u.status !== 'ROUTED';

/* ------------------------------------------------------------------ */
/* Commanders                                                          */
/* ------------------------------------------------------------------ */

/**
 * Commander ratings are GAME SYSTEM VARIABLES, not historical measurements
 * (§15, §42, §88). The type name says so, and UI must present them as game
 * ratings. We do not publish numeric judgements of real people and call it
 * history.
 */
export interface CommanderRatings {
  readonly leadership: number;
  readonly tactical: number;
  readonly strategic: number;
  /** Radius in metres within which this commander's bonuses apply. */
  readonly commandRangeM: number;
}

export interface Commander {
  readonly id: CommanderId;
  readonly faction: FactionId;
  /** Historical name, as attested. */
  readonly name: string;
  /** Always a game abstraction. Never rendered as a historical claim. */
  readonly ratings: CommanderRatings;
  /** Sourced biographical note for the education layer. */
  readonly historicalNote?: {
    readonly text: string;
    readonly status: EpistemicStatus;
    readonly sources: readonly SourceRef[];
  };
}

/* ------------------------------------------------------------------ */
/* Factions                                                            */
/* ------------------------------------------------------------------ */

export interface Faction {
  readonly id: FactionId;
  readonly name: string;
  /** Unit kinds this faction may field in this scenario (§14, §21 anachronism guard). */
  readonly allowedUnitKinds: readonly UnitKind[];
}

/* ------------------------------------------------------------------ */
/* Events (§11)                                                        */
/* ------------------------------------------------------------------ */

export type EventKind =
  /** Recorded as having happened, with sources. Never emitted by the engine. */
  | 'HISTORICAL_EVENT'
  /** The player did this. */
  | 'PLAYER_TRIGGERED'
  /** Emerged from the simulation. */
  | 'SIMULATION_EVENT'
  /** What-if / authored content. */
  | 'FICTIONAL_EVENT';

export interface BattleEvent {
  readonly id: EventId;
  readonly kind: EventKind;
  /** Simulation tick at which it occurred. */
  readonly tick: number;
  readonly message: string;
  readonly unitIds?: readonly UnitId[];
  readonly position?: Position;
  /** Populated only for HISTORICAL_EVENT. Enforced by the validator. */
  readonly sources?: readonly SourceRef[];
}

/* ------------------------------------------------------------------ */
/* Runtime state                                                       */
/* ------------------------------------------------------------------ */

export type BattleOutcome =
  | { readonly kind: 'ONGOING' }
  | { readonly kind: 'DECIDED'; readonly victor: FactionId; readonly reason: string }
  | { readonly kind: 'DRAW'; readonly reason: string };

/**
 * The runtime state of one battle.
 *
 * Bound to its scenario by id + version (INV-17) so that a result can always be
 * traced to the exact historical data it was produced from, and so a replay
 * cannot silently run against different data than it was recorded with.
 */
export interface BattleState {
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly simulationVersion: string;

  readonly tick: number;
  /** In-world elapsed time. Drives the tide and other scheduled systems. */
  readonly elapsedHours: number;

  readonly units: readonly Unit[];
  readonly commanders: readonly Commander[];
  readonly events: readonly BattleEvent[];
  readonly outcome: BattleOutcome;

  /** RNG state, stored so the battle can be resumed or replayed (INV-19). */
  readonly rngState: number;
  /** The seed the battle began from. */
  readonly seed: string;
}

/* ------------------------------------------------------------------ */
/* Forces described historically (scenario layer)                      */
/* ------------------------------------------------------------------ */

/**
 * How a scenario describes a historical force. Note that the *historical* size
 * is an UncertainQuantity while the *simulated* roster is concrete: the two are
 * deliberately separate, so the game can show "sources say 5,000-10,000" while
 * still having runnable units (§6, §87).
 */
export interface HistoricalForce {
  readonly faction: FactionId;
  readonly description: string;
  readonly historicalSize: UncertainQuantity;
  readonly note?: string;
}
