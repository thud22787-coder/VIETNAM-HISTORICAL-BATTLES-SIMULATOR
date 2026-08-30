import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BACH_DANG_1288, DAI_VIET, YUAN } from '../src/scenario/battles/bach-dang-1288.ts';
import { validateScenario, scenarioErrors, assertScenarioValid } from '../src/scenario/validate.ts';
import { createInitialState, step, type Command } from '../src/sim/engine.ts';
import { evaluateTide } from '../src/sim/tide.ts';
import { canAct, type BattleState } from '../src/domain/types.ts';

/* ------------------------------------------------------------------ */
/* Historical regression checks (§54)                                  */
/* ------------------------------------------------------------------ */

describe('scenario data correctness (§54)', () => {
  test('the scenario is structurally valid', () => {
    assert.doesNotThrow(() => assertScenarioValid(BACH_DANG_1288));
  });

  test('no validation errors at all', () => {
    assert.deepEqual(scenarioErrors(validateScenario(BACH_DANG_1288)), []);
  });

  test('both factions and their commanders are present', () => {
    assert.equal(BACH_DANG_1288.factions.length, 2);
    assert.ok(BACH_DANG_1288.commanders.some((c) => c.faction === DAI_VIET));
    assert.ok(BACH_DANG_1288.commanders.some((c) => c.faction === YUAN));
  });

  test('the historical victor is recorded as Dai Viet', () => {
    assert.equal(BACH_DANG_1288.historicalOutcome.victor, DAI_VIET);
  });

  test('scenario is versioned (§9)', () => {
    assert.ok(BACH_DANG_1288.version.length > 0);
  });
});

describe('historical honesty (§4, §43, §87)', () => {
  test('force sizes are NOT presented as known numbers', () => {
    // HISTORICAL_SOURCES S-005: no reliable figures exist. The scenario must
    // not invent any. This test exists to stop a future contributor from
    // "helpfully" filling these in.
    for (const force of BACH_DANG_1288.historicalForces) {
      assert.equal(
        force.historicalSize.quantity.kind,
        'UNKNOWN',
        `force size for ${force.faction} must remain UNKNOWN — no reliable source exists`,
      );
      assert.notEqual(force.historicalSize.status, 'VERIFIED_FACT');
    }
  });

  test('casualty figures are not invented', () => {
    for (const c of BACH_DANG_1288.historicalOutcome.casualties ?? []) {
      assert.notEqual(c.figure.status, 'VERIFIED_FACT');
    }
  });

  test('the stake field is labelled a gameplay assumption, not archaeology', () => {
    // Stake *construction* is archaeological (S-001); their *placement on this
    // map* is ours. Conflating the two would be exactly the dishonesty the
    // accuracy contract forbids.
    const field = BACH_DANG_1288.mechanics.obstacleFields![0]!;
    assert.equal(field.provenance.status, 'GAMEPLAY_ASSUMPTION');
    assert.match(field.provenance.note, /archaeological/i);
    assert.match(field.provenance.note, /PLACEMENT|placement/);
  });

  test('every VERIFIED_FACT phase cites a source', () => {
    for (const phase of BACH_DANG_1288.historicalPhases) {
      if (phase.status === 'VERIFIED_FACT') {
        assert.ok(phase.sources.length > 0, `phase ${phase.id} claims fact without a source`);
      }
    }
  });

  test('gameplay assumptions are declared to the player', () => {
    assert.ok(BACH_DANG_1288.gameplayAssumptions.length >= 5);
    const joined = BACH_DANG_1288.gameplayAssumptions.join(' ').toLowerCase();
    // The most important admissions must be present.
    assert.match(joined, /schematic|not a survey/);
    assert.match(joined, /commander ratings/);
    assert.match(joined, /simulation parameters|unit counts/);
  });

  test('commander ratings are never asserted as historical fact', () => {
    for (const c of BACH_DANG_1288.commanders) {
      if (c.historicalNote) {
        assert.notEqual(
          c.historicalNote.status,
          'VERIFIED_FACT',
          'biographical notes here are interpretations, not established fact',
        );
        assert.ok(c.historicalNote.sources.length > 0);
      }
    }
  });

  test('the anachronism guard rejects out-of-period units (INV-21)', () => {
    const broken = {
      ...BACH_DANG_1288,
      initialUnits: [{ ...BACH_DANG_1288.initialUnits[0]!, kind: 'SIEGE' as const }],
    };
    const codes = validateScenario(broken).map((p) => p.code);
    assert.ok(codes.includes('ANACHRONISTIC_UNIT') || codes.includes('UNIT_KIND_NOT_ALLOWED_FOR_FACTION'));
  });
});

/* ------------------------------------------------------------------ */
/* The tide mechanic must actually decide the battle                   */
/* ------------------------------------------------------------------ */

/** Yuan fleet runs for open water starting at `departTick`. */
function runWithDeparture(departTick: number, seed = 'regression'): BattleState {
  let s = createInitialState(BACH_DANG_1288, seed);
  for (let i = 0; i < 220 && s.outcome.kind === 'ONGOING'; i++) {
    const commands: Command[] = [];
    for (const u of s.units) {
      if (u.faction !== YUAN || !canAct(u)) continue;
      commands.push(
        s.tick >= departTick
          ? { kind: 'MOVE', unitId: u.id, to: { x: 200, y: u.position.y } }
          : { kind: 'HOLD', unitId: u.id },
      );
    }
    s = step(s, commands, BACH_DANG_1288);
  }
  return s;
}

const reachedOpenWater = (s: BattleState): number =>
  s.units.filter(
    (u) => u.faction === YUAN && canAct(u) && u.status !== 'IMMOBILISED' && u.position.x < 600,
  ).length;

const strikeCount = (s: BattleState): number =>
  s.events.filter((e) => /struck/.test(e.message)).length;

describe('the tide is the decisive variable (ADR-007)', () => {
  test('the obstacle field actually fires — ships strike the stakes', () => {
    // If this ever reaches zero, the scenario has drifted into being decided by
    // melee alone and the whole premise of the vertical slice is broken.
    assert.ok(strikeCount(runWithDeparture(6)) > 0, 'no vessel ever struck the obstacle field');
  });

  test('departing immediately gets ships out; delaying loses them', () => {
    // THE central property. The Yuan player's timing decision must matter.
    const early = runWithDeparture(0);
    const late = runWithDeparture(12);

    assert.ok(
      reachedOpenWater(early) > reachedOpenWater(late),
      `early departure must save more ships (early=${reachedOpenWater(early)}, late=${reachedOpenWater(late)})`,
    );
    assert.equal(reachedOpenWater(late), 0, 'a fleet that waits for the ebb should not escape');
  });

  test('a delayed fleet loses the battle outright', () => {
    const late = runWithDeparture(12);
    assert.equal(late.outcome.kind, 'DECIDED');
    if (late.outcome.kind === 'DECIDED') {
      assert.equal(late.outcome.victor, DAI_VIET);
    }
  });

  test('the escape window is tight but real — a few ticks change everything', () => {
    // Between t+0 and t+6 (30 in-world minutes) the outcome flips. This is the
    // scenario working as designed; if the window widens to hours or vanishes,
    // the time geometry has regressed.
    assert.ok(reachedOpenWater(runWithDeparture(0)) > 0, 'immediate departure must be survivable');
    assert.equal(reachedOpenWater(runWithDeparture(6)), 0, 'a 30-minute delay must be fatal');
  });

  test('light craft are never trapped by the stakes their own side placed', () => {
    const s = runWithDeparture(6);
    const trappedFriendlies = s.units.filter(
      (u) => u.faction === DAI_VIET && u.status === 'IMMOBILISED',
    );
    assert.deepEqual(trappedFriendlies, [], 'shallow-draft craft must pass the stake field freely');
  });

  test('the tide is genuinely falling through the decisive period', () => {
    const tide = BACH_DANG_1288.mechanics.tide!;
    const atStart = evaluateTide(tide, 0).levelM;
    const atTwoHours = evaluateTide(tide, 2).levelM;
    assert.ok(atTwoHours < atStart, 'the battle must open on an ebb');

    // Clearance over the stakes must cross the deep-draft threshold during play.
    const field = BACH_DANG_1288.mechanics.obstacleFields![0]!;
    const heavyDraft = 1.5;
    const startClear = atStart - field.topHeightM;
    const laterClear = evaluateTide(tide, 3).levelM - field.topHeightM;
    assert.ok(startClear > heavyDraft, 'deep-draft ships must start with a way out');
    assert.ok(laterClear < heavyDraft, 'and must lose it during the battle');
  });
});

describe('determinism of the slice', () => {
  test('the same departure plan reproduces exactly', () => {
    const a = runWithDeparture(6, 'fixed');
    const b = runWithDeparture(6, 'fixed');
    assert.equal(a.rngState, b.rngState);
    assert.deepEqual(
      a.units.map((u) => [u.id, u.strength, u.status]),
      b.units.map((u) => [u.id, u.strength, u.status]),
    );
  });
});
