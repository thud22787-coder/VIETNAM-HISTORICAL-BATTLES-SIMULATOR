/**
 * Scenario definition — the data layer between historical truth and runtime.
 *
 * Master Prompt §8 (scenario contract), §9 (versioning), §21 (scenario-specific
 * mechanics), §38 (data, not engine code), §73 (content scalability).
 *
 * The engine must never contain `if (battle === 'bach_dang')`. Instead a
 * scenario *declares* which mechanics it uses, and the engine runs whatever it
 * is given. Adding a battle should be new data plus config, never an engine
 * rewrite (§72).
 */

import type { EpistemicStatus, SourceRef, UncertainQuantity } from '../history/epistemic.ts';
import type {
  Commander,
  Faction,
  FactionId,
  HistoricalForce,
  Unit,
  UnitKind,
  Position,
} from '../domain/types.ts';
import type { TideConfig } from '../sim/tide.ts';

/* ------------------------------------------------------------------ */
/* Terrain (§19)                                                       */
/* ------------------------------------------------------------------ */

export type TerrainKind =
  | 'DEEP_WATER'
  | 'SHALLOW_WATER'
  | 'TIDAL_FLAT'
  | 'MARSH'
  | 'FOREST'
  | 'PLAIN'
  | 'HILL'
  | 'RIVERBANK';

export interface TerrainCell {
  readonly kind: TerrainKind;
  /**
   * Bed elevation in metres relative to the scenario datum. For water cells
   * this combines with tide level to give navigable depth.
   */
  readonly bedElevationM: number;
}

export interface TerrainMap {
  readonly widthCells: number;
  readonly heightCells: number;
  /** Metres per cell. */
  readonly cellSizeM: number;
  /** Row-major, length widthCells * heightCells. */
  readonly cells: readonly TerrainCell[];
}

export const terrainAt = (
  map: TerrainMap,
  cellX: number,
  cellY: number,
): TerrainCell | undefined => {
  if (cellX < 0 || cellY < 0 || cellX >= map.widthCells || cellY >= map.heightCells) {
    return undefined;
  }
  return map.cells[cellY * map.widthCells + cellX];
};

export const terrainAtPosition = (map: TerrainMap, p: Position): TerrainCell | undefined =>
  terrainAt(map, Math.floor(p.x / map.cellSizeM), Math.floor(p.y / map.cellSizeM));

/* ------------------------------------------------------------------ */
/* Obstacles — generic, not "stakes"                                   */
/* ------------------------------------------------------------------ */

/**
 * A submerged or emplaced obstacle field.
 *
 * Named generically on purpose. Bach Dang's iron-tipped stakes are one
 * instance; caltrops, booms, sunken hulks and pit traps are others. The engine
 * knows only "obstacle with a top height that damages units drawing more than
 * the available clearance".
 */
export interface ObstacleField {
  readonly id: string;
  readonly name: string;
  /** Cell coordinates covered by the field. */
  readonly cells: readonly { readonly x: number; readonly y: number }[];
  /** Height of the obstacle tops, in metres relative to datum. */
  readonly topHeightM: number;
  /** Probability a qualifying vessel is struck per tick within the field. */
  readonly strikeChancePerTick: number;
  /** Fraction of strength lost when struck. */
  readonly strikeDamageFraction: number;
  /** Whether the defending side placed it and therefore knows where it is. */
  readonly knownToFaction: FactionId;
  /** Where this obstacle's parameters come from epistemically. */
  readonly provenance: {
    readonly status: EpistemicStatus;
    readonly sources: readonly SourceRef[];
    readonly note: string;
  };
}

/* ------------------------------------------------------------------ */
/* Objectives and victory (§8, INV-15)                                 */
/* ------------------------------------------------------------------ */

export type VictoryCondition =
  /** Reduce an enemy faction below a fraction of its starting strength. */
  | {
      readonly kind: 'ATTRITION';
      readonly targetFaction: FactionId;
      readonly strengthFractionBelow: number;
    }
  /** Survive until a given in-world hour. */
  | { readonly kind: 'SURVIVE_UNTIL'; readonly hours: number }
  /**
   * Neutralise a fraction of an enemy's waterborne units.
   *
   * `countImmobilised` decides whether a vessel merely held fast counts.
   * Setting it false means the attacker must actually finish trapped ships
   * rather than being handed a victory the obstacles won on their own -- which
   * is the difference between the player being a participant and a spectator.
   */
  | {
      readonly kind: 'FLEET_NEUTRALISED';
      readonly targetFaction: FactionId;
      readonly fractionNeutralised: number;
      readonly countImmobilised?: boolean;
    }
  /**
   * Get a fraction of one's own force past a line on the map.
   *
   * For a force whose goal is to leave rather than to win a fight. Expressing
   * that as an attrition threshold would be a lie about the objective, and an
   * AI commander reading the scenario honestly would fight instead of running.
   */
  | {
      readonly kind: 'ESCAPE';
      /** Escape is achieved at or beyond this x, on whichever side. */
      readonly beyondX: number;
      /** Which direction counts as out: 'BELOW' means x <= beyondX. */
      readonly direction: 'BELOW' | 'ABOVE';
      readonly fractionEscaped: number;
    };

export interface Objective {
  readonly id: string;
  readonly faction: FactionId;
  readonly description: string;
  readonly condition: VictoryCondition;
}

/**
 * How a battle ends if no objective is met.
 *
 * Every scenario needs one: a simulation that simply stops after N ticks tells
 * the player nothing, and INV-15 requires victory to be evaluated consistently.
 * The natural limit here is the mechanic's own window — once the tide has run
 * out, the situation is settled one way or the other.
 */
export interface TimeLimit {
  /** In-world hours after which the battle is adjudicated. */
  readonly hours: number;
  /**
   * Who prevails if the limit is reached. Usually the defender, who only
   * needed to deny the objective.
   */
  readonly favours: FactionId;
  readonly reason: string;
}

/* ------------------------------------------------------------------ */
/* Historical narrative (§10, §11)                                     */
/* ------------------------------------------------------------------ */

export interface HistoricalPhase {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly status: EpistemicStatus;
  readonly sources: readonly SourceRef[];
}

export interface HistoricalOutcome {
  readonly victor: FactionId;
  readonly summary: string;
  readonly status: EpistemicStatus;
  readonly sources: readonly SourceRef[];
  /** Casualty figures, which are usually the least reliable data we have. */
  readonly casualties?: readonly {
    readonly faction: FactionId;
    readonly figure: UncertainQuantity;
  }[];
}

/* ------------------------------------------------------------------ */
/* Mechanics declaration (§21)                                         */
/* ------------------------------------------------------------------ */

/**
 * Scenario-declared mechanics. The engine checks which are present and runs
 * the corresponding system. Absent config means the system does not run.
 *
 * This is the mechanism that keeps `if (battle === ...)` out of the engine.
 */
export interface ScenarioMechanics {
  readonly tide?: TideConfig;
  readonly obstacleFields?: readonly ObstacleField[];
  /** Whether units have limited information about the enemy (§17). */
  readonly fogOfWar?: boolean;
}

/* ------------------------------------------------------------------ */
/* The scenario                                                        */
/* ------------------------------------------------------------------ */

export type ScenarioMode = 'HISTORICAL' | 'WHAT_IF' | 'BALANCED';

export interface BattleScenario {
  readonly id: string;
  /** Bumped whenever historical data changes (§9). */
  readonly version: string;

  readonly title: string;
  readonly period: string;
  readonly dateDescription: string;
  readonly location: string;

  /** Short context shown before play (§44 progressive disclosure). */
  readonly briefing: string;

  readonly factions: readonly Faction[];
  readonly commanders: readonly Commander[];

  /** What history says the forces were — uncertain by nature. */
  readonly historicalForces: readonly HistoricalForce[];
  /** The concrete, runnable roster. A gameplay construction. */
  readonly initialUnits: readonly Unit[];

  readonly terrain: TerrainMap;
  readonly mechanics: ScenarioMechanics;
  readonly objectives: readonly Objective[];
  /** Adjudication if no objective is met (see TimeLimit). */
  readonly timeLimit: TimeLimit;

  readonly historicalPhases: readonly HistoricalPhase[];
  readonly historicalOutcome: HistoricalOutcome;

  /** Every source id this scenario relies on. */
  readonly sources: readonly SourceRef[];

  /**
   * Honest statement of what in this scenario is invented. Displayed to the
   * player. Required — a scenario that claims nothing is assumed is lying.
   */
  readonly gameplayAssumptions: readonly string[];

  /** Unit kinds legal in this period, for the anachronism guard (INV-21). */
  readonly allowedUnitKinds: readonly UnitKind[];
}
