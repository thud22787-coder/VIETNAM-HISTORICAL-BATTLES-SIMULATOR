import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveQuantity,
  describeQuantity,
  validateClaimLike,
  validateUncertainQuantity,
  isHistoricalStatus,
  gameplayAssumption,
  verifiedFact,
  type UncertainQuantity,
} from '../src/history/epistemic.ts';

const errorsOf = (problems: { severity: string; code: string }[]) =>
  problems.filter((p) => p.severity === 'ERROR').map((p) => p.code);

describe('quantity handling (§6)', () => {
  test('resolves each kind to a runnable number or null', () => {
    assert.equal(resolveQuantity({ kind: 'EXACT', value: 42 }), 42);
    assert.equal(resolveQuantity({ kind: 'ESTIMATED', value: 100, plusMinus: 20 }), 100);
    assert.equal(resolveQuantity({ kind: 'RANGE', min: 5000, max: 10000 }), 7500);
    assert.equal(resolveQuantity({ kind: 'UNKNOWN' }), null);
  });

  test('DISPUTED does not silently pick a winner (§106)', () => {
    // Averaging is a visible non-choice; the UI still shows both candidates.
    const value = resolveQuantity({
      kind: 'DISPUTED',
      candidates: [
        { value: 100, sources: [{ id: 'S-001' }] },
        { value: 200, sources: [{ id: 'S-002' }] },
      ],
    });
    assert.equal(value, 150);
  });

  test('descriptions never hide uncertainty', () => {
    assert.equal(describeQuantity({ kind: 'RANGE', min: 5000, max: 10000 }), '5000–10000');
    assert.equal(describeQuantity({ kind: 'UNKNOWN' }), 'unknown');
    assert.match(describeQuantity({ kind: 'ESTIMATED', value: 20, plusMinus: 5 }), /±5/);
    assert.match(
      describeQuantity({
        kind: 'DISPUTED',
        candidates: [
          { value: 1, sources: [] },
          { value: 2, sources: [] },
        ],
      }),
      /disputed/,
    );
  });
});

describe('accuracy contract enforcement (§4, §8)', () => {
  test('VERIFIED_FACT without a source is an ERROR', () => {
    const problems = validateClaimLike(
      { status: 'VERIFIED_FACT', confidence: 'HIGH', sources: [] },
      'test.claim',
    );
    assert.ok(errorsOf(problems).includes('FACT_WITHOUT_SOURCE'));
  });

  test('VERIFIED_FACT with a source passes clean', () => {
    const problems = validateClaimLike(
      { status: 'VERIFIED_FACT', confidence: 'HIGH', sources: [{ id: 'S-001' }] },
      'test.claim',
    );
    assert.deepEqual(problems, []);
  });

  test('SUPPORTED_INTERPRETATION without a source is an ERROR', () => {
    const problems = validateClaimLike(
      { status: 'SUPPORTED_INTERPRETATION', confidence: 'MEDIUM', sources: [] },
      'test.claim',
    );
    assert.ok(errorsOf(problems).includes('INTERPRETATION_WITHOUT_SOURCE'));
  });

  test('GAMEPLAY_ASSUMPTION needs no source — inventing is allowed if labelled', () => {
    const problems = validateClaimLike(
      { status: 'GAMEPLAY_ASSUMPTION', confidence: 'UNKNOWN', sources: [] },
      'test.claim',
    );
    assert.deepEqual(errorsOf(problems), []);
  });

  test('low-confidence fact is flagged as contradictory', () => {
    const problems = validateClaimLike(
      { status: 'VERIFIED_FACT', confidence: 'LOW', sources: [{ id: 'S-001' }] },
      'test.claim',
    );
    assert.ok(problems.some((p) => p.code === 'FACT_LOW_CONFIDENCE'));
  });

  test('only fact/interpretation/uncertain count as historical', () => {
    assert.equal(isHistoricalStatus('VERIFIED_FACT'), true);
    assert.equal(isHistoricalStatus('UNCERTAIN'), true);
    assert.equal(isHistoricalStatus('GAMEPLAY_ASSUMPTION'), false);
    assert.equal(isHistoricalStatus('FICTIONAL'), false);
  });
});

describe('quantity validation', () => {
  test('inverted range is an ERROR', () => {
    const q: UncertainQuantity = {
      quantity: { kind: 'RANGE', min: 100, max: 10 },
      status: 'UNCERTAIN',
      confidence: 'LOW',
      sources: [{ id: 'S-005' }],
    };
    assert.ok(errorsOf(validateUncertainQuantity(q, 'forces.size')).includes('RANGE_INVERTED'));
  });

  test('DISPUTED with fewer than two candidates is an ERROR', () => {
    const q: UncertainQuantity = {
      quantity: { kind: 'DISPUTED', candidates: [{ value: 1, sources: [] }] },
      status: 'UNCERTAIN',
      confidence: 'LOW',
      sources: [],
    };
    assert.ok(
      errorsOf(validateUncertainQuantity(q, 'forces.size')).includes('DISPUTED_NEEDS_CANDIDATES'),
    );
  });

  test('the real S-005 troop figure validates as an honest RANGE', () => {
    // Wikipedia gives 5,000-10,000 for the Vietnamese side with NO attribution.
    // We are allowed to carry that only as UNCERTAIN with a caveat.
    const q: UncertainQuantity = {
      quantity: { kind: 'RANGE', min: 5000, max: 10000 },
      status: 'UNCERTAIN',
      confidence: 'LOW',
      sources: [{ id: 'S-005' }],
      note: 'Figure circulates without attribution; not usable as fact.',
    };
    assert.deepEqual(errorsOf(validateUncertainQuantity(q, 'forces.size')), []);
  });
});

describe('constructors', () => {
  test('gameplayAssumption is never historical', () => {
    const claim = gameplayAssumption(12, 'needed a ship count to run the sim');
    assert.equal(claim.status, 'GAMEPLAY_ASSUMPTION');
    assert.equal(isHistoricalStatus(claim.status), false);
    assert.deepEqual(claim.sources, []);
  });

  test('verifiedFact carries its sources', () => {
    const claim = verifiedFact('ironwood', [{ id: 'S-001' }]);
    assert.equal(claim.status, 'VERIFIED_FACT');
    assert.deepEqual(errorsOf(validateClaimLike(claim, 'stake.species')), []);
  });
});
