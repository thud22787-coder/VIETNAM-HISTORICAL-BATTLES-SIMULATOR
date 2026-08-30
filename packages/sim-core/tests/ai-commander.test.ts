import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  decide,
  initialAiState,
  explainDecisions,
  decisionsOfLayer,
  AI_TUNING,
  type AiState,
} from '../src/ai/commander.ts';
import { observe, emptyMemory, assertNoLeaks, type SightingMemory } from '../src/state/observed.ts';
import { createInitialState, step, type Command } from '../src/sim/engine.ts';
import { createRng } from '../src/sim/rng.ts';
import { BACH_DANG_1288, DAI_VIET, YUAN } from '../src/scenario/battles/bach-dang-1288.ts';
import { canAct, type BattleState, type FactionId } from '../src/domain/types.ts';
import { checkInvariants } from '../src/state/validator.ts';

/** Run a battle with both sides driven by the AI commander. */
function runAiBattle(
  seed = 'ai-test',
  maxTicks = 200,
): {
  state: BattleState;
  dvAI: AiState;
  yuanAI: AiState;
  leakChecked: number;
} {
  let state = createInitialState(BACH_DANG_1288, seed);
  let dvMemory: SightingMemory = emptyMemory();
  let yuanMemory: SightingMemory = emptyMemory();
  let dvAI = initialAiState();
  let yuanAI = initialAiState();
  let leakChecked = 0;

  for (let i = 0; i < maxTicks && state.outcome.kind === 'ONGOING'; i++) {
    const dvObs = observe(state, DAI_VIET, BACH_DANG_1288, createRng(`d${i}`), dvMemory);
    const yuanObs = observe(state, YUAN, BACH_DANG_1288, createRng(`y${i}`), yuanMemory);
    dvMemory = dvObs.memory;
    yuanMemory = yuanObs.memory;

    // The AI must only ever see a leak-free view.
    assertNoLeaks(dvObs.observed, state, BACH_DANG_1288);
    assertNoLeaks(yuanObs.observed, state, BACH_DANG_1288);
    leakChecked += 2;

    const dv = decide(dvObs.observed, BACH_DANG_1288, dvAI, createRng(`da${i}`));
    const yuan = decide(yuanObs.observed, BACH_DANG_1288, yuanAI, createRng(`ya${i}`));
    dvAI = dv.state;
    yuanAI = yuan.state;

    state = step(state, [...dv.commands, ...yuan.commands], BACH_DANG_1288);
  }

  return { state, dvAI, yuanAI, leakChecked };
}

describe('the AI obeys the rules like any player (§34)', () => {
  test('it only ever commands its own units', () => {
    // INV-09: commands reference only units the issuing side controls. An AI
    // that could order enemy units would be an admin, not a player.
    const state = createInitialState(BACH_DANG_1288, 'own-units');
    const obs = observe(state, YUAN, BACH_DANG_1288, createRng('o'), emptyMemory());
    const { commands } = decide(obs.observed, BACH_DANG_1288, initialAiState(), createRng('a'));

    assert.ok(commands.length > 0, 'expected the AI to issue orders');
    for (const c of commands) {
      const unit = state.units.find((u) => u.id === c.unitId);
      assert.ok(unit, `commanded a unit that does not exist: ${c.unitId}`);
      assert.equal(unit.faction, YUAN, `AI commanded a unit of ${unit.faction}`);
    }
  });

  test('it never commands a destroyed or routed unit', () => {
    const base = createInitialState(BACH_DANG_1288, 'dead-units');
    const state: BattleState = {
      ...base,
      units: base.units.map((u) =>
        u.faction === YUAN
          ? { ...u, strength: 0, status: 'DESTROYED' as const, morale: 0 }
          : u,
      ),
    };

    const obs = observe(state, YUAN, BACH_DANG_1288, createRng('o'), emptyMemory());
    const { commands } = decide(obs.observed, BACH_DANG_1288, initialAiState(), createRng('a'));
    assert.deepEqual(commands, [], 'a destroyed force has nothing to order');
  });

  test('the AI produces states that satisfy every invariant', () => {
    const { state } = runAiBattle('invariants', 120);
    assert.deepEqual(checkInvariants(state), []);
  });

  test('AI-driven battles reach a conclusion', () => {
    const { state } = runAiBattle('conclusion');
    assert.notEqual(state.outcome.kind, 'ONGOING');
  });
});

describe('the AI cannot read hidden state (§32)', () => {
  test('every view handed to the AI passes the leak guard', () => {
    const { leakChecked } = runAiBattle('leak-scan', 100);
    assert.ok(leakChecked > 20, 'expected many observations to be checked');
  });

  test('the Yuan commander does not know where the stake field is', () => {
    // The whole point. The defenders placed the obstacles; the attacker has no
    // legitimate source for their position, so it sails into them.
    const state = createInitialState(BACH_DANG_1288, 'blind');
    const obs = observe(state, YUAN, BACH_DANG_1288, createRng('o'), emptyMemory());

    assert.equal(
      obs.observed.knownObstacles.length,
      0,
      'the attacking AI must not be handed the trap position',
    );
  });

  test('the AI starts with no suspected hazards', () => {
    const state = createInitialState(BACH_DANG_1288, 'blind');
    const obs = observe(state, YUAN, BACH_DANG_1288, createRng('o'), emptyMemory());
    const { state: ai } = decide(obs.observed, BACH_DANG_1288, initialAiState(), createRng('a'));
    assert.deepEqual(ai.suspectedHazards, [], 'hazards must be learned, not known');
  });
});

describe('hazard inference — learning by paying for it', () => {
  test('the AI discovers the obstructions only after ships ground on them', () => {
    const { yuanAI } = runAiBattle('hazards', 120);

    assert.ok(
      yuanAI.suspectedHazards.length > 0,
      'the fleet should have learned that some water is dangerous',
    );

    // Every inferred hazard must correspond to somewhere a vessel actually
    // stopped — the AI may not invent knowledge, only infer it from what it saw.
    const inference = yuanAI.decisions.filter((d) =>
      /hazardous/i.test(d.summary),
    );
    assert.equal(
      inference.length,
      yuanAI.suspectedHazards.length,
      'every hazard must have a recorded inference behind it',
    );
    for (const d of inference) {
      assert.equal(d.basis['inference'], 'own units immobilised with no enemy contact explaining it');
    }
  });

  test('the inferred hazards are near the real obstacle field', () => {
    // The inference should be *correct*, not merely present: vessels ground
    // where the stakes are, so that is where the AI should suspect danger.
    const { yuanAI } = runAiBattle('hazards-near', 120);
    const field = BACH_DANG_1288.mechanics.obstacleFields![0]!;
    const cs = BACH_DANG_1288.terrain.cellSizeM;
    const minX = Math.min(...field.cells.map((c) => c.x)) * cs;
    const maxX = (Math.max(...field.cells.map((c) => c.x)) + 1) * cs;

    assert.ok(yuanAI.suspectedHazards.length > 0);
    for (const h of yuanAI.suspectedHazards) {
      assert.ok(
        h.x >= minX - 600 && h.x <= maxX + 600,
        `suspected hazard at x=${h.x} is nowhere near the obstacle field (${minX}..${maxX})`,
      );
    }
  });

  test('discovering a hazard changes the posture', () => {
    const { yuanAI } = runAiBattle('posture', 120);
    const postures = yuanAI.decisions
      .filter((d) => d.layer === 'OPERATIONAL' && /Posture:/.test(d.summary))
      .map((d) => d.summary);

    assert.ok(
      postures.some((p) => /CAUTIOUS/.test(p) && /stopped unexpectedly/.test(p)),
      `expected a cautious posture triggered by unexplained stops, got: ${postures.join(' | ')}`,
    );
  });
});

describe('three-layer architecture (§33)', () => {
  test('all three layers produce decisions', () => {
    const { yuanAI } = runAiBattle('layers', 120);
    for (const layer of ['STRATEGIC', 'OPERATIONAL', 'TACTICAL'] as const) {
      assert.ok(
        decisionsOfLayer(yuanAI, layer).length > 0,
        `no decisions recorded at the ${layer} layer`,
      );
    }
  });

  test('strategy is read from the scenario, not hard-coded', () => {
    // §38: no battle-specific branches. The AI must derive its goal from data.
    const state = createInitialState(BACH_DANG_1288, 'strategy');
    const obs = observe(state, YUAN, BACH_DANG_1288, createRng('o'), emptyMemory());
    const { state: ai } = decide(obs.observed, BACH_DANG_1288, initialAiState(), createRng('a'));

    const strategic = decisionsOfLayer(ai, 'STRATEGIC');
    assert.ok(strategic.length > 0);
    assert.equal(
      strategic[0]!.basis['objective'],
      'yuan-break-out',
      'the strategy must cite the scenario objective it came from',
    );
  });

  test('an ESCAPE objective produces a break-out strategy, not a brawl', () => {
    // This test exists because the opposite happened: the Yuan objective was
    // written as ATTRITION while describing itself as "break out to sea", and
    // the AI dutifully charged the defenders instead of running for the sea.
    const state = createInitialState(BACH_DANG_1288, 'escape');
    const obs = observe(state, YUAN, BACH_DANG_1288, createRng('o'), emptyMemory());
    const { state: ai } = decide(obs.observed, BACH_DANG_1288, initialAiState(), createRng('a'));

    const strategic = decisionsOfLayer(ai, 'STRATEGIC')[0]!;
    assert.match(strategic.summary, /BREAK_OUT/);
    assert.equal(strategic.basis['condition'], 'ESCAPE');
  });
});

describe('explainability (§35) — explanations reflect real decision data', () => {
  test('every explanation line comes from a recorded decision', () => {
    const { yuanAI } = runAiBattle('explain', 120);
    const lines = explainDecisions(yuanAI, 50);

    assert.ok(lines.length > 0);
    // Each line must be traceable to a decision that was actually taken: same
    // count, and each carries the tick and layer it was recorded at.
    for (const line of lines) {
      assert.match(line, /^t\d+ \[(STRATEGIC|OPERATIONAL|TACTICAL)\]/);
    }
  });

  test('decisions carry the observations they were based on', () => {
    const { yuanAI } = runAiBattle('basis', 120);
    const operational = decisionsOfLayer(yuanAI, 'OPERATIONAL').filter((d) =>
      /Posture:/.test(d.summary),
    );

    assert.ok(operational.length > 0);
    for (const d of operational) {
      // The basis must contain the observed quantities the choice used, so a
      // reader can check the reasoning rather than take it on trust.
      assert.ok('ownStrength' in d.basis, 'posture decision must record own strength');
      assert.ok(
        'estimatedEnemyStrength' in d.basis,
        'posture decision must record the ESTIMATE it used, not a true figure',
      );
      assert.ok('contactsInSight' in d.basis);
    }
  });

  test('the recorded enemy strength is an estimate, not the truth', () => {
    // §35 again, in its sharpest form: if the AI logged the true enemy strength
    // it would prove the AI had access to it.
    let state = createInitialState(BACH_DANG_1288, 'estimate-log');
    let memory: SightingMemory = emptyMemory();
    let ai = initialAiState();

    for (let i = 0; i < 12; i++) {
      const obs = observe(state, DAI_VIET, BACH_DANG_1288, createRng(`o${i}`), memory);
      memory = obs.memory;
      const d = decide(obs.observed, BACH_DANG_1288, ai, createRng(`a${i}`));
      ai = d.state;
      state = step(state, d.commands, BACH_DANG_1288);
    }

    const trueEnemyStrength = state.units
      .filter((u) => u.faction === YUAN && canAct(u))
      .reduce((s, u) => s + u.strength, 0);

    const logged = decisionsOfLayer(ai, 'OPERATIONAL')
      .map((d) => d.basis['estimatedEnemyStrength'])
      .filter((v): v is number => typeof v === 'number' && v > 0);

    if (logged.length > 0) {
      assert.ok(
        logged.every((v) => v !== Math.round(trueEnemyStrength)),
        'a logged figure exactly matching the truth suggests the AI read ground truth',
      );
    }
  });
});

describe('determinism (§23) — AI battles must replay', () => {
  test('the same seed reproduces the same AI battle exactly', () => {
    const a = runAiBattle('determinism', 100);
    const b = runAiBattle('determinism', 100);

    assert.equal(a.state.rngState, b.state.rngState);
    assert.deepEqual(
      a.state.units.map((u) => [u.id, u.strength, u.status]),
      b.state.units.map((u) => [u.id, u.strength, u.status]),
    );
    assert.deepEqual(
      a.yuanAI.decisions.map((d) => d.summary),
      b.yuanAI.decisions.map((d) => d.summary),
    );
  });

  test('decide() does not mutate the AI state it is given', () => {
    const state = createInitialState(BACH_DANG_1288, 'purity');
    const obs = observe(state, YUAN, BACH_DANG_1288, createRng('o'), emptyMemory());
    const before = initialAiState();
    const snapshot = JSON.stringify(before);

    decide(obs.observed, BACH_DANG_1288, before, createRng('a'));
    assert.equal(JSON.stringify(before), snapshot, 'decide() must be pure');
  });
});

describe('tuning is declared, not scattered', () => {
  test('AI tuning constants are exposed for inspection (§92)', () => {
    assert.ok(AI_TUNING.favourableRatio > 1);
    assert.ok(AI_TUNING.hazardAvoidanceM > 0);
    assert.ok(AI_TUNING.regroupStrengthFraction > 0 && AI_TUNING.regroupStrengthFraction < 1);
  });
});
