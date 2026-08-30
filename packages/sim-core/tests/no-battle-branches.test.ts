import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * §38 and §73: the engine must not special-case individual battles, or adding
 * the twentieth becomes a rewrite. This is the executable form of that rule.
 *
 * It is deliberately structural rather than a promise in a document: the whole
 * extensibility argument in ADR-008 rests on it, and a claim nobody checks
 * decays.
 */

const srcDir = fileURLToPath(new URL('../src', import.meta.url));

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

/**
 * Engine and framework files — everything except content and the places that
 * legitimately enumerate battles.
 *
 * Excluded, and why each is content rather than engine:
 *  - `scenario/battles/` and `campaign/campaigns/` ARE the battle and campaign
 *    data. A campaign naming its battles is its entire purpose, exactly as a
 *    scenario naming its terrain is. The campaign *engine* (`campaign.ts`) is
 *    still covered by this guard and stays generic.
 *  - `src/index.ts` is the package export registry.
 *  - `src/testing/` holds the determinism fingerprint, which must run specific
 *    battles to be a fingerprint at all.
 *
 * None of them decides how a battle is simulated, which is what this guard
 * protects.
 */
const engineFiles = walk(srcDir).filter(
  (f) =>
    f.endsWith('.ts') &&
    !f.includes(join('scenario', 'battles')) &&
    !f.includes(join('campaign', 'campaigns')) &&
    !f.includes(join('src', 'testing')) &&
    !f.endsWith(join('src', 'index.ts')),
);

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('the engine never special-cases a battle (§38, §73)', () => {
  test('no engine file names a specific battle', () => {
    // Comments are stripped: several modules legitimately *discuss* the rule,
    // and a guard that forbade explaining itself would be a bad guard.
    const offenders = engineFiles.filter((f) =>
      /BACH_DANG|CHI_LANG|bach[-_]dang|chi[-_]lang/i.test(stripComments(readFileSync(f, 'utf8'))),
    );

    assert.deepEqual(
      offenders,
      [],
      `engine code must not reference specific battles:\n${offenders.join('\n')}`,
    );
  });

  test('nothing branches on scenario or battle identity', () => {
    const offenders = engineFiles.filter((f) =>
      /(scenario|battle)\s*\.\s*id\s*===/.test(stripComments(readFileSync(f, 'utf8'))),
    );

    assert.deepEqual(
      offenders,
      [],
      `branching on scenario identity is how a codebase becomes a pile of special cases:\n${offenders.join('\n')}`,
    );
  });

  test('the guard covers a real body of engine code', () => {
    // A guard that scans nothing passes trivially.
    assert.ok(engineFiles.length > 8, `expected many engine files, found ${engineFiles.length}`);
  });
});
