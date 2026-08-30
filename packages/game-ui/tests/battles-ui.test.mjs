/**
 * Both battles must boot in the real shell.
 *
 * The §72 extensibility claim is about more than the simulation core: if adding
 * a battle required UI surgery, the claim would be only half true. This boots
 * the actual shell against each scenario in turn.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const htmlPath = fileURLToPath(new URL('../index.html', import.meta.url));
const ids = [...readFileSync(htmlPath, 'utf8').matchAll(/id="([^"]+)"/g)].map((m) => m[1]);

function fakeDom(search) {
  const made = new Map();
  const mkEl = (id = '') => {
    const el = {
      id, style: {}, dataset: {}, textContent: '', innerHTML: '', className: '',
      classList: { add() {}, remove() {}, contains: () => false },
      addEventListener() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 700 }),
      parentElement: null, width: 0, height: 0,
      getContext: () => new Proxy({}, { get: () => () => {} }),
      querySelectorAll: () => [],
    };
    el.parentElement = { getBoundingClientRect: el.getBoundingClientRect };
    return el;
  };
  for (const id of ids) made.set(id, mkEl(id));

  const missing = [];
  globalThis.document = {
    getElementById: (id) => { const e = made.get(id); if (!e) missing.push(id); return e ?? null; },
    querySelectorAll: () => [],
    createElement: () => mkEl(),
  };
  globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
  globalThis.location = { search, href: `http://localhost/${search}` };
  let frames = 0;
  globalThis.performance = { now: () => frames * 16 };
  globalThis.requestAnimationFrame = (fn) => { if (frames++ < 3) fn(frames * 16); };

  return { made, missing, frames: () => frames };
}

for (const [label, search] of [
  ['default (Bach Dang 1288)', ''],
  ['Chi Lang 1427', '?battle=CHI_LANG_1427'],
  ['Tot Dong 1426', '?battle=TOT_DONG_1426'],
  ['unknown battle falls back', '?battle=NOT_A_BATTLE'],
]) {
  test(`the shell boots for ${label}`, async () => {
    const dom = fakeDom(search);
    // Cache-bust so each case re-executes the module top level.
    await import(`../src/main.ts?case=${encodeURIComponent(label)}`);

    assert.deepEqual(dom.missing, [], `missing element ids: ${dom.missing.join(', ')}`);
    assert.ok(dom.frames() > 0, 'the render loop never ran');
    assert.ok(dom.made.get('briefTitle').textContent.length > 0, 'no battle title was set');
  });
}

test('the battle list offers every battle', async () => {
  const dom = fakeDom('');
  await import('../src/main.ts?case=list');
  const html = dom.made.get('battleList').innerHTML;
  assert.match(html, /BACH_DANG_1288/);
  assert.match(html, /CHI_LANG_1427/);
  assert.match(html, /TOT_DONG_1426/);
});
