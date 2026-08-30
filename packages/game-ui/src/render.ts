/**
 * Battlefield renderer.
 *
 * Master Prompt §76: gameplay clarity over graphical complexity. The player
 * must be able to read, at a glance: where the water is, where the obstacles
 * are, who is where, and how much time is left before the tide traps them.
 *
 * This module RENDERS STATE. It never reaches into simulation internals and
 * never mutates anything. If it needs information the state does not expose,
 * the fix is to expose it from the core, not to compute it here.
 *
 * FOG OF WAR
 *
 * It draws from `ObservedState`, never from `BattleState`. That is deliberate
 * and load-bearing: the renderer physically cannot draw an enemy the player has
 * not seen, because it is never handed one. A leak would have to be introduced
 * by changing this signature, which is a visible act rather than an oversight.
 */

import type {
  BattleScenario,
  Unit,
  UnitId,
  TideState,
  TerrainCell,
  ObservedState,
  ObservedUnit,
} from '@vhbs/sim-core';
import { isWaterborne, canAct, estimateOf } from '@vhbs/sim-core';

export interface Viewport {
  readonly width: number;
  readonly height: number;
  /** World metres per screen pixel. */
  readonly scale: number;
}

/** Colours chosen for readability, including at low saturation. */
const COLOURS = {
  deepWater: '#1b3a52',
  shallowWater: '#2c5f7c',
  tidalFlat: '#5a7a6a',
  marsh: '#4a5f43',
  riverbank: '#6b5d43',
  forest: '#2d4a2b',
  plain: '#6a6a4a',
  hill: '#7a6a52',

  daiViet: '#e8b04b',
  yuan: '#c1504a',

  obstacle: '#8b6f47',
  obstacleHidden: 'rgba(139, 111, 71, 0.18)',

  routed: '#6a6a6a',
  immobilised: '#d98d3a',
  destroyed: '#3a3a3a',

  text: '#e8e4dc',
  textDim: '#9a958c',
  panel: 'rgba(18, 22, 28, 0.88)',
} as const;

const terrainColour = (cell: TerrainCell): string => {
  switch (cell.kind) {
    case 'DEEP_WATER': return COLOURS.deepWater;
    case 'SHALLOW_WATER': return COLOURS.shallowWater;
    case 'TIDAL_FLAT': return COLOURS.tidalFlat;
    case 'MARSH': return COLOURS.marsh;
    case 'RIVERBANK': return COLOURS.riverbank;
    case 'FOREST': return COLOURS.forest;
    case 'PLAIN': return COLOURS.plain;
    case 'HILL': return COLOURS.hill;
  }
};

const factionColour = (faction: string): string =>
  faction === 'yuan' ? COLOURS.yuan : COLOURS.daiViet;

export interface RenderInput {
  /** What the player can see. NOT the true battle state. */
  readonly observed: ObservedState;
  readonly scenario: BattleScenario;
  readonly tide: TideState | null;
  readonly selected: ReadonlySet<UnitId>;
  readonly viewport: Viewport;
}

export function render(ctx: CanvasRenderingContext2D, input: RenderInput): void {
  const { observed, scenario, tide, selected, viewport } = input;
  const { scale } = viewport;
  const cellPx = scenario.terrain.cellSizeM / scale;

  ctx.clearRect(0, 0, viewport.width, viewport.height);

  /* --- Terrain, shaded by how much water is actually over it --- */

  for (let cy = 0; cy < scenario.terrain.heightCells; cy++) {
    for (let cx = 0; cx < scenario.terrain.widthCells; cx++) {
      const cell = scenario.terrain.cells[cy * scenario.terrain.widthCells + cx];
      if (!cell) continue;

      ctx.fillStyle = terrainColour(cell);
      ctx.fillRect(cx * cellPx, cy * cellPx, cellPx + 1, cellPx + 1);

      // Where the tide has exposed the bed, wash it out. This makes the ebb
      // legible as a change on the map rather than only a number in a panel.
      if (tide) {
        const depth = tide.levelM - cell.bedElevationM;
        if (depth <= 0) {
          ctx.fillStyle = 'rgba(120, 108, 84, 0.55)';
          ctx.fillRect(cx * cellPx, cy * cellPx, cellPx + 1, cellPx + 1);
        } else if (depth < 1.0) {
          ctx.fillStyle = `rgba(150, 135, 100, ${0.35 * (1 - depth)})`;
          ctx.fillRect(cx * cellPx, cy * cellPx, cellPx + 1, cellPx + 1);
        }
      }
    }
  }

  /* --- Obstacle fields --- */

  // `knownObstacles` has already been filtered by the observation layer to what
  // this side placed (§17), so there is no visibility decision to make here.
  for (const field of observed.knownObstacles) {
    const clearance = tide ? tide.levelM - field.topHeightM : null;

    for (const c of field.cells) {
      const x = c.x * cellPx;
      const y = c.y * cellPx;
      ctx.fillStyle = COLOURS.obstacleHidden;
      ctx.fillRect(x, y, cellPx + 1, cellPx + 1);
    }

    // Hatch the field so it reads as a hazard, not terrain.
    ctx.save();
    ctx.strokeStyle = COLOURS.obstacle;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    const xs = field.cells.map((c) => c.x);
    const ys = field.cells.map((c) => c.y);
    const x0 = Math.min(...xs) * cellPx;
    const y0 = Math.min(...ys) * cellPx;
    const x1 = (Math.max(...xs) + 1) * cellPx;
    const y1 = (Math.max(...ys) + 1) * cellPx;
    for (let x = x0; x < x1; x += 7) {
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
    ctx.restore();

    if (clearance !== null) {
      ctx.fillStyle = COLOURS.textDim;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`${field.name} — ${clearance.toFixed(2)}m clear`, x0 + 4, y0 - 5);
    }
  }

  /* --- Units --- */

  // Enemies first, so friendly markers draw on top where they overlap.
  for (const enemy of observed.enemies) {
    drawObservedEnemy(ctx, enemy, scale);
  }
  for (const unit of observed.own) {
    drawUnit(ctx, unit, scale, selected.has(unit.id));
  }
}

/**
 * Draw an enemy as the player perceives it.
 *
 * A remembered contact is drawn faded and ghosted at its last known position,
 * because that is genuinely what the commander has: an old report, not a
 * tracking display.
 */
function drawObservedEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: ObservedUnit,
  scale: number,
): void {
  const x = enemy.position.x / scale;
  const y = enemy.position.y / scale;
  const waterborne =
    enemy.kind !== 'UNIDENTIFIED' && isWaterborne(enemy.kind);
  const r = waterborne ? 8 : 7;

  ctx.save();

  if (enemy.apparentStatus === 'BROKEN') {
    ctx.strokeStyle = COLOURS.destroyed;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 4);
    ctx.lineTo(x + 4, y + 4);
    ctx.moveTo(x + 4, y - 4);
    ctx.lineTo(x - 4, y + 4);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Stale sightings are ghosted. The dashed ring says "this is where they were".
  if (!enemy.inContact) {
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = COLOURS.yuan;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = COLOURS.yuan;

  if (waterborne) {
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x, y - r * 0.6);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r * 0.6);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(x - r, y - r * 0.7, r * 2, r * 1.4);
  }

  // A vessel visibly in trouble is the player's cue to close in.
  if (enemy.apparentStatus === 'IN_TROUBLE') {
    ctx.strokeStyle = COLOURS.immobilised;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Estimated strength, not a true count.
  const est = estimateOf(enemy.strength);
  if (est !== null && enemy.inContact) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = COLOURS.textDim;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`~${Math.round(est)}`, x - r, y + r + 12);
  }

  ctx.restore();
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  unit: Unit,
  scale: number,
  isSelected: boolean,
): void {
  const x = unit.position.x / scale;
  const y = unit.position.y / scale;
  const r = isWaterborne(unit.kind) ? 8 : 7;

  ctx.save();

  if (unit.status === 'DESTROYED') {
    // Wrecks stay on the map — they are part of reading what happened.
    ctx.strokeStyle = COLOURS.destroyed;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 4);
    ctx.lineTo(x + 4, y + 4);
    ctx.moveTo(x + 4, y - 4);
    ctx.lineTo(x - 4, y + 4);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (isSelected) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  const base = factionColour(unit.faction);
  ctx.fillStyle = unit.status === 'ROUTED' ? COLOURS.routed : base;

  if (isWaterborne(unit.kind)) {
    // Hull shape, so vessels read differently from land units at a glance.
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x, y - r * 0.6);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r * 0.6);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(x - r, y - r * 0.7, r * 2, r * 1.4);
  }

  // Immobilised is the state that matters most in this battle — ring it.
  if (unit.status === 'IMMOBILISED') {
    ctx.strokeStyle = COLOURS.immobilised;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Strength bar: immediate read of how badly a unit is hurt.
  const frac = unit.initialStrength > 0 ? unit.strength / unit.initialStrength : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - r, y + r + 2, r * 2, 3);
  ctx.fillStyle = frac > 0.5 ? '#7bbf6a' : frac > 0.25 ? '#d4b04a' : '#c1504a';
  ctx.fillRect(x - r, y + r + 2, r * 2 * frac, 3);

  ctx.restore();
}

/**
 * Own unit nearest a click, within a tolerance. Used for selection.
 *
 * Takes only the player's own units, since those are the only ones selectable.
 */
export function unitAt(
  own: readonly Unit[],
  worldX: number,
  worldY: number,
  toleranceM: number,
): Unit | null {
  let best: Unit | null = null;
  let bestDist = toleranceM;

  for (const unit of own) {
    if (!canAct(unit)) continue;
    const d = Math.hypot(unit.position.x - worldX, unit.position.y - worldY);
    if (d <= bestDist) {
      best = unit;
      bestDist = d;
    }
  }
  return best;
}
