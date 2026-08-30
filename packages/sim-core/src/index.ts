/**
 * @vhbs/sim-core — the platform-independent simulation core.
 *
 * This package has NO platform dependencies: no DOM, no filesystem, no
 * network, no clock. That is deliberate (Master Prompt §48, §49) — desktop and
 * Android share this code exactly, and it is trivially testable because
 * everything is a pure function of its inputs.
 *
 * Start here:
 *   docs/PRODUCT_VISION.md
 *   docs/ARCHITECTURE.md
 *   docs/HISTORICAL_ACCURACY_CONTRACT.md
 *   docs/GAME_STATE_INVARIANTS.md
 */

/* Historical honesty layer */
export * from './history/epistemic.ts';
export * from './history/baseline.ts';
export * from './history/whatif.ts';

/* Domain */
export * from './domain/types.ts';

/* Scenario */
export * from './scenario/scenario.ts';
export * from './scenario/validate.ts';
export { BACH_DANG_1288, DAI_VIET, YUAN } from './scenario/battles/bach-dang-1288.ts';
export { CHI_LANG_1427, DAI_VIET_LAMSON, MING } from './scenario/battles/chi-lang-1427.ts';
export { TOT_DONG_1426, LAM_SON, MING_FIELD } from './scenario/battles/tot-dong-1426.ts';

/* Simulation */
export * from './sim/rng.ts';
export * from './sim/tide.ts';
export * from './sim/engine.ts';
export * from './sim/replay.ts';

/* State */
export * from './state/validator.ts';
export * from './state/observed.ts';

/* Campaign */
export * from './campaign/campaign.ts';
export { RESISTANCE_CAMPAIGN } from './campaign/campaigns/resistance.ts';
export { LAM_SON_CAMPAIGN } from './campaign/campaigns/lam-son.ts';

/* AI */
export * from './ai/commander.ts';

/* Testing utilities */
export * from './testing/fingerprint.ts';

/* Analysis */
export * from './analysis/analyse.ts';
