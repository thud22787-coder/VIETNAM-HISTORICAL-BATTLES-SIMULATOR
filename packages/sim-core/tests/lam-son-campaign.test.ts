import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LAM_SON_CAMPAIGN } from '../src/campaign/campaigns/lam-son.ts';
import { RESISTANCE_CAMPAIGN } from '../src/campaign/campaigns/resistance.ts';
import {
  startCampaign,
  recordResult,
  strengthMultiplier,
  applyCarryForward,
  summariseCampaign,
  validateCampaign,
  campaignErrors,
  type CampaignState,
} from '../src/campaign/campaign.ts';
import { TOT_DONG_1426, LAM_SON, MING_FIELD } from '../src/scenario/battles/tot-dong-1426.ts';
import { CHI_LANG_1427, DAI_VIET_LAMSON, MING } from '../src/scenario/battles/chi-lang-1427.ts';
import { assertScenarioValid } from '../src/scenario/validate.ts';

const KNOWN = ['TOT_DONG_1426', 'CHI_LANG_1427', 'BACH_DANG_1288'];

/** Finish Tot Dong with the Ming reduced to `surviving` of their strength. */
function afterFirstBattle(surviving: number, victor = LAM_SON): CampaignState {
  return recordResult(LAM_SON_CAMPAIGN, startCampaign(LAM_SON_CAMPAIGN), TOT_DONG_1426, {
    battleId: 'TOT_DONG_1426',
    victor,
    reason: 'test',
    survivingFraction: { [LAM_SON]: 0.8, [MING_FIELD]: surviving },
    seed: 'test',
    simulationVersion: '0.5.0',
  });
}

describe('the operational campaign is structurally sound', () => {
  test('it validates', () => {
    assert.deepEqual(campaignErrors(validateCampaign(LAM_SON_CAMPAIGN, KNOWN)), []);
  });

  test('it runs the two battles in historical order', () => {
    assert.deepEqual(
      LAM_SON_CAMPAIGN.steps.map((s) => s.battleId),
      ['TOT_DONG_1426', 'CHI_LANG_1427'],
    );
  });
});

describe('carry-forward finally has real content to work against', () => {
  test('a worse first battle leaves the enemy weaker in the second', () => {
    // This is the gap the previous session recorded: the machinery existed but
    // only a synthetic fixture exercised it. Now real history does.
    const crushed = strengthMultiplier(LAM_SON_CAMPAIGN, afterFirstBattle(0.3), MING);
    const bruised = strengthMultiplier(LAM_SON_CAMPAIGN, afterFirstBattle(0.9), MING);

    assert.ok(
      crushed < bruised,
      `a heavier defeat must tell later (crushed=${crushed}, bruised=${bruised})`,
    );
  });

  test('it scales smoothly rather than switching on a threshold', () => {
    const points = [0.9, 0.7, 0.5, 0.3].map((s) =>
      strengthMultiplier(LAM_SON_CAMPAIGN, afterFirstBattle(s), MING),
    );
    for (let i = 1; i < points.length; i++) {
      assert.ok(points[i]! < points[i - 1]!, 'each worse result must carry further');
    }
  });

  test('the floor keeps the second battle winnable after a catastrophe', () => {
    // A campaign that can become impossible two steps in is a worse simulation,
    // not a more realistic one.
    const floor = LAM_SON_CAMPAIGN.steps[1]!.carryForward.minStrengthFraction;
    assert.equal(strengthMultiplier(LAM_SON_CAMPAIGN, afterFirstBattle(0.01), MING), floor);
  });

  test('Lam Son losses do NOT carry forward', () => {
    // They were recruiting and reinforcing through 1427; carrying their
    // casualties would get the direction of the campaign backwards.
    const s = afterFirstBattle(0.5);
    assert.equal(strengthMultiplier(LAM_SON_CAMPAIGN, s, DAI_VIET_LAMSON), 1);
  });

  test('the derived scenario is weaker, re-identified and still valid', () => {
    const s = afterFirstBattle(0.5);
    const derived = applyCarryForward(LAM_SON_CAMPAIGN, s, CHI_LANG_1427);

    const before = CHI_LANG_1427.initialUnits
      .filter((u) => u.faction === MING)
      .reduce((sum, u) => sum + u.strength, 0);
    const after = derived.initialUnits
      .filter((u) => u.faction === MING)
      .reduce((sum, u) => sum + u.strength, 0);

    assert.ok(after < before);
    assert.match(derived.id, /CAMPAIGN/);
    assert.ok(derived.gameplayAssumptions.some((a) => a.startsWith('CAMPAIGN:')));
    assert.doesNotThrow(() => assertScenarioValid(derived));
  });

  test('the base scenario is never mutated', () => {
    const before = JSON.stringify(CHI_LANG_1427.initialUnits.map((u) => u.strength));
    applyCarryForward(LAM_SON_CAMPAIGN, afterFirstBattle(0.4), CHI_LANG_1427);
    assert.equal(JSON.stringify(CHI_LANG_1427.initialUnits.map((u) => u.strength)), before);
  });
});

describe('honesty about what the link between the battles is', () => {
  test('persistence is partial, not total', () => {
    // The Chi Lang column was a fresh army from Guangxi, not the force beaten
    // at Tot Dong. Carrying its losses across in full would model a continuity
    // the history does not have.
    const cf = LAM_SON_CAMPAIGN.steps[1]!.carryForward;
    assert.ok(cf.lossPersistence > 0, 'an operational campaign should carry something');
    assert.ok(cf.lossPersistence < 1, 'but not everything — it was a different army');
  });

  test('the step explains why it carries anything at all', () => {
    const note = LAM_SON_CAMPAIGN.steps[1]!.carryForward.note.toLowerCase();
    assert.match(note, /fresh|guangxi/);
    assert.match(note, /gameplay judgement|pressure/);
  });

  test('the assumptions distinguish it from the thematic campaign', () => {
    const joined = LAM_SON_CAMPAIGN.gameplayAssumptions.join(' ').toLowerCase();
    assert.match(joined, /operational/);
    assert.match(joined, /resistance/);
    assert.match(joined, /siege of đông quan|siege/);
  });

  test('the two campaigns model their links differently, on purpose', () => {
    // RESISTANCE spans 139 years and carries nothing; this one spans eleven
    // months and carries something. If they ever converge, one of them has
    // stopped telling the truth about its own history.
    const resistanceCarries = RESISTANCE_CAMPAIGN.steps.some(
      (s) => s.carryForward.lossPersistence > 0,
    );
    const lamSonCarries = LAM_SON_CAMPAIGN.steps.some((s) => s.carryForward.lossPersistence > 0);

    assert.equal(resistanceCarries, false, 'a 139-year gap must carry nothing');
    assert.equal(lamSonCarries, true, 'an eleven-month causal chain should carry something');
  });

  test('no step claims its link to the previous battle as fact', () => {
    for (const step of LAM_SON_CAMPAIGN.steps) {
      assert.notEqual(step.linkStatus, 'VERIFIED_FACT');
      assert.ok(step.linkSources.length > 0);
    }
  });
});

describe('divergence still works here (§37)', () => {
  test('losing the first battle diverges the whole campaign', () => {
    const s = afterFirstBattle(0.9, MING_FIELD);
    const summary = summariseCampaign(LAM_SON_CAMPAIGN, s);
    assert.equal(summary.label, 'WHAT-IF CAMPAIGN');
    assert.equal(summary.followsHistory, false);
  });

  test('matching history keeps the historical label', () => {
    let s = afterFirstBattle(0.5, LAM_SON);
    s = recordResult(LAM_SON_CAMPAIGN, s, CHI_LANG_1427, {
      battleId: 'CHI_LANG_1427',
      victor: DAI_VIET_LAMSON,
      reason: 'test',
      survivingFraction: {},
      seed: 'test',
      simulationVersion: '0.5.0',
    });
    assert.equal(summariseCampaign(LAM_SON_CAMPAIGN, s).label, 'HISTORICAL CAMPAIGN');
  });
});
