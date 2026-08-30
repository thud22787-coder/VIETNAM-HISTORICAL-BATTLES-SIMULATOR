import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ReplayRecorder,
  playReplay,
  ReplayMismatchError,
  createSave,
  loadSave,
  serialiseSave,
  deserialiseSave,
} from '../src/sim/replay.ts';
import { createInitialState, step, SIMULATION_VERSION, type Command } from '../src/sim/engine.ts';
import { BACH_DANG_1288, DAI_VIET, YUAN } from '../src/scenario/battles/bach-dang-1288.ts';
import { HistoricalBaseline } from '../src/history/baseline.ts';
import { createWhatIf, compareWithHistory, summariseForces } from '../src/history/whatif.ts';
import { analyseBattle } from '../src/analysis/analyse.ts';
import { assertScenarioValid } from '../src/scenario/validate.ts';
import { checkInvariants } from '../src/state/validator.ts';
import { canAct, type BattleState } from '../src/domain/types.ts';

/** Play a battle, recording commands as we go. */
function playAndRecord(departTick = 6, seed = 'replay-seed', maxTicks = 220) {
  const recorder = new ReplayRecorder(BACH_DANG_1288, seed);
  let state = createInitialState(BACH_DANG_1288, seed);

  for (let i = 0; i < maxTicks && state.outcome.kind === 'ONGOING'; i++) {
    const commands: Command[] = [];
    for (const u of state.units) {
      if (u.faction !== YUAN || !canAct(u)) continue;
      if (state.tick >= departTick) {
        commands.push({ kind: 'MOVE', unitId: u.id, to: { x: 200, y: u.position.y } });
      }
    }
    recorder.record(state.tick, commands);
    state = step(state, commands, BACH_DANG_1288);
  }

  return { state, replay: recorder.finish(state.tick, () => '2026-01-01T00:00:00.000Z') };
}

describe('replay (§28, INV-18)', () => {
  test('a replay reproduces the original battle exactly', () => {
    const { state, replay } = playAndRecord();
    const replayed = playReplay(replay, BACH_DANG_1288);

    assert.equal(replayed.tick, state.tick);
    assert.equal(replayed.rngState, state.rngState);
    assert.deepEqual(replayed.outcome, state.outcome);
    assert.deepEqual(
      replayed.units.map((u) => [u.id, u.strength, u.status, u.morale]),
      state.units.map((u) => [u.id, u.strength, u.status, u.morale]),
    );
    assert.deepEqual(
      replayed.events.map((e) => e.message),
      state.events.map((e) => e.message),
    );
  });

  test('a replay can be played to an intermediate tick (scrubbing)', () => {
    const { replay } = playAndRecord();
    const partial = playReplay(replay, BACH_DANG_1288, { untilTick: 10 });
    assert.equal(partial.tick, 10);
  });

  test('replay stores only issued commands, not every frame', () => {
    const { replay } = playAndRecord(6);
    // Ticks before departure issue no commands and must not be stored.
    assert.ok(replay.log.every((e) => e.commands.length > 0));
    assert.ok(replay.log.length < replay.finalTick);
  });

  test('refuses to run against a changed scenario version', () => {
    const { replay } = playAndRecord();
    const altered = { ...BACH_DANG_1288, version: 'v2' };
    assert.throws(() => playReplay(replay, altered), ReplayMismatchError);
  });

  test('refuses to run against a changed simulation version', () => {
    const { replay } = playAndRecord();
    const tampered = { ...replay, simulationVersion: '9.9.9' };
    assert.throws(
      () => playReplay(tampered, BACH_DANG_1288),
      (err: Error) => err instanceof ReplayMismatchError && /simulation rules have changed/i.test(err.message),
    );
  });

  test('refuses a replay for a different scenario', () => {
    const { replay } = playAndRecord();
    assert.throws(
      () => playReplay({ ...replay, scenarioId: 'OTHER_BATTLE' }, BACH_DANG_1288),
      ReplayMismatchError,
    );
  });
});

describe('save / load (§27, INV-22)', () => {
  test('a save round-trips through JSON and restores a valid state', () => {
    const { state, replay } = playAndRecord();
    const save = createSave(state, replay, () => '2026-01-01T00:00:00.000Z');

    const restored = loadSave(deserialiseSave(serialiseSave(save)), BACH_DANG_1288);

    assert.deepEqual(
      restored.units.map((u) => [u.id, u.strength, u.status]),
      state.units.map((u) => [u.id, u.strength, u.status]),
    );
    assert.equal(restored.rngState, state.rngState);
    // INV-22: the restored state must itself be valid.
    assert.deepEqual(checkInvariants(restored), []);
  });

  test('a restored save continues identically to the original', () => {
    const { state } = playAndRecord(6, 'continue-seed', 20);
    const save = createSave(state, new ReplayRecorder(BACH_DANG_1288, 'continue-seed').finish(state.tick));
    const restored = loadSave(deserialiseSave(serialiseSave(save)), BACH_DANG_1288);

    const advance = (s: BattleState): BattleState => step(s, [], BACH_DANG_1288);
    assert.equal(advance(restored).rngState, advance(state).rngState);
  });

  test('refuses a save from an incompatible simulation version', () => {
    const { state, replay } = playAndRecord();
    const save = createSave({ ...state, simulationVersion: '0.0.1' }, replay);
    assert.throws(() => loadSave(save, BACH_DANG_1288), ReplayMismatchError);
  });

  test('the save records the versions needed to interpret it', () => {
    const { state, replay } = playAndRecord();
    const save = createSave(state, replay);
    assert.equal(save.state.simulationVersion, SIMULATION_VERSION);
    assert.equal(save.state.scenarioVersion, BACH_DANG_1288.version);
    assert.ok(save.state.seed);
  });
});

describe('what-if (§3, §26, §83)', () => {
  const baseline = new HistoricalBaseline('BACH_DANG_1288', 'v1', BACH_DANG_1288);

  test('creating a what-if never mutates the baseline', () => {
    const before = JSON.stringify(baseline.data.initialUnits.map((u) => u.strength));
    createWhatIf(baseline, [{ kind: 'FORCE_SCALE', faction: YUAN, multiplier: 2 }]);
    const after = JSON.stringify(baseline.data.initialUnits.map((u) => u.strength));
    assert.equal(before, after, 'INV-16: baseline must be untouched');
  });

  test('a what-if scenario is marked as counterfactual', () => {
    const whatIf = createWhatIf(baseline, [{ kind: 'TIDE_SHIFT', shiftHours: 3 }]);
    assert.match(whatIf.id, /WHATIF/);
    assert.match(whatIf.version, /whatif/);
    assert.ok(
      whatIf.gameplayAssumptions.some((a) => a.startsWith('WHAT-IF:')),
      'the counterfactual nature must be declared to the player',
    );
  });

  test('a what-if scenario is still structurally valid', () => {
    const whatIf = createWhatIf(baseline, [{ kind: 'FORCE_SCALE', faction: DAI_VIET, multiplier: 1.2 }]);
    assert.doesNotThrow(() => assertScenarioValid(whatIf));
  });

  test('FORCE_SCALE actually changes strength', () => {
    const whatIf = createWhatIf(baseline, [{ kind: 'FORCE_SCALE', faction: DAI_VIET, multiplier: 2 }]);
    const orig = BACH_DANG_1288.initialUnits.filter((u) => u.faction === DAI_VIET);
    const scaled = whatIf.initialUnits.filter((u) => u.faction === DAI_VIET);
    assert.equal(
      scaled.reduce((s, u) => s + u.strength, 0),
      orig.reduce((s, u) => s + u.strength, 0) * 2,
    );
  });

  test('removing the stakes changes the battle — the mechanic is load-bearing', () => {
    // THE headline what-if: "what if the channel had not been prepared?"
    const whatIf = createWhatIf(baseline, [
      { kind: 'REMOVE_OBSTACLES', fieldId: 'stake-field-narrows' },
    ]);
    assert.equal(whatIf.mechanics.obstacleFields?.length, 0);

    const run = (scenario: typeof BACH_DANG_1288): BattleState => {
      let s = createInitialState(scenario, 'whatif-seed');
      for (let i = 0; i < 220 && s.outcome.kind === 'ONGOING'; i++) {
        const commands: Command[] = s.units
          .filter((u) => u.faction === YUAN && canAct(u))
          .map((u) => ({ kind: 'MOVE' as const, unitId: u.id, to: { x: 200, y: u.position.y } }));
        s = step(s, commands, scenario);
      }
      return s;
    };

    const withStakes = run(BACH_DANG_1288);
    const without = run(whatIf);

    const escaped = (s: BattleState): number =>
      s.units.filter(
        (u) => u.faction === YUAN && canAct(u) && u.status !== 'IMMOBILISED' && u.position.x < 600,
      ).length;

    assert.ok(
      escaped(without) > escaped(withStakes),
      `removing the stakes must let more ships escape (with=${escaped(withStakes)}, without=${escaped(without)})`,
    );
  });

  test('a tide shift changes how much time the fleet has', () => {
    const whatIf = createWhatIf(baseline, [{ kind: 'TIDE_SHIFT', shiftHours: 4 }]);
    assert.equal(
      whatIf.mechanics.tide!.highWaterAtHour,
      BACH_DANG_1288.mechanics.tide!.highWaterAtHour + 4,
    );
  });
});

describe('historical comparison (§30)', () => {
  test('reports whether the simulation matched history', () => {
    const { state } = playAndRecord(12);
    const comparison = compareWithHistory(state, BACH_DANG_1288);
    assert.equal(comparison.historicalVictor, DAI_VIET);
    assert.equal(comparison.simulatedVictor, DAI_VIET);
    assert.equal(comparison.matchesHistory, true);
  });

  test('comparison language never claims a counterfactual certainty (§3)', () => {
    const { state } = playAndRecord(12);
    const comparison = compareWithHistory(state, BACH_DANG_1288, [
      { kind: 'FORCE_SCALE', faction: YUAN, multiplier: 1.5 },
    ]);
    // The summary must not assert what "would have" happened in reality.
    assert.doesNotMatch(comparison.summary, /would actually have happened(?!\.)/);
    assert.match(comparison.summary, /simulation/i);
  });

  test('force summaries are internally consistent', () => {
    const { state } = playAndRecord(12);
    for (const f of summariseForces(state)) {
      assert.ok(f.lossFraction >= 0 && f.lossFraction <= 1);
      assert.ok(f.unitsLost <= f.unitsTotal);
      assert.ok(f.survivingStrength <= f.initialStrength);
    }
  });
});

describe('battle analysis (§29, §35)', () => {
  test('every finding is labelled with its epistemic confidence', () => {
    const { state } = playAndRecord(12);
    const analysis = analyseBattle(state, BACH_DANG_1288);
    assert.ok(analysis.findings.length > 0);
    for (const f of analysis.findings) {
      assert.ok(['OBSERVED', 'INFERRED', 'SPECULATIVE'].includes(f.confidence));
    }
  });

  test('OBSERVED findings are backed by the event log', () => {
    const { state } = playAndRecord(12);
    const analysis = analyseBattle(state, BACH_DANG_1288);

    const strikeFinding = analysis.findings.find(
      (f) => f.confidence === 'OBSERVED' && /vessel strike/.test(f.text),
    );
    if (strikeFinding) {
      const actual = state.events.filter((e) => /struck/.test(e.message)).length;
      assert.equal(strikeFinding.evidence?.['strikes'], actual, 'the count must match the log');
    }
  });

  test('speculation is explicitly marked, never stated as cause', () => {
    const { state } = playAndRecord(12);
    const analysis = analyseBattle(state, BACH_DANG_1288);
    for (const f of analysis.findings.filter((x) => x.confidence === 'SPECULATIVE')) {
      assert.match(f.text, /might|conjecture|could/i);
    }
  });

  test('the full event log is available for inspection (§90, §92)', () => {
    const { state } = playAndRecord(12);
    const analysis = analyseBattle(state, BACH_DANG_1288);
    assert.equal(analysis.keyEvents.length, state.events.length);
  });
});
