/**
 * Input layer: gesture interpretation.
 *
 * The interaction model is the whole point of Phase 12, so it is tested as
 * logic rather than left to manual poking. A fake canvas records the listeners
 * `attachInput` registers, and the tests drive real PointerEvent-shaped objects
 * through them.
 *
 * What matters here is that the SAME handlers serve mouse and touch. A test
 * that only exercised `pointerType: 'mouse'` would pass while the touch path
 * was broken, which is exactly the failure this phase exists to prevent.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachInput,
  pickUnit,
  unitsInBox,
  DRAG_THRESHOLD_PX,
  LONG_PRESS_MS,
  TAP_RADIUS_PX,
} from '../src/input.ts';

/** Minimal stand-in for a canvas that records handlers. */
function fakeCanvas() {
  const handlers = new Map();
  return {
    addEventListener: (type, fn) => handlers.set(type, fn),
    removeEventListener: (type) => handlers.delete(type),
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    fire: (type, ev) => handlers.get(type)?.(ev),
    has: (type) => handlers.has(type),
    count: () => handlers.size,
  };
}

const unit = (id, x, y) => ({
  id,
  faction: 'dai-viet',
  kind: 'LIGHT_BOAT',
  name: id,
  strength: 100,
  initialStrength: 100,
  morale: 0.8,
  fatigue: 0,
  cohesion: 0.9,
  supply: 1,
  position: { x, y },
  status: 'ACTIVE',
  baseSpeedMPerHour: 1000,
});

/** Wire up an input harness with a scale of 1 world metre per pixel. */
function harness(units, { hasSelection = false } = {}) {
  const canvas = fakeCanvas();
  const intents = [];
  const boxes = [];
  const hints = [];

  const detach = attachInput(canvas, {
    toWorld: (x, y) => ({ x, y }),
    scale: () => 1,
    ownUnits: () => units,
    hasSelection: () => hasSelection,
    dispatch: (i) => intents.push(i),
    onDragBox: (b) => boxes.push(b),
    onHint: (h) => hints.push(h),
  });

  return { canvas, intents, boxes, hints, detach };
}

const ptr = (x, y, type = 'touch', id = 1) => ({
  pointerId: id,
  clientX: x,
  clientY: y,
  pointerType: type,
  button: 0,
  preventDefault() {},
});

describe('pickUnit', () => {
  const units = [unit('a', 100, 100), unit('b', 400, 400)];

  test('finds a unit within the radius', () => {
    assert.equal(pickUnit(units, { x: 105, y: 105 }, 30)?.id, 'a');
  });

  test('returns null when nothing is close enough', () => {
    assert.equal(pickUnit(units, { x: 250, y: 250 }, 30), null);
  });

  test('prefers the nearer of two candidates', () => {
    const close = [unit('near', 100, 100), unit('far', 120, 100)];
    assert.equal(pickUnit(close, { x: 104, y: 100 }, 50)?.id, 'near');
  });

  test('the tap radius is generous enough for a fingertip', () => {
    // A target sized to the drawn sprite would be unusable on a phone, because
    // the finger covers it. This is the most important number in the module.
    assert.ok(TAP_RADIUS_PX >= 20, `tap radius ${TAP_RADIUS_PX}px is too small for touch`);
  });
});

describe('unitsInBox', () => {
  const units = [unit('in1', 100, 100), unit('in2', 200, 150), unit('out', 900, 900)];

  test('selects units inside the box', () => {
    const got = unitsInBox(units, { from: { x: 50, y: 50 }, to: { x: 300, y: 300 } });
    assert.deepEqual(got.map((u) => u.id), ['in1', 'in2']);
  });

  test('works when the box is dragged up and to the left', () => {
    // A drag that starts bottom-right and ends top-left has from > to on both
    // axes; normalising is the sort of thing that is easy to get wrong once.
    const got = unitsInBox(units, { from: { x: 300, y: 300 }, to: { x: 50, y: 50 } });
    assert.deepEqual(got.map((u) => u.id), ['in1', 'in2']);
  });

  test('an empty box selects nothing', () => {
    assert.deepEqual(unitsInBox(units, { from: { x: 500, y: 500 }, to: { x: 510, y: 510 } }), []);
  });
});

describe('tap to select', () => {
  for (const pointerType of ['touch', 'mouse', 'pen']) {
    test(`a ${pointerType} tap on a unit selects it`, () => {
      const h = harness([unit('a', 100, 100)]);
      h.canvas.fire('pointerdown', ptr(100, 100, pointerType));
      h.canvas.fire('pointerup', ptr(100, 100, pointerType));

      assert.deepEqual(h.intents, [{ kind: 'SELECT_ONE', unitId: 'a' }]);
    });
  }

  test('a tap slightly off a unit still selects it', () => {
    const h = harness([unit('a', 100, 100)]);
    h.canvas.fire('pointerdown', ptr(115, 112));
    h.canvas.fire('pointerup', ptr(115, 112));
    assert.equal(h.intents[0]?.kind, 'SELECT_ONE');
  });
});

describe('tap empty ground', () => {
  test('orders a move when something is selected', () => {
    // The primary way to give an order by touch. There is no right-click on a
    // finger, so this path has to work.
    const h = harness([unit('a', 100, 100)], { hasSelection: true });
    h.canvas.fire('pointerdown', ptr(600, 400));
    h.canvas.fire('pointerup', ptr(600, 400));

    assert.deepEqual(h.intents, [{ kind: 'ORDER_MOVE', to: { x: 600, y: 400 } }]);
  });

  test('clears the selection when nothing is selected', () => {
    const h = harness([unit('a', 100, 100)], { hasSelection: false });
    h.canvas.fire('pointerdown', ptr(600, 400));
    h.canvas.fire('pointerup', ptr(600, 400));

    assert.deepEqual(h.intents, [{ kind: 'CLEAR_SELECTION' }]);
  });
});

describe('drag to box-select', () => {
  test('a drag past the threshold selects units in the box', () => {
    const h = harness([unit('a', 100, 100), unit('b', 200, 200), unit('far', 900, 900)]);

    h.canvas.fire('pointerdown', ptr(50, 50));
    h.canvas.fire('pointermove', ptr(300, 300));
    h.canvas.fire('pointerup', ptr(300, 300));

    assert.deepEqual(h.intents, [{ kind: 'SELECT_BOX', unitIds: ['a', 'b'] }]);
  });

  test('a movement below the threshold is still a tap', () => {
    // Fingers wobble. Treating a 3px twitch as a drag would make selection feel
    // broken on touch while working fine with a mouse.
    const h = harness([unit('a', 100, 100)]);
    const jitter = Math.max(1, DRAG_THRESHOLD_PX - 4);

    h.canvas.fire('pointerdown', ptr(100, 100));
    h.canvas.fire('pointermove', ptr(100 + jitter, 100));
    h.canvas.fire('pointerup', ptr(100 + jitter, 100));

    assert.deepEqual(h.intents, [{ kind: 'SELECT_ONE', unitId: 'a' }]);
  });

  test('the drag box is reported while dragging and cleared after', () => {
    const h = harness([unit('a', 100, 100)]);
    h.canvas.fire('pointerdown', ptr(50, 50));
    h.canvas.fire('pointermove', ptr(300, 300));

    assert.deepEqual(h.boxes.at(-1), { from: { x: 50, y: 50 }, to: { x: 300, y: 300 } });

    h.canvas.fire('pointerup', ptr(300, 300));
    assert.equal(h.boxes.at(-1), null, 'the box must be cleared when the drag ends');
  });
});

describe('long-press to add to selection', () => {
  test('toggles a unit after the press duration', async () => {
    const h = harness([unit('a', 100, 100)]);
    h.canvas.fire('pointerdown', ptr(100, 100));

    await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 80));

    assert.deepEqual(h.intents, [{ kind: 'TOGGLE_ONE', unitId: 'a' }]);
    assert.ok(h.hints.length > 0, 'a long-press needs feedback — nothing else shows it worked');
  });

  test('releasing after a long-press does not also select', async () => {
    // Otherwise the toggle would immediately be replaced by a fresh selection,
    // which is the bug this ordering exists to avoid.
    const h = harness([unit('a', 100, 100)]);
    h.canvas.fire('pointerdown', ptr(100, 100));
    await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 80));
    h.canvas.fire('pointerup', ptr(100, 100));

    assert.deepEqual(h.intents, [{ kind: 'TOGGLE_ONE', unitId: 'a' }]);
  });

  test('moving cancels the long-press', async () => {
    const h = harness([unit('a', 100, 100)]);
    h.canvas.fire('pointerdown', ptr(100, 100));
    h.canvas.fire('pointermove', ptr(300, 300));
    await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 80));

    assert.equal(
      h.intents.some((i) => i.kind === 'TOGGLE_ONE'),
      false,
      'a drag must not also fire a long-press',
    );
  });

  test('a quick tap does not trigger it', async () => {
    const h = harness([unit('a', 100, 100)]);
    h.canvas.fire('pointerdown', ptr(100, 100));
    h.canvas.fire('pointerup', ptr(100, 100));
    await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 80));

    assert.deepEqual(h.intents, [{ kind: 'SELECT_ONE', unitId: 'a' }]);
  });
});

describe('robustness', () => {
  test('pointercancel abandons the gesture cleanly', () => {
    // Fired when the OS takes over — a system gesture, a call arriving. Leaving
    // a drag box on screen forever would be a visible bug on a phone.
    const h = harness([unit('a', 100, 100)]);
    h.canvas.fire('pointerdown', ptr(50, 50));
    h.canvas.fire('pointermove', ptr(300, 300));
    h.canvas.fire('pointercancel', ptr(300, 300));

    assert.equal(h.boxes.at(-1), null);
    assert.deepEqual(h.intents, []);

    h.canvas.fire('pointerup', ptr(300, 300));
    assert.deepEqual(h.intents, [], 'a cancelled gesture must not resurrect on pointerup');
  });

  test('a second pointer does not disturb the first gesture', () => {
    // A second finger landing mid-drag is normal on a phone.
    const h = harness([unit('a', 100, 100)]);
    h.canvas.fire('pointerdown', ptr(50, 50, 'touch', 1));
    h.canvas.fire('pointermove', ptr(300, 300, 'touch', 1));
    h.canvas.fire('pointerup', ptr(900, 900, 'touch', 2)); // different pointer

    assert.deepEqual(h.intents, [], 'the stray pointer must be ignored');

    h.canvas.fire('pointerup', ptr(300, 300, 'touch', 1));
    assert.equal(h.intents.at(-1)?.kind, 'SELECT_BOX');
  });

  test('secondary mouse buttons do not start a gesture', () => {
    const h = harness([unit('a', 100, 100)]);
    h.canvas.fire('pointerdown', { ...ptr(100, 100, 'mouse'), button: 2 });
    h.canvas.fire('pointerup', { ...ptr(100, 100, 'mouse'), button: 2 });
    assert.deepEqual(h.intents, []);
  });

  test('right-click still orders a move, for mouse players', () => {
    const h = harness([unit('a', 100, 100)], { hasSelection: true });
    h.canvas.fire('contextmenu', ptr(500, 300, 'mouse'));
    assert.deepEqual(h.intents, [{ kind: 'ORDER_MOVE', to: { x: 500, y: 300 } }]);
  });

  test('detaching removes every listener', () => {
    const h = harness([unit('a', 100, 100)]);
    assert.ok(h.canvas.count() > 0);
    h.detach();
    assert.equal(h.canvas.count(), 0);
  });
});
