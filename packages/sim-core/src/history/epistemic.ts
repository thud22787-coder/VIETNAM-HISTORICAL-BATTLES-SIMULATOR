/**
 * Epistemic status and uncertain quantities.
 *
 * This module is the executable form of docs/HISTORICAL_ACCURACY_CONTRACT.md.
 * It exists so that the type system makes it awkward to state something as a
 * historical fact, and easy to state it honestly.
 *
 * Master Prompt: §4 (accuracy contract), §6 (uncertainty), §41 (confidence),
 * §87 (no fake numbers).
 */

/** How well supported a historical claim is. See accuracy contract §1. */
export type EpistemicStatus =
  /** Strong sourcing. Safe to state plainly in UI. */
  | 'VERIFIED_FACT'
  /** A scholarly reading of the evidence; reasonable but not certain. */
  | 'SUPPORTED_INTERPRETATION'
  /** Sources conflict or evidence is thin. UI must surface the doubt. */
  | 'UNCERTAIN'
  /** Invented because the simulation needs a value. This is NOT history. */
  | 'GAMEPLAY_ASSUMPTION'
  /** Counterfactual / what-if / player-authored. */
  | 'FICTIONAL';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

/**
 * Reference into docs/HISTORICAL_SOURCES.md. We deliberately store the source
 * *id* rather than free text, so that a claim cannot cite a source that does
 * not exist in the register.
 */
export interface SourceRef {
  /** e.g. 'S-001'. Must exist in HISTORICAL_SOURCES.md. */
  readonly id: string;
  /** Optional locator within the source (page, section, table). */
  readonly locator?: string;
}

/**
 * Statuses that may be presented to the player as history rather than as game
 * content. Used by UI and by the validator.
 */
const HISTORICAL_STATUSES: ReadonlySet<EpistemicStatus> = new Set<EpistemicStatus>([
  'VERIFIED_FACT',
  'SUPPORTED_INTERPRETATION',
  'UNCERTAIN',
]);

export function isHistoricalStatus(s: EpistemicStatus): boolean {
  return HISTORICAL_STATUSES.has(s);
}

/**
 * A claim about the past, carrying its own epistemic weight.
 *
 * Note the shape: you cannot construct one of these without saying what kind of
 * claim it is. There is no default. That is the point — per the accuracy
 * contract, absence of classification must never read as "fact".
 */
export interface HistoricalClaim<T> {
  readonly value: T;
  readonly status: EpistemicStatus;
  readonly confidence: Confidence;
  readonly sources: readonly SourceRef[];
  /** Free-text caveat shown alongside the value when status is not VERIFIED_FACT. */
  readonly note?: string;
}

/* ------------------------------------------------------------------ */
/* Uncertain quantities (accuracy contract §2)                         */
/* ------------------------------------------------------------------ */

/**
 * A historical quantity. Pre-modern figures are frequently unreliable, so the
 * domain refuses to model them as plain numbers.
 *
 * See HISTORICAL_SOURCES.md S-005 for a worked example of why: the widely
 * repeated ship-complement figure for Bach Dang 938 is internally inconsistent
 * (its parts sum to 47 against a stated total of 50).
 */
export type Quantity =
  | { readonly kind: 'EXACT'; readonly value: number }
  | { readonly kind: 'ESTIMATED'; readonly value: number; readonly plusMinus: number }
  | { readonly kind: 'RANGE'; readonly min: number; readonly max: number }
  | { readonly kind: 'DISPUTED'; readonly candidates: readonly DisputedCandidate[] }
  | { readonly kind: 'UNKNOWN' };

export interface DisputedCandidate {
  readonly value: number;
  readonly sources: readonly SourceRef[];
  readonly note?: string;
}

/** A quantity plus its epistemic framing. This is the type scenarios use. */
export interface UncertainQuantity {
  readonly quantity: Quantity;
  readonly status: EpistemicStatus;
  readonly confidence: Confidence;
  readonly sources: readonly SourceRef[];
  readonly note?: string;
}

/**
 * Collapse a quantity to a single number the simulation can actually run with.
 *
 * IMPORTANT: the result is a SIMULATION_PARAMETER, not a historical fact
 * (Master Prompt §87). Callers must not present it as "the historical number".
 * `resolveQuantity` is deliberately named to make that read wrong at call sites.
 *
 * Ranges resolve to their midpoint *only* for a runnable default; the original
 * UncertainQuantity is retained in the scenario so the UI can always show the
 * real spread (accuracy contract §2 forbids silently collapsing for display).
 */
export function resolveQuantity(q: Quantity): number | null {
  switch (q.kind) {
    case 'EXACT':
      return q.value;
    case 'ESTIMATED':
      return q.value;
    case 'RANGE':
      return (q.min + q.max) / 2;
    case 'DISPUTED': {
      // No silent winner (§106): with no basis to choose, use the central
      // tendency of the candidates and let the UI show that sources disagree.
      if (q.candidates.length === 0) return null;
      const sum = q.candidates.reduce((acc, c) => acc + c.value, 0);
      return sum / q.candidates.length;
    }
    case 'UNKNOWN':
      return null;
  }
}

/** Human-readable rendering that never hides uncertainty. */
export function describeQuantity(q: Quantity): string {
  switch (q.kind) {
    case 'EXACT':
      return String(q.value);
    case 'ESTIMATED':
      return `~${q.value} (±${q.plusMinus})`;
    case 'RANGE':
      return `${q.min}–${q.max}`;
    case 'DISPUTED':
      return q.candidates.length === 0
        ? 'disputed'
        : `disputed: ${q.candidates.map((c) => c.value).join(' vs ')}`;
    case 'UNKNOWN':
      return 'unknown';
  }
}

/* ------------------------------------------------------------------ */
/* Validation (accuracy contract §8)                                   */
/* ------------------------------------------------------------------ */

export interface ClaimProblem {
  readonly severity: 'ERROR' | 'WARNING';
  readonly code: string;
  readonly message: string;
}

/**
 * Enforce the contract's sourcing rules on a single claim.
 *
 * The central rule: a claim cannot assert factual status without citing
 * something. This is what stops confident-sounding invention from reaching the
 * player labelled as history.
 */
export function validateClaimLike(
  claim: { status: EpistemicStatus; confidence: Confidence; sources: readonly SourceRef[] },
  path: string,
): ClaimProblem[] {
  const problems: ClaimProblem[] = [];

  if (claim.status === 'VERIFIED_FACT' && claim.sources.length === 0) {
    problems.push({
      severity: 'ERROR',
      code: 'FACT_WITHOUT_SOURCE',
      message: `${path}: status VERIFIED_FACT requires at least one source (accuracy contract §8).`,
    });
  }

  if (claim.status === 'VERIFIED_FACT' && claim.confidence !== 'HIGH') {
    problems.push({
      severity: 'WARNING',
      code: 'FACT_LOW_CONFIDENCE',
      message: `${path}: VERIFIED_FACT with confidence ${claim.confidence} is contradictory; consider SUPPORTED_INTERPRETATION.`,
    });
  }

  if (claim.status === 'SUPPORTED_INTERPRETATION' && claim.sources.length === 0) {
    problems.push({
      severity: 'ERROR',
      code: 'INTERPRETATION_WITHOUT_SOURCE',
      message: `${path}: SUPPORTED_INTERPRETATION requires a source to be an interpretation *of* something.`,
    });
  }

  // A gameplay assumption citing sources is a category error worth flagging: it
  // suggests the author believed it was historical.
  if (claim.status === 'GAMEPLAY_ASSUMPTION' && claim.sources.length > 0) {
    problems.push({
      severity: 'WARNING',
      code: 'ASSUMPTION_WITH_SOURCE',
      message: `${path}: GAMEPLAY_ASSUMPTION cites sources; if it is actually supported, classify it honestly.`,
    });
  }

  return problems;
}

export function validateUncertainQuantity(q: UncertainQuantity, path: string): ClaimProblem[] {
  const problems = validateClaimLike(q, path);

  if (q.quantity.kind === 'RANGE' && q.quantity.min > q.quantity.max) {
    problems.push({
      severity: 'ERROR',
      code: 'RANGE_INVERTED',
      message: `${path}: range min ${q.quantity.min} exceeds max ${q.quantity.max}.`,
    });
  }

  if (q.quantity.kind === 'EXACT' && q.status === 'UNCERTAIN') {
    problems.push({
      severity: 'WARNING',
      code: 'EXACT_BUT_UNCERTAIN',
      message: `${path}: an EXACT quantity marked UNCERTAIN should probably be a RANGE or DISPUTED.`,
    });
  }

  if (q.quantity.kind === 'DISPUTED' && q.quantity.candidates.length < 2) {
    problems.push({
      severity: 'ERROR',
      code: 'DISPUTED_NEEDS_CANDIDATES',
      message: `${path}: DISPUTED requires at least two candidate values.`,
    });
  }

  return problems;
}

/* ------------------------------------------------------------------ */
/* Convenience constructors                                            */
/* ------------------------------------------------------------------ */

/**
 * Build a value the simulation needs but history does not supply.
 * Named verbosely on purpose: inventing a number should look like what it is.
 */
export function gameplayAssumption<T>(value: T, note: string): HistoricalClaim<T> {
  return { value, status: 'GAMEPLAY_ASSUMPTION', confidence: 'UNKNOWN', sources: [], note };
}

export function verifiedFact<T>(
  value: T,
  sources: readonly SourceRef[],
  note?: string,
): HistoricalClaim<T> {
  return {
    value,
    status: 'VERIFIED_FACT',
    confidence: 'HIGH',
    sources,
    ...(note === undefined ? {} : { note }),
  };
}
