/**
 * Replay and save/load.
 *
 * Master Prompt §27 (save/load contract), §28 (replay), §53 (simulation
 * testing), INV-18, INV-19, INV-22.
 *
 * Because `step` is a pure function of (state, commands, scenario), a battle is
 * fully reconstructible from its seed plus its command log. We therefore store
 * the log, not every frame (§28) — which is both far smaller and a much
 * stronger correctness statement, since a replay that diverges proves a real
 * determinism bug rather than a serialisation bug.
 */

import type { BattleState } from '../domain/types.ts';
import type { BattleScenario } from '../scenario/scenario.ts';
import { step, createInitialState, SIMULATION_VERSION, type Command } from './engine.ts';

export const REPLAY_FORMAT_VERSION = 1;

/** Commands issued on a particular tick. */
export interface CommandLogEntry {
  readonly tick: number;
  readonly commands: readonly Command[];
}

export interface Replay {
  readonly formatVersion: number;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly simulationVersion: string;
  readonly seed: string;
  readonly log: readonly CommandLogEntry[];
  /** Ticks the recording covers. */
  readonly finalTick: number;
  readonly recordedAt: string;
}

/* ------------------------------------------------------------------ */
/* Recording                                                           */
/* ------------------------------------------------------------------ */

export class ReplayRecorder {
  readonly #entries: CommandLogEntry[] = [];
  readonly #scenario: BattleScenario;
  readonly #seed: string;

  constructor(scenario: BattleScenario, seed: string) {
    this.#scenario = scenario;
    this.#seed = seed;
  }

  /** Record the commands issued for a tick. Empty ticks are not stored. */
  record(tick: number, commands: readonly Command[]): void {
    if (commands.length === 0) return;
    this.#entries.push({ tick, commands: [...commands] });
  }

  finish(finalTick: number, now: () => string = () => new Date().toISOString()): Replay {
    return {
      formatVersion: REPLAY_FORMAT_VERSION,
      scenarioId: this.#scenario.id,
      scenarioVersion: this.#scenario.version,
      simulationVersion: SIMULATION_VERSION,
      seed: this.#seed,
      log: [...this.#entries],
      finalTick,
      recordedAt: now(),
    };
  }
}

/* ------------------------------------------------------------------ */
/* Playback                                                            */
/* ------------------------------------------------------------------ */

export class ReplayMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayMismatchError';
  }
}

/**
 * Reconstruct a battle from a replay.
 *
 * Refuses to run against a different scenario or simulation version (INV-18).
 * This is deliberately a hard failure rather than a best-effort attempt: a
 * replay run against changed rules produces a plausible battle that never
 * happened, which is worse than no replay at all.
 */
export function playReplay(
  replay: Replay,
  scenario: BattleScenario,
  options: { readonly untilTick?: number } = {},
): BattleState {
  if (replay.formatVersion !== REPLAY_FORMAT_VERSION) {
    throw new ReplayMismatchError(
      `Replay format version ${replay.formatVersion} cannot be read by this build (expects ${REPLAY_FORMAT_VERSION}).`,
    );
  }
  if (replay.scenarioId !== scenario.id) {
    throw new ReplayMismatchError(
      `Replay is for scenario ${replay.scenarioId}, not ${scenario.id}.`,
    );
  }
  if (replay.scenarioVersion !== scenario.version) {
    throw new ReplayMismatchError(
      `Replay was recorded against scenario version ${replay.scenarioVersion}, but this build has ${scenario.version}. ` +
        `Historical data has changed, so the replay would not reproduce the recorded battle.`,
    );
  }
  if (replay.simulationVersion !== SIMULATION_VERSION) {
    throw new ReplayMismatchError(
      `Replay was recorded with simulation version ${replay.simulationVersion}, but this build is ${SIMULATION_VERSION}. ` +
        `Simulation rules have changed; replaying would fabricate a battle that never occurred.`,
    );
  }

  const byTick = new Map<number, readonly Command[]>();
  for (const entry of replay.log) byTick.set(entry.tick, entry.commands);

  const limit = options.untilTick ?? replay.finalTick;
  let state = createInitialState(scenario, replay.seed);

  while (state.tick < limit && state.outcome.kind === 'ONGOING') {
    // Commands are recorded against the tick they were issued on, which is the
    // tick *before* step() advances the counter.
    const commands = byTick.get(state.tick) ?? [];
    state = step(state, commands, scenario);
  }

  return state;
}

/* ------------------------------------------------------------------ */
/* Save / load (§27)                                                   */
/* ------------------------------------------------------------------ */

export const SAVE_FORMAT_VERSION = 1;

export interface SaveGame {
  readonly formatVersion: number;
  readonly state: BattleState;
  readonly replay: Replay;
  readonly savedAt: string;
}

export function createSave(
  state: BattleState,
  replay: Replay,
  now: () => string = () => new Date().toISOString(),
): SaveGame {
  return { formatVersion: SAVE_FORMAT_VERSION, state, replay, savedAt: now() };
}

/**
 * Restore a save, verifying it is compatible and internally consistent.
 * A save that restores an invalid state is a corrupt save (INV-22), so callers
 * should run the state validator on the result.
 */
export function loadSave(save: SaveGame, scenario: BattleScenario): BattleState {
  if (save.formatVersion !== SAVE_FORMAT_VERSION) {
    throw new ReplayMismatchError(
      `Save format version ${save.formatVersion} cannot be read by this build (expects ${SAVE_FORMAT_VERSION}).`,
    );
  }
  if (save.state.scenarioId !== scenario.id) {
    throw new ReplayMismatchError(
      `Save is for scenario ${save.state.scenarioId}, not ${scenario.id}.`,
    );
  }
  if (save.state.scenarioVersion !== scenario.version) {
    throw new ReplayMismatchError(
      `Save was made against scenario version ${save.state.scenarioVersion}, but this build has ${scenario.version}.`,
    );
  }
  if (save.state.simulationVersion !== SIMULATION_VERSION) {
    throw new ReplayMismatchError(
      `Save was made with simulation version ${save.state.simulationVersion}, but this build is ${SIMULATION_VERSION}.`,
    );
  }
  return save.state;
}

/** Round-trip a save through JSON, as persistence would. */
export function serialiseSave(save: SaveGame): string {
  return JSON.stringify(save);
}

export function deserialiseSave(json: string): SaveGame {
  return JSON.parse(json) as SaveGame;
}
