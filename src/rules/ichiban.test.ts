import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { ichibanCrowdFactor } from './demand'
import { boxWholesale, createBox, drawTicket, refundAmount, selfDraw } from './ichiban'
import { createRng } from './rng'
import type { BoxState, Ticket } from './types'

function ticket(partial: Partial<Ticket> & Pick<Ticket, 'grade' | 'unitCost'>): Ticket {
  return { figureId: null, label: '測試', ...partial }
}

function boxWith(tickets: Ticket[], awarded = false): BoxState {
  return {
    boxId: 'test',
    name: '測試箱',
    wholesale: 100,
    tickets,
    lastPrize: { id: 'lantern', label: '夜市燈籠', unitCost: 200, awarded },
    draws: 0,
    income: 0,
    selfIncome: 0,
    selfDraws: 0,
  }
}

describe('ichiban', () => {
  it('matches the plan box: 80 tickets and a wholesale of 2670', () => {
    const box = gameConfig.ichiban.boxes[0]
    expect(box).toBeDefined()
    if (!box) return
    expect(box.prizes.reduce((sum, prize) => sum + prize.count, 0)).toBe(80)
    expect(boxWholesale(box)).toBe(2670)
    expect(box.wholesale).toBe(2670)
    for (const def of gameConfig.ichiban.boxes) {
      expect(boxWholesale(def)).toBe(def.wholesale)
    }
  })

  it('shuffles deterministically and keeps the published prize counts', () => {
    const def = gameConfig.ichiban.boxes[0]
    expect(def).toBeDefined()
    if (!def) return
    const first = createBox(def, createRng(7))
    const again = createBox(def, createRng(7))
    expect(again.tickets).toEqual(first.tickets)
    expect(first.tickets).toHaveLength(80)
    expect(first.tickets.filter((item) => item.grade === 'A')).toHaveLength(1)
    expect(first.tickets.filter((item) => item.grade === 'B')).toHaveLength(3)
    expect(first.tickets.filter((item) => item.grade === 'C')).toHaveLength(8)
    expect(first.tickets.filter((item) => item.grade === 'D')).toHaveLength(68)

    let state = first
    let last: string | null = null
    const seen = { A: 0, B: 0, C: 0, D: 0 }
    while (state.tickets.length > 0) {
      const drawn = drawTicket(state)
      seen[drawn.ticket.grade] += 1
      last = drawn.lastPrize?.label ?? last
      expect(drawn.lastPrize == null || state.tickets.length === 1).toBe(true)
      state = drawn.box
    }
    expect(seen).toEqual({ A: 1, B: 3, C: 8, D: 68 })
    expect(last).toBe('夜市燈籠')
    expect(state.lastPrize.awarded).toBe(true)
    expect(state.draws).toBe(80)
  })

  it('refunds 30% of the leftover wholesale, including an unawarded last prize', () => {
    const untouched = gameConfig.ichiban.boxes[0]
    expect(untouched).toBeDefined()
    if (!untouched) return
    const full = createBox(untouched, createRng(1))
    expect(refundAmount(full, 0.3)).toBe(801)
    const partial = boxWith([
      ticket({ grade: 'A', unitCost: 600, figureId: 'temple', label: '廟會小狗' }),
      ticket({ grade: 'D', unitCost: 15, label: '貼紙小卡' }),
    ])
    expect(refundAmount(partial, 0.3)).toBe(245)
    const empty = boxWith([], true)
    expect(refundAmount(empty, 0.3)).toBe(0)
  })

  it('converts a duplicate dog into currency and keeps a single collection entry', () => {
    const temple = ticket({ grade: 'A', unitCost: 600, figureId: 'temple', label: '廟會小狗' })
    const first = selfDraw({
      box: boxWith([temple, { ...temple }]),
      collection: {},
      decorations: [],
      drawPrice: 50,
      config: gameConfig,
    })
    expect(first.collection.temple).toBe(1)
    expect(first.moneyDelta).toBe(0)
    expect(first.box.selfIncome).toBe(50)

    const second = selfDraw({
      box: first.box,
      collection: first.collection,
      decorations: first.decorations,
      drawPrice: 50,
      config: gameConfig,
    })
    expect(second.collection.temple).toBe(1)
    expect(second.moneyDelta).toBe(180)
    expect(second.decorations).toContain('lantern')
    expect(second.lastPrizeLabel).toBe('夜市燈籠')
  })

  it('lowers the crowd as A and B prizes leave, then bumps the last ten tickets', () => {
    const filler = Array.from({ length: 12 }, () => ticket({ grade: 'D', unitCost: 15 }))
    const withA = boxWith([ticket({ grade: 'A', unitCost: 600 }), ticket({ grade: 'B', unitCost: 150 }), ...filler])
    expect(ichibanCrowdFactor(withA, gameConfig)).toBe(1.5)
    const noA = boxWith([ticket({ grade: 'B', unitCost: 150 }), ...filler])
    expect(ichibanCrowdFactor(noA, gameConfig)).toBe(1)
    const leftovers = Array.from({ length: 8 }, () => ticket({ grade: 'D', unitCost: 15 }))
    expect(ichibanCrowdFactor(boxWith(leftovers), gameConfig)).toBeCloseTo(0.6 * 1.2)
    expect(ichibanCrowdFactor(null, gameConfig)).toBe(0)
  })
})
