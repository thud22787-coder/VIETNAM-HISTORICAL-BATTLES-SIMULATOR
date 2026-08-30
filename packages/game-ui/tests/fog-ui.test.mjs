/**
 * The UI must not be able to see through the fog.
 *
 * These assert a structural property rather than pixels: the render path takes
 * an ObservedState and nothing else, so there is no route by which the shell
 * could draw an enemy the player has not observed. A regression here would be
 * someone widening the signature, which these tests make visible.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const renderSrc = read('../src/render.ts');
const mainSrc = read('../src/main.ts');

test('the renderer takes an ObservedState, not a BattleState', () => {
  assert.match(renderSrc, /readonly observed: ObservedState/);
  assert.doesNotMatch(
    renderSrc,
    /readonly state: BattleState/,
    'render input must not accept ground truth',
  );
});

test('the renderer never iterates the true unit list', () => {
  // state.units is the ground-truth roster. The renderer must reach units only
  // through observed.own / observed.enemies.
  assert.doesNotMatch(
    renderSrc,
    /state\.units/,
    'renderer must not read state.units — that is ground truth',
  );
});

test('the shell renders from the observed view', () => {
  assert.match(mainSrc, /render\(ctx,\s*\{\s*observed:\s*playerView/);
});

test('the scripted opponent reads its own observed view', () => {
  // The placeholder AI must obey the same constraint the real one will, or the
  // constraint will be discovered to be broken only after Phase 8 is built.
  const fn = mainSrc.slice(
    mainSrc.indexOf('function enemyCommands('),
    mainSrc.indexOf('function advance('),
  );
  assert.match(fn, /observe\(/, 'the opponent must go through observe()');
  assert.match(fn, /result\.observed\.own/, 'and act on its own observed units');
  assert.doesNotMatch(
    fn,
    /state\.units\.filter/,
    'the opponent must not read the ground-truth roster',
  );
});

test('the battle log shown to the player is the filtered one', () => {
  assert.match(mainSrc, /playerView\.events/);
});
