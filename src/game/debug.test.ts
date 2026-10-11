import { describe, expect, it } from 'vitest'
import { debugHooksEnabled } from './debug'

describe('debug hooks', () => {
  it('opens window.__puppy on the production site only when the URL asks for debug=1', () => {
    expect(debugHooksEnabled('?debug=1', 'production')).toBe(true)
    expect(debugHooksEnabled('?foo=1&debug=1', 'production')).toBe(true)
    expect(debugHooksEnabled('', 'production')).toBe(false)
    expect(debugHooksEnabled('?debug=0', 'production')).toBe(false)
    expect(debugHooksEnabled('?debug=true', 'production')).toBe(false)
  })

  it('keeps the hook on in dev and test so playtest and e2e can pause the clock', () => {
    expect(debugHooksEnabled('', 'development')).toBe(true)
    expect(debugHooksEnabled('?debug=0', 'development')).toBe(true)
    expect(debugHooksEnabled('', 'test')).toBe(true)
    expect(debugHooksEnabled('?other=1', 'test')).toBe(true)
  })
})
