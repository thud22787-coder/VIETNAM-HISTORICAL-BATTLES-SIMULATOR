/**
 * Cross-platform determinism fingerprint.
 *
 * Master Prompt §23, §53. ADR-001 chose uint32 arithmetic for the RNG
 * specifically so that desktop and Android would agree bit-for-bit, but that
 * was a design intention rather than a measured fact until this existed.
 *
 * The fingerprint is a pure function of the simulation. Running it under any
 * JavaScript engine must produce byte-identical output; if it does not, replays
 * and saves are not portable between platforms and the reproducibility contract
 * is broken.
 *
 * It lives in `src/` rather than `tests/` on purpose: the browser and Android
 * harnesses import it too, and a test file would not be part of the package's
 * public surface.
 */

import { createRng, hashSeed } from '../sim/rng.ts';
import { createInitialState, step, type Command } from '../sim/engine.ts';
import { BACH_DANG_1288, YUAN } from '../scenario/battles/bach-dang-1288.ts';
import { CHI_LANG_1427, MING } from '../scenario/battles/chi-lang-1427.ts';
import { canAct, type FactionId } from '../domain/types.ts';

/** Bump only when the fingerprint's own definition changes, not the values. */
export const FINGERPRINT_VERSION = 1;

/** Run one battle headlessly with a fixed plan and report its end state. */
function battleFingerprint(
  scenario: typeof BACH_DANG_1288 | typeof CHI_LANG_1427,
  attacker: FactionId,
  towardX: number,
  ticks: number,
): string[] {
  let s = createInitialState(scenario, 'fingerprint');
  for (let i = 0; i < ticks && s.outcome.kind === 'ONGOING'; i++) {
    const commands: Command[] = s.units
      .filter((u) => u.faction === attacker && canAct(u))
      .map((u) => ({ kind: 'MOVE' as const, unitId: u.id, to: { x: towardX, y: u.position.y } }));
    s = step(s, commands, scenario);
  }
  return [
    `${scenario.id}.rng=${s.rngState}`,
    `${scenario.id}.tick=${s.tick}`,
    `${scenario.id}.hours=${s.elapsedHours.toFixed(6)}`,
    // Full precision: a divergence in the last bits is exactly what would break
    // a replay, so rounding here would hide the failure this is looking for.
    `${scenario.id}.strengths=${s.units.map((u) => u.strength.toFixed(9)).join(',')}`,
    `${scenario.id}.morale=${s.units.map((u) => u.morale.toFixed(9)).join(',')}`,
    `${scenario.id}.outcome=${JSON.stringify(s.outcome)}`,
  ];
}

/**
 * Compute the fingerprint. Pure, deterministic, and free of platform APIs.
 */
export function computeFingerprint(): string {
  const lines: string[] = [`version=${FINGERPRINT_VERSION}`];

  // Raw RNG behaviour, at full float precision.
  lines.push(`hashSeed=${hashSeed('vhbs')}`);
  const rng = createRng('determinism-fingerprint');
  const draws = Array.from({ length: 32 }, () => rng.next());
  lines.push(`draws=${draws.map((d) => d.toFixed(17)).join('|')}`);
  lines.push(`rngAfter=${rng.getState()}`);

  // Forked streams, since subsystem isolation is part of the contract.
  const parent = createRng('fork-root');
  lines.push(`fork.combat=${parent.fork('combat').getState()}`);
  lines.push(`fork.obstacles=${parent.fork('obstacles').getState()}`);

  // Both battles, exercising tide/obstacles and terrain respectively.
  lines.push(...battleFingerprint(BACH_DANG_1288, YUAN, 150, 80));
  lines.push(...battleFingerprint(CHI_LANG_1427, MING, 1000, 80));

  return lines.join('\n');
}
