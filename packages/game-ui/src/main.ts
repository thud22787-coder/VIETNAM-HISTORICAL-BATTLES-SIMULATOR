/**
 * Game shell.
 *
 * The player commands Đại Việt; the Yuan fleet is run by the AI commander.
 *
 * This layer only renders state and sends commands. All rules live in
 * @vhbs/sim-core — including the AI, which is a simulation concern rather than
 * a UI one and must remain testable without a browser.
 */

import {
  BACH_DANG_1288,
  CHI_LANG_1427,
  createInitialState,
  step,
  evaluateTide,
  analyseBattle,
  compareWithHistory,
  assertScenarioValid,
  canAct,
  isWaterborne,
  timeUntilLevel,
  observe,
  emptyMemory,
  estimateOf,
  createRng,
  decide,
  initialAiState,
  explainDecisions,
  type AiState,
  MINUTES_PER_TICK,
  type BattleState,
  type Command,
  type UnitId,
  type Unit,
  type ObservedState,
  type SightingMemory,
} from '@vhbs/sim-core';
import { render, unitAt, type Viewport } from './render.ts';

/**
 * Available battles.
 *
 * Adding one is a matter of listing it here: which side the player commands is
 * scenario data, not a UI assumption. That the second battle needed no other UI
 * change is part of the §72 extensibility evidence.
 */
const BATTLES = [
  { scenario: BACH_DANG_1288, player: 'dai-viet', enemy: 'yuan' },
  { scenario: CHI_LANG_1427, player: 'lam-son', enemy: 'ming' },
] as const;

/** Chosen from the URL (?battle=CHI_LANG_1427) or the briefing screen. */
function chooseBattle(): (typeof BATTLES)[number] {
  const wanted = new URLSearchParams(location.search).get('battle');
  return BATTLES.find((b) => b.scenario.id === wanted) ?? BATTLES[0];
}

let battle = chooseBattle();
let scenario = battle.scenario;
assertScenarioValid(scenario);

let PLAYER_FACTION = battle.player as string;
let ENEMY_FACTION = battle.enemy as string;

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

/**
 * What each side remembers seeing.
 *
 * Held here rather than in BattleState because memory belongs to a commander,
 * not to the battlefield — and storing both sides' beliefs in shared state
 * would put each side's picture where the other could read it.
 */
let playerMemory: SightingMemory = emptyMemory();
let enemyMemory: SightingMemory = emptyMemory();

/** The opposing commander's accumulated reasoning. */
let enemyAI: AiState = initialAiState();

/** The player's current view. Everything the UI renders comes from this. */
let playerView: ObservedState = observePlayer();

function observePlayer(): ObservedState {
  const result = observe(
    state,
    PLAYER_FACTION as never,
    scenario,
    createRng(`obs-${state.seed}-${state.tick}`),
    playerMemory,
  );
  playerMemory = result.memory;
  return result.observed;
}

let mapWidthM = scenario.terrain.widthCells * scenario.terrain.cellSizeM;
let mapHeightM = scenario.terrain.heightCells * scenario.terrain.cellSizeM;

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
/* Opponent — the AI commander                                         */
/* ------------------------------------------------------------------ */

/**
 * The Yuan fleet, run by the AI commander.
 *
 * It is handed its own `ObservedState` and nothing else, so it does not know
 * where the stake field is. It sails into the obstructions for the same reason
 * the historical fleet did — the route to the sea runs through them — and only
 * learns the water is dangerous by watching its own ships stop dead in it.
 */
function enemyCommands(): Command[] {
  const result = observe(
    state,
    ENEMY_FACTION as never,
    scenario,
    createRng(`enemy-obs-${state.seed}-${state.tick}`),
    enemyMemory,
  );
  enemyMemory = result.memory;

  const decision = decide(
    result.observed,
    scenario,
    enemyAI,
    createRng(`enemy-ai-${state.seed}-${state.tick}`),
  );
  enemyAI = decision.state;
  return [...decision.commands];
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

  const commands: Command[] = [...enemyCommands()];
  for (const [unitId, order] of standingOrders) {
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit || !canAct(unit)) {
      standingOrders.delete(unitId);
      continue;
    }
    commands.push(order);
  }

  state = step(state, commands, scenario);
  playerView = observePlayer();
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
  render(ctx, { observed: playerView, scenario, tide, selected, viewport });
  updatePanels(tide);
}

function fmtClock(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function updatePanels(tide: ReturnType<typeof currentTide>): void {
  $('clock').textContent = `T+${fmtClock(state.elapsedHours)}`;

  /* Tide readout — present only for scenarios that declare a tide. */
  if (!tide) {
    $('tideLevel').textContent = '—';
    $('tidePhase').textContent = 'no tide';
    $('trapStatus').textContent = '—';
    $('trapStatus').className = 'value';
    $('tideBar').style.height = '0%';
  }
  if (tide) {
    $('tideLevel').textContent = `${tide.levelM.toFixed(2)} m`;
    $('tidePhase').textContent = tide.phase.replace('_', ' ').toLowerCase();

    const bar = $('tideBar');
    const cfg = scenario.mechanics.tide!;
    const frac = (tide.levelM - cfg.lowWaterM) / (cfg.highWaterM - cfg.lowWaterM);
    bar.style.height = `${Math.max(0, Math.min(1, frac)) * 100}%`;

    // Warn the ENEMY-facing danger explicitly: how long until deep-draft
    // vessels can no longer clear the obstacles. This is the tactical clock.
    // Uses the obstacle the player KNOWS about, and the deepest draft among
    // enemy vessels currently in sight. A commander who has lost contact does
    // not get a live readout of the enemy's predicament.
    const field = playerView.knownObstacles[0];
    const deepest = Math.max(
      ...playerView.enemies
        .filter((e) => e.inContact && e.kind !== 'UNIDENTIFIED' && isWaterborne(e.kind))
        .map((e) => (e.kind === 'HEAVY_SHIP' ? 1.5 : e.kind === 'WAR_JUNK' ? 0.9 : 0.4)),
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

  /* Force summary — own exact, enemy only as observed */
  const own = playerView.own;
  const ownAlive = own.filter(canAct);
  const ownStuck = own.filter((u) => u.status === 'IMMOBILISED').length;
  $('forceOwnLabel').textContent =
    scenario.factions.find((f) => f.id === PLAYER_FACTION)?.name ?? PLAYER_FACTION;
  $('forceEnemyLabel').textContent =
    scenario.factions.find((f) => f.id === ENEMY_FACTION)?.name ?? ENEMY_FACTION;

  $('forceDaiViet').textContent =
    `${ownAlive.length}/${own.length} units · ${Math.round(
      ownAlive.reduce((s, u) => s + u.strength, 0),
    )} str${ownStuck ? ` · ${ownStuck} held fast` : ''}`;

  const seen = playerView.enemies.filter((e) => e.inContact);
  const stale = playerView.enemies.length - seen.length;
  const inTrouble = seen.filter((e) => e.apparentStatus === 'IN_TROUBLE').length;
  const estTotal = seen.reduce((sum, e) => sum + (estimateOf(e.strength) ?? 0), 0);

  $('forceYuan').textContent =
    playerView.enemies.length === 0
      ? 'no contact'
      : `${seen.length} in sight${stale ? ` · ${stale} last seen` : ''} · ~${Math.round(estTotal)} str${
          inTrouble ? ` · ${inTrouble} in trouble` : ''
        }`;

  /* Selection */
  const sel = [...selected]
    .map((id) => playerView.own.find((u) => u.id === id))
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
  const recent = playerView.events.slice(-40).reverse();
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

    <h3>What the opposing commander was thinking</h3>
    <p class="dim" style="font-size:12px">
      Taken from the decisions actually recorded during the battle, with the
      observations each was based on. The Yuan commander could not see the
      obstructions — it inferred them from its own ships stopping.
    </p>
    <ul class="ai-log">
      ${explainDecisions(enemyAI, 14).map((l) => `<li>${l}</li>`).join('')}
    </ul>

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
  const hit = unitAt(playerView.own, x, y, viewport.scale * 14);

  if (!hit) {
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
    const unit = playerView.own.find((u) => u.id === id);
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
  playerMemory = emptyMemory();
  enemyMemory = emptyMemory();
  enemyAI = initialAiState();
  playerView = observePlayer();
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

$('battleList').innerHTML = BATTLES.map(
  (b) =>
    `<li><a href="?battle=${b.scenario.id}"${
      b.scenario.id === scenario.id ? ' class="current"' : ''
    }>${b.scenario.title}</a> <span class="dim">— ${b.scenario.period}</span></li>`,
).join('');

$('startBtn').addEventListener('click', () => {
  $('briefingOverlay').style.display = 'none';
  running = true;
  lastFrame = performance.now();
});

resize();
requestAnimationFrame(frame);
