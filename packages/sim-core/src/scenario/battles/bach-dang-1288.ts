/**
 * BACH_DANG_1288 — the first vertical slice.
 *
 * See docs/DECISIONS/ADR-007-first-vertical-slice.md for why this battle and
 * not the more famous 938 engagement: the stake fields that decide this battle
 * are physically excavated and radiocarbon dated, whereas the 938 tactical
 * detail and troop figures are unsourced.
 *
 * EPISTEMIC DISCIPLINE IN THIS FILE
 *
 * Read the `provenance` and `status` fields carefully before changing numbers.
 * They are not decoration. Specifically:
 *
 *  - That stakes existed, were ironwood, roughly 2.6-2.8m long and 20-30cm in
 *    diameter, and date to c.1288: ARCHAEOLOGICAL, HIGH confidence (S-001).
 *  - The tidal regime (diurnal, ~3m spring range): SCIENTIFIC (S-002), but
 *    measured in the MODERN estuary, so MEDIUM as a 13th-century proxy.
 *  - Where the stakes sat relative to the channel, the map layout, unit counts,
 *    speeds, drafts and every tuning number: GAMEPLAY_ASSUMPTION. We do not
 *    have a surveyed paleo-channel (research debt RD-01/RD-04).
 *
 * The map here is a PLAYABLE ABSTRACTION of an estuary, not a survey of the
 * real one. It is labelled as such in `gameplayAssumptions` and shown to the
 * player. Do not let it drift into being presented as the real geography.
 */

import type { BattleScenario, TerrainCell, TerrainMap } from '../scenario.ts';
import {
  type Unit,
  type Commander,
  type Faction,
  unitId,
  factionId,
  commanderId,
} from '../../domain/types.ts';

export const DAI_VIET = factionId('dai-viet');
export const YUAN = factionId('yuan');

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */

const CELL_SIZE_M = 100;
const WIDTH_CELLS = 60; // 6 km across
const HEIGHT_CELLS = 40; // 4 km deep

/**
 * A schematic estuary: a navigable channel running roughly west-east, flanked
 * by tidal flats and marsh, with wooded banks north and south.
 *
 * Bed elevations are relative to the scenario datum, where 0 = low water.
 * The channel is deep; the flats dry out as the tide falls. The obstacle field
 * sits in the channel where it narrows.
 */
function buildTerrain(): TerrainMap {
  const cells: TerrainCell[] = [];

  for (let y = 0; y < HEIGHT_CELLS; y++) {
    for (let x = 0; x < WIDTH_CELLS; x++) {
      // Channel centred around y=20, narrowing toward the east (upstream).
      const channelCentre = 20;
      const channelHalfWidth = 8 - (x / WIDTH_CELLS) * 3.5;
      const distFromCentre = Math.abs(y - channelCentre);

      let kind: TerrainCell['kind'];
      let bedElevationM: number;

      if (distFromCentre <= channelHalfWidth) {
        kind = 'DEEP_WATER';
        // Deepest mid-channel, shoaling toward the sides.
        bedElevationM = -4.5 + (distFromCentre / channelHalfWidth) * 2.0;
      } else if (distFromCentre <= channelHalfWidth + 4) {
        kind = 'SHALLOW_WATER';
        bedElevationM = -2.5 + (distFromCentre - channelHalfWidth) * 0.4;
      } else if (distFromCentre <= channelHalfWidth + 7) {
        kind = 'TIDAL_FLAT';
        bedElevationM = -0.5 + (distFromCentre - channelHalfWidth - 4) * 0.3;
      } else if (distFromCentre <= channelHalfWidth + 9) {
        kind = 'MARSH';
        bedElevationM = 1.0;
      } else if (distFromCentre <= channelHalfWidth + 11) {
        kind = 'RIVERBANK';
        bedElevationM = 2.5;
      } else {
        kind = 'FOREST';
        bedElevationM = 3.5;
      }

      cells.push({ kind, bedElevationM });
    }
  }

  return { widthCells: WIDTH_CELLS, heightCells: HEIGHT_CELLS, cellSizeM: CELL_SIZE_M, cells };
}

/* ------------------------------------------------------------------ */
/* Obstacle field — the stakes                                         */
/* ------------------------------------------------------------------ */

/**
 * The stake field, placed across the channel at the narrows (x = 40..45).
 *
 * Top height 1.0m above datum is a GAMEPLAY ASSUMPTION, tuned so the mechanic
 * behaves as the sources describe. The numbers must satisfy:
 *
 *   passable near high water:  3.0m - 1.0m = 2.0m clearance > 1.5m draft + 0.2m
 *   lethal on the ebb:         once the tide falls below ~2.7m, deep-draft
 *                              ships no longer clear, while 0.4m light craft
 *                              stay safe until the water is nearly gone.
 *
 * That gap is the entire tactical window, and it is what makes TIMING rather
 * than troop count decide this battle — which matters, because the tide is the
 * part we have evidence for and the troop counts are the part we do not
 * (S-002 vs S-005).
 *
 * The real driving depth is not recoverable without the paleo-channel survey
 * (RD-01/RD-04). Stake *construction* is archaeological; stake *placement here*
 * is ours.
 */
function buildStakeField(): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  // Placed DOWNSTREAM, near the seaward end of the channel (world x
  // 1200-1900m). Position is dictated by the time geometry: the fleet starts
  // upstream around x=5400 and makes ~1100 m/h, so it reaches this line about
  // three hours in -- by which time the ebb has taken the water below what a
  // deep hull needs. Placed further upstream the fleet would cross while the
  // tide was still high and the obstructions would never bite.
  //
  // This also matches the tactical logic of the accounts: the obstructions are
  // between the fleet and the open sea, so the trap is sprung on a force that
  // is already committed to withdrawing.
  for (let x = 12; x <= 18; x++) {
    for (let y = 12; y <= 28; y++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/* ------------------------------------------------------------------ */
/* Commanders                                                          */
/* ------------------------------------------------------------------ */

/**
 * Ratings are GAME SYSTEM VARIABLES (§15, §42, §88). They express how the unit
 * behaves in this simulation. They are not a historical assessment of these
 * people, and the UI must never present them as one.
 */
const commanders: Commander[] = [
  {
    id: commanderId('tran-hung-dao'),
    faction: DAI_VIET,
    name: 'Trần Hưng Đạo',
    ratings: { leadership: 90, tactical: 92, strategic: 92, commandRangeM: 2500 },
    historicalNote: {
      text:
        'Commanded Đại Việt forces against the Yuan invasions. The Bạch Đằng ' +
        'operation of 1288 is attributed to his planning in the chronicle tradition.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-003' }],
    },
  },
  {
    id: commanderId('omar'),
    faction: YUAN,
    name: 'Ô Mã Nhi (Omar)',
    ratings: { leadership: 72, tactical: 70, strategic: 65, commandRangeM: 2000 },
    historicalNote: {
      text: 'Yuan naval commander during the 1288 withdrawal down the Bạch Đằng.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-003' }],
    },
  },
];

/* ------------------------------------------------------------------ */
/* Factions                                                            */
/* ------------------------------------------------------------------ */

const factions: Faction[] = [
  {
    id: DAI_VIET,
    name: 'Đại Việt',
    allowedUnitKinds: ['LIGHT_BOAT', 'WAR_JUNK', 'INFANTRY', 'ARCHERS', 'ELITE', 'MILITIA'],
  },
  {
    id: YUAN,
    name: 'Yuan fleet',
    allowedUnitKinds: ['HEAVY_SHIP', 'WAR_JUNK', 'INFANTRY', 'ARCHERS'],
  },
];

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

/**
 * Unit counts, strengths, drafts and speeds are ALL gameplay constructions.
 * Chronicle fleet sizes for 1288 are as unreliable as those for 938 (S-005),
 * so we do not pretend to reproduce them. What we reproduce is the *structure*
 * of the engagement: a heavy deep-draft fleet, a light shallow-draft defending
 * force, and an obstacle field that only one of them can cross safely.
 *
 * Drafts are the load-bearing numbers, because they drive the tide mechanic:
 *   light boats 0.4m  -> clear the stakes at almost any tide
 *   war junks   0.9m  -> marginal on the ebb
 *   heavy ships 1.5m  -> trapped once the water falls below ~3.3m
 */
function buildUnits(): Unit[] {
  const units: Unit[] = [];

  const light = (n: number, x: number, y: number): Unit => ({
    id: unitId(`dv-light-${n}`),
    faction: DAI_VIET,
    kind: 'LIGHT_BOAT',
    name: `Light flotilla ${n}`,
    strength: 300,
    initialStrength: 300,
    morale: 0.85,
    fatigue: 0.05,
    cohesion: 0.9,
    supply: 1,
    position: { x, y },
    status: 'ACTIVE',
    draftM: 0.4,
    baseSpeedMPerHour: 2600,
    commanderId: commanderId('tran-hung-dao'),
  });

  // Light craft are positioned UPSTREAM of the stake field (east of x=4600),
  // between the Yuan fleet and the sea-bound escape route only in the sense
  // that they harass from behind and drive the fleet downstream onto the
  // prepared ground. This matters: if the defenders sat on top of the stake
  // field they would simply intercept the fleet before it ever reached the
  // trap, and the tide would decide nothing.
  // Two flotillas harass from upstream, driving the fleet on; two wait
  // downstream near the obstructions to fall on whatever grounds there.
  units.push(light(1, 5100, 1500));
  units.push(light(2, 5100, 2500));
  units.push(light(3, 2100, 1500));
  units.push(light(4, 2100, 2500));

  // Shore troops on the banks, able to engage vessels grounded near the flats.
  for (let i = 0; i < 2; i++) {
    units.push({
      id: unitId(`dv-shore-${i + 1}`),
      faction: DAI_VIET,
      kind: 'INFANTRY',
      name: `Bank detachment ${i + 1}`,
      strength: 800,
      initialStrength: 800,
      morale: 0.8,
      fatigue: 0.05,
      cohesion: 0.85,
      supply: 1,
      // Bank detachments overlook the stake field, ready to fall on vessels
      // that ground there. They cannot reach midstream.
      position: { x: 1600, y: i === 0 ? 900 : 3100 },
      status: 'ACTIVE',
      baseSpeedMPerHour: 3000,
      commanderId: commanderId('tran-hung-dao'),
    });
  }

  // Yuan fleet entering from upstream (east), withdrawing seaward (west).
  for (let i = 0; i < 5; i++) {
    units.push({
      id: unitId(`yuan-heavy-${i + 1}`),
      faction: YUAN,
      kind: 'HEAVY_SHIP',
      name: `Heavy squadron ${i + 1}`,
      strength: 600,
      initialStrength: 600,
      morale: 0.7,
      fatigue: 0.2,
      cohesion: 0.8,
      supply: 0.6,
      position: { x: 5400, y: 1700 + i * 150 },
      status: 'ACTIVE',
      draftM: 1.5,
      // Tuned against the tide, which is the whole design of this scenario.
      // The fleet must cover ~4.2km to the obstructions; at this speed that
      // takes ~1.6h, and the channel closes to deep hulls at ~2h. So a fleet
      // that sails at once gets out, and one that hesitates does not. If this
      // number changes, recheck the escape-window regression tests.
      baseSpeedMPerHour: 2600,
      commanderId: commanderId('omar'),
    });
  }

  for (let i = 0; i < 3; i++) {
    units.push({
      id: unitId(`yuan-junk-${i + 1}`),
      faction: YUAN,
      kind: 'WAR_JUNK',
      name: `Escort junk ${i + 1}`,
      strength: 350,
      initialStrength: 350,
      morale: 0.72,
      fatigue: 0.18,
      cohesion: 0.8,
      supply: 0.6,
      position: { x: 5600, y: 1800 + i * 200 },
      status: 'ACTIVE',
      draftM: 0.9,
      baseSpeedMPerHour: 3000,
      commanderId: commanderId('omar'),
    });
  }

  return units;
}

/* ------------------------------------------------------------------ */
/* Scenario                                                            */
/* ------------------------------------------------------------------ */

export const BACH_DANG_1288: BattleScenario = {
  id: 'BACH_DANG_1288',
  version: 'v1',

  title: 'Bạch Đằng, 1288',
  period: 'Trần dynasty / Yuan invasions (13th century)',
  dateDescription: '1288',
  location: 'Bạch Đằng estuary, present-day Quảng Ninh / Hải Phòng, Vietnam',

  briefing:
    'A Yuan fleet is withdrawing seaward down the Bạch Đằng estuary. Đại Việt forces have ' +
    'prepared the channel and hold light, shallow-draft craft upstream. The tide is near its ' +
    'height and has begun to turn. Deep-draft ships that are still over the obstructions when ' +
    'the water falls will not get out.',

  factions,
  commanders,

  historicalForces: [
    {
      faction: DAI_VIET,
      description: 'Đại Việt forces: light river craft and shore troops',
      historicalSize: {
        quantity: { kind: 'UNKNOWN' },
        status: 'UNCERTAIN',
        confidence: 'LOW',
        sources: [{ id: 'S-005' }],
        note:
          'No reliable figure. Pre-modern chronicle army sizes are generally unreliable and ' +
          'frequently inflated; we do not substitute an invented number.',
      },
    },
    {
      faction: YUAN,
      description: 'Yuan fleet withdrawing toward the sea',
      historicalSize: {
        quantity: { kind: 'UNKNOWN' },
        status: 'UNCERTAIN',
        confidence: 'LOW',
        sources: [{ id: 'S-005' }],
        note: 'Fleet size varies widely between accounts. Treated as unknown rather than guessed.',
      },
    },
  ],

  initialUnits: buildUnits(),
  terrain: buildTerrain(),

  mechanics: {
    // Diurnal regime, ~3m spring range (S-002). High water at hour 1 so the
    // battle opens near the top of the tide and the ebb runs through play.
    // Diurnal regime, ~3m spring range (S-002).
    //
    // TIME GEOMETRY -- this is the crux of the scenario and the reason these
    // numbers are what they are. The tide falls over ~12 hours, but a fleet
    // under sail crosses this 6km map in ~2. If the fleet can simply run for
    // the sea, it is clear of the obstructions long before the water drops and
    // the trap is decorative.
    //
    // So high water is set at hour -1.5 (i.e. before the battle opens): play
    // begins on an ebb already underway, with roughly 2.4m of water over the
    // stakes and falling. Deep-draft ships (1.5m + 0.2m clearance = 1.7m)
    // have a window of a little over two hours to get out. That is genuinely
    // tight, and it is what makes the Yuan player's timing decision real.
    tide: {
      periodHours: 24.8,
      lowWaterM: 0,
      highWaterM: 3.0,
      highWaterAtHour: -1.5,
    },
    obstacleFields: [
      {
        id: 'stake-field-narrows',
        name: 'the stake field',
        cells: buildStakeField(),
        topHeightM: 1.0,
        strikeChancePerTick: 0.35,
        strikeDamageFraction: 0.18,
        knownToFaction: DAI_VIET,
        provenance: {
          status: 'GAMEPLAY_ASSUMPTION',
          sources: [],
          note:
            'Stake CONSTRUCTION is archaeological (S-001: ironwood, c.2.6-2.8m long, ' +
            '20-30cm diameter, radiocarbon dated to c.1288). Stake PLACEMENT on this map, ' +
            'the 1.0m top height, strike chance and damage are gameplay constructions ' +
            'chosen to reproduce the documented dynamic. No surveyed paleo-channel exists ' +
            'in our sources (RD-01, RD-04).',
        },
      },
    ],
    fogOfWar: true,
  },

  objectives: [
    {
      id: 'dv-trap-fleet',
      faction: DAI_VIET,
      description: 'Neutralise the Yuan fleet before it reaches open water',
      // Calibrated against what good play can actually achieve. The obstacles
      // typically hold about half the fleet; converting those into destroyed
      // vessels requires the player to bring the shore detachments onto them.
      // Passive play leaves them merely held fast, the tide turns, and the
      // attempt fails -- so the threshold sits just above what the trap
      // delivers on its own.
      condition: { kind: 'FLEET_NEUTRALISED', targetFaction: YUAN, fractionNeutralised: 0.5 },
    },
    {
      id: 'yuan-break-out',
      faction: YUAN,
      description: 'Break out to sea with the fleet intact',
      // This was previously an ATTRITION condition against Dai Viet, which
      // contradicted its own description: it said "break out" but rewarded
      // grinding the defenders down. An AI commander reading the scenario
      // honestly did exactly that -- charged the defenders and won without ever
      // approaching the obstructions. The mechanics now match the words.
      //
      // The threshold is dictated by the physics, not chosen for feel.
      //
      // Five of the eight vessels draw 1.5m and need 2.7m of water over the
      // obstructions. They need ~1.35h to reach the stake line and the channel
      // closes to them at ~1.35h, so the heavy squadrons sit on a knife edge.
      // The three shallow-draft junks (38% of the fleet) can always get out.
      //
      // 0.5 therefore has to mean "at least some of the heavy squadrons got
      // through", which is the only reading under which "break out with the
      // fleet intact" is true. Setting it at or below 0.38 would hand the Yuan
      // a victory for saving nothing but the light escorts while the entire
      // battle fleet lay wrecked on the stakes -- which is precisely the
      // outcome history records as a catastrophic defeat.
      condition: { kind: 'ESCAPE', beyondX: 600, direction: 'BELOW', fractionEscaped: 0.5 },
    },
  ],

  // Once the water is gone the situation is settled: any vessel still caught
  // above the obstructions is not getting out, and the Yuan attempt to break
  // through has failed. Six hours is a little past the point where deep-draft
  // ships lose all clearance.
  // If the player never converts the trap, the surviving fleet works its way
  // clear on the next flood and the attempt has failed. The defender does not
  // win by default here -- the trap has to be exploited.
  timeLimit: {
    hours: 6,
    favours: YUAN,
    reason: 'The Yuan fleet held out until the tide turned and the channel reopened',
  },

  historicalPhases: [
    {
      id: 'phase-preparation',
      title: 'Preparation of the channel',
      summary:
        'Stakes were emplaced in the riverbed. Excavated examples are largely ironwood, ' +
        'roughly 2.6-2.8m long and 20-30cm in diameter, set densely enough to be described ' +
        'as forming a wall.',
      status: 'VERIFIED_FACT',
      sources: [{ id: 'S-001' }],
    },
    {
      id: 'phase-tide',
      title: 'The tidal window',
      summary:
        'The estuary has a diurnal tide with a spring range of roughly 2.5-3.2m, giving one ' +
        'usable high-water window per day and a single long ebb.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-002' }],
    },
    {
      id: 'phase-engagement',
      title: 'Engagement on the ebb',
      summary:
        'Light craft engaged and drew the fleet onto the prepared ground; as the tide fell, ' +
        'deep-draft vessels were caught on the obstructions and attacked.',
      status: 'SUPPORTED_INTERPRETATION',
      sources: [{ id: 'S-004' }],
    },
  ],

  historicalOutcome: {
    victor: DAI_VIET,
    summary:
      'The Yuan fleet was destroyed in the estuary. The defeat ended the third Yuan invasion ' +
      'of Đại Việt.',
    status: 'SUPPORTED_INTERPRETATION',
    sources: [{ id: 'S-003' }, { id: 'S-001' }],
    casualties: [
      {
        faction: YUAN,
        figure: {
          quantity: { kind: 'UNKNOWN' },
          status: 'UNCERTAIN',
          confidence: 'LOW',
          sources: [{ id: 'S-005' }],
          note: 'Casualty figures in the chronicle tradition are not reliable.',
        },
      },
    ],
  },

  sources: [{ id: 'S-001' }, { id: 'S-002' }, { id: 'S-003' }, { id: 'S-004' }, { id: 'S-005' }],

  gameplayAssumptions: [
    'The map is a schematic estuary, not a survey. The real 13th-century channel has not been reconstructed in our sources (RD-01, RD-04).',
    'Stake positions, the 1.0m obstacle height, strike chance and damage are gameplay constructions. Stake construction and dating are archaeological; placement here is not.',
    'All unit counts, strengths, drafts and speeds are simulation parameters. No reliable force figures exist for either side.',
    'Tidal figures are modern measurements of the estuary used as a proxy for 13th-century conditions.',
    'Commander ratings are game system variables, not historical assessments of these people.',
    'The battle is compressed into a single continuous engagement for playability.',
  ],

  allowedUnitKinds: ['LIGHT_BOAT', 'WAR_JUNK', 'HEAVY_SHIP', 'INFANTRY', 'ARCHERS', 'ELITE', 'MILITIA'],
};
