import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CHI_LANG_1427, DAI_VIET_LAMSON, MING } from '../src/scenario/battles/chi-lang-1427.ts';
import { BACH_DANG_1288 } from '../src/scenario/battles/bach-dang-1288.ts';
import { validateScenario, scenarioErrors, assertScenarioValid } from '../src/scenario/validate.ts';
import { createInitialState, step, combatPower, type Command } from '../src/sim/engine.ts';
import { checkInvariants, assertInvariants } from '../src/state/validator.ts';
import { terrainAtPosition } from '../src/scenario/scenario.ts';
import { canAct, type BattleState } from '../src/domain/types.ts';

/* ------------------------------------------------------------------ */
/* Scenario correctness (§54)                                          */
/* ------------------------------------------------------------------ */

describe('Chi Lang 1427 scenario data', () => {
  test('validates without errors', () => {
    assert.deepEqual(scenarioErrors(validateScenario(CHI_LANG_1427)), []);
    assert.doesNotThrow(() => assertScenarioValid(CHI_LANG_1427));
  });

  test('has both factions, commanders and objectives', () => {
    assert.equal(CHI_LANG_1427.factions.length, 2);
    assert.ok(CHI_LANG_1427.commanders.some((c) => c.faction === DAI_VIET_LAMSON));
    assert.ok(CHI_LANG_1427.commanders.some((c) => c.faction === MING));
    assert.equal(CHI_LANG_1427.objectives.length, 2);
  });

  test('records Lam Son as the historical victor', () => {
    assert.equal(CHI_LANG_1427.historicalOutcome.victor, DAI_VIET_LAMSON);
  });

  test('the initial state is valid', () => {
    assert.deepEqual(checkInvariants(createInitialState(CHI_LANG_1427, 'seed')), []);
  });

  test('every unit starts on the map', () => {
    // The validator caught a unit at x=12100 on a 12000m map while this
    // scenario was being written. Keeping the check explicit here means a
    // future edit to the unit layout fails loudly rather than subtly.
    const w = CHI_LANG_1427.terrain.widthCells * CHI_LANG_1427.terrain.cellSizeM;
    const h = CHI_LANG_1427.terrain.heightCells * CHI_LANG_1427.terrain.cellSizeM;
    for (const u of CHI_LANG_1427.initialUnits) {
      assert.ok(
        u.position.x >= 0 && u.position.x <= w && u.position.y >= 0 && u.position.y <= h,
        `${u.id} starts off the map at (${u.position.x}, ${u.position.y})`,
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* Historical honesty (§4, §87)                                        */
/* ------------------------------------------------------------------ */

describe('historical honesty', () => {
  test('force sizes stay UNKNOWN — the sources say so explicitly', () => {
    for (const force of CHI_LANG_1427.historicalForces) {
      assert.equal(
        force.historicalSize.quantity.kind,
        'UNKNOWN',
        `force size for ${force.faction} must remain UNKNOWN`,
      );
      assert.notEqual(force.historicalSize.status, 'VERIFIED_FACT');
    }
  });

  test('casualties are recorded as DISPUTED, not averaged into false precision', () => {
    const casualties = CHI_LANG_1427.historicalOutcome.casualties ?? [];
    assert.ok(casualties.length > 0);
    for (const c of casualties) {
      assert.equal(
        c.figure.quantity.kind,
        'DISPUTED',
        'a 70,000-90,000 range against a disputed total must be carried as DISPUTED',
      );
      assert.notEqual(c.figure.status, 'VERIFIED_FACT');
    }
  });

  test('no phase claims VERIFIED_FACT without a source', () => {
    for (const p of CHI_LANG_1427.historicalPhases) {
      if (p.status === 'VERIFIED_FACT') {
        assert.ok(p.sources.length > 0, `phase ${p.id} claims fact without a source`);
      }
    }
  });

  test('commander notes are interpretations, not established fact', () => {
    for (const c of CHI_LANG_1427.commanders) {
      if (c.historicalNote) {
        assert.notEqual(c.historicalNote.status, 'VERIFIED_FACT');
        assert.ok(c.historicalNote.sources.length > 0);
      }
    }
  });

  test('the map and the terrain numbers are declared as assumptions', () => {
    const joined = CHI_LANG_1427.gameplayAssumptions.join(' ').toLowerCase();
    assert.match(joined, /schematic/);
    assert.match(joined, /terrain effect|multipliers/);
    assert.match(joined, /commander ratings/);
    assert.ok(CHI_LANG_1427.gameplayAssumptions.length >= 5);
  });

  test('the objective matches its own description', () => {
    // The lesson from Bach Dang, where "break out to sea" was expressed as an
    // attrition condition and the AI dutifully fought instead of running.
    const force = CHI_LANG_1427.objectives.find((o) => o.id === 'ming-force-the-pass')!;
    assert.match(force.description, /force the pass|continue/i);
    assert.equal(force.condition.kind, 'ESCAPE');
  });
});

/* ------------------------------------------------------------------ */
/* The terrain mechanic must decide this battle                        */
/* ------------------------------------------------------------------ */

describe('terrain is the decisive mechanic (GAP-02 closed)', () => {
  test('the scenario declares terrain effects', () => {
    assert.ok(CHI_LANG_1427.mechanics.terrainEffects, 'terrain effects must be declared');
    assert.ok(CHI_LANG_1427.mechanics.terrainEffects!.MARSH);
  });

  test('cavalry is crippled in marsh — the reversal the battle turns on', () => {
    const cav = CHI_LANG_1427.initialUnits.find((u) => u.kind === 'CAVALRY')!;

    const onPlain = { ...cav, position: { x: 9000, y: 2000 } };
    const inMarsh = { ...cav, position: { x: 6000, y: 2200 } };

    assert.equal(terrainAtPosition(CHI_LANG_1427.terrain, inMarsh.position)?.kind, 'MARSH');

    const plainPower = combatPower(onPlain, CHI_LANG_1427);
    const marshPower = combatPower(inMarsh, CHI_LANG_1427);

    assert.ok(
      marshPower < plainPower * 0.5,
      `cavalry must lose most of its effectiveness in marsh (plain=${plainPower.toFixed(0)}, marsh=${marshPower.toFixed(0)})`,
    );
  });

  test('infantry is far less hampered by marsh than cavalry', () => {
    const cav = CHI_LANG_1427.initialUnits.find((u) => u.kind === 'CAVALRY')!;
    const inf = CHI_LANG_1427.initialUnits.find(
      (u) => u.kind === 'INFANTRY' && u.faction === MING,
    )!;
    const at = { x: 6000, y: 2200 };

    const cavRatio =
      combatPower({ ...cav, position: at }, CHI_LANG_1427) /
      combatPower({ ...cav, position: { x: 9000, y: 2000 } }, CHI_LANG_1427);
    const infRatio =
      combatPower({ ...inf, position: at }, CHI_LANG_1427) /
      combatPower({ ...inf, position: { x: 9000, y: 2000 } }, CHI_LANG_1427);

    assert.ok(
      infRatio > cavRatio,
      `foot must suffer less than horse in marsh (infantry ${infRatio.toFixed(2)}, cavalry ${cavRatio.toFixed(2)})`,
    );
  });

  test('the marsh is avoidable — there is firm ground through the waist', () => {
    // A trap the column cannot route around is a toll, not a trap. The whole
    // decision for the attacker is whether to take the firm lane, which runs
    // under the flanking high ground.
    const firm: string[] = [];
    for (let y = 200; y < 4000; y += 200) {
      const cell = terrainAtPosition(CHI_LANG_1427.terrain, { x: 6000, y });
      if (cell && (cell.kind === 'PLAIN' || cell.kind === 'FOREST')) firm.push(cell.kind);
    }
    assert.ok(firm.length > 0, 'there must be a route through the waist that is not marsh');
  });

  test('the route taken determines how much marsh the column crosses', () => {
    // The mechanic is exposure to bad ground, so that is what this asserts.
    //
    // An earlier version of this test compared final strength between lanes and
    // was rightly unstable: units start spread across the valley and a straight
    // march keeps most of them near their own latitude whatever destination is
    // named, so the strength difference was noise. What IS reliably true, and
    // is the thing the mechanic actually does, is that a southern route spends
    // far longer in the marsh than a northern one.
    const marshTicks = (laneY: number): number => {
      let s = createInitialState(CHI_LANG_1427, 'lane');
      let ticks = 0;
      for (let i = 0; i < 250 && s.outcome.kind === 'ONGOING'; i++) {
        const commands: Command[] = s.units
          .filter((u) => u.faction === MING && canAct(u))
          .map((u) => ({ kind: 'MOVE' as const, unitId: u.id, to: { x: 1000, y: laneY } }));
        s = step(s, commands, CHI_LANG_1427);
        for (const u of s.units) {
          if (u.faction !== MING || !canAct(u)) continue;
          if (terrainAtPosition(CHI_LANG_1427.terrain, u.position)?.kind === 'MARSH') ticks++;
        }
      }
      return ticks;
    };

    const north = marshTicks(1500);
    const south = marshTicks(2400);

    assert.ok(
      south > north * 2,
      `the southern route must wade far more marsh (north=${north}, south=${south})`,
    );
  });

  test('removing terrain effects changes the battle', () => {
    // Direct proof the mechanic is load-bearing rather than cosmetic.
    // Build the mechanics without terrainEffects rather than setting it to
    // undefined: exactOptionalPropertyTypes distinguishes "absent" from
    // "explicitly undefined", and absent is what a scenario without terrain
    // effects actually looks like.
    const { terrainEffects: _omitted, ...mechanicsWithoutTerrain } = CHI_LANG_1427.mechanics;
    const withoutTerrain: typeof CHI_LANG_1427 = {
      ...CHI_LANG_1427,
      mechanics: mechanicsWithoutTerrain,
    };

    const run = (scenario: typeof CHI_LANG_1427): number => {
      let s = createInitialState(scenario, 'terrain-off');
      for (let i = 0; i < 250 && s.outcome.kind === 'ONGOING'; i++) {
        const commands: Command[] = s.units
          .filter((u) => u.faction === MING && canAct(u))
          .map((u) => ({ kind: 'MOVE' as const, unitId: u.id, to: { x: 1000, y: 2200 } }));
        s = step(s, commands, scenario);
      }
      return s.units.filter((u) => u.faction === MING).reduce((sum, u) => sum + u.strength, 0);
    };

    assert.ok(
      run(CHI_LANG_1427) < run(withoutTerrain),
      'the column must fare better when terrain does not bite',
    );
  });
});

/* ------------------------------------------------------------------ */
/* Engine behaviour on a second, structurally different battle         */
/* ------------------------------------------------------------------ */

describe('the engine handles a battle unlike the first (§72)', () => {
  test('no tide and no obstacle field is a valid configuration', () => {
    assert.equal(CHI_LANG_1427.mechanics.tide, undefined);
    assert.equal(CHI_LANG_1427.mechanics.obstacleFields, undefined);
    assert.doesNotThrow(() => assertScenarioValid(CHI_LANG_1427));
  });

  test('invariants hold at every tick of a full battle', () => {
    let s = createInitialState(CHI_LANG_1427, 'invariants');
    const bounds = {
      width: CHI_LANG_1427.terrain.widthCells * CHI_LANG_1427.terrain.cellSizeM,
      height: CHI_LANG_1427.terrain.heightCells * CHI_LANG_1427.terrain.cellSizeM,
    };

    for (let i = 0; i < 150 && s.outcome.kind === 'ONGOING'; i++) {
      const commands: Command[] = s.units
        .filter((u) => u.faction === MING && canAct(u))
        .map((u) => ({ kind: 'MOVE' as const, unitId: u.id, to: { x: 1000, y: u.position.y } }));
      s = step(s, commands, CHI_LANG_1427);
      assert.doesNotThrow(
        () => assertInvariants(s, 'STRICT', { bounds }),
        `invariant violated at tick ${s.tick}`,
      );
    }
  });

  test('the battle reaches a conclusion', () => {
    let s = createInitialState(CHI_LANG_1427, 'conclusion');
    for (let i = 0; i < 250 && s.outcome.kind === 'ONGOING'; i++) {
      const commands: Command[] = s.units
        .filter((u) => u.faction === MING && canAct(u))
        .map((u) => ({ kind: 'MOVE' as const, unitId: u.id, to: { x: 1000, y: u.position.y } }));
      s = step(s, commands, CHI_LANG_1427);
    }
    assert.notEqual(s.outcome.kind, 'ONGOING');
  });

  test('it is deterministic like the first battle', () => {
    const run = (): BattleState => {
      let s = createInitialState(CHI_LANG_1427, 'determinism');
      for (let i = 0; i < 100 && s.outcome.kind === 'ONGOING'; i++) {
        const commands: Command[] = s.units
          .filter((u) => u.faction === MING && canAct(u))
          .map((u) => ({ kind: 'MOVE' as const, unitId: u.id, to: { x: 1000, y: 2000 } }));
        s = step(s, commands, CHI_LANG_1427);
      }
      return s;
    };
    const a = run();
    const b = run();
    assert.equal(a.rngState, b.rngState);
    assert.deepEqual(
      a.units.map((u) => [u.id, u.strength, u.status]),
      b.units.map((u) => [u.id, u.strength, u.status]),
    );
  });

  test('adding this battle did not change the first one', () => {
    // The extensibility claim cuts both ways: a new scenario must not perturb
    // an existing one. Bach Dang declares no terrain effects, so the new
    // capability must be inert there.
    assert.equal(BACH_DANG_1288.mechanics.terrainEffects, undefined);

    let s = createInitialState(BACH_DANG_1288, 'unchanged');
    for (let i = 0; i < 40; i++) s = step(s, [], BACH_DANG_1288);
    assert.deepEqual(checkInvariants(s), []);
  });

  test('the two battles use genuinely different mechanics', () => {
    // If the second battle were a reskin of the first it would prove nothing
    // about extensibility.
    assert.ok(BACH_DANG_1288.mechanics.tide, 'Bach Dang turns on the tide');
    assert.ok(BACH_DANG_1288.mechanics.obstacleFields?.length, 'and on obstacles');
    assert.equal(CHI_LANG_1427.mechanics.tide, undefined, 'Chi Lang has no tide');
    assert.ok(CHI_LANG_1427.mechanics.terrainEffects, 'Chi Lang turns on terrain');

    const bdKinds = new Set(BACH_DANG_1288.initialUnits.map((u) => u.kind));
    const clKinds = new Set(CHI_LANG_1427.initialUnits.map((u) => u.kind));
    assert.ok(bdKinds.has('HEAVY_SHIP'));
    assert.ok(clKinds.has('CAVALRY'));
    assert.equal(clKinds.has('HEAVY_SHIP'), false, 'no ships in a mountain pass');
  });
});
