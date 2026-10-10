import { describe, expect, it } from 'vitest'
import { createRng, sampleCount } from './rng'

describe('rng', () => {
  it('repeats a stream from the same seed and resumes from the saved state', () => {
    const first = createRng(7)
    const a = first.next()
    const b = first.next()
    const again = createRng(7)
    expect(again.next()).toBe(a)
    expect(again.next()).toBe(b)
    const resumed = createRng(first.getState())
    const third = first.next()
    expect(resumed.next()).toBe(third)
    expect(createRng(8).next()).not.toBe(a)
  })

  it('turns a fractional rate into a deterministic head count', () => {
    const rng = createRng(3)
    const scripted = { next: () => 0.2, getState: () => 0 }
    expect(sampleCount(2.25, scripted)).toBe(3)
    expect(sampleCount(2.25, { next: () => 0.9, getState: () => 0 })).toBe(2)
    expect(sampleCount(2, rng)).toBe(2)
    expect(sampleCount(0, rng)).toBe(0)
  })
})
