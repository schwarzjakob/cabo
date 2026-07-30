/**
 * Deterministic RNG. The engine never reaches for Math.random, so any game can
 * be replayed exactly from its seed — which is what makes the rules testable.
 */
export type Rng = () => number;

/** mulberry32 — small, fast, good enough for shuffling a card deck. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically derive the next seed, so a game can reshuffle repeatedly
 * without ever reusing a shuffle.
 */
export function nextSeed(seed: number): number {
  return (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0) || 1;
}

/** Fisher-Yates. Returns a new array; the input is left alone. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
