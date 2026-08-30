import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, restoreRng, hashSeed } from '../src/sim/rng.ts';

describe('deterministic RNG (§23, §24)', () => {
  test('same seed produces the same sequence', () => {
    const a = createRng('bach-dang-1288');
    const b = createRng('bach-dang-1288');
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    assert.deepEqual(seqA, seqB);
  });

  test('different seeds diverge', () => {
    const a = createRng('seed-a');
    const b = createRng('seed-b');
    assert.notDeepEqual(
      Array.from({ length: 20 }, () => a.next()),
      Array.from({ length: 20 }, () => b.next()),
    );
  });

  test('string and numeric seeds are both accepted and stable', () => {
    assert.equal(hashSeed('x'), hashSeed('x'));
    const a = createRng(12345);
    const b = createRng(12345);
    assert.equal(a.next(), b.next());
  });

  test('state can be captured and restored mid-stream (save/load, replay)', () => {
    const rng = createRng('replay');
    for (let i = 0; i < 10; i++) rng.next();

    const saved = rng.getState();
    const expected = Array.from({ length: 10 }, () => rng.next());

    const restored = restoreRng(saved);
    const actual = Array.from({ length: 10 }, () => restored.next());

    assert.deepEqual(actual, expected, 'restored stream must continue identically');
  });

  test('forked streams are independent but reproducible', () => {
    const parent1 = createRng('root');
    const combat1 = parent1.fork('combat');
    const morale1 = parent1.fork('morale');

    const parent2 = createRng('root');
    const combat2 = parent2.fork('combat');

    assert.equal(combat1.next(), combat2.next(), 'same fork label must reproduce');
    // Different subsystems must not share a stream, or adding a roll in one
    // would shift results in the other and break unrelated replays.
    assert.notEqual(combat1.getState(), morale1.getState());
  });

  test('output stays within [0, 1)', () => {
    const rng = createRng('bounds');
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
    }
  });

  test('nextInt respects bounds and rejects empty intervals', () => {
    const rng = createRng('ints');
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(5, 10);
      assert.ok(v >= 5 && v < 10 && Number.isInteger(v));
    }
    assert.throws(() => rng.nextInt(5, 5));
    assert.throws(() => rng.nextInt(0.5, 3));
  });

  test('distribution is not obviously biased', () => {
    const rng = createRng('distribution');
    const buckets = new Array(10).fill(0);
    const N = 100_000;
    for (let i = 0; i < N; i++) buckets[Math.floor(rng.next() * 10)]!++;
    for (const [i, count] of buckets.entries()) {
      const deviation = Math.abs(count - N / 10) / (N / 10);
      assert.ok(deviation < 0.05, `bucket ${i} deviated ${(deviation * 100).toFixed(1)}%`);
    }
  });
});

describe('Math.random is banned in sim-core (§24)', () => {
  test('no source file references Math.random', () => {
    const srcDir = fileURLToPath(new URL('../src', import.meta.url));

    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });

    // Match actual invocations, not prose. rng.ts legitimately *names*
    // Math.random in the comment explaining why it is banned, and a guard that
    // forbade discussing the rule would be a bad guard.
    const CALL = /Math\s*\.\s*random\s*\(/;

    const offenders = walk(srcDir).filter((file) => {
      if (!file.endsWith('.ts')) return false;
      const withoutComments = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      return CALL.test(withoutComments);
    });

    assert.deepEqual(
      offenders,
      [],
      `Math.random() breaks reproducibility. Use createRng(seed). Offending files:\n${offenders.join('\n')}`,
    );
  });
});
