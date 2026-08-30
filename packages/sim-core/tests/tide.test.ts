import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateTide,
  depthOverFeature,
  vesselClears,
  timeUntilLevel,
  type TideConfig,
} from '../src/sim/tide.ts';

/**
 * Config grounded in HISTORICAL_SOURCES.md S-002: diurnal regime (~24.8h),
 * spring range ~3.0m. Datum chosen so low water is 0.
 */
const BACH_DANG_SPRING: TideConfig = {
  periodHours: 24.8,
  lowWaterM: 0,
  highWaterM: 3.0,
  highWaterAtHour: 6,
};

describe('tide model', () => {
  test('reaches high water at the configured hour', () => {
    const t = evaluateTide(BACH_DANG_SPRING, 6);
    assert.ok(Math.abs(t.levelM - 3.0) < 1e-9, `expected 3.0m, got ${t.levelM}`);
    assert.equal(t.phase, 'HIGH_SLACK');
  });

  test('reaches low water half a period later', () => {
    const t = evaluateTide(BACH_DANG_SPRING, 6 + 24.8 / 2);
    assert.ok(Math.abs(t.levelM - 0) < 1e-9, `expected 0m, got ${t.levelM}`);
    assert.equal(t.phase, 'LOW_SLACK');
  });

  test('is periodic', () => {
    const a = evaluateTide(BACH_DANG_SPRING, 3);
    const b = evaluateTide(BACH_DANG_SPRING, 3 + 24.8);
    assert.ok(Math.abs(a.levelM - b.levelM) < 1e-9);
  });

  test('ebbs after high water and floods before it', () => {
    assert.equal(evaluateTide(BACH_DANG_SPRING, 9).phase, 'EBB');
    assert.equal(evaluateTide(BACH_DANG_SPRING, 3).phase, 'FLOOD');
  });

  test('level never leaves the configured range', () => {
    for (let t = 0; t < 50; t += 0.1) {
      const { levelM } = evaluateTide(BACH_DANG_SPRING, t);
      assert.ok(levelM >= -1e-9 && levelM <= 3.0 + 1e-9, `level ${levelM} out of range at t=${t}`);
    }
  });

  test('is deterministic and pure', () => {
    assert.deepEqual(evaluateTide(BACH_DANG_SPRING, 7.3), evaluateTide(BACH_DANG_SPRING, 7.3));
  });

  test('rejects invalid configuration loudly (fail-fast, §96)', () => {
    assert.throws(() => evaluateTide({ ...BACH_DANG_SPRING, periodHours: 0 }, 1));
    assert.throws(() =>
      evaluateTide({ ...BACH_DANG_SPRING, highWaterM: -1 }, 1),
    );
  });
});

describe('stake / draft interaction — the Bach Dang mechanic', () => {
  // Stake top 1.8m above datum; at 3.0m high water there is 1.2m over it.
  const STAKE_TOP_M = 1.8;

  test('depth over a feature follows the tide', () => {
    const high = evaluateTide(BACH_DANG_SPRING, 6);
    assert.ok(Math.abs(depthOverFeature(high, STAKE_TOP_M) - 1.2) < 1e-9);
  });

  test('deep-draft ship clears at high water but not at low water', () => {
    const heavyDraft = 1.0;
    const high = evaluateTide(BACH_DANG_SPRING, 6);
    const low = evaluateTide(BACH_DANG_SPRING, 6 + 12.4);

    assert.equal(vesselClears(high, STAKE_TOP_M, heavyDraft), true);
    assert.equal(vesselClears(low, STAKE_TOP_M, heavyDraft), false);
  });

  test('shallow-draft craft still clears when heavy ships are trapped', () => {
    // This asymmetry is the whole tactical point: light boats operate freely
    // in water that has already immobilised the enemy fleet.
    const lightDraft = 0.3;
    const heavyDraft = 1.0;
    // Partway down the ebb.
    const ebbing = evaluateTide(BACH_DANG_SPRING, 10.5);

    assert.equal(vesselClears(ebbing, STAKE_TOP_M, lightDraft), true);
    assert.equal(vesselClears(ebbing, STAKE_TOP_M, heavyDraft), false);
  });

  test('clearance margin makes marginal passage unsafe', () => {
    const high = evaluateTide(BACH_DANG_SPRING, 6); // 1.2m of water over stakes
    assert.equal(vesselClears(high, STAKE_TOP_M, 1.1, 0), true);
    assert.equal(vesselClears(high, STAKE_TOP_M, 1.1, 0.5), false);
  });
});

describe('timeUntilLevel — the closing trap window', () => {
  test('finds the falling crossing and it verifies', () => {
    const target = 2.0;
    const dt = timeUntilLevel(BACH_DANG_SPRING, 6, target, 24, true);
    assert.ok(dt !== null, 'expected a falling crossing after high water');
    const level = evaluateTide(BACH_DANG_SPRING, 6 + dt).levelM;
    assert.ok(Math.abs(level - target) < 1e-3, `crossing level was ${level}`);
  });

  test('returns null when the level is not reached in the window', () => {
    // Never rises above 3.0m.
    assert.equal(timeUntilLevel(BACH_DANG_SPRING, 0, 5.0, 30, false), null);
  });

  test('gives a commander usable warning time before the trap closes', () => {
    // From high water, how long until deep-draft ships (1.0m) ground on
    // 1.8m stakes? Water must fall to 2.8m.
    const dt = timeUntilLevel(BACH_DANG_SPRING, 6, 2.8, 24, true);
    assert.ok(dt !== null);
    // Sanity: should be a meaningful but not unlimited window.
    assert.ok(dt > 0.5 && dt < 6, `trap window was ${dt}h, expected a few hours`);
  });
});
