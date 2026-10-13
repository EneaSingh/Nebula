// Seeded PRNG (mulberry32) — the simulation never touches Math.random.

export function hashSeed(seed) {
  // Accept numbers or strings; mix into a 32-bit state.
  let h = 0x811c9dc5 ^ 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed = 1) {
    this.state = hashSeed(seed) || 0x9e3779b9;
  }

  /** Float in [0, 1). */
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) { return min + (max - min) * this.next(); }
  int(min, maxInclusive) { return min + Math.floor(this.next() * (maxInclusive - min + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr.length ? arr[Math.floor(this.next() * arr.length)] : undefined; }

  /** Pick an index with probability proportional to weights[i] (>= 0). */
  weightedIndex(weights) {
    let total = 0;
    for (const w of weights) total += w > 0 ? w : 0;
    if (total <= 0) return -1;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] > 0 ? weights[i] : 0;
      if (r < w) return i;
      r -= w;
    }
    return weights.length - 1;
  }

  /** Poisson-ish event: probability that an event with `rate` per day happens within `dt` days. */
  hazard(rate, dt) {
    if (rate <= 0) return false;
    return this.next() < 1 - Math.exp(-rate * dt);
  }
}
