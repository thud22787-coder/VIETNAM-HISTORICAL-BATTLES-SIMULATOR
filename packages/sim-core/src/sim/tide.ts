/**
 * Tidal model.
 *
 * This is a scenario-configured environmental system, NOT a Bach Dang special
 * case (Master Prompt §21, §38 — no `if battle == bach_dang` anywhere). Any
 * scenario may declare a tide; scenarios without one simply omit the config.
 *
 * Physical grounding: HISTORICAL_SOURCES.md S-002 records a *diurnal* regime in
 * the Bach Dang estuary with spring range c. 2.5-3.2 m and neap range c.
 * 0.5-1.0 m, from peer-reviewed marine science literature. Diurnal means ONE
 * high water per day, which is what makes the battle's timing window tight.
 *
 * Honesty note: those are MODERN measurements standing in for 13th-century
 * conditions, after ~700 years of sedimentation and channel migration. The
 * regime and order of magnitude are reliable; absolute depth at a given point
 * is not. Research debt RD-04 tracks replacing this proxy. Scenario data marks
 * derived depths accordingly.
 */

/**
 * Tide configuration, supplied by scenario data.
 * All heights in metres relative to the scenario's chart datum.
 */
export interface TideConfig {
  /**
   * Hours for one complete cycle. A diurnal regime is ~24.8h (one high water
   * per lunar day); a semidiurnal regime would be ~12.4h.
   */
  readonly periodHours: number;
  /** Water height at low water. */
  readonly lowWaterM: number;
  /** Water height at high water. */
  readonly highWaterM: number;
  /**
   * Hour within the cycle at which high water occurs. Lets a scenario place
   * the battle at a chosen point in the tidal cycle.
   */
  readonly highWaterAtHour: number;
}

export type TidePhase = 'FLOOD' | 'EBB' | 'HIGH_SLACK' | 'LOW_SLACK';

export interface TideState {
  /** Water level in metres above datum. */
  readonly levelM: number;
  /** Whether water is rising, falling, or near a turning point. */
  readonly phase: TidePhase;
  /** Rate of change, metres per hour. Negative on the ebb. */
  readonly rateMPerHour: number;
  /** Normalised 0..1 position through the cycle, for UI. */
  readonly cyclePosition: number;
}

/** Slack water threshold: below this rate we call it a turning point. */
const SLACK_RATE_THRESHOLD = 0.05;

/**
 * Evaluate the tide at a given elapsed time.
 *
 * Model: a simple harmonic (cosine) approximation. Real tides are a sum of many
 * harmonic constituents and are asymmetric in estuaries — flood often runs
 * faster than ebb. We deliberately do not model that here: the extra fidelity
 * would not change a player's decision, and inventing asymmetry we have not
 * sourced would be a fabricated detail dressed as precision. If RD-04 produces
 * real constituents, this function is where they go.
 *
 * Pure and deterministic: same inputs always give the same output, so it is
 * replay-safe and needs no RNG.
 */
export function evaluateTide(config: TideConfig, elapsedHours: number): TideState {
  const { periodHours, lowWaterM, highWaterM, highWaterAtHour } = config;

  if (periodHours <= 0) {
    throw new Error(`Tide periodHours must be positive, got ${periodHours}`);
  }
  if (highWaterM < lowWaterM) {
    throw new Error(
      `Tide highWaterM (${highWaterM}) must be >= lowWaterM (${lowWaterM})`,
    );
  }

  const meanM = (highWaterM + lowWaterM) / 2;
  const amplitudeM = (highWaterM - lowWaterM) / 2;

  // Phase angle, zero at high water.
  const theta = (2 * Math.PI * (elapsedHours - highWaterAtHour)) / periodHours;

  const levelM = meanM + amplitudeM * Math.cos(theta);

  // d/dt of the above.
  const rateMPerHour =
    (-amplitudeM * 2 * Math.PI * Math.sin(theta)) / periodHours;

  let phase: TidePhase;
  if (Math.abs(rateMPerHour) < SLACK_RATE_THRESHOLD) {
    phase = levelM > meanM ? 'HIGH_SLACK' : 'LOW_SLACK';
  } else {
    phase = rateMPerHour > 0 ? 'FLOOD' : 'EBB';
  }

  // Normalise to 0..1 where 0 is high water.
  const raw = (elapsedHours - highWaterAtHour) / periodHours;
  const cyclePosition = ((raw % 1) + 1) % 1;

  return { levelM, phase, rateMPerHour, cyclePosition };
}

/**
 * Water depth over a submerged feature (a stake, a bar, a shoal) at a moment.
 * Negative means the feature is exposed above the waterline.
 */
export function depthOverFeature(
  tide: TideState,
  featureTopHeightM: number,
): number {
  return tide.levelM - featureTopHeightM;
}

/**
 * Whether a vessel of the given draft clears a submerged feature.
 *
 * This is the heart of the Bach Dang mechanic, expressed generically: heavy
 * deep-draft ships strike stakes that shallow craft pass over freely. The
 * scenario supplies the numbers; the engine supplies only the rule.
 *
 * `clearanceM` is a safety margin — a hull passing within a few centimetres of
 * an iron-tipped stake in a moving current is not safely clear.
 */
export function vesselClears(
  tide: TideState,
  featureTopHeightM: number,
  vesselDraftM: number,
  clearanceM = 0,
): boolean {
  return depthOverFeature(tide, featureTopHeightM) >= vesselDraftM + clearanceM;
}

/**
 * Find the next time the tide falls to a given level, searching forward.
 * Used by AI and by UI countdowns ("the ebb traps you in ~40 minutes").
 *
 * Returns null if the level is never reached within the search window.
 * Coarse scan then bisection, so it is deterministic and allocation-free.
 */
export function timeUntilLevel(
  config: TideConfig,
  fromHours: number,
  targetLevelM: number,
  searchHours: number,
  falling: boolean,
): number | null {
  const STEP = 0.05;
  let prev = evaluateTide(config, fromHours);

  for (let t = fromHours + STEP; t <= fromHours + searchHours; t += STEP) {
    const cur = evaluateTide(config, t);
    const crossed = falling
      ? prev.levelM > targetLevelM && cur.levelM <= targetLevelM
      : prev.levelM < targetLevelM && cur.levelM >= targetLevelM;

    if (crossed) {
      // Bisect within the bracketing step for a precise crossing time.
      let lo = t - STEP;
      let hi = t;
      for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) / 2;
        const midLevel = evaluateTide(config, mid).levelM;
        const midPast = falling ? midLevel <= targetLevelM : midLevel >= targetLevelM;
        if (midPast) hi = mid;
        else lo = mid;
      }
      return hi - fromHours;
    }
    prev = cur;
  }

  return null;
}
