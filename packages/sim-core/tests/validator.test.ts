import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkInvariants,
  assertInvariants,
  InvariantViolationError,
  commandableUnits,
} from '../src/state/validator.ts';
import {
  type BattleState,
  type Unit,
  unitId,
  factionId,
  commanderId,
  eventId,
} from '../src/domain/types.ts';

const DAI_VIET = factionId('dai-viet');
const YUAN = factionId('yuan');

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: unitId('u1'),
    faction: DAI_VIET,
    kind: 'LIGHT_BOAT',
    name: 'Light flotilla',
    strength: 50,
    initialStrength: 50,
    morale: 0.8,
    fatigue: 0.1,
    cohesion: 0.9,
    supply: 1,
    position: { x: 100, y: 100 },
    status: 'ACTIVE',
    draftM: 0.3,
    baseSpeedMPerHour: 4000,
    ...overrides,
  };
}

function makeState(overrides: Partial<BattleState> = {}): BattleState {
  return {
    scenarioId: 'BACH_DANG_1288',
    scenarioVersion: 'v1',
    simulationVersion: '0.1.0',
    tick: 0,
    elapsedHours: 0,
    units: [makeUnit()],
    commanders: [],
    events: [],
    outcome: { kind: 'ONGOING' },
    rngState: 12345,
    seed: 'test-seed',
    ...overrides,
  };
}

const ids = (vs: { id: string }[]) => vs.map((v) => v.id);

describe('a well-formed state passes', () => {
  test('no violations for a valid state', () => {
    assert.deepEqual(checkInvariants(makeState()), []);
  });

  test('assertInvariants does not throw on valid state', () => {
    assert.doesNotThrow(() => assertInvariants(makeState(), 'STRICT'));
  });
});

describe('INV-01 unique unit ids', () => {
  test('duplicate ids are caught', () => {
    const state = makeState({ units: [makeUnit(), makeUnit()] });
    assert.ok(ids(checkInvariants(state)).includes('INV-01'));
  });
});

describe('INV-04 commander references', () => {
  test('dangling commander reference is caught', () => {
    const state = makeState({
      units: [makeUnit({ commanderId: commanderId('ghost') })],
    });
    assert.ok(ids(checkInvariants(state)).includes('INV-04'));
  });

  test('valid commander reference passes', () => {
    const state = makeState({
      units: [makeUnit({ commanderId: commanderId('tran-hung-dao') })],
      commanders: [
        {
          id: commanderId('tran-hung-dao'),
          faction: DAI_VIET,
          name: 'Tran Hung Dao',
          ratings: { leadership: 90, tactical: 90, strategic: 90, commandRangeM: 2000 },
        },
      ],
    });
    assert.deepEqual(checkInvariants(state), []);
  });
});

describe('INV-05 strength bounds', () => {
  test('negative strength is caught', () => {
    assert.ok(ids(checkInvariants(makeState({ units: [makeUnit({ strength: -1 })] }))).includes('INV-05'));
  });

  test('strength above initial is caught unless reinforcement is allowed', () => {
    const state = makeState({ units: [makeUnit({ strength: 80, initialStrength: 50 })] });
    assert.ok(ids(checkInvariants(state)).includes('INV-05'));
    assert.deepEqual(
      checkInvariants(state, { allowReinforcement: true }).filter((v) => v.id === 'INV-05'),
      [],
    );
  });
});

describe('INV-08 status matches numbers', () => {
  test('zero strength but not DESTROYED is caught', () => {
    const state = makeState({ units: [makeUnit({ strength: 0, status: 'ACTIVE' })] });
    assert.ok(ids(checkInvariants(state)).includes('INV-08'));
  });

  test('DESTROYED but still has strength is caught', () => {
    const state = makeState({ units: [makeUnit({ strength: 10, status: 'DESTROYED' })] });
    assert.ok(ids(checkInvariants(state)).includes('INV-08'));
  });

  test('zero morale but still fighting is caught', () => {
    const state = makeState({ units: [makeUnit({ morale: 0, status: 'ACTIVE' })] });
    assert.ok(ids(checkInvariants(state)).includes('INV-08'));
  });
});

describe('INV-12 normalised stats', () => {
  test('out-of-range morale and fatigue are caught', () => {
    assert.ok(ids(checkInvariants(makeState({ units: [makeUnit({ morale: 1.5 })] }))).includes('INV-12'));
    assert.ok(ids(checkInvariants(makeState({ units: [makeUnit({ fatigue: -0.2 })] }))).includes('INV-12'));
    assert.ok(ids(checkInvariants(makeState({ units: [makeUnit({ supply: NaN })] }))).includes('INV-12'));
  });
});

describe('INV-13 map bounds', () => {
  test('unit outside bounds is caught', () => {
    const state = makeState({ units: [makeUnit({ position: { x: 99999, y: 0 } })] });
    assert.ok(ids(checkInvariants(state, { bounds: { width: 5000, height: 5000 } })).includes('INV-13'));
  });

  test('unit inside bounds passes', () => {
    assert.deepEqual(checkInvariants(makeState(), { bounds: { width: 5000, height: 5000 } }), []);
  });
});

describe('INV-14 events recorded once', () => {
  test('duplicate event id is caught', () => {
    const ev = {
      id: eventId('e1'),
      kind: 'SIMULATION_EVENT' as const,
      tick: 1,
      message: 'x',
    };
    assert.ok(ids(checkInvariants(makeState({ events: [ev, ev] }))).includes('INV-14'));
  });
});

describe('INV-17/18/19 reproducibility bindings', () => {
  test('missing scenario version, simulation version or seed is caught', () => {
    assert.ok(ids(checkInvariants(makeState({ scenarioVersion: '' }))).includes('INV-17'));
    assert.ok(ids(checkInvariants(makeState({ simulationVersion: '' }))).includes('INV-18'));
    assert.ok(ids(checkInvariants(makeState({ seed: '' }))).includes('INV-19'));
  });
});

describe('INV-20 history and simulation are distinguishable', () => {
  test('HISTORICAL_EVENT without sources is caught', () => {
    const state = makeState({
      events: [{ id: eventId('h1'), kind: 'HISTORICAL_EVENT', tick: 0, message: 'The fleet entered the estuary' }],
    });
    assert.ok(ids(checkInvariants(state)).includes('INV-20'));
  });

  test('SIMULATION_EVENT dressed with historical sources is caught', () => {
    // This is the dangerous direction: engine output masquerading as history.
    const state = makeState({
      events: [
        {
          id: eventId('s1'),
          kind: 'SIMULATION_EVENT',
          tick: 5,
          message: 'Flank attack succeeded',
          sources: [{ id: 'S-001' }],
        },
      ],
    });
    assert.ok(ids(checkInvariants(state)).includes('INV-20'));
  });

  test('a properly sourced historical event passes', () => {
    const state = makeState({
      events: [
        {
          id: eventId('h1'),
          kind: 'HISTORICAL_EVENT',
          tick: 0,
          message: 'Stakes were planted in the riverbed',
          sources: [{ id: 'S-001' }],
        },
      ],
    });
    assert.deepEqual(checkInvariants(state), []);
  });
});

describe('INV-21 waterborne units need a draft', () => {
  test('waterborne unit without draft is caught (tide interaction undefined)', () => {
    const u = makeUnit({ kind: 'HEAVY_SHIP' });
    const { draftM: _omit, ...withoutDraft } = u;
    assert.ok(ids(checkInvariants(makeState({ units: [withoutDraft as Unit] }))).includes('INV-21'));
  });

  test('non-positive draft is caught', () => {
    assert.ok(ids(checkInvariants(makeState({ units: [makeUnit({ draftM: 0 })] }))).includes('INV-21'));
  });
});

describe('INV-15 outcome consistency', () => {
  test('victor with no surviving units is caught', () => {
    const state = makeState({
      units: [makeUnit({ id: unitId('a'), faction: DAI_VIET, strength: 0, status: 'DESTROYED' })],
      outcome: { kind: 'DECIDED', victor: DAI_VIET, reason: 'test' },
    });
    assert.ok(ids(checkInvariants(state)).includes('INV-15'));
  });

  test('victor absent from the battle entirely is caught', () => {
    const state = makeState({
      outcome: { kind: 'DECIDED', victor: YUAN, reason: 'test' },
    });
    assert.ok(ids(checkInvariants(state)).includes('INV-15'));
  });

  test('a legitimate victory passes', () => {
    const state = makeState({
      units: [
        makeUnit({ id: unitId('a'), faction: DAI_VIET }),
        makeUnit({ id: unitId('b'), faction: YUAN, strength: 0, status: 'DESTROYED', morale: 0 }),
      ],
      outcome: { kind: 'DECIDED', victor: DAI_VIET, reason: 'enemy destroyed' },
    });
    assert.deepEqual(checkInvariants(state), []);
  });
});

describe('validation levels (§95, §96)', () => {
  test('STRICT throws with all violations named', () => {
    const bad = makeState({ units: [makeUnit({ strength: -5, morale: 2 })], seed: '' });
    try {
      assertInvariants(bad, 'STRICT');
      assert.fail('expected a throw');
    } catch (err) {
      assert.ok(err instanceof InvariantViolationError);
      assert.ok(err.violations.length >= 2);
      // The message must be debuggable: it names the invariant ids.
      assert.match(err.message, /INV-\d+/);
    }
  });

  test('OFF skips checking entirely', () => {
    const bad = makeState({ units: [makeUnit({ strength: -5 })] });
    assert.doesNotThrow(() => assertInvariants(bad, 'OFF'));
  });
});

describe('commandable units (INV-06, INV-07)', () => {
  test('destroyed and routed units cannot be commanded', () => {
    const state = makeState({
      units: [
        makeUnit({ id: unitId('active') }),
        makeUnit({ id: unitId('routed'), status: 'ROUTED', morale: 0 }),
        makeUnit({ id: unitId('dead'), status: 'DESTROYED', strength: 0, morale: 0 }),
      ],
    });
    assert.deepEqual(commandableUnits(state).map((u) => u.id), ['active']);
  });
});
