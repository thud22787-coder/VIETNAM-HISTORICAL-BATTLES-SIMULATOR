import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TOT_DONG_1426, LAM_SON, MING_FIELD } from '../src/scenario/battles/tot-dong-1426.ts';
import { CHI_LANG_1427 } from '../src/scenario/battles/chi-lang-1427.ts';
import { BACH_DANG_1288 } from '../src/scenario/battles/bach-dang-1288.ts';
import { validateScenario, scenarioErrors, assertScenarioValid } from '../src/scenario/validate.ts';
import { createInitialState, step, combatPower, type Command } from '../src/sim/engine.ts';
import { assertInvariants, checkInvariants } from '../src/state/validator.ts';
import { terrainAtPosition } from '../src/scenario/scenario.ts';
import { canAct, type BattleState } from '../src/domain/types.ts';

describe('Tot Dong 1426 scenario data (§54)', () => {
  test('validates with no errors', () => {
    assert.deepEqual(scenarioErrors(validateScenario(TOT_DONG_1426)), []);
    assert.doesNotThrow(() => assertScenarioValid(TOT_DONG_1426));
  });

  test('validates with no warnings either', () => {
    // The validator caught a real epistemic error while this scenario was being
    // written: the Lam Son strength was typed EXACT while marked UNCERTAIN,
    // which is a contradiction. Keeping the warning bar at zero means the next
    // one gets caught too.
    assert.deepEqual(validateScenario(TOT_DONG_1426), []);
  });

  test('records Lam Son as the historical victor', () => {
    assert.equal(TOT_DONG_1426.historicalOutcome.victor, LAM_SON);
  });

  test('the initial state is valid and every unit starts on the map', () => {
    assert.deepEqual(checkInvariants(createInitialState(TOT_DONG_1426, 'seed')), []);

    const w = TOT_DONG_1426.terrain.widthCells * TOT_DONG_1426.terrain.cellSizeM;
    const h = TOT_DONG_1426.terrain.heightCells * TOT_DONG_1426.terrain.cellSizeM;
    for (const u of TOT_DONG_1426.initialUnits) {
      assert.ok(
        u.position.x >= 0 && u.position.x <= w && u.position.y >= 0 && u.position.y <= h,
        `${u.id} starts off the map at (${u.position.x}, ${u.position.y})`,
      );
    }
  });
});

describe('historical honesty — the disputed-figures case (§4, §106)', () => {
  test('Ming strength is carried as DISPUTED, with both traditions intact', () => {
    // This battle is the project's best example of a documented disagreement:
    // both sides' figures survive and both are attributed. Averaging them into
    // one number would destroy the most useful thing here.
    const ming = TOT_DONG_1426.historicalForces.find((f) => f.faction === MING_FIELD)!;
    assert.equal(ming.historicalSize.quantity.kind, 'DISPUTED');
    if (ming.historicalSize.quantity.kind !== 'DISPUTED') throw new Error('unreachable');

    const values = ming.historicalSize.quantity.candidates.map((c) => c.value).sort((a, b) => a - b);
    assert.deepEqual(values, [54000, 100000]);

    for (const c of ming.historicalSize.quantity.candidates) {
      assert.ok(c.sources.length > 0, 'each candidate must say where it comes from');
      assert.ok(c.note && c.note.length > 0, 'and which tradition reports it');
    }
  });

  test('casualties are DISPUTED too, not reconciled', () => {
    const casualties = TOT_DONG_1426.historicalOutcome.casualties ?? [];
    assert.ok(casualties.length > 0);
    for (const c of casualties) {
      assert.equal(c.figure.quantity.kind, 'DISPUTED');
      assert.notEqual(c.figure.status, 'VERIFIED_FACT');
    }
  });

  test('no force figure claims to be a fact', () => {
    for (const f of TOT_DONG_1426.historicalForces) {
      assert.notEqual(f.historicalSize.status, 'VERIFIED_FACT');
      assert.ok(f.historicalSize.sources.length > 0);
    }
  });

  test('commander notes are interpretations with sources', () => {
    for (const c of TOT_DONG_1426.commanders) {
      if (c.historicalNote) {
        assert.notEqual(c.historicalNote.status, 'VERIFIED_FACT');
        assert.ok(c.historicalNote.sources.length > 0);
      }
    }
  });

  test('the assumptions admit what is invented', () => {
    const joined = TOT_DONG_1426.gameplayAssumptions.join(' ').toLowerCase();
    assert.match(joined, /schematic/);
    assert.match(joined, /simulation parameters/);
    assert.match(joined, /commander ratings/);
    // The accounts mention war elephants; we do not model them, and say so
    // rather than letting a reader assume the scenario is complete.
    assert.match(joined, /elephant/);
  });
});

describe('the paddy is the mechanic', () => {
  test('cavalry is crippled in the paddy', () => {
    const cav = TOT_DONG_1426.initialUnits.find((u) => u.kind === 'CAVALRY')!;
    const onRoad = { ...cav, position: { x: 4600, y: 1600 } };
    const inPaddy = { ...cav, position: { x: 3000, y: 600 } };

    assert.equal(terrainAtPosition(TOT_DONG_1426.terrain, inPaddy.position)?.kind, 'MARSH');
    assert.ok(
      combatPower(inPaddy, TOT_DONG_1426) < combatPower(onRoad, TOT_DONG_1426) * 0.5,
      'a heavy column off the road must lose most of its effectiveness',
    );
  });

  test('local levies are barely hampered by ground they chose', () => {
    // The asymmetry is the battle: the same mud that ruins the column is
    // workable for troops who live and farm in it.
    const militia = TOT_DONG_1426.initialUnits.find((u) => u.kind === 'MILITIA')!;
    const cav = TOT_DONG_1426.initialUnits.find((u) => u.kind === 'CAVALRY')!;
    const paddy = { x: 3000, y: 600 };
    const road = { x: 4600, y: 1600 };

    const ratio = (u: typeof militia): number =>
      combatPower({ ...u, position: paddy }, TOT_DONG_1426) /
      combatPower({ ...u, position: road }, TOT_DONG_1426);

    assert.ok(
      ratio(militia) > ratio(cav) * 2,
      `militia should far outlast cavalry in the paddy (${ratio(militia).toFixed(2)} vs ${ratio(cav).toFixed(2)})`,
    );
  });

  test('there is a firm road, so leaving it is a choice', () => {
    // A field that is uniformly bad is a toll, not a trap — the same lesson
    // Chi Lang taught. The Ming problem here is being talked off the road.
    let firm = 0;
    for (let x = 500; x < 5000; x += 100) {
      if (terrainAtPosition(TOT_DONG_1426.terrain, { x, y: 1600 })?.kind === 'PLAIN') firm++;
    }
    assert.ok(firm > 20, 'the road must be a usable continuous route');
  });

  test('the river is worse for cavalry than for anyone else', () => {
    const cav = TOT_DONG_1426.initialUnits.find((u) => u.kind === 'CAVALRY')!;
    const inf = TOT_DONG_1426.initialUnits.find(
      (u) => u.kind === 'INFANTRY' && u.faction === MING_FIELD,
    )!;
    const river = { x: 2000, y: 1600 };
    assert.equal(terrainAtPosition(TOT_DONG_1426.terrain, river)?.kind, 'SHALLOW_WATER');

    const road = { x: 4600, y: 1600 };
    const drop = (u: typeof cav): number =>
      combatPower({ ...u, position: river }, TOT_DONG_1426) /
      combatPower({ ...u, position: road }, TOT_DONG_1426);

    assert.ok(drop(cav) < drop(inf), 'being caught mid-crossing must hurt horse most');
  });
});

describe('the engine handles a third battle unchanged (§72, ADR-008)', () => {
  test('it needed no new mechanic', () => {
    // Chi Lang required terrain effects to exist. This battle uses the same
    // mechanic with different numbers, which is what ADR-008 predicted the
    // third battle would cost: nothing.
    assert.ok(TOT_DONG_1426.mechanics.terrainEffects);
    assert.equal(TOT_DONG_1426.mechanics.tide, undefined);
    assert.equal(TOT_DONG_1426.mechanics.obstacleFields, undefined);
  });

  test('invariants hold at every tick of a full battle', () => {
    let s = createInitialState(TOT_DONG_1426, 'invariants');
    const bounds = {
      width: TOT_DONG_1426.terrain.widthCells * TOT_DONG_1426.terrain.cellSizeM,
      height: TOT_DONG_1426.terrain.heightCells * TOT_DONG_1426.terrain.cellSizeM,
    };
    for (let i = 0; i < 150 && s.outcome.kind === 'ONGOING'; i++) {
      const commands: Command[] = s.units
        .filter((u) => u.faction === MING_FIELD && canAct(u))
        .map((u) => ({ kind: 'MOVE' as const, unitId: u.id, to: { x: 1000, y: u.position.y } }));
      s = step(s, commands, TOT_DONG_1426);
      assert.doesNotThrow(
        () => assertInvariants(s, 'STRICT', { bounds }),
        `invariant violated at tick ${s.tick}`,
      );
    }
  });

  test('the battle reaches a conclusion and is deterministic', () => {
    const run = (): BattleState => {
      let s = createInitialState(TOT_DONG_1426, 'determinism');
      for (let i = 0; i < 200 && s.outcome.kind === 'ONGOING'; i++) {
        const commands: Command[] = s.units
          .filter((u) => u.faction === MING_FIELD && canAct(u))
          .map((u) => ({ kind: 'MOVE' as const, unitId: u.id, to: { x: 1000, y: 1600 } }));
        s = step(s, commands, TOT_DONG_1426);
      }
      return s;
    };
    const a = run();
    const b = run();
    assert.notEqual(a.outcome.kind, 'ONGOING');
    assert.equal(a.rngState, b.rngState);
    assert.deepEqual(
      a.units.map((u) => [u.id, u.strength, u.status]),
      b.units.map((u) => [u.id, u.strength, u.status]),
    );
  });

  test('adding it changed neither existing battle', () => {
    for (let s = createInitialState(BACH_DANG_1288, 'unchanged'), i = 0; i < 30; i++) {
      s = step(s, [], BACH_DANG_1288);
      assert.deepEqual(checkInvariants(s), []);
    }
    for (let s = createInitialState(CHI_LANG_1427, 'unchanged'), i = 0; i < 30; i++) {
      s = step(s, [], CHI_LANG_1427);
      assert.deepEqual(checkInvariants(s), []);
    }
  });

  test('the three battles use genuinely different ground', () => {
    // Bach Dang turns on water depth, Chi Lang on a defile, Tot Dong on a field
    // that is bad almost everywhere with one firm road through it.
    assert.ok(BACH_DANG_1288.mechanics.tide);
    assert.ok(CHI_LANG_1427.mechanics.terrainEffects);
    assert.ok(TOT_DONG_1426.mechanics.terrainEffects);

    const marshFraction = (s: typeof TOT_DONG_1426): number =>
      s.terrain.cells.filter((c) => c.kind === 'MARSH').length / s.terrain.cells.length;

    assert.ok(
      marshFraction(TOT_DONG_1426) > marshFraction(CHI_LANG_1427) * 2,
      'Tot Dong should be mostly soft ground; Chi Lang mostly not',
    );
  });
});
