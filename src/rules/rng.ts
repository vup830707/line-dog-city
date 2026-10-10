export interface Rng {
  next(): number
  getState(): number
}

/** mulberry32. Restoring `getState()` continues the same stream. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    next() {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    getState() {
      return a >>> 0
    },
  }
}

export function sampleCount(rate: number, rng: Rng): number {
  if (rate <= 0) return 0
  const whole = Math.floor(rate)
  const frac = rate - whole
  if (frac <= 1e-12) return whole
  return whole + (rng.next() < frac ? 1 : 0)
}
