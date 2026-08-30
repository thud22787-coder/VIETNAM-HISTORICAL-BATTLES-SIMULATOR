/**
 * TOT_DONG_1426 — the third battle, and the first half of an operational campaign.
 *
 * Tốt Động – Chúc Động, 7 November 1426. A Lam Sơn force ambushes a much larger
 * Ming army under Wang Tong in the mud and rice paddies of the Red River delta,
 * routing it and driving Wang Tong back to Đông Quan — where Lê Lợi besieges
 * him, which is precisely why the Ming send Liễu Thăng's relief column into
 * Chi Lăng the following year.
 *
 * WHY THIS BATTLE
 *
 * The campaign system needed content that is genuinely *operational*. Bạch Đằng
 * and Chi Lăng are 139 years apart, so RESISTANCE carries nothing forward and
 * says so. This battle and Chi Lăng are eleven months apart in one war, under
 * one leader, with a causal chain between them — losses here plausibly matter
 * there, which is what makes carry-forward meaningful rather than decorative.
 *
 * WHAT IT COST TO ADD (ADR-008's claim, third data point)
 *
 * Nothing. No engine change. The mechanic — a heavy force bogged in soft ground
 * while lighter troops who chose it move freely — is the same shape as Chi
 * Lăng's marsh, expressed with different numbers in `mechanics.terrainEffects`.
 * That is the extensibility claim behaving as advertised.
 *
 * EPISTEMIC POSITION — the best of the three, and worth explaining
 *
 * This battle has something the other two lack: **both sides' figures survive
 * and both are attributed** (S-012). The Ming Shi-lu gives Lam Sơn 6,000 and
 * the Ming 54,000; Vietnamese sources give the Ming 100,000. Casualties differ
 * by more still.
 *
 * That disagreement is not an obstacle, it is the most useful thing here. It is
 * carried through as `DISPUTED` with both candidates and their attributions
 * intact, so a player can see a real historiographical conflict rather than a
 * confident number someone chose. Note which direction it runs: the victor's
 * tradition reports a larger enemy and heavier enemy losses.
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

export const LAM_SON = factionId('lam-son');
export const MING_FIELD = factionId('ming');

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */

const CELL_SIZE_M = 100;
const WIDTH_CELLS = 50; // 5 km
const HEIGHT_CELLS = 34; // 3.4 km

/**
 * Delta farmland: rice paddy and mud, cut by the Yên Duyệt river, with firmer
 * ground along a road and around the two villages.
 *
 * Unlike Chi Lăng, there is no defile. The trap here is not a chokepoint but
 * *ground that looks passable and is not* — which is why the feigned retreat
 * matters: the Ming had to be persuaded to leave the road.
 *
 * The layout is a gameplay construction. S-011 attests mud, rice paddies, a
 * river crossing and the two villages; it does not give us a survey (RD-09).
 */
function buildTerrain(): TerrainMap {
  const cells: TerrainCell[] = [];

  for (let y = 0; y < HEIGHT_CELLS; y++) {
    for (let x = 0; x < WIDTH_CELLS; x++) {
      let kind: TerrainCell['kind'];
      let bedElevationM: number;

      // The river runs roughly north-south across the middle of the field.
      const riverX = 20 + Math.round(Math.sin(y / 5) * 1.5);
      const onRiver = Math.abs(x - riverX) <= 1;

      // A raised road runs east-west along y ≈ 16: the firm route, and the one
      // a sensible commander would stay on.
      const onRoad = Math.abs(y - 16) <= 1;

      // Two villages on slightly higher ground, west of the river.
      const inVillage =
        (Math.hypot(x - 11, y - 10) < 3) || (Math.hypot(x - 9, y - 23) < 3);

      if (onRiver) {
        kind = 'SHALLOW_WATER';
        bedElevationM = -1.2;
      } else if (inVillage) {
        kind = 'PLAIN';
        bedElevationM = 3;
      } else if (onRoad) {
        kind = 'PLAIN';
        bedElevationM = 2.5;
      } else {
        // Everything else is worked paddy: waterlogged, soft, and treacherous
        // for anything heavy that leaves the road.
        kind = 'MARSH';
        bedElevationM = 1;
      }

      cells.push({ kind, bedElevationM });
    }
  }

  return { widthCells: WIDTH_CELLS, heightCells: HEIGHT_CELLS, cellSizeM: CELL_SIZE_M, cells };
}

/* ------------------------------------------------------------------ */
/* Terrain effects                                                     */
/* ------------------------------------------------------------------ */

/**
 * All GAMEPLAY_ASSUMPTION values, tuned to reproduce what S-011 describes.
 *
 * The difference from Chi Lăng is instructive. There, marsh was a *place* the
 * cavalry could be lured into. Here it is nearly the whole field, and the
 * firm road is the exception — so the Ming problem is not "avoid one patch"
 * but "do not be talked off the road". Infantry suffer less than at Chi Lăng
 * because paddy is worked, walkable ground rather than true swamp; what it
 * ruins is formation and mobility, not the ability to stand.
 */
const terrainEffects: TerrainEffects = {
  PLAIN: { movement: 1.0, combat: 1.0 },

  MARSH: {
    movement: 0.55,
    combat: 0.75,
    byUnitKind: {
      // Local troops who chose this ground and know where the bunds are.
      MILITIA: { movement: 0.85, combat: 1.0 },
      INFANTRY: { movement: 0.75, combat: 0.9 },
      ELITE: { movement: 0.8, combat: 0.95 },
      // A heavy column strung out in mud is the whole point of the battle.
      CAVALRY: { movement: 0.25, combat: 0.4 },
    },
  },

  SHALLOW_WATER: {
    movement: 0.4,
    combat: 0.6,
    byUnitKind: {
      // Being caught mid-crossing is how the rout became a slaughter.
      CAVALRY: { movement: 0.3, combat: 0.35 },
    },
  },
};

/* ------------------------------------------------------------------ */
/* Commanders                                                          */
/* ------------------------------------------------------------------ */

/** Ratings are GAME SYSTEM VARIABLES (§15, §42, §88), never historical judgements. */
const commanders: Commander[] = [
  {
    id: commanderId('dinh-le'),
    faction: LAM_SON,
    name: 'Đinh Lễ',
    ratings: { leadership: 84, tactical: 88, strategic: 76, commandRangeM: 2400 },
    historicalNote: {
      text:
        'One of the Lam Sơn commanders named in accounts of Tốt Động – Chúc Động, alongside ' +
        'Lý Triện, Đỗ Bí, Nguyễn Xí and Trương Chiến, under Lê Lợi’s overall direction.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-010' }],
    },
  },
  {
    id: commanderId('wang-tong'),
    faction: MING_FIELD,
    name: 'Vương Thông (Wang Tong)',
    ratings: { leadership: 74, tactical: 66, strategic: 68, commandRangeM: 2600 },
    historicalNote: {
      text:
        'Ming commander in Jiaozhi. Defeated here, he withdrew to Đông Quan and was besieged ' +
        'there — which is why a relief column was sent the following year, into Chi Lăng.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-010' }],
    },
  },
];

/* ------------------------------------------------------------------ */
/* Factions                                                            */
/* ------------------------------------------------------------------ */

const factions: Faction[] = [
  {
    id: LAM_SON,
    name: 'Lam Sơn',
    allowedUnitKinds: ['INFANTRY', 'ARCHERS', 'ELITE', 'MILITIA'],
  },
  {
    id: MING_FIELD,
    name: 'Ming field army',
    allowedUnitKinds: ['INFANTRY', 'CAVALRY', 'ARCHERS', 'ELITE'],
  },
];

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

/**
 * All SIMULATION PARAMETERS (§87). The sources disagree with each other by
 * roughly a factor of two on Ming strength (S-012), so no figure here is a
 * historical claim.
 *
 * What is modelled is the *structure* both traditions agree on: a much smaller
 * Lam Sơn force, holding ground it chose, against a large Ming army that has
 * to leave the road to come at it.
 */
function buildUnits(): Unit[] {
  const units: Unit[] = [];

  /* --- Lam Sơn: the ambush, hidden off the road --- */

  // The bait: visible, on the road, positioned to give way eastward.
  units.push({
    id: unitId('ls-bait'),
    faction: LAM_SON,
    kind: 'INFANTRY',
    name: 'Forward detachment',
    strength: 500,
    initialStrength: 500,
    morale: 0.82,
    fatigue: 0.05,
    cohesion: 0.86,
    supply: 1,
    position: { x: 2600, y: 1600 },
    status: 'ACTIVE',
    baseSpeedMPerHour: 4200,
    commanderId: commanderId('dinh-le'),
  });

  // Concealed in the villages and paddy, north and south of the road. These are
  // the troops that "lay silent and did not move" until the Ming were committed.
  for (let i = 0; i < 2; i++) {
    units.push({
      id: unitId(`ls-village-${i + 1}`),
      faction: LAM_SON,
      kind: 'ELITE',
      name: `Village ambush ${i + 1}`,
      strength: 900,
      initialStrength: 900,
      morale: 0.88,
      fatigue: 0,
      cohesion: 0.9,
      supply: 1,
      position: { x: i === 0 ? 1100 : 900, y: i === 0 ? 1000 : 2300 },
      status: 'ACTIVE',
      baseSpeedMPerHour: 3600,
      commanderId: commanderId('dinh-le'),
    });
  }

  // Local levies in the paddy itself — slow anywhere else, at home here.
  for (let i = 0; i < 3; i++) {
    units.push({
      id: unitId(`ls-paddy-${i + 1}`),
      faction: LAM_SON,
      kind: 'MILITIA',
      name: `Paddy levy ${i + 1}`,
      strength: 600,
      initialStrength: 600,
      morale: 0.75,
      fatigue: 0,
      cohesion: 0.78,
      supply: 1,
      position: { x: 1500 + i * 200, y: i % 2 === 0 ? 700 : 2600 },
      status: 'ACTIVE',
      baseSpeedMPerHour: 3000,
      commanderId: commanderId('dinh-le'),
    });
  }

  // Archers covering the river crossing.
  units.push({
    id: unitId('ls-archers'),
    faction: LAM_SON,
    kind: 'ARCHERS',
    name: 'River archers',
    strength: 500,
    initialStrength: 500,
    morale: 0.84,
    fatigue: 0,
    cohesion: 0.88,
    supply: 1,
    position: { x: 1800, y: 1600 },
    status: 'ACTIVE',
    baseSpeedMPerHour: 3200,
    commanderId: commanderId('dinh-le'),
  });

  /* --- Ming: the column, advancing west along the road --- */

  for (let i = 0; i < 2; i++) {
    units.push({
      id: unitId(`ming-cav-${i + 1}`),
      faction: MING_FIELD,
      kind: 'CAVALRY',
      name: `Vanguard horse ${i + 1}`,
      strength: 600,
      initialStrength: 600,
      morale: 0.78,
      fatigue: 0.1,
      cohesion: 0.84,
      supply: 0.85,
      position: { x: 4600, y: 1500 + i * 200 },
      status: 'ACTIVE',
      baseSpeedMPerHour: 6500,
      commanderId: commanderId('wang-tong'),
    });
  }

  for (let i = 0; i < 4; i++) {
    units.push({
      id: unitId(`ming-inf-${i + 1}`),
      faction: MING_FIELD,
      kind: 'INFANTRY',
      name: `Column infantry ${i + 1}`,
      strength: 1100,
      initialStrength: 1100,
      morale: 0.74,
      fatigue: 0.15,
      cohesion: 0.8,
      supply: 0.75,
      position: { x: 4800 + (i % 2) * 150, y: 1500 + (i < 2 ? -150 : 150) },
      status: 'ACTIVE',
      baseSpeedMPerHour: 3300,
      commanderId: commanderId('wang-tong'),
    });
  }

  return units;
}

/* ------------------------------------------------------------------ */
/* Scenario                                                            */
/* ------------------------------------------------------------------ */

export const TOT_DONG_1426: BattleScenario = {
  id: 'TOT_DONG_1426',
  version: 'v1',

  title: 'Tốt Động – Chúc Động, 1426',
  period: 'Lam Sơn uprising / Ming occupation (15th century)',
  dateDescription: '7 November 1426',
  location: 'Between Tốt Động and Chúc Động, Chương Mỹ, Red River delta',

  briefing:
    'A Ming army under Vương Thông is advancing west along the road through the delta. The ' +
    'ground either side of it is worked rice paddy — soft, waterlogged, and ruinous to anything ' +
    'heavy that leaves the firm route. Your own troops are already in it and know where the ' +
    'bunds run. Give ground on the road, let them follow, and take them where their weight ' +
    'counts against them.',

  factions,
  commanders,

  historicalForces: [
    {
      faction: LAM_SON,
      description: 'Lam Sơn forces holding the delta ground',
      historicalSize: {
        // ESTIMATED, not EXACT. The scenario validator flagged the original
        // EXACT as contradicting its own UNCERTAIN status, and it was right:
        // a figure reported once by the losing side's record is an estimate,
        // whatever precision it is written with. The +/- is deliberately wide.
        quantity: { kind: 'ESTIMATED', value: 6000, plusMinus: 3000 },
        status: 'UNCERTAIN',
        confidence: 'LOW',
        sources: [{ id: 'S-012' }],
        note:
          'The Ming Shi-lu gives 6,000. A single figure from the losing side’s own record, ' +
          'reported here because it is attributed — not because it is established.',
      },
    },
    {
      faction: MING_FIELD,
      description: 'Ming field army under Vương Thông',
      historicalSize: {
        quantity: {
          kind: 'DISPUTED',
          candidates: [
            {
              value: 54000,
              sources: [{ id: 'S-012' }],
              note: 'Chinese sources (Ming Shi-lu, via Geoff Wade)',
            },
            {
              value: 100000,
              sources: [{ id: 'S-012' }],
              note: 'Vietnamese sources',
            },
          ],
        },
        status: 'UNCERTAIN',
        confidence: 'LOW',
        sources: [{ id: 'S-012' }],
        note:
          'The two traditions differ by roughly a factor of two. Both are carried here rather ' +
          'than averaged: the disagreement is the honest state of the evidence, and it runs in ' +
          'the direction such disagreements usually do.',
      },
    },
  ],

  initialUnits: buildUnits(),
  terrain: buildTerrain(),

  mechanics: {
    terrainEffects,
    fogOfWar: true,
  },

  objectives: [
    {
      id: 'ls-rout-the-column',
      faction: LAM_SON,
      description: 'Break the Ming field army in the paddy',
      condition: { kind: 'ATTRITION', targetFaction: MING_FIELD, strengthFractionBelow: 0.5 },
    },
    {
      id: 'ming-reach-the-villages',
      faction: MING_FIELD,
      description: 'Push through to the villages and clear the road west',
      condition: { kind: 'ESCAPE', beyondX: 1400, direction: 'BELOW', fractionEscaped: 0.5 },
    },
  ],

  // A field army still intact at nightfall has not been broken, and the Lam Sơn
  // position depends on breaking it — a drawn day favours the side that can
  // absorb one.
  timeLimit: {
    hours: 7,
    favours: MING_FIELD,
    reason: 'The Ming army was still in the field when the day ended',
  },

  historicalPhases: [
    {
      id: 'phase-advance',
      title: 'The Ming advance',
      summary:
        'Wang Tong moved against the Lam Sơn forces in the delta, his army advancing along the ' +
        'firm ground between flooded paddy.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-010' }],
    },
    {
      id: 'phase-feint',
      title: 'The feigned retreat',
      summary:
        'Lam Sơn troops gave way past the Tam La bridge, across mud and rice paddies, where the ' +
        'pursuing Ming force bogged down and was ambushed.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-011' }],
    },
    {
      id: 'phase-silence',
      title: 'Lying silent',
      summary:
        'Learning that the Ming intended to place troops behind them during a river crossing, ' +
        'the Lam Sơn force lay silent and still to conceal its position.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-011' }],
    },
    {
      id: 'phase-rout',
      title: 'The rout at the river',
      summary:
        'The ambush fell on the Ming near the Yên Duyệt river and drove them into the villages ' +
        'of Tốt Động and Chúc Động. Many drowned attempting to recross.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-011' }],
    },
  ],

  historicalOutcome: {
    victor: LAM_SON,
    summary:
      'The Ming field army was routed. Vương Thông withdrew to Đông Quan, where Lê Lợi besieged ' +
      'him — which is why a Ming relief column was sent the following year, into Chi Lăng.',
    status: 'SUPPORTED_INTERPRETATION',
    sources: [{ id: 'S-010' }],
    casualties: [
      {
        faction: MING_FIELD,
        figure: {
          quantity: {
            kind: 'DISPUTED',
            candidates: [
              {
                value: 25000,
                sources: [{ id: 'S-012' }],
                note: 'Chinese sources: 20,000–30,000 killed (midpoint shown)',
              },
              {
                value: 50000,
                sources: [{ id: 'S-012' }],
                note: 'Vietnamese sources: 50,000 killed, plus 10,000 captured',
              },
            ],
          },
          status: 'UNCERTAIN',
          confidence: 'LOW',
          sources: [{ id: 'S-012' }],
          note:
            'The two traditions differ by roughly a factor of two here as well. Lam Sơn losses ' +
            'are not recorded at all in either.',
        },
      },
    ],
  },

  sources: [{ id: 'S-010' }, { id: 'S-011' }, { id: 'S-012' }],

  gameplayAssumptions: [
    'The map is a schematic 5km section of delta farmland. The sources attest mud, rice paddy, a river crossing and the two villages, but give no survey (RD-09).',
    'All unit counts, strengths and speeds are simulation parameters. The sources disagree by roughly a factor of two on Ming strength and on casualties; nothing here is a historical figure.',
    'Terrain effect multipliers are gameplay constructions chosen to reproduce the dynamic the accounts describe, not measured values.',
    'The war elephants attested in the accounts are not modelled; neither is the multi-day structure of the fighting, which is compressed into one engagement.',
    'Commander ratings are game system variables, not historical assessments of these people.',
  ],

  allowedUnitKinds: ['INFANTRY', 'CAVALRY', 'ARCHERS', 'ELITE', 'MILITIA'],
};
