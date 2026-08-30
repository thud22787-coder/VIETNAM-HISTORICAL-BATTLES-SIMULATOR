import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  startCampaign,
  recordResult,
  currentStep,
  isComplete,
  isDiverged,
  strengthMultiplier,
  applyCarryForward,
  summariseCampaign,
  validateCampaign,
  campaignErrors,
  assertCampaignValid,
  CampaignError,
  type Campaign,
  type CampaignState,
} from '../src/campaign/campaign.ts';
import { RESISTANCE_CAMPAIGN } from '../src/campaign/campaigns/resistance.ts';
import { BACH_DANG_1288, DAI_VIET, YUAN } from '../src/scenario/battles/bach-dang-1288.ts';
import { CHI_LANG_1427, DAI_VIET_LAMSON, MING } from '../src/scenario/battles/chi-lang-1427.ts';
import { assertScenarioValid } from '../src/scenario/validate.ts';
import { factionId, type FactionId } from '../src/domain/types.ts';

const KNOWN = [BACH_DANG_1288.id, CHI_LANG_1427.id];

/** Record a result for the current step. */
const win = (
  state: CampaignState,
  scenario: typeof BACH_DANG_1288 | typeof CHI_LANG_1427,
  victor: FactionId | null,
  surviving: Record<string, number> = {},
): CampaignState =>
  recordResult(RESISTANCE_CAMPAIGN, state, scenario, {
    battleId: scenario.id,
    victor,
    reason: 'test',
    survivingFraction: surviving,
    seed: 'test-seed',
    simulationVersion: '0.5.0',
  });

/* ------------------------------------------------------------------ */

describe('campaign structure (§36)', () => {
  test('the shipped campaign validates', () => {
    assert.deepEqual(campaignErrors(validateCampaign(RESISTANCE_CAMPAIGN, KNOWN)), []);
    assert.doesNotThrow(() => assertCampaignValid(RESISTANCE_CAMPAIGN, KNOWN));
  });

  test('it references only battles that exist', () => {
    for (const step of RESISTANCE_CAMPAIGN.steps) {
      assert.ok(KNOWN.includes(step.battleId), `unknown battle ${step.battleId}`);
    }
  });

  test('a campaign naming a battle that does not exist is rejected', () => {
    const broken: Campaign = {
      ...RESISTANCE_CAMPAIGN,
      steps: [{ ...RESISTANCE_CAMPAIGN.steps[0]!, battleId: 'NO_SUCH_BATTLE' }],
    };
    assert.ok(campaignErrors(validateCampaign(broken, KNOWN)).some((e) => e.code === 'UNKNOWN_BATTLE'));
  });

  test('it walks through its steps and completes', () => {
    let s = startCampaign(RESISTANCE_CAMPAIGN);
    assert.equal(currentStep(RESISTANCE_CAMPAIGN, s)?.battleId, BACH_DANG_1288.id);
    assert.equal(isComplete(RESISTANCE_CAMPAIGN, s), false);

    s = win(s, BACH_DANG_1288, DAI_VIET);
    assert.equal(currentStep(RESISTANCE_CAMPAIGN, s)?.battleId, CHI_LANG_1427.id);

    s = win(s, CHI_LANG_1427, DAI_VIET_LAMSON);
    assert.equal(isComplete(RESISTANCE_CAMPAIGN, s), true);
    assert.equal(currentStep(RESISTANCE_CAMPAIGN, s), null);
    assert.equal(s.results.length, 2);
  });

  test('recording is pure — the input state is unchanged', () => {
    const s = startCampaign(RESISTANCE_CAMPAIGN);
    const before = JSON.stringify(s);
    win(s, BACH_DANG_1288, DAI_VIET);
    assert.equal(JSON.stringify(s), before);
  });
});

describe('divergence is permanent (§37)', () => {
  test('matching history keeps the campaign historical', () => {
    let s = startCampaign(RESISTANCE_CAMPAIGN);
    s = win(s, BACH_DANG_1288, DAI_VIET);
    s = win(s, CHI_LANG_1427, DAI_VIET_LAMSON);

    assert.equal(isDiverged(s.divergence), false);
    assert.equal(summariseCampaign(RESISTANCE_CAMPAIGN, s).label, 'HISTORICAL CAMPAIGN');
  });

  test('a result that contradicts the record diverges the campaign', () => {
    let s = startCampaign(RESISTANCE_CAMPAIGN);
    s = win(s, BACH_DANG_1288, YUAN); // history records Dai Viet

    assert.equal(s.divergence.kind, 'DIVERGED');
    if (s.divergence.kind !== 'DIVERGED') throw new Error('unreachable');
    assert.equal(s.divergence.atBattleId, BACH_DANG_1288.id);
    assert.equal(s.divergence.historicalVictor, DAI_VIET);
    assert.equal(s.divergence.actualVictor, YUAN);
    assert.equal(s.divergence.atStep, 0);
  });

  test('an undecided battle also counts as divergence', () => {
    // History records a decisive result. A campaign that fails to reach one has
    // not reproduced it, and saying otherwise would be generous to the point of
    // dishonesty.
    let s = startCampaign(RESISTANCE_CAMPAIGN);
    s = win(s, BACH_DANG_1288, null);
    assert.equal(isDiverged(s.divergence), true);
  });

  test('winning the NEXT battle correctly does not undo the divergence', () => {
    // The whole point. A player who lost the historical line does not get it
    // back by performing well afterwards — the campaign they actually played
    // still went the other way.
    let s = startCampaign(RESISTANCE_CAMPAIGN);
    s = win(s, BACH_DANG_1288, YUAN);
    s = win(s, CHI_LANG_1427, DAI_VIET_LAMSON);

    assert.equal(isDiverged(s.divergence), true);
    if (s.divergence.kind !== 'DIVERGED') throw new Error('unreachable');
    assert.equal(
      s.divergence.atBattleId,
      BACH_DANG_1288.id,
      'the divergence must still point at the battle where it happened',
    );
  });

  test('a diverged campaign is relabelled, permanently', () => {
    let s = startCampaign(RESISTANCE_CAMPAIGN);
    s = win(s, BACH_DANG_1288, YUAN);

    const summary = summariseCampaign(RESISTANCE_CAMPAIGN, s);
    assert.equal(summary.label, 'WHAT-IF CAMPAIGN');
    assert.equal(summary.followsHistory, false);

    s = win(s, CHI_LANG_1427, DAI_VIET_LAMSON);
    assert.equal(summariseCampaign(RESISTANCE_CAMPAIGN, s).label, 'WHAT-IF CAMPAIGN');
  });

  test('the summary never claims to know what would really have happened (§3)', () => {
    let s = startCampaign(RESISTANCE_CAMPAIGN);
    s = win(s, BACH_DANG_1288, YUAN);
    const { summary } = summariseCampaign(RESISTANCE_CAMPAIGN, s);

    assert.match(summary, /simulation|model/i);
    assert.match(summary, /not an account of what would have happened/i);
  });

  test('there is no API for resetting divergence', () => {
    // Enforced by the module's surface: the only route to DIVERGED is through
    // recordResult, and nothing sets it back. This asserts the surface, since a
    // future "helpful" reset function is exactly the regression to fear.
    const s = win(startCampaign(RESISTANCE_CAMPAIGN), BACH_DANG_1288, YUAN);
    const keys = Object.keys(s);
    assert.deepEqual(
      keys.filter((k) => /reset|clear|restore/i.test(k)),
      [],
      'campaign state must expose no way to un-diverge',
    );
  });
});

describe('guards against mismatched state', () => {
  test('a result for the wrong battle is refused', () => {
    const s = startCampaign(RESISTANCE_CAMPAIGN);
    assert.throws(() => win(s, CHI_LANG_1427, DAI_VIET_LAMSON), CampaignError);
  });

  test('a state from another campaign is refused', () => {
    const s = { ...startCampaign(RESISTANCE_CAMPAIGN), campaignId: 'OTHER' };
    assert.throws(() => win(s, BACH_DANG_1288, DAI_VIET), CampaignError);
  });

  test('a state from another campaign version is refused', () => {
    // Same reasoning as INV-17: a result is only meaningful against the content
    // version it was produced from.
    const s = { ...startCampaign(RESISTANCE_CAMPAIGN), campaignVersion: 'v0' };
    assert.throws(() => win(s, BACH_DANG_1288, DAI_VIET), CampaignError);
  });

  test('recording past the end is refused', () => {
    let s = startCampaign(RESISTANCE_CAMPAIGN);
    s = win(s, BACH_DANG_1288, DAI_VIET);
    s = win(s, CHI_LANG_1427, DAI_VIET_LAMSON);
    assert.throws(() => win(s, BACH_DANG_1288, DAI_VIET), CampaignError);
  });
});

describe('carrying results forward', () => {
  /** A synthetic operational campaign, since the shipped one deliberately carries nothing. */
  const OPERATIONAL: Campaign = {
    ...RESISTANCE_CAMPAIGN,
    id: 'TEST_OPERATIONAL',
    steps: [
      { ...RESISTANCE_CAMPAIGN.steps[0]! },
      {
        ...RESISTANCE_CAMPAIGN.steps[1]!,
        carryForward: {
          lossPersistence: 1,
          minStrengthFraction: 0.4,
          note: 'test: full persistence',
        },
      },
    ],
  };

  const advance = (surviving: Record<string, number>): CampaignState =>
    recordResult(OPERATIONAL, startCampaign(OPERATIONAL), BACH_DANG_1288, {
      battleId: BACH_DANG_1288.id,
      victor: DAI_VIET,
      reason: 'test',
      survivingFraction: surviving,
      seed: 's',
      simulationVersion: '0.5.0',
    });

  test('losses reduce the next battle when persistence is on', () => {
    const s = advance({ [MING]: 0.6 });
    assert.equal(strengthMultiplier(OPERATIONAL, s, MING), 0.6);
  });

  test('the floor stops a bad result making the next battle unwinnable', () => {
    // A campaign that can become impossible two steps in is a worse simulation,
    // not a more realistic one.
    const s = advance({ [MING]: 0.05 });
    assert.equal(strengthMultiplier(OPERATIONAL, s, MING), 0.4);
  });

  test('a faction with no recorded result is unaffected', () => {
    const s = advance({ [MING]: 0.5 });
    assert.equal(strengthMultiplier(OPERATIONAL, s, factionId('nobody')), 1);
  });

  test('applying carry-forward never mutates the original scenario', () => {
    // Same rule as what-if (§26, §81): a second playthrough must not start from
    // the first one's damage.
    const before = JSON.stringify(CHI_LANG_1427.initialUnits.map((u) => u.strength));
    const s = advance({ [MING]: 0.5 });
    applyCarryForward(OPERATIONAL, s, CHI_LANG_1427);
    assert.equal(JSON.stringify(CHI_LANG_1427.initialUnits.map((u) => u.strength)), before);
  });

  test('the derived scenario is re-identified and still valid', () => {
    const s = advance({ [MING]: 0.5 });
    const derived = applyCarryForward(OPERATIONAL, s, CHI_LANG_1427);

    assert.match(derived.id, /CAMPAIGN/);
    assert.match(derived.version, /campaign/);
    assert.ok(derived.gameplayAssumptions.some((a) => a.startsWith('CAMPAIGN:')));
    assert.doesNotThrow(() => assertScenarioValid(derived));
  });

  test('weakened units are actually weaker', () => {
    const s = advance({ [MING]: 0.5 });
    const derived = applyCarryForward(OPERATIONAL, s, CHI_LANG_1427);

    const before = CHI_LANG_1427.initialUnits
      .filter((u) => u.faction === MING)
      .reduce((sum, u) => sum + u.strength, 0);
    const after = derived.initialUnits
      .filter((u) => u.faction === MING)
      .reduce((sum, u) => sum + u.strength, 0);

    assert.ok(after < before, `${after} should be less than ${before}`);
  });

  test('with nothing to carry, the scenario is returned untouched', () => {
    const s = startCampaign(OPERATIONAL);
    assert.equal(applyCarryForward(OPERATIONAL, s, BACH_DANG_1288), BACH_DANG_1288);
  });
});

describe('the shipped campaign is honest about what it is (§43, §85)', () => {
  test('it carries nothing forward, because it cannot defensibly', () => {
    // Bach Dang 1288 and Chi Lang 1427 are 139 years apart. Modelling attrition
    // across that gap would invent a continuity the history does not have.
    for (const step of RESISTANCE_CAMPAIGN.steps) {
      assert.equal(
        step.carryForward.lossPersistence,
        0,
        `step ${step.battleId} carries losses across more than a century`,
      );
    }
  });

  test('it says plainly that it is thematic rather than operational', () => {
    const joined = RESISTANCE_CAMPAIGN.gameplayAssumptions.join(' ').toLowerCase();
    assert.match(joined, /thematic/);
    assert.match(joined, /139 years|not operational/);
    assert.match(joined, /nothing carries forward/);
  });

  test('the briefing does not imply a single military sequence', () => {
    assert.match(
      RESISTANCE_CAMPAIGN.briefing,
      /not one campaign in the military sense|no army marched/i,
    );
  });

  test('every step links with a sourced, non-fact status', () => {
    for (const step of RESISTANCE_CAMPAIGN.steps) {
      assert.notEqual(
        step.linkStatus,
        'VERIFIED_FACT',
        'the connection between these battles is a framing, not an established fact',
      );
      assert.ok(step.linkSources.length > 0);
    }
  });
});

describe('campaign validation catches dishonesty (§94)', () => {
  test('a fact-status link without sources is an error', () => {
    const broken: Campaign = {
      ...RESISTANCE_CAMPAIGN,
      steps: [
        { ...RESISTANCE_CAMPAIGN.steps[0]!, linkStatus: 'VERIFIED_FACT', linkSources: [] },
      ],
    };
    assert.ok(
      campaignErrors(validateCampaign(broken, KNOWN)).some(
        (e) => e.code === 'LINK_FACT_WITHOUT_SOURCE',
      ),
    );
  });

  test('carrying losses forward without explanation is flagged', () => {
    const broken: Campaign = {
      ...RESISTANCE_CAMPAIGN,
      steps: [
        {
          ...RESISTANCE_CAMPAIGN.steps[0]!,
          carryForward: { lossPersistence: 0.5, minStrengthFraction: 0.5, note: '' },
        },
      ],
    };
    assert.ok(
      validateCampaign(broken, KNOWN).some((p) => p.code === 'UNEXPLAINED_CARRY_FORWARD'),
    );
  });

  test('out-of-range carry-forward values are errors', () => {
    const broken: Campaign = {
      ...RESISTANCE_CAMPAIGN,
      steps: [
        {
          ...RESISTANCE_CAMPAIGN.steps[0]!,
          carryForward: { lossPersistence: 2, minStrengthFraction: 0, note: 'x' },
        },
      ],
    };
    const codes = campaignErrors(validateCampaign(broken, KNOWN)).map((e) => e.code);
    assert.ok(codes.includes('INVALID_LOSS_PERSISTENCE'));
    assert.ok(codes.includes('INVALID_MIN_STRENGTH'));
  });

  test('a campaign with no sources is an error', () => {
    const broken: Campaign = { ...RESISTANCE_CAMPAIGN, sources: [] };
    assert.ok(campaignErrors(validateCampaign(broken, KNOWN)).some((e) => e.code === 'NO_SOURCES'));
  });
});
