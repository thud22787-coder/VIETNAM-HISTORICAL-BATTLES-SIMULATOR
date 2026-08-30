/**
 * LAM_SON_1426 — the first genuinely operational campaign.
 *
 * Tốt Động – Chúc Động (November 1426) → Chi Lăng (October 1427).
 *
 * WHY THIS ONE IS DIFFERENT FROM `RESISTANCE`
 *
 * `RESISTANCE` links Bạch Đằng and Chi Lăng, which are 139 years apart. It is
 * thematic, it carries nothing forward, and it says so. That was the honest
 * thing to build with the content available, but it meant the carry-forward
 * machinery had no real history to work against — a gap the last handoff
 * recorded plainly.
 *
 * This campaign closes it. These two battles are **eleven months apart in one
 * war**, under one leader, and the link between them is **causal rather than
 * thematic**:
 *
 *   Wang Tong is beaten at Tốt Động → he withdraws to Đông Quan → Lê Lợi
 *   besieges him there → the Ming send Liễu Thăng's relief column to break the
 *   siege → that column marches into Chi Lăng.
 *
 * Chi Lăng happens *because* Tốt Động happened. That is what makes carrying
 * losses forward defensible here and indefensible in `RESISTANCE`.
 *
 * WHAT CARRIES, AND THE LIMIT OF WHAT WE CAN CLAIM
 *
 * The Ming force at Chi Lăng was a **fresh relief column from Guangxi**, not
 * the army beaten at Tốt Động. So losses do NOT carry across at full strength —
 * that would be modelling a continuity the history does not have, the same
 * error `RESISTANCE` avoids by carrying nothing.
 *
 * What is defensible is weaker and more interesting: a Ming position that
 * collapsed more badly in 1426 is one under more pressure in 1427, committing
 * its relief force in worse circumstances. That is modelled as *partial*
 * persistence (0.4) with a floor, and the note in the step says exactly this.
 * It is a gameplay judgement, labelled as one, not a claim about logistics.
 *
 * The Lam Sơn side carries nothing: they were reinforcing and recruiting
 * throughout, and modelling their losses as persistent would get the direction
 * of the campaign backwards.
 */

import type { Campaign } from '../campaign.ts';
import { factionId } from '../../domain/types.ts';

/** The Ming, as identified in both battles of this campaign. */
const MING_FACTION = factionId('ming');

export const LAM_SON_CAMPAIGN: Campaign = {
  id: 'LAM_SON_1426',
  version: 'v1',

  title: 'The Lam Sơn campaign, 1426–1427',
  period: '15th century, Ming occupation',

  briefing:
    'Two battles eleven months apart in the same war, and the second happens because of the ' +
    'first. Beat Vương Thông in the delta and he falls back on Đông Quan, where he can be ' +
    'besieged — and a besieged commander is a reason for the Ming to send a relief army south ' +
    'through the passes. Win well at Tốt Động and that relief column marches into a worse ' +
    'situation at Chi Lăng. This is one campaign, not two engagements that happen to be listed ' +
    'together.',

  steps: [
    {
      battleId: 'TOT_DONG_1426',
      linkText:
        'November 1426. A Ming field army under Vương Thông advances into the delta. The ground ' +
        'either side of the road is flooded paddy, and your troops are already in it.',
      linkStatus: 'SUPPORTED_INTERPRETATION',
      linkSources: [{ id: 'S-010' }, { id: 'S-011' }],
      carryForward: {
        lossPersistence: 0,
        minStrengthFraction: 1,
        note: 'The opening engagement; nothing carries into it.',
      },
    },
    {
      battleId: 'CHI_LANG_1427',
      linkText:
        'Vương Thông fell back on Đông Quan and was besieged there. October 1427: a Ming relief ' +
        'column under Liễu Thăng marches south through the Chi Lăng defile to break the siege. ' +
        'It is a fresh army — but it is committed under the pressure your victory created.',
      linkStatus: 'SUPPORTED_INTERPRETATION',
      linkSources: [{ id: 'S-007' }, { id: 'S-010' }],
      carryForward: {
        // Partial, and the note has to justify it — see the module comment.
        lossPersistence: 0.4,
        minStrengthFraction: 0.7,
        // The Ming only. Both battles use the faction id `lam-son`, so without
        // this the rule would quietly carry Lam Sơn losses forward too — which
        // is the opposite of what happened, and what the assumptions below say.
        // A test caught this.
        appliesTo: [MING_FACTION],
        note:
          'Partial, and a gameplay judgement rather than a logistical claim. The Chi Lăng ' +
          'column was a fresh force from Guangxi, not the army beaten at Tốt Động, so its ' +
          'losses cannot carry across directly. What is defensible is that a Ming position ' +
          'which collapsed more badly in 1426 is one committing its relief force under more ' +
          'pressure in 1427. The floor keeps a heavy first-battle defeat from making the ' +
          'second unwinnable.',
      },
    },
  ],

  sources: [{ id: 'S-006' }, { id: 'S-007' }, { id: 'S-010' }, { id: 'S-011' }, { id: 'S-012' }],

  gameplayAssumptions: [
    'This campaign is OPERATIONAL: its two battles are eleven months apart in one war, under one leader, and the second is caused by the first. That is what distinguishes it from RESISTANCE, which is thematic and carries nothing forward.',
    'Ming losses carry forward only partially (40%, with a floor). The Chi Lăng relief column was a fresh army from Guangxi, not the force beaten at Tốt Động, so carrying its losses across at full strength would model a continuity the history does not have. The partial figure represents strategic pressure, and is a gameplay judgement rather than a claim about logistics.',
    'Lam Sơn losses do not carry forward at all. They were recruiting and reinforcing throughout 1427, and modelling their casualties as persistent would get the direction of the campaign backwards.',
    'The siege of Đông Quan between the two battles is not playable. It is narrated in the link text because it is the causal join, but a siege is a different kind of engagement from anything the simulation currently models.',
    'Each battle keeps its own gameplay assumptions, which are shown after it is fought.',
  ],
};
