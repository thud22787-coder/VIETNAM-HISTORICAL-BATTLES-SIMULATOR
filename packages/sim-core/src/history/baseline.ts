/**
 * Historical baseline immutability (INV-16).
 *
 * Master Prompt §26, §81, §83:
 *
 *   Historical Baseline --COPY--> What-if State      (allowed)
 *   Historical Baseline --MODIFY-> ...               (forbidden)
 *
 * This is enforced by deep-freezing, not by convention. Convention fails
 * silently and at the worst possible moment: a what-if run that quietly edits
 * the baseline corrupts every subsequent historical comparison in the session,
 * and nothing looks wrong until the numbers stop making sense.
 *
 * Note on strict mode: ES modules are always strict, so writing to a frozen
 * object throws a TypeError rather than failing silently. That is exactly the
 * fail-loud behaviour §96 asks for.
 */

/**
 * Recursively freeze an object graph. Handles cycles.
 *
 * Returns the same reference (now frozen), typed as deeply readonly.
 */
export function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): Readonly<T> {
  if (value === null || typeof value !== 'object') return value;

  const obj = value as unknown as object;
  if (seen.has(obj)) return value as Readonly<T>;
  seen.add(obj);

  // Freeze children first so the graph is fully sealed before the root is.
  for (const key of Reflect.ownKeys(obj)) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key);
    // Skip getters: invoking them here could run arbitrary code or throw.
    if (descriptor && 'value' in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }

  return Object.freeze(value);
}

/** True if the whole reachable graph is frozen. Used by tests and tooling. */
export function isDeeplyFrozen(value: unknown, seen: WeakSet<object> = new WeakSet()): boolean {
  if (value === null || typeof value !== 'object') return true;

  const obj = value as object;
  if (seen.has(obj)) return true;
  seen.add(obj);

  if (!Object.isFrozen(obj)) return false;

  for (const key of Reflect.ownKeys(obj)) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key);
    if (descriptor && 'value' in descriptor && !isDeeplyFrozen(descriptor.value, seen)) {
      return false;
    }
  }
  return true;
}

/**
 * A historical baseline: scenario data that must never change at runtime.
 *
 * The only legitimate way to derive a variant is `fork`, which produces a
 * mutable deep copy. There is deliberately no `mutate` or `update` method —
 * the type offers no route to modification at all.
 */
export class HistoricalBaseline<T extends object> {
  readonly #data: Readonly<T>;
  readonly scenarioId: string;
  readonly scenarioVersion: string;

  constructor(scenarioId: string, scenarioVersion: string, data: T) {
    this.scenarioId = scenarioId;
    this.scenarioVersion = scenarioVersion;
    this.#data = deepFreeze(structuredClone(data));
    Object.freeze(this);
  }

  /** Read-only access to the canonical historical data. */
  get data(): Readonly<T> {
    return this.#data;
  }

  /**
   * Produce an independent, mutable copy for what-if work (§83).
   * Mutating the result can never affect the baseline.
   */
  fork(): T {
    return structuredClone(this.#data) as T;
  }

  /**
   * Fork and apply a modification in one step, for readable what-if code:
   *
   *   const whatIf = baseline.forkWith(s => { s.forces[0].ships += 20; });
   */
  forkWith(modify: (draft: T) => void): T {
    const draft = this.fork();
    modify(draft);
    return draft;
  }
}
