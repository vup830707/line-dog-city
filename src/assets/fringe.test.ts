import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('stall sprites', () => {
  it('keeps near-white pixels off the alpha edge', () => {
    const output = execFileSync('node', ['scripts/check-stall-fringe.mjs'], { encoding: 'utf8' })
    expect(output).toContain('dream-ice-cream-cart.png')
    expect(output).not.toContain('fringe ')
  })
})