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

/**
 * Yuan fleet runs for open water starting at `departTick`.
 *
 * `playerActive` decides whether Dai Viet converts the trap. This matters: the
 * obstacles only hold vessels fast, and finishing them is the player's job, so
 * a passive defender now loses. Tests about the tide use the passive form;
 * tests about the outcome use the active one.
 */
function runWithDeparture(
  departTick: number,
  seed = 'regression',
  playerActive = false,
): BattleState {
  let s = createInitialState(BACH_DANG_1288, seed);
  for (let i = 0; i < 220 && s.outcome.kind === 'ONGOING'; i++) {
    const commands: Command[] = [];
    for (const u of s.units) {
      if (u.faction !== YUAN || !canAct(u)) continue;
      commands.push(
        s.tick >= departTick
          ? { kind: 'MOVE', unitId: u.id, to: { x: 150, y: u.position.y } }
          : { kind: 'HOLD', unitId: u.id },
      );
    }

    if (playerActive) {
      const stuck = s.units.filter((u) => u.faction === YUAN && u.status === 'IMMOBILISED');
      if (stuck.length > 0) {
        for (const u of s.units) {
          if (u.faction !== DAI_VIET || !canAct(u)) continue;
          const target = stuck.reduce((best, e) =>
            Math.hypot(e.position.x - u.position.x, e.position.y - u.position.y) <
            Math.hypot(best.position.x - u.position.x, best.position.y - u.position.y)
              ? e
              : best,
          );
          commands.push({ kind: 'MOVE', unitId: u.id, to: target.position });
        }
      }
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
    assert.ok(strikeCount(runWithDeparture(24)) > 0, 'no vessel ever struck the obstacle field');
  });

  test('departing immediately gets ships out; waiting for the ebb does not', () => {
    // THE central property. The Yuan timing decision must matter, because the
    // tide is the evidenced part of this battle (S-002) and the troop counts
    // are not (S-005).
    const early = runWithDeparture(0);
    const late = runWithDeparture(24);

    assert.ok(
      reachedOpenWater(early) > reachedOpenWater(late),
      `early departure must save more ships (early=${reachedOpenWater(early)}, late=${reachedOpenWater(late)})`,
    );
    assert.equal(reachedOpenWater(late), 0, 'a fleet that waits for the ebb should not escape');
  });

  test('a fleet that lingers is caught by the falling tide', () => {
    const late = runWithDeparture(24);
    const caught = late.units.filter(
      (u) => u.faction === YUAN && (u.status === 'IMMOBILISED' || u.status === 'DESTROYED'),
    );
    assert.ok(caught.length > 0, 'the ebb must catch a fleet that delays');
  });

  test('the escape window is real — departure time changes how many get out', () => {
    // The fleet needs ~1.6h to reach the obstructions; the channel closes to
    // deep hulls at ~2h. If this window widens to hours or vanishes entirely,
    // the time geometry has regressed and the battle stops being a decision.
    assert.ok(reachedOpenWater(runWithDeparture(0)) > 0, 'immediate departure must be survivable');
    assert.equal(reachedOpenWater(runWithDeparture(24)), 0, 'a two-hour delay must be fatal');
  });

  test('the player must convert the trap — passivity never wins', () => {
    // The obstacles hold vessels fast; they do not finish them. Closing on the
    // grounded ships is the player's job, and that is what keeps the player a
    // participant rather than a spectator.
    //
    // Checked across several seeds deliberately. How many vessels the ebb
    // catches genuinely varies, so a single-seed assertion would be tuning to
    // luck. What must hold universally is the *direction*: committing forces
    // always destroys more of the fleet, and a passive defender never wins.
    const seeds = ['agency', 'ag2', 's1', 's2', 's3', 's4'];

    const destroyed = (s: BattleState): number =>
      s.units.filter((u) => u.faction === YUAN && u.status === 'DESTROYED').length;

    let activeWins = 0;

    for (const seed of seeds) {
      const passive = runWithDeparture(6, seed, false);
      const active = runWithDeparture(6, seed, true);

      assert.ok(
        destroyed(active) > destroyed(passive),
        `[${seed}] committing forces must destroy more (active=${destroyed(active)}, passive=${destroyed(passive)})`,
      );

      assert.equal(passive.outcome.kind, 'DECIDED');
      if (passive.outcome.kind === 'DECIDED') {
        assert.notEqual(
          passive.outcome.victor,
          DAI_VIET,
          `[${seed}] a passive defender must not be handed a victory`,
        );
      }

      if (active.outcome.kind === 'DECIDED' && active.outcome.victor === DAI_VIET) {
        activeWins++;
      }
    }

    // Skilful play should usually — not always — win. If this ever reaches
    // every seed, the battle has become deterministic in a way the tide should
    // not allow; if it reaches none, the player has no agency at all.
    assert.ok(
      activeWins >= seeds.length / 2,
      `active play should win most seeds, won ${activeWins}/${seeds.length}`,
    );
  });

  test('light craft are never trapped by the stakes their own side placed', () => {
    const s = runWithDeparture(6, 'regression', true);
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

describe('objectives must be attainable and honest', () => {
  test('the Yuan objective matches its own description', () => {
    // It previously read "break out to sea" while its condition rewarded
    // grinding down the defenders. An AI reading the scenario honestly charged
    // the defenders instead of running, which is how the contradiction surfaced.
    const breakOut = BACH_DANG_1288.objectives.find((o) => o.id === 'yuan-break-out')!;
    assert.match(breakOut.description, /break out|sea/i);
    assert.equal(
      breakOut.condition.kind,
      'ESCAPE',
      'an objective describing escape must be expressed as an escape condition',
    );
  });

  test('the escape threshold requires more than just the light escorts', () => {
    // Only the three shallow-draft junks (38% of the fleet) can reliably clear
    // the obstructions. A threshold at or below that would hand the Yuan a
    // victory for saving nothing but escorts while the battle fleet lay wrecked
    // -- the outcome history records as a catastrophic defeat.
    const breakOut = BACH_DANG_1288.objectives.find((o) => o.id === 'yuan-break-out')!;
    assert.equal(breakOut.condition.kind, 'ESCAPE');
    if (breakOut.condition.kind !== 'ESCAPE') throw new Error('unreachable');

    const fleet = BACH_DANG_1288.initialUnits.filter((u) => u.faction === YUAN);
    const shallow = fleet.filter((u) => (u.draftM ?? 0) < 1.0).length;
    assert.ok(
      breakOut.condition.fractionEscaped > shallow / fleet.length,
      `escape threshold ${breakOut.condition.fractionEscaped} is met by the light escorts alone`,
    );
  });

  test('the escape threshold is not literally unattainable either', () => {
    // The mirror failure: a threshold no amount of good play can reach means
    // the Yuan cannot win by their own stated objective.
    const breakOut = BACH_DANG_1288.objectives.find((o) => o.id === 'yuan-break-out')!;
    if (breakOut.condition.kind !== 'ESCAPE') throw new Error('unreachable');
    assert.ok(breakOut.condition.fractionEscaped <= 1);

    // Sailing hard from tick zero must get at least someone out.
    let s = createInitialState(BACH_DANG_1288, 'attainable');
    for (let i = 0; i < 200 && s.outcome.kind === 'ONGOING'; i++) {
      const commands: Command[] = s.units
        .filter((u) => u.faction === YUAN && canAct(u))
        .map((u) => ({ kind: 'MOVE' as const, unitId: u.id, to: { x: 100, y: u.position.y } }));
      s = step(s, commands, BACH_DANG_1288);
    }
    const out = s.units.filter(
      (u) => u.faction === YUAN && canAct(u) && u.position.x <= 600,
    ).length;
    assert.ok(out > 0, 'optimal play must get at least some vessels to open water');
  });
});

describe('every battle reaches a conclusion (INV-15)', () => {
  test('the battle always resolves rather than hanging', () => {
    // A simulation that simply stops tells the player nothing.
    for (const active of [false, true]) {
      const s = runWithDeparture(6, 'conclusion', active);
      assert.notEqual(s.outcome.kind, 'ONGOING', 'the battle must resolve');
    }
  });

  test('a fleet that never sails is adjudicated at the time limit', () => {
    // departTick beyond the run length means the Yuan fleet never moves, so no
    // objective is met and the scenario time limit decides.
    const s = runWithDeparture(9999);
    assert.equal(s.outcome.kind, 'DECIDED');
    assert.ok(s.elapsedHours >= BACH_DANG_1288.timeLimit.hours);
  });
});

describe('determinism of the slice', () => {
  test('the same departure plan reproduces exactly', () => {
    const a = runWithDeparture(6, 'fixed', true);
    const b = runWithDeparture(6, 'fixed', true);
    assert.equal(a.rngState, b.rngState);
    assert.deepEqual(
      a.units.map((u) => [u.id, u.strength, u.status]),
      b.units.map((u) => [u.id, u.strength, u.status]),
    );
  });
});
