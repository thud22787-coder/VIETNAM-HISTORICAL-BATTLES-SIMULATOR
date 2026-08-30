/**
 * Deterministic pseudo-random number generation.
 *
 * Master Prompt §23 (deterministic simulation), §24 (randomness contract),
 * §89 (decision traceability).
 *
 * Math.random() is BANNED everywhere in sim-core. It cannot be seeded, so it
 * would destroy replay, regression testing and historical comparison. A test
 * asserts that no source file references it.
 *
 * Algorithm: SplitMix64-derived 32-bit variant (mulberry32 mixing). Chosen for:
 *  - exact reproducibility across platforms (pure uint32 arithmetic, no floats
 *    in the state transition, so desktop and Android agree bit-for-bit),
 *  - cheap serialisation (state is one uint32),
 *  - adequate statistical quality for gameplay. This is NOT cryptographic.
 */

export type RngState = number;

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [minInclusive, maxExclusive). */
  nextInt(minInclusive: number, maxExclusive: number): number;
  /** Uniform in [min, max). */
  nextRange(min: number, max: number): number;
  /** True with the given probability. */
  chance(probability: number): boolean;
  /** Current state — serialise this into saves/replays. */
  getState(): RngState;
  /**
   * Fork a child generator deterministically. Use this to give subsystems
   * independent streams so that adding a die roll in one system does not
   * shift every other system's results (which would break replays for
   * unrelated reasons).
   */
  fork(label: string): Rng;
}

/** Convert an arbitrary string seed into a uint32, deterministically. */
export function hashSeed(seed: string): number {
  // FNV-1a, 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

class Mulberry32 implements Rng {
  private state: number;

  constructor(state: number) {
    this.state = state >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(minInclusive: number, maxExclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive)) {
      throw new Error('nextInt requires integer bounds');
    }
    if (maxExclusive <= minInclusive) {
      throw new Error(`nextInt: empty interval [${minInclusive}, ${maxExclusive})`);
    }
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }

  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  getState(): RngState {
    return this.state;
  }

  fork(label: string): Rng {
    // Mix the current state with the label so each named stream is independent
    // but still fully determined by the parent seed.
    return new Mulberry32((this.state ^ hashSeed(label)) >>> 0);
  }
}

export function createRng(seed: string | number): Rng {
  return new Mulberry32(typeof seed === 'string' ? hashSeed(seed) : seed >>> 0);
}

/** Restore a generator mid-stream, for save/load and replay. */
export function restoreRng(state: RngState): Rng {
  return new Mulberry32(state);
}
