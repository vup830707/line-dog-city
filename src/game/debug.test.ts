import { describe, expect, it } from 'vitest'
import { debugHooksEnabled } from './debug'

describe('debug hooks', () => {
  it('opens window.__puppy only when the URL asks for debug=1', () => {
    expect(debugHooksEnabled('?debug=1')).toBe(true)
    expect(debugHooksEnabled('?foo=1&debug=1')).toBe(true)
    expect(debugHooksEnabled('')).toBe(false)
    expect(debugHooksEnabled('?debug=0')).toBe(false)
    expect(debugHooksEnabled('?debug=true')).toBe(false)
  })
})
