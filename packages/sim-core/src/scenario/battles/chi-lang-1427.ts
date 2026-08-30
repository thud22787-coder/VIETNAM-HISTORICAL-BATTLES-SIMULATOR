/**
 * CHI_LANG_1427 — the second battle.
 *
 * This scenario exists to test the claim in Master Prompt §72: that adding a
 * battle should be new data plus configuration, not an engine rewrite. It was
 * deliberately chosen to be as *unlike* Bạch Đằng as possible — a land ambush
 * in a mountain defile rather than a tidal naval trap — so that it exercises
 * code paths the first battle never touched.
 *
 * WHAT IT COST (recorded honestly for the extensibility claim)
 *
 * One general engine capability had to be added: terrain affecting movement and
 * combat, which was documented as GAP-02 and unimplemented. That is a *generic*
 * mechanic declared as scenario data — `mechanics.terrainEffects` — not a
 * Chi Lăng special case, and Bạch Đằng is unaffected because it declares none.
 * Beyond that, this file is data.
 *
 * EPISTEMIC DISCIPLINE IN THIS FILE
 *
 * The evidence position here is *different* from Bạch Đằng and worth stating:
 *
 *  - The valley itself is real and measurable: c. 20 km long, c. 3 km at its
 *    widest, walled by the Bảo Đài and Cai Kinh limestone ranges, with the
 *    Thương River running through (S-006). That is the tactical logic of the
 *    battle and it can be checked against a map.
 *  - That the battle happened, that Liễu Thăng commanded and was killed at Mã
 *    Yên, and that the column was destroyed: ACADEMIC_SECONDARY (S-007).
 *  - The feigned-withdrawal-into-marsh sequence: SUPPORTED_INTERPRETATION,
 *    from Charney via secondary citation (S-008).
 *  - Force sizes: DISPUTED and, for the battle itself, explicitly UNKNOWN in
 *    the sources (S-009). Two published totals for the relief expedition differ
 *    by about 30%. We invent none of them.
 *
 * The map below is a PLAYABLE ABSTRACTION at 1:1 metres of a valley whose real
 * 15th-century vegetation, marsh extent and river course are not recoverable
 * from our sources (RD-05). It is labelled as such to the player.
 */

import type { BattleScenario, TerrainCell, TerrainMap, TerrainEffects } from '../scenario.ts';
import {
  type Unit,
  type Commander,
  type Faction,
  unitId,
  factionId,
  commanderId,
} from '../../domain/types.ts';

export const DAI_VIET_LAMSON = factionId('lam-son');
export const MING = factionId('ming');

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */

const CELL_SIZE_M = 200;
const WIDTH_CELLS = 60; // 12 km of the valley's length
const HEIGHT_CELLS = 20; // 4 km across, containing the ~3 km floor

/**
 * The Chi Lăng defile, schematically.
 *
 * The valley runs roughly northeast (x high, where the Ming enter) to southwest
 * (x low, toward Đông Quan and the relief objective). Limestone ranges wall it
 * north and south; the floor narrows in the middle, and marshy ground lies near
 * the narrows where the Thương River spreads.
 *
 * Scale is taken from S-006: c. 3 km at the widest. The narrowing to roughly a
 * kilometre at the waist is a gameplay construction — the sources say the
 * valley is narrow and oval, not how narrow at each point.
 */
function buildTerrain(): TerrainMap {
  const cells: TerrainCell[] = [];
  const centreY = HEIGHT_CELLS / 2;

  for (let y = 0; y < HEIGHT_CELLS; y++) {
    for (let x = 0; x < WIDTH_CELLS; x++) {
      // Valley floor half-width in cells: widest at the ends, pinched at the
      // waist around x = 30.
      const waist = Math.abs(x - 30) / 30; // 0 at the waist, 1 at the ends
      const floorHalfWidth = 2.5 + waist * 4.5;
      const fromCentre = Math.abs(y - centreY);

      let kind: TerrainCell['kind'];
      let bedElevationM: number;

      if (fromCentre <= floorHalfWidth) {
        // Marshy ground at the waist, where the river spreads and the going is
        // worst. This is the ground the accounts describe cavalry bogging in.
        // Marsh occupies the southern part of the floor at the waist, leaving
        // a firm strip along the northern side. That strip is the whole
        // decision for the attacker: it is narrower, it runs directly under the
        // flanking high ground, and taking it means passing close to whatever
        // is waiting up there. Marsh spanning the entire floor would not be a
        // trap at all, merely a toll every crossing pays.
        const marshy = x >= 26 && x <= 36 && y > centreY - 1 && fromCentre <= floorHalfWidth * 0.9;
        kind = marshy ? 'MARSH' : 'PLAIN';
        bedElevationM = marshy ? 2 : 5;
      } else if (fromCentre <= floorHalfWidth + 1.5) {
        kind = 'FOREST';
        bedElevationM = 20;
      } else if (fromCentre <= floorHalfWidth + 3) {
        kind = 'HILL';
        bedElevationM = 90;
      } else {
        // The limestone ranges. Impassable in practice, and the ground the
        // ambush is launched from.
        kind = 'HILL';
        bedElevationM = 200;
      }

      cells.push({ kind, bedElevationM });
    }
  }

  return { widthCells: WIDTH_CELLS, heightCells: HEIGHT_CELLS, cellSizeM: CELL_SIZE_M, cells };
}

/* ------------------------------------------------------------------ */
/* Terrain effects — the mechanic of this battle                       */
/* ------------------------------------------------------------------ */

/**
 * All GAMEPLAY_ASSUMPTION values. They are chosen to reproduce the dynamic the
 * sources describe (S-008), not measured from anything.
 *
 * The load-bearing entry is cavalry in marsh. Horses in soft ground lose the
 * mobility and shock that are their entire advantage, and that reversal is what
 * the ambush is built on: the Ming column's strongest arm becomes its most
 * vulnerable one the moment it is drawn onto the wrong ground.
 */
const terrainEffects: TerrainEffects = {
  PLAIN: { movement: 1.0, combat: 1.0 },

  MARSH: {
    movement: 0.5,
    combat: 0.8,
    byUnitKind: {
      // The reversal the whole battle turns on.
      CAVALRY: { movement: 0.2, combat: 0.35 },
      // Foot troops who chose this ground are far less hampered by it.
      INFANTRY: { movement: 0.7, combat: 0.9 },
      MILITIA: { movement: 0.7, combat: 0.9 },
    },
  },

  FOREST: {
    movement: 0.6,
    combat: 0.9,
    byUnitKind: {
      CAVALRY: { movement: 0.35, combat: 0.6 },
      // Ambushers in cover fight from advantage.
      ARCHERS: { movement: 0.7, combat: 1.25 },
      ELITE: { movement: 0.8, combat: 1.15 },
    },
  },

  HILL: {
    movement: 0.45,
    combat: 1.1,
    byUnitKind: {
      CAVALRY: { movement: 0.25, combat: 0.7 },
      ARCHERS: { movement: 0.6, combat: 1.3 },
    },
  },
};

/* ------------------------------------------------------------------ */
/* Commanders                                                          */
/* ------------------------------------------------------------------ */

/** Ratings are GAME SYSTEM VARIABLES (§15, §42, §88), never historical judgements. */
const commanders: Commander[] = [
  {
    id: commanderId('tran-luu'),
    faction: DAI_VIET_LAMSON,
    name: 'Trần Lưu',
    ratings: { leadership: 82, tactical: 88, strategic: 78, commandRangeM: 3000 },
    historicalNote: {
      text:
        'Named in Vietnamese accounts as leading the force that gave way before the Ming ' +
        'vanguard and drew it into the defile. Lê Sát, Lưu Nhân Chú, Lê Lãnh, Đinh Liệt and ' +
        'Lê Thụ are also associated with the Chi Lăng action, under Lê Lợi’s direction.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-007' }],
    },
  },
  {
    id: commanderId('lieu-thang'),
    faction: MING,
    name: 'Liễu Thăng (Liu Sheng)',
    ratings: { leadership: 76, tactical: 62, strategic: 70, commandRangeM: 2500 },
    historicalNote: {
      text:
        'Commanded the main Ming relief column entering via Guangxi. Killed at Mã Yên ' +
        'mountain during the action at Chi Lăng.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-007' }],
    },
  },
];

/* ------------------------------------------------------------------ */
/* Factions                                                            */
/* ------------------------------------------------------------------ */

const factions: Faction[] = [
  {
    id: DAI_VIET_LAMSON,
    name: 'Lam Sơn',
    allowedUnitKinds: ['INFANTRY', 'ARCHERS', 'ELITE', 'MILITIA'],
  },
  {
    id: MING,
    name: 'Ming relief column',
    allowedUnitKinds: ['INFANTRY', 'CAVALRY', 'ARCHERS', 'ELITE'],
  },
];

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

/**
 * Counts, strengths and speeds are SIMULATION PARAMETERS (§87). Sources give
 * the battle's own strengths as UNKNOWN and disagree about the expedition total
 * by ~30% (S-009), so nothing here is a historical claim.
 *
 * What is modelled is the *structure* the sources do support: a large column
 * strung out along a defile, with cavalry as its strongest arm, against a
 * smaller force holding the high ground on both sides.
 */
function buildUnits(): Unit[] {
  const units: Unit[] = [];
  const mapH = HEIGHT_CELLS * CELL_SIZE_M;

  /* --- Lam Sơn: the ambush --- */

  // The bait: a force in the open near the waist, positioned to give way.
  units.push({
    id: unitId('ls-bait'),
    faction: DAI_VIET_LAMSON,
    kind: 'INFANTRY',
    name: 'Trần Lưu’s screen',
    strength: 600,
    initialStrength: 600,
    morale: 0.8,
    fatigue: 0.05,
    cohesion: 0.85,
    supply: 1,
    position: { x: 7600, y: mapH / 2 },
    status: 'ACTIVE',
    baseSpeedMPerHour: 4000,
    commanderId: commanderId('tran-luu'),
  });

  // Archers on the flanking high ground, north and south of the narrows.
  for (let i = 0; i < 4; i++) {
    const north = i < 2;
    units.push({
      id: unitId(`ls-archers-${i + 1}`),
      faction: DAI_VIET_LAMSON,
      kind: 'ARCHERS',
      name: `Hill archers ${i + 1}`,
      strength: 500,
      initialStrength: 500,
      morale: 0.85,
      fatigue: 0,
      cohesion: 0.9,
      supply: 1,
      // Weighted onto the NORTHERN high ground, because that is the side the
      // firm lane runs under. The southern pair watches the marsh side, where
      // the ground does the work for them. An ambush that spreads itself evenly
      // across a valley covers everything weakly and the strong route not at
      // all.
      position: north
        ? { x: 5400 + (i % 2) * 1400, y: 1200 }
        : { x: 5600 + (i % 2) * 1600, y: mapH - 1000 },
      status: 'ACTIVE',
      baseSpeedMPerHour: 3000,
      commanderId: commanderId('tran-luu'),
    });
  }

  // Elite troops held to fall on the column once it is committed to the marsh.
  for (let i = 0; i < 2; i++) {
    units.push({
      id: unitId(`ls-elite-${i + 1}`),
      faction: DAI_VIET_LAMSON,
      kind: 'ELITE',
      name: `Lam Sơn veterans ${i + 1}`,
      strength: 900,
      initialStrength: 900,
      morale: 0.9,
      fatigue: 0,
      cohesion: 0.92,
      supply: 1,
      // Stationed IN the narrows, not behind them. An ambush that lets the
      // column past the chokepoint has not sprung a trap, it has merely
      // skirmished -- which is exactly what happened when these were placed
      // further back and the Ming infantry walked through the gap.
      position: { x: 6000, y: i === 0 ? 1700 : 2300 },
      status: 'ACTIVE',
      baseSpeedMPerHour: 3600,
      commanderId: commanderId('tran-luu'),
    });
  }

  /* --- Ming: the column --- */

  // Vanguard cavalry: fast, strong in the open, and the arm that will be ruined
  // if it can be drawn onto soft ground.
  for (let i = 0; i < 3; i++) {
    units.push({
      id: unitId(`ming-cav-${i + 1}`),
      faction: MING,
      kind: 'CAVALRY',
      name: `Vanguard cavalry ${i + 1}`,
      strength: 700,
      initialStrength: 700,
      morale: 0.8,
      fatigue: 0.1,
      cohesion: 0.85,
      supply: 0.8,
      position: { x: 11200, y: mapH / 2 + (i - 1) * 400 },
      status: 'ACTIVE',
      baseSpeedMPerHour: 7000,
      commanderId: commanderId('lieu-thang'),
    });
  }

  // Infantry, strung out behind — slower, and unable to help quickly.
  for (let i = 0; i < 4; i++) {
    units.push({
      id: unitId(`ming-inf-${i + 1}`),
      faction: MING,
      kind: 'INFANTRY',
      name: `Column infantry ${i + 1}`,
      strength: 1200,
      initialStrength: 1200,
      morale: 0.75,
      fatigue: 0.2,
      cohesion: 0.8,
      supply: 0.7,
      // Strung out behind the vanguard, but inside the map: the validator
      // caught 11800 + 3*100 running past the 12km eastern edge.
      position: { x: 11400 + i * 100, y: mapH / 2 + (i % 2 === 0 ? 300 : -300) },
      status: 'ACTIVE',
      baseSpeedMPerHour: 3200,
      commanderId: commanderId('lieu-thang'),
    });
  }

  return units;
}

/* ------------------------------------------------------------------ */
/* Scenario                                                            */
/* ------------------------------------------------------------------ */

export const CHI_LANG_1427: BattleScenario = {
  id: 'CHI_LANG_1427',
  version: 'v1',

  title: 'Chi Lăng, 1427',
  period: 'Lam Sơn uprising / Ming occupation (15th century)',
  dateDescription: '1427',
  location: 'Chi Lăng pass, Lạng Sơn province, Vietnam',

  briefing:
    'A Ming relief column is marching south through the Chi Lăng defile to break the siege of ' +
    'Đông Quan. The valley is twenty kilometres of narrow floor between limestone ranges, and ' +
    'the column must pass through it strung out in march order. Its vanguard is cavalry — fast ' +
    'and dangerous in the open, and helpless in the marsh near the narrows. Give ground, draw ' +
    'them on, and take them where their horses cannot serve them.',

  factions,
  commanders,

  historicalForces: [
    {
      faction: DAI_VIET_LAMSON,
      description: 'Lam Sơn forces holding the pass',
      historicalSize: {
        quantity: { kind: 'UNKNOWN' },
        status: 'UNCERTAIN',
        confidence: 'LOW',
        sources: [{ id: 'S-009' }],
        note:
          'The sources give the Vietnamese strength at Chi Lăng as unknown. We do not ' +
          'substitute an invented figure.',
      },
    },
    {
      faction: MING,
      description: 'Ming relief column under Liễu Thăng',
      historicalSize: {
        quantity: { kind: 'UNKNOWN' },
        status: 'UNCERTAIN',
        confidence: 'LOW',
        sources: [{ id: 'S-009' }],
        note:
          'Published totals for the whole relief expedition differ by about 30% (c. 115,200 ' +
          'vs 150,000), and neither describes the force actually engaged in the defile. The ' +
          'battle strength itself is recorded as unknown.',
      },
    },
  ],

  initialUnits: buildUnits(),
  terrain: buildTerrain(),

  mechanics: {
    // No tide and no obstacle field: this battle turns on ground, not water.
    // That is the point of choosing it — it exercises a different mechanic.
    terrainEffects,
    fogOfWar: true,
  },

  objectives: [
    {
      id: 'ls-destroy-column',
      faction: DAI_VIET_LAMSON,
      description: 'Destroy the relief column in the defile',
      condition: { kind: 'ATTRITION', targetFaction: MING, strengthFractionBelow: 0.45 },
    },
    {
      id: 'ming-force-the-pass',
      faction: MING,
      description: 'Force the pass and continue toward Đông Quan',
      // The column wins by getting through, not by winning a fight in the
      // defile — the same lesson learned from the Bạch Đằng objective, which
      // once described escape while rewarding attrition.
      // Forcing the pass means arriving as a relief force, not trickling out a
      // remnant. The column starts with 3 cavalry and 4 infantry; getting more
      // than half of it through is the bar for having actually broken the
      // ambush rather than survived it.
      condition: { kind: 'ESCAPE', beyondX: 1200, direction: 'BELOW', fractionEscaped: 0.7 },
    },
  ],

  // If the column is still in the defile at nightfall it has failed to force
  // the pass, and a strung-out force halted in a hostile valley is in a far
  // worse position than the one it started in.
  timeLimit: {
    hours: 8,
    favours: DAI_VIET_LAMSON,
    reason: 'The column was still in the defile when the day ended',
  },

  historicalPhases: [
    {
      id: 'phase-approach',
      title: 'The column enters the defile',
      summary:
        'The Ming relief force under Liễu Thăng marched south through the Lạng Sơn approaches ' +
        'toward the besieged Đông Quan, entering the Chi Lăng valley in march order.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-007' }],
    },
    {
      id: 'phase-bait',
      title: 'The feigned withdrawal',
      summary:
        'Vietnamese troops engaged and then gave way, drawing the Ming vanguard forward into ' +
        'the pass ahead of the rest of the column.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-008' }],
    },
    {
      id: 'phase-marsh',
      title: 'Cavalry bogged and ambushed',
      summary:
        'The charging cavalry became bogged in marshy ground and was attacked from the ' +
        'flanking high ground, losing the mobility that was its advantage.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-008' }],
    },
    {
      id: 'phase-collapse',
      title: 'The column destroyed',
      summary:
        'Liễu Thăng was killed at Mã Yên mountain and his column effectively annihilated. On ' +
        'hearing of it, the second Ming column under Mộc Thạnh withdrew.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-007' }],
    },
  ],

  historicalOutcome: {
    victor: DAI_VIET_LAMSON,
    summary:
      'The Ming relief column was destroyed and Liễu Thăng killed. With no relief coming, ' +
      'Vương Thông sued for peace, ending ten years of war and the Ming occupation.',
    status: 'SUPPORTED_INTERPRETATION',
    sources: [{ id: 'S-007' }],
    casualties: [
      {
        faction: MING,
        figure: {
          quantity: {
            kind: 'DISPUTED',
            candidates: [
              { value: 70000, sources: [{ id: 'S-009' }], note: 'lower bound, Sun (2006) via Wikipedia' },
              { value: 90000, sources: [{ id: 'S-009' }], note: 'upper bound, same citation' },
            ],
          },
          status: 'UNCERTAIN',
          confidence: 'LOW',
          sources: [{ id: 'S-009' }],
          note:
            'A range this wide, against an expedition whose own total is disputed by 30%, is ' +
            'not a usable figure. Recorded as disputed rather than averaged into a false ' +
            'precision.',
        },
      },
    ],
  },

  sources: [{ id: 'S-006' }, { id: 'S-007' }, { id: 'S-008' }, { id: 'S-009' }],

  gameplayAssumptions: [
    'The map is a schematic 12km section of the Chi Lăng valley. Its overall shape and scale follow the modern landform, but 15th-century marsh extent, river course and vegetation are not recoverable from our sources (RD-05).',
    'All unit counts, strengths and speeds are simulation parameters. The sources record the strengths at this battle as unknown, and published totals for the wider expedition differ by about 30%.',
    'Terrain effect multipliers — including cavalry being crippled in marsh — are gameplay constructions chosen to reproduce the dynamic the accounts describe, not measured values.',
    'The position of the marshy ground within the valley is ours. The sources say cavalry bogged near Đảo Mã Pha mountain, not where that lies relative to the rest of the pass.',
    'Commander ratings are game system variables, not historical assessments of these people.',
    'The battle is compressed into a single continuous engagement over one day.',
  ],

  allowedUnitKinds: ['INFANTRY', 'CAVALRY', 'ARCHERS', 'ELITE', 'MILITIA'],
};
