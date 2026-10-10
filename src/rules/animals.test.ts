import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { bearCanVisit, foxCanVisit, letterFor, satisfactionOf, speciesWeight } from './animals'
import { decor, ownedSet, stall, streetWith } from './fixtures'
import type { BoxState } from './types'

function boxWith(grades: Array<'A' | 'B' | 'C' | 'D'>): BoxState {
  return {
    boxId: 'set1',
    name: '測試箱',
    wholesale: 100,
    tickets: grades.map((grade) => ({ grade, figureId: grade === 'D' ? null : 'temple', label: grade, unitCost: 10 })),
    lastPrize: { id: 'lantern', label: '燈', unitCost: 20, awarded: false },
    draws: 0,
    income: 0,
  }
}

describe('animal preferences', () => {
  it('shifts who arrives without removing everyday animals', () => {
    const rain = streetWith({ weather: 'rain', phase: 'dusk' })
    const sun = streetWith({ weather: 'sunny', phase: 'mid' })
    expect(speciesWeight('cat', rain, gameConfig)).toBeGreaterThan(speciesWeight('cat', sun, gameConfig))
    expect(speciesWeight('rabbit', sun, gameConfig)).toBeGreaterThan(0)
    expect(speciesWeight('hamster', rain, gameConfig)).toBeGreaterThan(0)
  })

  it('opens the fox only on a festival while A or B remains', () => {
    const festival = streetWith({ day: 15, box: boxWith(['A']) })
    const quiet = streetWith({ day: 1, box: boxWith(['A', 'B']) })
    const leftovers = streetWith({ day: 15, box: boxWith(['D']) })
    expect(foxCanVisit(festival, gameConfig)).toBe(true)
    expect(speciesWeight('fox', festival, gameConfig)).toBeGreaterThan(0)
    expect(foxCanVisit(quiet, gameConfig)).toBe(false)
    expect(speciesWeight('fox', quiet, gameConfig)).toBe(0)
    expect(foxCanVisit(leftovers, gameConfig)).toBe(false)
  })

  it('opens the bear only when the wish pond is placed, the set is complete, and ambience is high enough', () => {
    const ids = gameConfig.figures.map((figure) => figure.id)
    const slots = streetWith().slots.slice()
    slots[3] = stall('wish', 'wish')
    const ready = streetWith({ slots, collection: ownedSet(ids), cleanliness: 100 })
    const noStall = streetWith({ collection: ownedSet(ids), cleanliness: 100 })
    const dirty = streetWith({ slots, collection: ownedSet(ids), cleanliness: 0 })
    expect(bearCanVisit(ready, gameConfig)).toBe(true)
    expect(speciesWeight('bear', ready, gameConfig)).toBeGreaterThan(0)
    expect(bearCanVisit(noStall, gameConfig)).toBe(false)
    expect(bearCanVisit(dirty, gameConfig)).toBe(false)
  })

  it('writes a letter only after the favourite stall, nearby decor, and satisfaction line up', () => {
    const slots = streetWith().slots.slice()
    slots[1] = stall('fortune', 'fortune')
    slots[2] = decor('lantern')
    const ready = streetWith({ slots, cleanliness: 100 })
    const score = satisfactionOf({ liked: true, decor: true, cleanliness: 100, greet: false, config: gameConfig })
    expect(score).toBeGreaterThanOrEqual(gameConfig.letterAt)
    const letter = letterFor({
      species: 'cat',
      stall: 'fortune',
      decor: true,
      street: ready,
      config: gameConfig,
      drewGrade: null,
      satisfaction: score,
    })
    expect(letter?.topic).toBe('cat')
    const plain = letterFor({
      species: 'cat',
      stall: 'fortune',
      decor: false,
      street: ready,
      config: gameConfig,
      drewGrade: null,
      satisfaction: satisfactionOf({ liked: true, decor: false, cleanliness: 100, greet: false, config: gameConfig }),
    })
    expect(plain).toBeNull()
  })
})
