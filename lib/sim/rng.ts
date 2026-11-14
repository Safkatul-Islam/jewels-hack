// ============================================================
// lib/sim/rng.ts   (P3)
// ============================================================
// Deterministic seeded RNG. docs/01-ARCHITECTURE.md: "no Math.random() except
// through the seeded RNG" — this is what makes simulate() a pure function of
// (WorldState, RoadNetwork), reproducible run to run from world.params.seed.

export interface Rng {
  next(): number;                              // [0, 1)
  int(maxExclusive: number): number;           // integer in [0, maxExclusive)
  range(min: number, max: number): number;     // float in [min, max)
  pick<T>(items: readonly T[]): T;
  /** Weighted pick; `weights` need not sum to 1 — they're normalised internally. */
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T;
  shuffle<T>(items: T[]): T[];                 // in place, returns the same array
}

/** mulberry32 — small, fast, decent statistical quality for agent sampling. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;

  function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[Math.floor(next() * items.length)]!;
  }

  function weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0) throw new Error('Rng.weightedPick: empty array');
    const total = weights.reduce((s, w) => s + w, 0);
    if (total <= 0) return pick(items);
    let threshold = next() * total;
    for (let i = 0; i < items.length; i++) {
      threshold -= weights[i] ?? 0;
      if (threshold <= 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }

  return {
    next,
    int(maxExclusive) {
      return Math.floor(next() * maxExclusive);
    },
    range(min, max) {
      return min + next() * (max - min);
    },
    pick,
    weightedPick,
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = items[i]!;
        items[i] = items[j]!;
        items[j] = tmp;
      }
      return items;
    },
  };
}
