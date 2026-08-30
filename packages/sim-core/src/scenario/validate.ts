/**
 * Scenario validator (Master Prompt §94).
 *
 * A scenario must not run if it is structurally broken or historically
 * dishonest. This catches both classes: missing factions and broken references
 * on one side, unsourced factual claims and undeclared assumptions on the other.
 */

import type { BattleScenario } from './scenario.ts';
import { validateClaimLike, validateUncertainQuantity, type ClaimProblem } from '../history/epistemic.ts';

export interface ScenarioProblem {
  readonly severity: 'ERROR' | 'WARNING';
  readonly code: string;
  readonly message: string;
}

const toScenarioProblem = (p: ClaimProblem): ScenarioProblem => ({
  severity: p.severity,
  code: p.code,
  message: p.message,
});

export function validateScenario(scenario: BattleScenario): ScenarioProblem[] {
  const problems: ScenarioProblem[] = [];
  const err = (code: string, message: string): void => {
    problems.push({ severity: 'ERROR', code, message });
  };
  const warn = (code: string, message: string): void => {
    problems.push({ severity: 'WARNING', code, message });
  };

  /* --- Structure --- */

  if (!scenario.id) err('MISSING_ID', 'Scenario has no id.');
  if (!scenario.version) err('MISSING_VERSION', 'Scenario has no version (§9).');
  if (scenario.factions.length < 2) {
    err('INSUFFICIENT_FACTIONS', 'A battle needs at least two factions.');
  }

  const factionIds = new Set(scenario.factions.map((f) => f.id));

  for (const c of scenario.commanders) {
    if (!factionIds.has(c.faction)) {
      err('BROKEN_COMMANDER_FACTION', `Commander ${c.id} references unknown faction ${c.faction}.`);
    }
  }

  const commanderIds = new Set(scenario.commanders.map((c) => c.id));
  const allowedKinds = new Set(scenario.allowedUnitKinds);
  const seenUnitIds = new Set<string>();

  for (const u of scenario.initialUnits) {
    if (seenUnitIds.has(u.id)) err('DUPLICATE_UNIT_ID', `Duplicate unit id ${u.id}.`);
    seenUnitIds.add(u.id);

    if (!factionIds.has(u.faction)) {
      err('BROKEN_UNIT_FACTION', `Unit ${u.id} references unknown faction ${u.faction}.`);
    }
    if (u.commanderId !== undefined && !commanderIds.has(u.commanderId)) {
      err('BROKEN_UNIT_COMMANDER', `Unit ${u.id} references unknown commander ${u.commanderId}.`);
    }

    // INV-21 anachronism guard: the unit kind must be legal for this period,
    // and legal for this faction specifically.
    if (!allowedKinds.has(u.kind)) {
      err(
        'ANACHRONISTIC_UNIT',
        `Unit ${u.id} is of kind ${u.kind}, not permitted in scenario period "${scenario.period}" (§14, INV-21).`,
      );
    }
    const faction = scenario.factions.find((f) => f.id === u.faction);
    if (faction && !faction.allowedUnitKinds.includes(u.kind)) {
      err(
        'UNIT_KIND_NOT_ALLOWED_FOR_FACTION',
        `Unit ${u.id} of kind ${u.kind} is not available to faction ${u.faction}.`,
      );
    }

    if (u.initialStrength <= 0) {
      err('NON_POSITIVE_STRENGTH', `Unit ${u.id} has non-positive initial strength.`);
    }
  }

  if (scenario.initialUnits.length === 0) {
    err('NO_UNITS', 'Scenario has no initial units.');
  }

  /* --- Terrain --- */

  const expectedCells = scenario.terrain.widthCells * scenario.terrain.heightCells;
  if (scenario.terrain.cells.length !== expectedCells) {
    err(
      'TERRAIN_SIZE_MISMATCH',
      `Terrain declares ${scenario.terrain.widthCells}x${scenario.terrain.heightCells} = ${expectedCells} cells but has ${scenario.terrain.cells.length}.`,
    );
  }
  if (scenario.terrain.cellSizeM <= 0) {
    err('INVALID_CELL_SIZE', 'Terrain cellSizeM must be positive.');
  }

  // Units must start on the map.
  const mapWidthM = scenario.terrain.widthCells * scenario.terrain.cellSizeM;
  const mapHeightM = scenario.terrain.heightCells * scenario.terrain.cellSizeM;
  for (const u of scenario.initialUnits) {
    if (u.position.x < 0 || u.position.y < 0 || u.position.x > mapWidthM || u.position.y > mapHeightM) {
      err('UNIT_OFF_MAP', `Unit ${u.id} starts outside the map at (${u.position.x}, ${u.position.y}).`);
    }
  }

  /* --- Objectives --- */

  if (scenario.objectives.length === 0) {
    err('NO_OBJECTIVES', 'Scenario defines no objectives, so victory can never be evaluated (INV-15).');
  }
  for (const o of scenario.objectives) {
    if (!factionIds.has(o.faction)) {
      err('BROKEN_OBJECTIVE_FACTION', `Objective ${o.id} references unknown faction ${o.faction}.`);
    }
    const cond = o.condition;
    if (cond.kind === 'ATTRITION' && !factionIds.has(cond.targetFaction)) {
      err('BROKEN_OBJECTIVE_TARGET', `Objective ${o.id} targets unknown faction ${cond.targetFaction}.`);
    }
    if (cond.kind === 'FLEET_NEUTRALISED' && !factionIds.has(cond.targetFaction)) {
      err('BROKEN_OBJECTIVE_TARGET', `Objective ${o.id} targets unknown faction ${cond.targetFaction}.`);
    }
  }

  if (!factionIds.has(scenario.timeLimit.favours)) {
    err(
      'BROKEN_TIMELIMIT_FACTION',
      `Time limit favours unknown faction ${scenario.timeLimit.favours}.`,
    );
  }
  if (scenario.timeLimit.hours <= 0) {
    err('INVALID_TIMELIMIT', 'Time limit hours must be positive.');
  }

  /* --- Mechanics --- */

  const tide = scenario.mechanics.tide;
  if (tide) {
    if (tide.periodHours <= 0) err('INVALID_TIDE_PERIOD', 'Tide periodHours must be positive.');
    if (tide.highWaterM < tide.lowWaterM) {
      err('INVALID_TIDE_RANGE', 'Tide highWaterM must be >= lowWaterM.');
    }
  }

  for (const field of scenario.mechanics.obstacleFields ?? []) {
    if (!factionIds.has(field.knownToFaction)) {
      err('BROKEN_OBSTACLE_FACTION', `Obstacle field ${field.id} is known to unknown faction ${field.knownToFaction}.`);
    }
    if (field.cells.length === 0) {
      err('EMPTY_OBSTACLE_FIELD', `Obstacle field ${field.id} covers no cells.`);
    }
    if (field.strikeChancePerTick < 0 || field.strikeChancePerTick > 1) {
      err('INVALID_STRIKE_CHANCE', `Obstacle field ${field.id} strikeChancePerTick must be in [0,1].`);
    }
    if (field.strikeDamageFraction < 0 || field.strikeDamageFraction > 1) {
      err('INVALID_STRIKE_DAMAGE', `Obstacle field ${field.id} strikeDamageFraction must be in [0,1].`);
    }
    // Obstacles depend on the tide to matter; flag the likely authoring error.
    if (!tide) {
      warn(
        'OBSTACLE_WITHOUT_TIDE',
        `Obstacle field ${field.id} exists but the scenario declares no tide; depth-based strikes will not vary.`,
      );
    }
    // An obstacle field is a historical claim about the battlefield.
    problems.push(
      ...validateClaimLike(
        { status: field.provenance.status, confidence: 'MEDIUM', sources: field.provenance.sources },
        `obstacleField.${field.id}`,
      ).map(toScenarioProblem),
    );
  }

  /* --- Historical honesty (§4, §85) --- */

  if (!factionIds.has(scenario.historicalOutcome.victor)) {
    err('BROKEN_OUTCOME_VICTOR', 'Historical outcome names a faction not in the scenario.');
  }

  problems.push(
    ...validateClaimLike(
      {
        status: scenario.historicalOutcome.status,
        confidence: 'HIGH',
        sources: scenario.historicalOutcome.sources,
      },
      'historicalOutcome',
    ).map(toScenarioProblem),
  );

  for (const phase of scenario.historicalPhases) {
    problems.push(
      ...validateClaimLike(
        { status: phase.status, confidence: 'MEDIUM', sources: phase.sources },
        `historicalPhase.${phase.id}`,
      ).map(toScenarioProblem),
    );
  }

  for (const force of scenario.historicalForces) {
    if (!factionIds.has(force.faction)) {
      err('BROKEN_FORCE_FACTION', `Historical force references unknown faction ${force.faction}.`);
    }
    problems.push(
      ...validateUncertainQuantity(force.historicalSize, `historicalForce.${force.faction}.size`).map(
        toScenarioProblem,
      ),
    );
  }

  for (const c of scenario.historicalOutcome.casualties ?? []) {
    problems.push(
      ...validateUncertainQuantity(c.figure, `historicalOutcome.casualties.${c.faction}`).map(
        toScenarioProblem,
      ),
    );
  }

  // §4: a scenario that declares no assumptions is almost certainly not being
  // honest about the gap between evidence and a runnable simulation.
  if (scenario.gameplayAssumptions.length === 0) {
    warn(
      'NO_DECLARED_ASSUMPTIONS',
      'Scenario declares no gameplay assumptions. Every runnable scenario invents something; say what.',
    );
  }

  if (scenario.sources.length === 0) {
    err('NO_SOURCES', 'Scenario cites no sources (§5).');
  }

  return problems;
}

export const scenarioErrors = (problems: readonly ScenarioProblem[]): readonly ScenarioProblem[] =>
  problems.filter((p) => p.severity === 'ERROR');

/** Throw unless the scenario is fit to run (§96 fail early). */
export function assertScenarioValid(scenario: BattleScenario): void {
  const errors = scenarioErrors(validateScenario(scenario));
  if (errors.length > 0) {
    throw new Error(
      `Scenario "${scenario.id}" is invalid:\n` +
        errors.map((e) => `  [${e.code}] ${e.message}`).join('\n'),
    );
  }
}
