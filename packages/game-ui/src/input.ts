/**
 * Input handling for mouse and touch.
 *
 * Master Prompt §46 (accessibility: mouse and touch), §77 (mobile is not a
 * shrunken desktop).
 *
 * WHY THIS IS A SEPARATE MODULE
 *
 * The original UI used `mousedown` + `shiftKey` to select and `contextmenu` to
 * order. Neither has a touch equivalent: a finger has no right button and no
 * shift key. Adding `touchstart` alongside would not have fixed that — it would
 * have produced a mouse interface you poke at.
 *
 * So the interaction model is redesigned around what a pointer can actually
 * express, and then *mouse* is treated as the special case that has extra
 * affordances rather than touch being the degraded one:
 *
 *   tap / click on own unit    select it
 *   tap / click empty ground   with a selection: order a move
 *                              without one: clear
 *   drag                       box-select own units
 *   long-press on own unit     add/remove from selection (the shift-click of
 *                              touch, and it works with a mouse too)
 *   right-click                order a move (mouse convenience, kept)
 *   two-finger / wheel         reserved for zoom — see NOT IMPLEMENTED below
 *
 * The important consequence: **tapping empty ground orders a move**. On desktop
 * that reads as a shortcut; on touch it is the only way to give an order at all.
 * Making it the primary path for both means one code path is exercised by every
 * player rather than a mobile branch nobody runs.
 *
 * Everything here is Pointer Events, so mouse, touch and stylus arrive through
 * the same handlers and there is no duplicated logic to drift.
 *
 * NOT IMPLEMENTED, deliberately: pinch zoom and pan. Both battles are designed
 * to fit one screen — the whole tactical map is the point — so a camera would
 * add state and a class of bugs for no gameplay gain today. `Viewport` already
 * carries a scale, so adding one later is a change to this module and the
 * renderer, not to the simulation.
 */

import type { Unit, UnitId } from '@vhbs/sim-core';

/** How far a pointer may move before a tap becomes a drag, in CSS pixels. */
export const DRAG_THRESHOLD_PX = 8;

/** How long a stationary press must last to count as a long-press, in ms. */
export const LONG_PRESS_MS = 450;

/**
 * Hit tolerance in CSS pixels.
 *
 * Deliberately larger than the drawn unit. A fingertip covers roughly 9mm and
 * the player cannot see under it, so a target sized to the sprite would be
 * unusable on a phone. This is the single most important number in the file.
 */
export const TAP_RADIUS_PX = 22;

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

/** A selection box being dragged, in world coordinates. */
export interface DragBox {
  readonly from: WorldPoint;
  readonly to: WorldPoint;
}

/**
 * What the input layer asks the game to do.
 *
 * Expressed as intents rather than raw events so the shell does not have to
 * care whether an order came from a finger, a mouse or (later) a keyboard.
 */
export type InputIntent =
  | { readonly kind: 'SELECT_ONE'; readonly unitId: UnitId }
  | { readonly kind: 'TOGGLE_ONE'; readonly unitId: UnitId }
  | { readonly kind: 'SELECT_BOX'; readonly unitIds: readonly UnitId[] }
  | { readonly kind: 'ORDER_MOVE'; readonly to: WorldPoint }
  | { readonly kind: 'CLEAR_SELECTION' };

export interface InputCallbacks {
  /** Convert client coordinates to world coordinates. */
  readonly toWorld: (clientX: number, clientY: number) => WorldPoint;
  /** World metres per CSS pixel, for scaling thresholds. */
  readonly scale: () => number;
  /** The player's own units, the only selectable things. */
  readonly ownUnits: () => readonly Unit[];
  /** Whether anything is currently selected. */
  readonly hasSelection: () => boolean;
  /** Act on an intent. */
  readonly dispatch: (intent: InputIntent) => void;
  /** Called as a drag box changes, so the renderer can show it. */
  readonly onDragBox: (box: DragBox | null) => void;
  /** Brief feedback text, e.g. after a long-press. Optional. */
  readonly onHint?: (text: string) => void;
}

/** Nearest own unit to a world point, within a pixel radius. */
export function pickUnit(
  units: readonly Unit[],
  at: WorldPoint,
  radiusM: number,
): Unit | null {
  let best: Unit | null = null;
  let bestDist = radiusM;

  for (const unit of units) {
    const d = Math.hypot(unit.position.x - at.x, unit.position.y - at.y);
    if (d <= bestDist) {
      best = unit;
      bestDist = d;
    }
  }
  return best;
}

/** Units whose position falls inside a world-space box. */
export function unitsInBox(units: readonly Unit[], box: DragBox): Unit[] {
  const minX = Math.min(box.from.x, box.to.x);
  const maxX = Math.max(box.from.x, box.to.x);
  const minY = Math.min(box.from.y, box.to.y);
  const maxY = Math.max(box.from.y, box.to.y);

  return units.filter(
    (u) =>
      u.position.x >= minX &&
      u.position.x <= maxX &&
      u.position.y >= minY &&
      u.position.y <= maxY,
  );
}

interface PointerState {
  readonly pointerId: number;
  readonly startClient: { x: number; y: number };
  readonly startWorld: WorldPoint;
  readonly startedAt: number;
  moved: boolean;
  longPressed: boolean;
  longPressTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Attach pointer handling to a canvas.
 *
 * Returns a teardown function, so a caller can detach cleanly — which matters
 * for tests and would matter for a scenario switch that rebuilt the canvas.
 */
export function attachInput(canvas: HTMLElement, cb: InputCallbacks): () => void {
  let active: PointerState | null = null;

  const clearLongPress = (): void => {
    if (active?.longPressTimer !== null && active?.longPressTimer !== undefined) {
      clearTimeout(active.longPressTimer);
      active.longPressTimer = null;
    }
  };

  const onPointerDown = (ev: PointerEvent): void => {
    // Ignore secondary mouse buttons here; right-click is handled separately so
    // that it can order a move without going through drag detection.
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;

    const world = cb.toWorld(ev.clientX, ev.clientY);
    const state: PointerState = {
      pointerId: ev.pointerId,
      startClient: { x: ev.clientX, y: ev.clientY },
      startWorld: world,
      startedAt: Date.now(),
      moved: false,
      longPressed: false,
      longPressTimer: null,
    };
    active = state;

    if (canvas.setPointerCapture) canvas.setPointerCapture(ev.pointerId);

    // Long-press on an own unit toggles it in the selection: the touch
    // equivalent of shift-click, available to the mouse as well.
    state.longPressTimer = setTimeout(() => {
      if (!active || active.pointerId !== state.pointerId || active.moved) return;
      const hit = pickUnit(cb.ownUnits(), world, TAP_RADIUS_PX * cb.scale());
      if (hit) {
        active.longPressed = true;
        cb.dispatch({ kind: 'TOGGLE_ONE', unitId: hit.id });
        cb.onHint?.('added to selection');
      }
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (ev: PointerEvent): void => {
    if (!active || ev.pointerId !== active.pointerId) return;

    const dx = ev.clientX - active.startClient.x;
    const dy = ev.clientY - active.startClient.y;

    if (!active.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      active.moved = true;
      clearLongPress();
    }

    if (active.moved) {
      cb.onDragBox({ from: active.startWorld, to: cb.toWorld(ev.clientX, ev.clientY) });
    }
  };

  const onPointerUp = (ev: PointerEvent): void => {
    if (!active || ev.pointerId !== active.pointerId) return;
    const state = active;
    clearLongPress();
    active = null;
    cb.onDragBox(null);

    if (canvas.releasePointerCapture && canvas.hasPointerCapture?.(ev.pointerId)) {
      canvas.releasePointerCapture(ev.pointerId);
    }

    // A long-press already acted; releasing must not also select or order.
    if (state.longPressed) return;

    const world = cb.toWorld(ev.clientX, ev.clientY);

    if (state.moved) {
      const box: DragBox = { from: state.startWorld, to: world };
      const inBox = unitsInBox(cb.ownUnits(), box);
      cb.dispatch({ kind: 'SELECT_BOX', unitIds: inBox.map((u) => u.id) });
      return;
    }

    // A tap.
    const hit = pickUnit(cb.ownUnits(), world, TAP_RADIUS_PX * cb.scale());
    if (hit) {
      cb.dispatch({ kind: 'SELECT_ONE', unitId: hit.id });
      return;
    }

    // Empty ground: order the selection there, or clear if there is none.
    // This is the only way to give an order by touch, so it is the primary
    // path on every platform rather than a mobile-only branch.
    if (cb.hasSelection()) {
      cb.dispatch({ kind: 'ORDER_MOVE', to: world });
    } else {
      cb.dispatch({ kind: 'CLEAR_SELECTION' });
    }
  };

  const onPointerCancel = (): void => {
    clearLongPress();
    active = null;
    cb.onDragBox(null);
  };

  // Right-click keeps working as a move order for players used to it.
  const onContextMenu = (ev: MouseEvent): void => {
    ev.preventDefault();
    if (!cb.hasSelection()) return;
    cb.dispatch({ kind: 'ORDER_MOVE', to: cb.toWorld(ev.clientX, ev.clientY) });
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('contextmenu', onContextMenu);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('contextmenu', onContextMenu);
  };
}
