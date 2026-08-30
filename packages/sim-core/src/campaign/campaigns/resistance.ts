/**
 * RESISTANCE — the first campaign.
 *
 * HONESTY FIRST, BECAUSE THIS ONE NEEDS IT
 *
 * Bạch Đằng (1288) and Chi Lăng (1427) are **139 years apart**. Different
 * dynasties, different invaders, different armies, different generations.
 * Calling them a "campaign" in the operational sense — one force marching from
 * the first engagement to the next, carrying its losses — would be a lie about
 * the history, and exactly the kind of lie §43 and §85 exist to prevent.
 *
 * So this campaign is explicitly **thematic, not operational**. It is a
 * sequence of engagements that share a problem — a large invading army from the
 * north, met by a smaller force that wins by making the ground and the water
 * fight for it — and it says so to the player rather than implying continuity
 * it does not have.
 *
 * The practical consequence: `lossPersistence` is **0**. Nothing carries
 * forward, because nothing plausibly could across 139 years. The carry-forward
 * machinery exists and is tested, but this campaign deliberately does not use
 * it, and the note says why. An operational campaign — the four engagements of
 * a single Lam Sơn year, say — is where that machinery earns its keep, and is
 * the obvious second campaign to write.
 *
 * What the campaign DOES do is make §37 real: win Chi Lăng as the Ming and the
 * whole sequence is permanently relabelled a what-if, because a Vietnamese
 * defeat there is not the history this campaign claims to walk through.
 */

import type { Campaign } from '../campaign.ts';

export const RESISTANCE_CAMPAIGN: Campaign = {
  id: 'RESISTANCE',
  version: 'v1',

  title: 'Resistance: two rivers, two centuries',
  period: '13th–15th century',

  briefing:
    'Two battles, a hundred and thirty-nine years apart, against two different empires. They ' +
    'are not one campaign in the military sense — no army marched from the first to the ' +
    'second, and nobody who fought at Bạch Đằng lived to see Chi Lăng. What they share is a ' +
    'problem and an answer: a far larger invading force from the north, and a defender who ' +
    'wins by choosing ground where the enemy’s strength becomes their weakness. Fight both and ' +
    'see whether the same idea holds in water and in stone.',

  steps: [
    {
      battleId: 'BACH_DANG_1288',
      linkText:
        'A Yuan fleet withdraws down the Bạch Đằng estuary. The channel has been prepared, and ' +
        'the tide is turning.',
      linkStatus: 'SUPPORTED_INTERPRETATION',
      linkSources: [{ id: 'S-001' }, { id: 'S-003' }],
      carryForward: {
        // First battle: nothing precedes it.
        lossPersistence: 0,
        minStrengthFraction: 1,
        note: 'The opening engagement; nothing carries into it.',
      },
    },
    {
      battleId: 'CHI_LANG_1427',
      linkText:
        'A hundred and thirty-nine years later, a Ming relief column marches south through the ' +
        'Chi Lăng defile. Different empire, different century, same shape of problem: a large ' +
        'force committed to ground that does not suit it.',
      linkStatus: 'SUPPORTED_INTERPRETATION',
      linkSources: [{ id: 'S-006' }, { id: 'S-007' }],
      carryForward: {
        // The load-bearing honesty in this file.
        lossPersistence: 0,
        minStrengthFraction: 1,
        note:
          'Nothing carries forward. These battles are 139 years apart; no force, commander or ' +
          'materiel is shared between them, and modelling attrition across that gap would be ' +
          'inventing a continuity the history does not have.',
      },
    },
  ],

  sources: [
    { id: 'S-001' },
    { id: 'S-003' },
    { id: 'S-006' },
    { id: 'S-007' },
  ],

  gameplayAssumptions: [
    'This campaign is THEMATIC, not operational. Bạch Đằng (1288) and Chi Lăng (1427) are 139 years apart and share no army, commander or materiel. They are grouped because they pose the same tactical problem, not because they form a single military sequence.',
    'Nothing carries forward between the battles. Each is fought at full strength, because there is no defensible way to model attrition across more than a century.',
    'The order is chronological. It is not a claim that the later battle was influenced by the earlier one, though the Bạch Đằng tradition was certainly known to later Vietnamese commanders.',
    'Each battle keeps its own gameplay assumptions, which are shown after it is fought.',
  ],
};
