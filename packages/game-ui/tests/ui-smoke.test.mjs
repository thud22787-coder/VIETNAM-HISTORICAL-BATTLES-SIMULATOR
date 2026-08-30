/**
 * UI smoke test.
 *
 * Boots the real game shell against a minimal fake DOM. This catches the class
 * of failure typechecking cannot see: an element id referenced in code but
 * absent from the HTML, or a runtime error on the first frames. Those would
 * otherwise only show up when a human opened the page.
 *
 * It is intentionally not a rendering test -- the canvas context is a no-op
 * proxy. What is asserted is that the shell wires up and runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const htmlPath = fileURLToPath(new URL('../index.html', import.meta.url));
const ids = [...readFileSync(htmlPath, 'utf8').matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const made = new Map();
const mkEl = (id='') => {
  const el = {
    id, style:{}, dataset:{}, textContent:'', innerHTML:'', className:'',
    classList:{ add(){}, remove(){}, contains(){return false} },
    addEventListener(){}, getBoundingClientRect:()=>({left:0,top:0,width:1200,height:700}),
    parentElement:null, width:0, height:0,
    getContext:()=>new Proxy({},{get:()=>()=>{}}),
    querySelectorAll:()=>[],
  };
  el.parentElement = { getBoundingClientRect: el.getBoundingClientRect };
  return el;
};
for (const id of ids) made.set(id, mkEl(id));

let rafCalls = 0;
globalThis.document = {
  getElementById: (id) => made.get(id) ?? null,
  querySelectorAll: () => [],
  createElement: () => mkEl(),
};
globalThis.window = { addEventListener(){}, devicePixelRatio:1 };
globalThis.performance = { now: () => rafCalls * 16 };
globalThis.requestAnimationFrame = (fn) => { if (rafCalls++ < 3) fn(rafCalls*16); };

const missing = [];
const origGet = globalThis.document.getElementById;
globalThis.document.getElementById = (id) => { const e = origGet(id); if(!e) missing.push(id); return e; };

await import('../src/main.ts');

test('every element id the shell references exists in index.html', () => {
  assert.deepEqual(missing, [], `main.ts referenced element ids absent from index.html: ${missing.join(', ')}`);
});

test('the shell boots and renders frames without throwing', () => {
  assert.ok(rafCalls > 0, 'the render loop never ran');
});
