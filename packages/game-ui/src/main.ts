/**
 * Game shell.
 *
 * The player commands Đại Việt; the Yuan fleet is run by a simple scripted
 * opponent until the AI commander exists (roadmap Phase 8).
 *
 * This layer only renders state and sends commands. All rules live in
 * @vhbs/sim-core.
 */

import {
  BACH_DANG_1288,
  createInitialState,
  step,
  evaluateTide,
  analyseBattle,
  compareWithHistory,
  assertScenarioValid,
  canAct,
  isWaterborne,
  timeUntilLevel,
  MINUTES_PER_TICK,
  type BattleState,
  type Command,
  type UnitId,
  type Unit,
} from '@vhbs/sim-core';
import { render, unitAt, type Viewport } from './render.ts';

const scenario = BACH_DANG_1288;
assertScenarioValid(scenario);

const PLAYER_FACTION = 'dai-viet';
const ENEMY_FACTION = 'yuan';

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

let state: BattleState = createInitialState(scenario, `seed-${Date.now()}`);
let selected = new Set<UnitId>();
let running = false;
let speed = 4; // ticks per second
let accumulator = 0;
let lastFrame = performance.now();

/** Orders that persist across ticks, so a unit keeps moving once told to. */
const standingOrders = new Map<UnitId, Command>();

const mapWidthM = scenario.terrain.widthCells * scenario.terrain.cellSizeM;
const mapHeightM = scenario.terrain.heightCells * scenario.terrain.cellSizeM;

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('battlefield') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const $ = (id: string): HTMLElement => document.getElementById(id)!;

let viewport: Viewport = { width: 0, height: 0, scale: 1 };

function resize(): void {
  const rect = canvas.parentElement!.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Fit the whole battlefield; this is a tactical map, not a scrolling world.
  const scale = Math.max(mapWidthM / rect.width, mapHeightM / rect.height);
  viewport = { width: rect.width, height: rect.height, scale };
}

window.addEventListener('resize', resize);

/* ------------------------------------------------------------------ */
/* Opponent (scripted placeholder — see roadmap Phase 8)               */
/* ------------------------------------------------------------------ */

/**
 * The Yuan fleet makes for open water. This is NOT the AI commander from
 * §31-35 — it is a deliberately simple stand-in so the battle is playable.
 * It reads full state, which a real AI commander must not do (§32, §34).
 */
function enemyCommands(s: BattleState): Command[] {
  return s.units
    .filter((u) => u.faction === ENEMY_FACTION && canAct(u))
    .map((u) => ({ kind: 'MOVE' as const, unitId: u.id, to: { x: 150, y: u.position.y } }));
}

/* ------------------------------------------------------------------ */
/* Simulation loop                                                     */
/* ------------------------------------------------------------------ */

function advance(): void {
  if (state.outcome.kind !== 'ONGOING') {
    running = false;
    showResult();
    return;
  }

  const commands: Command[] = [...enemyCommands(state)];
  for (const [unitId, order] of standingOrders) {
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit || !canAct(unit)) {
      standingOrders.delete(unitId);
      continue;
    }
    commands.push(order);
  }

  state = step(state, commands, scenario);
}

function frame(now: number): void {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;

  if (running) {
    accumulator += dt * speed;
    // Cap catch-up so a background tab does not fast-forward the battle.
    let budget = 8;
    while (accumulator >= 1 && budget-- > 0) {
      accumulator -= 1;
      advance();
    }
  }

  draw();
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function currentTide() {
  return scenario.mechanics.tide
    ? evaluateTide(scenario.mechanics.tide, state.elapsedHours)
    : null;
}

function draw(): void {
  const tide = currentTide();
  render(ctx, { state, scenario, tide, selected, viewport, playerFaction: PLAYER_FACTION });
  updatePanels(tide);
}

function fmtClock(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function updatePanels(tide: ReturnType<typeof currentTide>): void {
  $('clock').textContent = `T+${fmtClock(state.elapsedHours)}`;

  /* Tide readout — the most important number on screen in this battle. */
  if (tide) {
    $('tideLevel').textContent = `${tide.levelM.toFixed(2)} m`;
    $('tidePhase').textContent = tide.phase.replace('_', ' ').toLowerCase();

    const bar = $('tideBar');
    const cfg = scenario.mechanics.tide!;
    const frac = (tide.levelM - cfg.lowWaterM) / (cfg.highWaterM - cfg.lowWaterM);
    bar.style.height = `${Math.max(0, Math.min(1, frac)) * 100}%`;

    // Warn the ENEMY-facing danger explicitly: how long until deep-draft
    // vessels can no longer clear the obstacles. This is the tactical clock.
    const field = scenario.mechanics.obstacleFields?.[0];
    const deepest = Math.max(
      ...state.units
        .filter((u) => u.faction === ENEMY_FACTION && isWaterborne(u.kind) && canAct(u))
        .map((u) => u.draftM ?? 0),
      0,
    );
    if (field && deepest > 0) {
      const needed = field.topHeightM + deepest + 0.2;
      if (tide.levelM > needed) {
        const dt = timeUntilLevel(scenario.mechanics.tide!, state.elapsedHours, needed, 24, true);
        $('trapStatus').textContent =
          dt === null ? 'channel passable' : `channel closes in ${fmtClock(dt)}`;
        $('trapStatus').className = 'value warn';
      } else {
        $('trapStatus').textContent = 'CHANNEL CLOSED to deep hulls';
        $('trapStatus').className = 'value danger';
      }
    }
  }

  /* Force summary */
  const summary = (faction: string): string => {
    const us = state.units.filter((u) => u.faction === faction);
    const alive = us.filter(canAct).length;
    const stuck = us.filter((u) => u.status === 'IMMOBILISED').length;
    const strength = us.filter(canAct).reduce((s, u) => s + u.strength, 0);
    return `${alive}/${us.length} units · ${Math.round(strength)} str${stuck ? ` · ${stuck} held fast` : ''}`;
  };
  $('forceDaiViet').textContent = summary(PLAYER_FACTION);
  $('forceYuan').textContent = summary(ENEMY_FACTION);

  /* Selection */
  const sel = [...selected]
    .map((id) => state.units.find((u) => u.id === id))
    .filter((u): u is Unit => u !== undefined);

  $('selection').innerHTML =
    sel.length === 0
      ? '<span class="dim">Click a unit to select. Shift-click adds. Right-click to order a move.</span>'
      : sel
          .map(
            (u) => `<div class="unit-row">
              <strong>${u.name}</strong>
              <span class="dim">${u.kind.toLowerCase().replace('_', ' ')}${u.draftM ? ` · draft ${u.draftM.toFixed(1)}m` : ''}</span>
              <span>str ${Math.round(u.strength)}/${u.initialStrength} · morale ${(u.morale * 100).toFixed(0)}% · ${u.status.toLowerCase()}</span>
            </div>`,
          )
          .join('');

  /* Event log — newest first, capped for readability */
  const recent = state.events.slice(-40).reverse();
  $('log').innerHTML = recent
    .map((e) => `<div class="log-line"><span class="dim">t${e.tick}</span> ${e.message}</div>`)
    .join('');

  $('playBtn').textContent = running ? '❚❚ Pause' : '▶ Play';
}

/* ------------------------------------------------------------------ */
/* Result screen                                                       */
/* ------------------------------------------------------------------ */

function showResult(): void {
  const analysis = analyseBattle(state, scenario);
  const comparison = compareWithHistory(state, scenario);

  const badge =
    state.outcome.kind === 'DECIDED'
      ? state.outcome.victor === PLAYER_FACTION
        ? '<span class="win">VICTORY</span>'
        : '<span class="lose">DEFEAT</span>'
      : '<span>UNDECIDED</span>';

  const findings = analysis.findings
    .map(
      (f) => `<li class="finding ${f.confidence.toLowerCase()}">
        <span class="tag">${f.confidence}</span> ${f.text}
        ${f.evidence ? `<div class="evidence">${Object.entries(f.evidence).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>` : ''}
      </li>`,
    )
    .join('');

  $('resultBody').innerHTML = `
    <h2>${badge}</h2>
    <p class="outcome">${analysis.outcome}</p>
    <p class="dim">Duration: ${fmtClock(analysis.durationHours)}</p>

    <h3>What happened</h3>
    <ul class="findings">${findings}</ul>

    <h3>Compared with history</h3>
    <p>${comparison.summary}</p>

    <h3>What this simulation assumes</h3>
    <ul class="assumptions">
      ${scenario.gameplayAssumptions.map((a) => `<li>${a}</li>`).join('')}
    </ul>
  `;
  $('resultOverlay').style.display = 'flex';
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

const toWorld = (ev: MouseEvent): { x: number; y: number } => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * viewport.scale,
    y: (ev.clientY - rect.top) * viewport.scale,
  };
};

canvas.addEventListener('mousedown', (ev) => {
  if (ev.button !== 0) return;
  const { x, y } = toWorld(ev);
  const hit = unitAt(state, x, y, viewport.scale * 14);

  if (!hit || hit.faction !== PLAYER_FACTION) {
    if (!ev.shiftKey) selected.clear();
    return;
  }
  if (ev.shiftKey) {
    selected.has(hit.id) ? selected.delete(hit.id) : selected.add(hit.id);
  } else {
    selected = new Set([hit.id]);
  }
});

canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  if (selected.size === 0) return;
  const { x, y } = toWorld(ev);

  for (const id of selected) {
    const unit = state.units.find((u) => u.id === id);
    if (!unit || !canAct(unit)) continue;
    standingOrders.set(id, { kind: 'MOVE', unitId: id, to: { x, y } });
  }
});

$('playBtn').addEventListener('click', () => {
  if (state.outcome.kind !== 'ONGOING') return;
  running = !running;
  lastFrame = performance.now();
});

$('stepBtn').addEventListener('click', () => {
  running = false;
  advance();
});

for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
  btn.addEventListener('click', () => {
    speed = Number(btn.dataset['speed']);
    for (const b of document.querySelectorAll('[data-speed]')) b.classList.remove('active');
    btn.classList.add('active');
  });
}

$('restartBtn').addEventListener('click', () => {
  state = createInitialState(scenario, `seed-${Date.now()}`);
  selected.clear();
  standingOrders.clear();
  running = false;
  $('resultOverlay').style.display = 'none';
});

$('closeResult').addEventListener('click', () => {
  $('resultOverlay').style.display = 'none';
});

/* ------------------------------------------------------------------ */
/* Briefing                                                            */
/* ------------------------------------------------------------------ */

$('briefTitle').textContent = scenario.title;
$('briefLocation').textContent = scenario.location;
$('briefText').textContent = scenario.briefing;
$('tickLen').textContent = `${MINUTES_PER_TICK} min/tick`;

$('briefForces').innerHTML = scenario.historicalForces
  .map(
    (f) => `<li><strong>${f.description}</strong><br>
      <span class="dim">Recorded strength: ${f.historicalSize.quantity.kind === 'UNKNOWN' ? 'unknown' : 'see sources'} — ${f.historicalSize.note ?? ''}</span></li>`,
  )
  .join('');

$('startBtn').addEventListener('click', () => {
  $('briefingOverlay').style.display = 'none';
  running = true;
  lastFrame = performance.now();
});

resize();
requestAnimationFrame(frame);
