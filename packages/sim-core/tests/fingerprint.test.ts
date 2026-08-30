import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeFingerprint, FINGERPRINT_VERSION } from '../src/testing/fingerprint.ts';

/**
 * The determinism fingerprint (§23, §53).
 *
 * The golden file is the reference. Two things can break it, and they need
 * different responses:
 *
 *  - **A deliberate simulation change.** Expected. Bump SIMULATION_VERSION and
 *    regenerate the golden file in the same commit, so the diff shows exactly
 *    which numbers moved.
 *  - **The same code producing different numbers.** That is a real bug, and it
 *    means replays and saves are not reproducible.
 *
 * The same function is run in a browser by
 * `packages/game-ui/tests/determinism-browser.test.mjs`, which compares that
 * result against this same golden file. That is what actually verifies the
 * cross-platform claim in ADR-001.
 */

const goldenPath = fileURLToPath(new URL('./fingerprint.golden.txt', import.meta.url));

describe('determinism fingerprint', () => {
  test('matches the golden reference', () => {
    const golden = readFileSync(goldenPath, 'utf8').trimEnd();
    const actual = computeFingerprint();

    if (actual !== golden) {
      // Report the first differing line rather than dumping 2KB of noise.
      const a = actual.split('\n');
      const g = golden.split('\n');
      const i = a.findIndex((line, idx) => line !== g[idx]);
      assert.fail(
        `Fingerprint diverged at line ${i + 1}:\n` +
          `  expected: ${g[i]?.slice(0, 160)}\n` +
          `  actual:   ${a[i]?.slice(0, 160)}\n` +
          `If this was a deliberate simulation change, bump SIMULATION_VERSION and ` +
          `regenerate tests/fingerprint.golden.txt in the same commit.`,
      );
    }
  });

  test('is stable across repeated computation', () => {
    assert.equal(computeFingerprint(), computeFingerprint());
  });

  test('covers both battles and the raw RNG', () => {
    // A fingerprint that exercised only one code path would pass while the
    // other diverged.
    const fp = computeFingerprint();
    assert.match(fp, /BACH_DANG_1288\.rng=/);
    assert.match(fp, /CHI_LANG_1427\.rng=/);
    assert.match(fp, /hashSeed=/);
    assert.match(fp, /fork\.combat=/);
    assert.equal(fp.startsWith(`version=${FINGERPRINT_VERSION}`), true);
  });

  test('records full float precision', () => {
    // Rounding would hide exactly the last-bit divergence this exists to catch.
    assert.match(computeFingerprint(), /draws=0\.\d{17}\|/);
  });
});
