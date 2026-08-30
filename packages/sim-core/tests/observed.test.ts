import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  observe,
  assertNoLeaks,
  estimateOf,
  emptyMemory,
  VISIBILITY,
  type ObservedState,
  type SightingMemory,
} from '../src/state/observed.ts';
import { createRng } from '../src/sim/rng.ts';
import { createInitialState, step, type Command } from '../src/sim/engine.ts';
import { BACH_DANG_1288, DAI_VIET, YUAN } from '../src/scenario/battles/bach-dang-1288.ts';
import { canAct, type BattleState, type Unit } from '../src/domain/types.ts';

const rng = () => createRng('fog-test');

const observeFor = (
  state: BattleState,
  faction: typeof DAI_VIET | typeof YUAN,
  memory: SightingMemory = emptyMemory(),
) => observe(state, faction, BACH_DANG_1288, rng(), memory);

/** Move a unit somewhere, for constructing visibility situations. */
const moveUnit = (state: BattleState, id: string, x: number, y: number): BattleState => ({
  ...state,
  units: state.units.map((u) => (u.id === id ? { ...u, position: { x, y } } : u)),
});

/**
 * Reduce a side to a single unit.
 *
 * Necessary for any test about losing contact: the scenario starts with two
 * flotillas within sight of the fleet, so walking one away proves nothing
 * while the other is still watching.
 */
const onlyObserver = (state: BattleState, keepId: string): BattleState => ({
  ...state,
  units: state.units.filter((u) => u.faction !== DAI_VIET || u.id === keepId),
});

describe('the scenario actually declares fog of war (GAP-01)', () => {
  test('Bach Dang 1288 has fogOfWar enabled', () => {
    // This test is the reason GAP-01 was worth closing: the flag was declared
    // and nothing read it. If the flag is ever removed, this fails loudly
    // rather than the mechanic silently disappearing.
    assert.equal(BACH_DANG_1288.mechanics.fogOfWar, true);
  });
});

describe('own forces are fully known', () => {
  test('a side sees all of its own units in full', () => {
    const state = createInitialState(BACH_DANG_1288, 'seed');
    const { observed } = observeFor(state, DAI_VIET);

    const ownIds = state.units.filter((u) => u.faction === DAI_VIET).map((u) => u.id);
    assert.deepEqual(observed.own.map((u) => u.id).sort(), ownIds.sort());

    // Own units keep their full detail — they report in.
    for (const u of observed.own) {
      assert.equal(typeof u.morale, 'number');
      assert.equal(typeof u.strength, 'number');
    }
  });

  test('own[] never contains an enemy unit', () => {
    const state = createInitialState(BACH_DANG_1288, 'seed');
    for (const faction of [DAI_VIET, YUAN] as const) {
      const { observed } = observeFor(state, faction);
      assert.ok(observed.own.every((u) => u.faction === faction));
    }
  });
});

describe('enemy strength is never handed over exactly (INV-24)', () => {
  test('a visible enemy yields an estimate, not the true number', () => {
    const state = createInitialState(BACH_DANG_1288, 'seed');
    const { observed } = observeFor(state, DAI_VIET);

    const seen = observed.enemies.filter((e) => e.inContact);
    assert.ok(seen.length > 0, 'expected at least one enemy in contact at the start');

    for (const e of seen) {
      assert.equal(
        e.strength.knowledge,
        'ESTIMATED',
        `enemy ${e.id} strength must be an estimate under fog of war`,
      );
    }
  });

  test('the estimate brackets are plausible but not exact', () => {
    const state = createInitialState(BACH_DANG_1288, 'seed');
    const { observed } = observeFor(state, DAI_VIET);

    for (const e of observed.enemies) {
      if (e.strength.knowledge !== 'ESTIMATED') continue;
      const truth = state.units.find((u) => u.id === e.id)!;

      assert.ok(e.strength.min <= e.strength.max, 'bracket must be ordered');
      assert.ok(e.strength.min >= 0, 'strength cannot be negative');

      // The estimate should be in the right neighbourhood — a bracket that
      // never overlaps reality is noise, not intelligence.
      const midpoint = estimateOf(e.strength)!;
      const ratio = midpoint / truth.strength;
      assert.ok(
        ratio > 0.3 && ratio < 3,
        `estimate for ${e.id} (${midpoint}) is wildly off truth (${truth.strength})`,
      );
    }
  });

  test('closer observation gives a tighter estimate', () => {
    // The whole point of scouting: getting closer buys you better information.
    const base = createInitialState(BACH_DANG_1288, 'seed');
    const enemy = base.units.find((u) => u.faction === YUAN)!;
    const scout = base.units.find((u) => u.faction === DAI_VIET)!;

    const widthAt = (offsetM: number): number => {
      const state = moveUnit(base, scout.id, enemy.position.x + offsetM, enemy.position.y);
      // Remove every other friendly unit so only this scout observes.
      const isolated: BattleState = {
        ...state,
        units: state.units.filter((u) => u.faction === YUAN || u.id === scout.id),
      };
      const { observed } = observeFor(isolated, DAI_VIET);
      const seen = observed.enemies.find((e) => e.id === enemy.id);
      assert.ok(seen, `enemy not visible at ${offsetM}m`);
      assert.equal(seen.strength.knowledge, 'ESTIMATED');
      if (seen.strength.knowledge !== 'ESTIMATED') throw new Error('unreachable');
      return seen.strength.max - seen.strength.min;
    };

    assert.ok(
      widthAt(100) < widthAt(1000),
      'a close sighting must be more precise than a distant one',
    );
  });

  test('a destroyed enemy is unambiguously known to be gone', () => {
    const base = createInitialState(BACH_DANG_1288, 'seed');
    const enemy = base.units.find((u) => u.faction === YUAN)!;
    const state: BattleState = {
      ...base,
      units: base.units.map((u) =>
        u.id === enemy.id ? { ...u, strength: 0, status: 'DESTROYED' as const, morale: 0 } : u,
      ),
    };
    // Put an observer alongside so it is definitely visible.
    const withScout = moveUnit(state, base.units.find((u) => u.faction === DAI_VIET)!.id,
      enemy.position.x, enemy.position.y);

    const { observed } = observeFor(withScout, DAI_VIET);
    const seen = observed.enemies.find((e) => e.id === enemy.id);
    assert.ok(seen);
    assert.equal(seen.strength.knowledge, 'KNOWN');
    assert.equal(seen.apparentStatus, 'BROKEN');
  });
});

describe('visibility is limited by range and terrain (§17, §19)', () => {
  test('a distant enemy is not visible at all', () => {
    const base = createInitialState(BACH_DANG_1288, 'seed');
    const enemy = base.units.find((u) => u.faction === YUAN)!;

    // Park every friendly unit far away from the fleet.
    const state: BattleState = {
      ...base,
      units: base.units.map((u) =>
        u.faction === DAI_VIET ? { ...u, position: { x: 100, y: 100 } } : u,
      ),
    };

    const { observed } = observeFor(state, DAI_VIET);
    assert.equal(
      observed.enemies.some((e) => e.id === enemy.id && e.inContact),
      false,
      'an enemy 5km away must not be in contact',
    );
  });

  test('an unseen enemy is absent from the picture, not listed as UNKNOWN', () => {
    // Knowing that an unseen enemy *exists* is itself unearned information.
    const base = createInitialState(BACH_DANG_1288, 'seed');
    const state: BattleState = {
      ...base,
      units: base.units.map((u) =>
        u.faction === DAI_VIET ? { ...u, position: { x: 100, y: 3900 } } : u,
      ),
    };

    const { observed } = observeFor(state, DAI_VIET);
    assert.equal(
      observed.enemies.length,
      0,
      'with no contact, the enemy list must be empty rather than full of placeholders',
    );
  });

  test('concealing terrain shortens sighting range', () => {
    // Forest conceals far more than open water.
    assert.ok(VISIBILITY.concealment.FOREST < VISIBILITY.concealment.DEEP_WATER);
    assert.ok(VISIBILITY.concealment.MARSH < VISIBILITY.concealment.DEEP_WATER);
  });
});

describe('sighting memory (§18)', () => {
  test('a lost contact is remembered, flagged stale, at its last known position', () => {
    const start = createInitialState(BACH_DANG_1288, 'seed');
    const enemy = start.units.find((u) => u.faction === YUAN)!;
    const scout = start.units.find((u) => u.faction === DAI_VIET)!;
    const base = onlyObserver(start, scout.id);

    // Tick 1: in contact.
    const contact = moveUnit(base, scout.id, enemy.position.x + 200, enemy.position.y);
    const first = observeFor(contact, DAI_VIET);
    const sighted = first.observed.enemies.find((e) => e.id === enemy.id);
    assert.ok(sighted?.inContact, 'expected contact on the first observation');

    // Tick 2: scout withdraws out of range; the enemy has not moved.
    const lost: BattleState = {
      ...moveUnit(contact, scout.id, 100, 3900),
      tick: contact.tick + 1,
    };
    const second = observe(lost, DAI_VIET, BACH_DANG_1288, rng(), first.memory);

    const remembered = second.observed.enemies.find((e) => e.id === enemy.id);
    assert.ok(remembered, 'a recent sighting should still be remembered');
    assert.equal(remembered.inContact, false, 'it must be flagged as not in contact');
    assert.deepEqual(
      remembered.position,
      enemy.position,
      'a remembered sighting reports the last known position',
    );
    assert.equal(
      remembered.apparentStatus,
      'UNKNOWN',
      'a stale report says nothing about current condition',
    );
  });

  test('memory expires, and the enemy drops out of the picture', () => {
    const start = createInitialState(BACH_DANG_1288, 'seed');
    const enemy = start.units.find((u) => u.faction === YUAN)!;
    const scout = start.units.find((u) => u.faction === DAI_VIET)!;
    const base = onlyObserver(start, scout.id);

    const contact = moveUnit(base, scout.id, enemy.position.x + 200, enemy.position.y);
    const first = observeFor(contact, DAI_VIET);

    const longAfter: BattleState = {
      ...moveUnit(contact, scout.id, 100, 3900),
      tick: contact.tick + VISIBILITY.memoryTicks + 1,
    };
    const later = observe(longAfter, DAI_VIET, BACH_DANG_1288, rng(), first.memory);

    assert.equal(
      later.observed.enemies.some((e) => e.id === enemy.id),
      false,
      'a stale sighting must eventually be forgotten',
    );
  });

  test('a remembered position goes stale when the enemy moves away', () => {
    const start = createInitialState(BACH_DANG_1288, 'seed');
    const enemy = start.units.find((u) => u.faction === YUAN)!;
    const scout = start.units.find((u) => u.faction === DAI_VIET)!;
    const base = onlyObserver(start, scout.id);

    const contact = moveUnit(base, scout.id, enemy.position.x + 200, enemy.position.y);
    const first = observeFor(contact, DAI_VIET);

    // Enemy sails away; scout also loses contact.
    let moved = moveUnit(contact, enemy.id, 300, 2000);
    moved = moveUnit(moved, scout.id, 100, 3900);
    const second = observe({ ...moved, tick: moved.tick + 1 }, DAI_VIET, BACH_DANG_1288, rng(), first.memory);

    const remembered = second.observed.enemies.find((e) => e.id === enemy.id);
    assert.ok(remembered);
    assert.notDeepEqual(
      remembered.position,
      { x: 300, y: 2000 },
      'memory must not track a unit it can no longer see',
    );
  });
});

describe('obstacles are known only to the side that placed them (§17)', () => {
  test('Dai Viet knows the stake field; the Yuan do not', () => {
    const state = createInitialState(BACH_DANG_1288, 'seed');

    const dv = observeFor(state, DAI_VIET).observed;
    const yuan = observeFor(state, YUAN).observed;

    assert.equal(dv.knownObstacles.length, 1, 'the defenders placed the obstacles');
    assert.equal(
      yuan.knownObstacles.length,
      0,
      'the Yuan must not be handed the position of the trap',
    );
  });
});

describe('events are filtered to what a side could witness', () => {
  test('a side sees events involving its own units', () => {
    const state = createInitialState(BACH_DANG_1288, 'seed');
    const own = state.units.find((u) => u.faction === DAI_VIET)!;
    const withEvent: BattleState = {
      ...state,
      events: [
        {
          id: 'e1' as never,
          kind: 'SIMULATION_EVENT',
          tick: 1,
          message: 'own unit did something',
          unitIds: [own.id],
        },
      ],
    };

    const { observed } = observeFor(withEvent, DAI_VIET);
    assert.equal(observed.events.length, 1);
  });

  test('a side does not see distant enemy-only events', () => {
    const base = createInitialState(BACH_DANG_1288, 'seed');
    const enemy = base.units.find((u) => u.faction === YUAN)!;

    const state: BattleState = {
      ...base,
      units: base.units.map((u) =>
        u.faction === DAI_VIET ? { ...u, position: { x: 100, y: 3900 } } : u,
      ),
      events: [
        {
          id: 'e1' as never,
          kind: 'SIMULATION_EVENT',
          tick: 1,
          message: 'something happened to the fleet, far away',
          unitIds: [enemy.id],
          position: enemy.position,
        },
      ],
    };

    const { observed } = observeFor(state, DAI_VIET);
    assert.equal(observed.events.length, 0, 'a distant enemy-only event must not be witnessed');
  });

  test('battle-level announcements reach everyone', () => {
    const state = createInitialState(BACH_DANG_1288, 'seed');
    const withEvent: BattleState = {
      ...state,
      events: [
        { id: 'e1' as never, kind: 'SIMULATION_EVENT', tick: 1, message: 'Battle decided' },
      ],
    };
    assert.equal(observeFor(withEvent, YUAN).observed.events.length, 1);
  });
});

describe('the leak guard (INV-23)', () => {
  test('a correctly projected state passes', () => {
    const state = createInitialState(BACH_DANG_1288, 'seed');
    for (const faction of [DAI_VIET, YUAN] as const) {
      const { observed } = observeFor(state, faction);
      assert.doesNotThrow(() => assertNoLeaks(observed, state, BACH_DANG_1288));
    }
  });

  test('the guard catches an exact enemy strength', () => {
    // The guard must actually be able to fail, or it guards nothing.
    const state = createInitialState(BACH_DANG_1288, 'seed');
    const { observed } = observeFor(state, DAI_VIET);
    const enemy = state.units.find((u) => u.faction === YUAN)!;

    const leaked: ObservedState = {
      ...observed,
      enemies: [
        {
          id: enemy.id,
          faction: enemy.faction,
          position: enemy.position,
          lastSeenTick: 0,
          inContact: true,
          kind: enemy.kind,
          strength: { knowledge: 'KNOWN', value: enemy.strength },
          apparentStatus: 'ACTIVE',
        },
      ],
    };

    assert.throws(
      () => assertNoLeaks(leaked, state, BACH_DANG_1288),
      /INV-23|estimate/i,
    );
  });

  test('the guard catches an obstacle leaked to the wrong side', () => {
    const state = createInitialState(BACH_DANG_1288, 'seed');
    const dv = observeFor(state, DAI_VIET).observed;
    const yuanObserved = observeFor(state, YUAN).observed;

    const leaked: ObservedState = { ...yuanObserved, knownObstacles: dv.knownObstacles };

    assert.throws(() => assertNoLeaks(leaked, state, BACH_DANG_1288), /obstacle field/i);
  });

  test('no leak occurs at any point during a real battle', () => {
    // The important test: run the actual battle and check every tick.
    let state = createInitialState(BACH_DANG_1288, 'leak-scan');
    let dvMemory = emptyMemory();
    let yuanMemory = emptyMemory();

    for (let i = 0; i < 60 && state.outcome.kind === 'ONGOING'; i++) {
      const commands: Command[] = state.units
        .filter((u) => u.faction === YUAN && canAct(u))
        .map((u) => ({ kind: 'MOVE' as const, unitId: u.id, to: { x: 150, y: u.position.y } }));
      state = step(state, commands, BACH_DANG_1288);

      const dv = observe(state, DAI_VIET, BACH_DANG_1288, createRng(`dv-${i}`), dvMemory);
      const yuan = observe(state, YUAN, BACH_DANG_1288, createRng(`yn-${i}`), yuanMemory);
      dvMemory = dv.memory;
      yuanMemory = yuan.memory;

      assert.doesNotThrow(
        () => assertNoLeaks(dv.observed, state, BACH_DANG_1288),
        `Dai Viet view leaked at tick ${state.tick}`,
      );
      assert.doesNotThrow(
        () => assertNoLeaks(yuan.observed, state, BACH_DANG_1288),
        `Yuan view leaked at tick ${state.tick}`,
      );
    }
  });
});

describe('determinism (§23 — fog must not break replay)', () => {
  test('the same state and seed produce the same observation', () => {
    const state = createInitialState(BACH_DANG_1288, 'seed');
    const a = observe(state, DAI_VIET, BACH_DANG_1288, createRng('x'), emptyMemory());
    const b = observe(state, DAI_VIET, BACH_DANG_1288, createRng('x'), emptyMemory());
    assert.deepEqual(a.observed.enemies, b.observed.enemies);
  });

  test('observing does not perturb the simulation — existing replays stay valid', () => {
    // Observation draws from its own seeded stream, not the battle RNG. If that
    // ever changes, every recorded replay silently diverges, so this is worth
    // pinning down explicitly.
    const run = (withObservation: boolean): BattleState => {
      let s = createInitialState(BACH_DANG_1288, 'perturb');
      let memory = emptyMemory();
      for (let i = 0; i < 40; i++) {
        if (withObservation) {
          const o = observe(s, YUAN, BACH_DANG_1288, createRng(`obs-${i}`), memory);
          memory = o.memory;
        }
        const commands: Command[] = s.units
          .filter((u) => u.faction === YUAN && canAct(u))
          .map((u) => ({ kind: 'MOVE' as const, unitId: u.id, to: { x: 150, y: u.position.y } }));
        s = step(s, commands, BACH_DANG_1288);
      }
      return s;
    };

    const without = run(false);
    const with_ = run(true);
    assert.equal(with_.rngState, without.rngState, 'observation must not consume battle RNG');
    assert.deepEqual(with_.units, without.units);
    assert.deepEqual(with_.events, without.events);
  });

  test('observation does not mutate the battle state', () => {
    const state = createInitialState(BACH_DANG_1288, 'seed');
    const before = JSON.stringify(state);
    observeFor(state, DAI_VIET);
    assert.equal(JSON.stringify(state), before, 'observe() must be pure');
  });
});

describe('fog disabled', () => {
  const noFog = {
    ...BACH_DANG_1288,
    mechanics: { ...BACH_DANG_1288.mechanics, fogOfWar: false },
  };

  test('everything is visible and exact when fog is off', () => {
    const state = createInitialState(noFog, 'seed');
    const { observed } = observe(state, DAI_VIET, noFog, rng());

    const enemyCount = state.units.filter((u) => u.faction === YUAN).length;
    assert.equal(observed.enemies.length, enemyCount);
    assert.ok(observed.enemies.every((e) => e.strength.knowledge === 'KNOWN'));
    assert.equal(observed.knownObstacles.length, 1);
  });

  test('the guard does not complain when fog is off', () => {
    const state = createInitialState(noFog, 'seed');
    const { observed } = observe(state, YUAN, noFog, rng());
    assert.doesNotThrow(() => assertNoLeaks(observed, state, noFog));
  });
});
