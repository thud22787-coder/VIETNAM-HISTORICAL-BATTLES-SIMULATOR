import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  step,
  createInitialState,
  runBattle,
  combatPower,
  evaluateVictory,
  SIMULATION_VERSION,
  type Command,
} from '../src/sim/engine.ts';
import { BACH_DANG_1288, DAI_VIET, YUAN } from '../src/scenario/battles/bach-dang-1288.ts';
import { assertInvariants, checkInvariants } from '../src/state/validator.ts';
import { canAct, unitId, type BattleState } from '../src/domain/types.ts';

const SEED = 'test-seed-1';

const noCommands = (): readonly Command[] => [];

describe('initial state', () => {
  test('binds scenario and simulation versions (INV-17, INV-18)', () => {
    const s = createInitialState(BACH_DANG_1288, SEED);
    assert.equal(s.scenarioId, 'BACH_DANG_1288');
    assert.equal(s.scenarioVersion, BACH_DANG_1288.version);
    assert.equal(s.simulationVersion, SIMULATION_VERSION);
    assert.equal(s.seed, SEED);
  });

  test('is valid under the invariant checker', () => {
    const s = createInitialState(BACH_DANG_1288, SEED);
    assert.deepEqual(checkInvariants(s), []);
  });
});

describe('determinism (§23, §53) — the contract that makes replay possible', () => {
  test('same seed + same commands + same version = same result', () => {
    const a = runBattle(BACH_DANG_1288, SEED, noCommands, 120);
    const b = runBattle(BACH_DANG_1288, SEED, noCommands, 120);

    assert.equal(a.tick, b.tick);
    assert.equal(a.rngState, b.rngState);
    assert.deepEqual(a.outcome, b.outcome);
    assert.deepEqual(
      a.units.map((u) => [u.id, u.strength, u.morale, u.status]),
      b.units.map((u) => [u.id, u.strength, u.morale, u.status]),
    );
    assert.deepEqual(a.events.map((e) => e.message), b.events.map((e) => e.message));
  });

  test('different seeds give different detail once anything stochastic happens', () => {
    // With no orders the fleets never close, so nothing draws from the RNG and
    // both seeds legitimately produce the same static result. To test seed
    // sensitivity we must actually run a battle: order the Yuan fleet to sea,
    // which triggers obstacle rolls and combat.
    const sail = (state: BattleState): readonly Command[] =>
      state.units
        .filter((u) => u.faction === YUAN && canAct(u))
        .map((u) => ({ kind: 'MOVE' as const, unitId: u.id, to: { x: 200, y: u.position.y } }));

    const a = runBattle(BACH_DANG_1288, 'seed-a', sail, 150);
    const b = runBattle(BACH_DANG_1288, 'seed-b', sail, 150);

    assert.notDeepEqual(
      a.units.map((u) => u.strength),
      b.units.map((u) => u.strength),
      'different seeds must produce different stochastic detail',
    );
  });

  test('stepping is pure — the input state is never mutated', () => {
    const s0 = createInitialState(BACH_DANG_1288, SEED);
    const snapshot = JSON.stringify(s0);
    step(s0, [], BACH_DANG_1288);
    assert.equal(JSON.stringify(s0), snapshot, 'step() must not mutate its input (INV-10)');
  });

  test('replaying from a mid-battle state reproduces the tail exactly', () => {
    // This is the property the replay system depends on.
    let mid = createInitialState(BACH_DANG_1288, SEED);
    for (let i = 0; i < 30; i++) mid = step(mid, [], BACH_DANG_1288);

    const continued = (from: BattleState): BattleState => {
      let s = from;
      for (let i = 0; i < 30; i++) s = step(s, [], BACH_DANG_1288);
      return s;
    };

    const a = continued(mid);
    const b = continued(mid);
    assert.equal(a.rngState, b.rngState);
    assert.deepEqual(a.units.map((u) => u.strength), b.units.map((u) => u.strength));
  });
});

describe('invariants hold throughout a full battle', () => {
  test('every tick produces a valid state', () => {
    let s = createInitialState(BACH_DANG_1288, SEED);
    const bounds = {
      width: BACH_DANG_1288.terrain.widthCells * BACH_DANG_1288.terrain.cellSizeM,
      height: BACH_DANG_1288.terrain.heightCells * BACH_DANG_1288.terrain.cellSizeM,
    };

    for (let i = 0; i < 200 && s.outcome.kind === 'ONGOING'; i++) {
      s = step(s, [], BACH_DANG_1288);
      assert.doesNotThrow(
        () => assertInvariants(s, 'STRICT', { bounds }),
        `invariant violated at tick ${s.tick}`,
      );
    }
  });

  test('tick and elapsed time advance monotonically (INV-11)', () => {
    let s = createInitialState(BACH_DANG_1288, SEED);
    let lastTick = s.tick;
    let lastHours = s.elapsedHours;
    for (let i = 0; i < 50; i++) {
      s = step(s, [], BACH_DANG_1288);
      assert.ok(s.tick > lastTick);
      assert.ok(s.elapsedHours > lastHours);
      lastTick = s.tick;
      lastHours = s.elapsedHours;
    }
  });

  test('event ids stay unique across a long battle (INV-14)', () => {
    const final = runBattle(BACH_DANG_1288, SEED, noCommands, 200);
    const ids = final.events.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('the engine never emits a HISTORICAL_EVENT (INV-20)', () => {
    const final = runBattle(BACH_DANG_1288, SEED, noCommands, 200);
    assert.equal(final.events.some((e) => e.kind === 'HISTORICAL_EVENT'), false);
    assert.ok(final.events.every((e) => e.kind === 'SIMULATION_EVENT'));
  });
});

describe('commands (§16, INV-06, INV-07)', () => {
  test('a MOVE order actually moves the unit', () => {
    const s0 = createInitialState(BACH_DANG_1288, SEED);
    const u = s0.units.find((x) => x.id === unitId('dv-light-1'))!;
    const target = { x: u.position.x - 800, y: u.position.y };

    const s1 = step(s0, [{ kind: 'MOVE', unitId: u.id, to: target }], BACH_DANG_1288);
    const moved = s1.units.find((x) => x.id === u.id)!;
    assert.ok(moved.position.x < u.position.x, 'unit should have advanced toward the target');
  });

  test('orders to destroyed units are ignored', () => {
    const s0 = createInitialState(BACH_DANG_1288, SEED);
    const dead = { ...s0.units[0]!, strength: 0, status: 'DESTROYED' as const, morale: 0 };
    const state = { ...s0, units: [dead, ...s0.units.slice(1)] };

    const after = step(
      state,
      [{ kind: 'MOVE', unitId: dead.id, to: { x: 0, y: 0 } }],
      BACH_DANG_1288,
    );
    const stillDead = after.units.find((u) => u.id === dead.id)!;
    assert.deepEqual(stillDead.position, dead.position, 'a destroyed unit must not move');
  });

  test('an immobilised unit cannot move even when ordered', () => {
    const s0 = createInitialState(BACH_DANG_1288, SEED);
    const stuck = { ...s0.units.find((u) => u.kind === 'HEAVY_SHIP')!, status: 'IMMOBILISED' as const };
    const state = { ...s0, units: s0.units.map((u) => (u.id === stuck.id ? stuck : u)) };

    const after = step(state, [{ kind: 'MOVE', unitId: stuck.id, to: { x: 0, y: 1700 } }], BACH_DANG_1288);
    const stillStuck = after.units.find((u) => u.id === stuck.id)!;
    assert.deepEqual(stillStuck.position, stuck.position);
  });
});

describe('combat model (§22) — not just hp arithmetic', () => {
  test('combat power depends on more than raw strength', () => {
    const base = BACH_DANG_1288.initialUnits.find((u) => u.kind === 'HEAVY_SHIP')!;

    const fresh = combatPower(base, BACH_DANG_1288);
    const demoralised = combatPower({ ...base, morale: 0.2 }, BACH_DANG_1288);
    const exhausted = combatPower({ ...base, fatigue: 1 }, BACH_DANG_1288);
    const broken = combatPower({ ...base, cohesion: 0.2 }, BACH_DANG_1288);

    assert.ok(demoralised < fresh, 'morale must matter');
    assert.ok(exhausted < fresh, 'fatigue must matter');
    assert.ok(broken < fresh, 'cohesion must matter');
  });

  test('a routed or destroyed unit contributes no combat power', () => {
    const base = BACH_DANG_1288.initialUnits[0]!;
    assert.equal(combatPower({ ...base, status: 'ROUTED' }, BACH_DANG_1288), 0);
    assert.equal(combatPower({ ...base, status: 'DESTROYED' }, BACH_DANG_1288), 0);
  });

  test('an immobilised unit fights at a penalty', () => {
    const base = BACH_DANG_1288.initialUnits.find((u) => u.kind === 'HEAVY_SHIP')!;
    assert.ok(
      combatPower({ ...base, status: 'IMMOBILISED' }, BACH_DANG_1288) < combatPower(base, BACH_DANG_1288),
    );
  });
});

describe('victory evaluation (INV-15)', () => {
  test('ongoing at the start', () => {
    const s = createInitialState(BACH_DANG_1288, SEED);
    assert.equal(evaluateVictory(s.units, BACH_DANG_1288, 0).kind, 'ONGOING');
  });

  test('Dai Viet wins when enough of the fleet is neutralised', () => {
    const s = createInitialState(BACH_DANG_1288, SEED);
    const units = s.units.map((u) =>
      u.faction === YUAN ? { ...u, status: 'DESTROYED' as const, strength: 0, morale: 0 } : u,
    );
    const outcome = evaluateVictory(units, BACH_DANG_1288, 2);
    assert.equal(outcome.kind, 'DECIDED');
    if (outcome.kind === 'DECIDED') assert.equal(outcome.victor, DAI_VIET);
  });

  test('a decided outcome never contradicts the invariant checker', () => {
    const s = createInitialState(BACH_DANG_1288, SEED);
    const units = s.units.map((u) =>
      u.faction === YUAN ? { ...u, status: 'DESTROYED' as const, strength: 0, morale: 0 } : u,
    );
    const outcome = evaluateVictory(units, BACH_DANG_1288, 2);
    assert.deepEqual(checkInvariants({ ...s, units, outcome }), []);
  });

  test('a finished battle stops advancing', () => {
    const s = createInitialState(BACH_DANG_1288, SEED);
    const finished: BattleState = {
      ...s,
      outcome: { kind: 'DECIDED', victor: DAI_VIET, reason: 'test' },
    };
    assert.equal(step(finished, [], BACH_DANG_1288).tick, finished.tick);
  });
});
