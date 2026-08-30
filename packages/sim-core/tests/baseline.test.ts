import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HistoricalBaseline, deepFreeze, isDeeplyFrozen } from '../src/history/baseline.ts';

interface ScenarioData {
  name: string;
  forces: { faction: string; ships: number; nested: { depth: number } }[];
}

const sample = (): ScenarioData => ({
  name: 'Bach Dang 1288',
  forces: [
    { faction: 'dai-viet', ships: 100, nested: { depth: 1 } },
    { faction: 'yuan', ships: 400, nested: { depth: 2 } },
  ],
});

describe('deepFreeze', () => {
  test('freezes nested structures, not just the root', () => {
    const frozen = deepFreeze(sample());
    assert.ok(isDeeplyFrozen(frozen));
    assert.throws(() => {
      (frozen.forces[0] as { ships: number }).ships = 999;
    }, TypeError);
    assert.throws(() => {
      (frozen.forces[0]!.nested as { depth: number }).depth = 999;
    }, TypeError);
  });

  test('handles cyclic graphs without infinite recursion', () => {
    const a: Record<string, unknown> = { name: 'a' };
    const b: Record<string, unknown> = { name: 'b', a };
    a['b'] = b;
    const frozen = deepFreeze(a);
    assert.ok(Object.isFrozen(frozen));
    assert.ok(Object.isFrozen(b));
  });

  test('passes through primitives and null', () => {
    assert.equal(deepFreeze(42), 42);
    assert.equal(deepFreeze(null), null);
    assert.equal(deepFreeze('x'), 'x');
  });
});

describe('HistoricalBaseline — INV-16 (§26)', () => {
  test('exposes data that cannot be mutated', () => {
    const baseline = new HistoricalBaseline('BACH_DANG_1288', 'v1', sample());
    assert.throws(() => {
      (baseline.data.forces[0] as { ships: number }).ships = 999;
    }, TypeError);
  });

  test('is insulated from later mutation of the source object', () => {
    // A caller keeping a reference to the input must not be able to reach in
    // and edit the baseline afterwards.
    const source = sample();
    const baseline = new HistoricalBaseline('BACH_DANG_1288', 'v1', source);
    source.forces[0]!.ships = 12345;
    assert.equal(baseline.data.forces[0]!.ships, 100, 'baseline must be a defensive copy');
  });

  test('fork yields an independent mutable copy', () => {
    const baseline = new HistoricalBaseline('BACH_DANG_1288', 'v1', sample());
    const whatIf = baseline.fork();

    whatIf.forces[0]!.ships += 50;
    whatIf.forces[0]!.nested.depth = 99;

    assert.equal(whatIf.forces[0]!.ships, 150);
    assert.equal(baseline.data.forces[0]!.ships, 100, 'baseline must be untouched');
    assert.equal(baseline.data.forces[0]!.nested.depth, 1, 'nested baseline data must be untouched');
  });

  test('forkWith expresses a what-if readably and safely', () => {
    const baseline = new HistoricalBaseline('BACH_DANG_1288', 'v1', sample());

    // "What if the defenders had 20% more light craft?"
    const whatIf = baseline.forkWith((draft) => {
      draft.forces[0]!.ships = Math.round(draft.forces[0]!.ships * 1.2);
    });

    assert.equal(whatIf.forces[0]!.ships, 120);
    assert.equal(baseline.data.forces[0]!.ships, 100);
  });

  test('repeated forks do not accumulate changes', () => {
    const baseline = new HistoricalBaseline('BACH_DANG_1288', 'v1', sample());
    for (let i = 0; i < 5; i++) {
      const f = baseline.forkWith((d) => {
        d.forces[0]!.ships += 100;
      });
      assert.equal(f.forces[0]!.ships, 200, 'each fork starts from the pristine baseline');
    }
    assert.equal(baseline.data.forces[0]!.ships, 100);
  });

  test('the baseline object itself is frozen', () => {
    const baseline = new HistoricalBaseline('BACH_DANG_1288', 'v1', sample());
    assert.throws(() => {
      (baseline as { scenarioVersion: string }).scenarioVersion = 'v2';
    }, TypeError);
  });

  test('carries scenario identity for INV-17 binding', () => {
    const baseline = new HistoricalBaseline('BACH_DANG_1288', 'v1', sample());
    assert.equal(baseline.scenarioId, 'BACH_DANG_1288');
    assert.equal(baseline.scenarioVersion, 'v1');
  });
});
