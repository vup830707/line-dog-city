import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { ambienceScore, expectedVisits } from './ambience'
import { bearCanVisit, foxCanVisit, letterFor, satisfactionOf, speciesWeight } from './animals'
import { decor, stall, streetWith } from './fixtures'
import type { BoxState, Species, Weather } from './types'

const STARTERS: Species[] = ['cat', 'rabbit', 'hamster', 'sparrow']

function unlockOtter(street: ReturnType<typeof streetWith>) {
  const slots = street.slots.slice()
  slots[0] = decor('seat', 'seat-a')
  slots[1] = decor('seat', 'seat-b')
  return { ...street, slots }
}

function unlockHedgehog(street: ReturnType<typeof streetWith>) {
  const slots = street.slots.slice()
  slots[0] = { ...stall('ice', 'ice-3'), level: 3 }
  return { ...street, slots }
}

function unlockFox(day: number, grades: Array<'A' | 'B' | 'C' | 'D'>) {
  const slots = streetWith().slots.slice()
  slots[0] = stall('ichiban', 'ichiban')
  for (let i = 1; i <= 8; i += 1) slots[i] = decor('lantern', `lantern-${i}`)
  return streetWith({ slots, day, weather: 'sunny', phase: 'mid', box: boxWith(grades) })
}
const WEATHERS: Weather[] = ['sunny', 'hot', 'cold', 'rain']

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

  it('lets the red panda visit once ichiban and eight decorations are out, and doubles that on a festival with A or B left', () => {
    const quiet = unlockFox(1, ['A'])
    const festival = unlockFox(15, ['A'])
    const leftovers = unlockFox(15, ['D'])
    const locked = streetWith({ day: 15, box: boxWith(['A']) })
    expect(foxCanVisit(quiet, gameConfig)).toBe(true)
    expect(speciesWeight('fox', quiet, gameConfig)).toBeGreaterThan(0)
    expect(speciesWeight('fox', festival, gameConfig)).toBe(speciesWeight('fox', quiet, gameConfig) * 2)
    expect(speciesWeight('fox', leftovers, gameConfig)).toBe(speciesWeight('fox', quiet, gameConfig))
    expect(foxCanVisit(locked, gameConfig)).toBe(false)
    expect(speciesWeight('fox', locked, gameConfig)).toBe(0)
  })

  it('opens the raccoon when the wish pond is placed and bustle reaches 80', () => {
    const slots = streetWith().slots.slice()
    slots[8] = stall('wish', 'wish')
    for (let i = 0; i < 7; i += 1) slots[i] = decor('star', `star-${i}`)
    const ready = streetWith({ slots, cleanliness: 0 })
    const noStall = streetWith({ cleanliness: 100 })
    const quiet = streetWith({ slots: [stall('wish', 'wish')], cleanliness: 100 })
    expect(ambienceScore(ready, gameConfig)).toBeGreaterThanOrEqual(80)
    expect(bearCanVisit(ready, gameConfig)).toBe(true)
    expect(speciesWeight('bear', ready, gameConfig)).toBeGreaterThan(0)
    expect(bearCanVisit(noStall, gameConfig)).toBe(false)
    expect(bearCanVisit(quiet, gameConfig)).toBe(false)
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

  it('changes visitor weights with the weather and keeps the visit count at or above the ambience floor', () => {
    const rain = streetWith({ weather: 'rain', phase: 'mid' })
    const sun = streetWith({ weather: 'sunny', phase: 'mid' })
    expect(speciesWeight('cat', rain, gameConfig)).toBeGreaterThan(speciesWeight('cat', sun, gameConfig))
    expect(speciesWeight('otter', unlockOtter(rain), gameConfig)).toBeGreaterThan(speciesWeight('otter', unlockOtter(sun), gameConfig))
    expect(speciesWeight('rabbit', sun, gameConfig)).toBeGreaterThan(speciesWeight('rabbit', rain, gameConfig))
    const floor = gameConfig.baseVisitsPerPhase * gameConfig.ambienceFloor
    for (const weather of WEATHERS) {
      const street = streetWith({ weather, phase: 'mid' })
      for (const species of STARTERS) expect(speciesWeight(species, street, gameConfig)).toBeGreaterThan(0)
      const visits = expectedVisits({ ambience: 0, festival: false, weather }, gameConfig)
      expect(visits).toBeGreaterThanOrEqual(floor)
      expect(visits).toBe(expectedVisits({ ambience: 0, festival: false }, gameConfig))
    }
  })

  it('changes visitor weights with the night phase and keeps the visit count at or above the ambience floor', () => {
    const dusk = streetWith({ weather: 'sunny', phase: 'dusk' })
    const mid = streetWith({ weather: 'sunny', phase: 'mid' })
    const late = streetWith({ weather: 'sunny', phase: 'late' })
    expect(speciesWeight('sparrow', dusk, gameConfig)).toBeGreaterThan(speciesWeight('sparrow', late, gameConfig))
    expect(speciesWeight('cat', dusk, gameConfig)).toBeGreaterThan(speciesWeight('cat', mid, gameConfig))
    expect(speciesWeight('rabbit', mid, gameConfig)).toBeGreaterThan(speciesWeight('rabbit', dusk, gameConfig))
    expect(speciesWeight('hedgehog', unlockHedgehog(late), gameConfig)).toBeGreaterThan(
      speciesWeight('hedgehog', unlockHedgehog(dusk), gameConfig),
    )
    const floor = gameConfig.baseVisitsPerPhase * gameConfig.ambienceFloor
    for (const street of [dusk, mid, late]) {
      for (const species of STARTERS) expect(speciesWeight(species, street, gameConfig)).toBeGreaterThan(0)
      const visits = expectedVisits({ ambience: 0, festival: false }, gameConfig)
      expect(visits).toBeGreaterThanOrEqual(floor)
    }
    expect(expectedVisits({ ambience: gameConfig.ambienceTarget, festival: false }, gameConfig)).toBe(gameConfig.baseVisitsPerPhase)
  })

  it('changes the fox weight and the visit count on a festival without going under the ambience floor', () => {
    const festival = unlockFox(15, ['A'])
    const quiet = unlockFox(1, ['A'])
    expect(speciesWeight('fox', festival, gameConfig)).toBeGreaterThan(speciesWeight('fox', quiet, gameConfig))
    expect(speciesWeight('fox', quiet, gameConfig)).toBeGreaterThan(0)
    for (const species of STARTERS) expect(speciesWeight(species, festival, gameConfig)).toBeGreaterThan(0)
    const floor = gameConfig.baseVisitsPerPhase * gameConfig.ambienceFloor
    const calm = expectedVisits({ ambience: 0, festival: false }, gameConfig)
    const busy = expectedVisits({ ambience: 0, festival: true }, gameConfig)
    expect(calm).toBe(floor)
    expect(busy).toBeGreaterThan(calm)
    expect(busy).toBeGreaterThanOrEqual(floor)
    expect(busy).toBeCloseTo(floor * gameConfig.festivalBonus)
  })

  it('doubles the red panda on a festival while A or B remains, and still lets them visit otherwise', () => {
    const festival = unlockFox(15, ['B'])
    const quiet = unlockFox(1, ['A', 'B'])
    const leftovers = unlockFox(22, ['C', 'D'])
    const empty = unlockFox(30, ['D'])
    empty.box = null
    expect(foxCanVisit(festival, gameConfig)).toBe(true)
    expect(speciesWeight('fox', festival, gameConfig)).toBe(speciesWeight('fox', quiet, gameConfig) * 2)
    expect(foxCanVisit(quiet, gameConfig)).toBe(true)
    expect(speciesWeight('fox', leftovers, gameConfig)).toBe(speciesWeight('fox', quiet, gameConfig))
    expect(foxCanVisit(empty, gameConfig)).toBe(true)
    expect(speciesWeight('fox', empty, gameConfig)).toBe(speciesWeight('fox', quiet, gameConfig))
  })

  it('triggers the raccoon from the wish pond and bustle, without asking for the figure set again', () => {
    const slots = streetWith().slots.slice()
    slots[8] = stall('wish', 'wish')
    for (let i = 0; i < 7; i += 1) slots[i] = decor('star', `star-${i}`)
    const ready = streetWith({ slots, collection: {}, cleanliness: 0 })
    expect(bearCanVisit(ready, gameConfig)).toBe(true)
    expect(speciesWeight('bear', ready, gameConfig)).toBeGreaterThan(0)
  })

  it('does not trigger the raccoon when the pond or the bustle is missing', () => {
    const slots = streetWith().slots.slice()
    slots[3] = stall('wish', 'wish')
    const noStall = streetWith({ cleanliness: 100 })
    const quiet = streetWith({ slots, cleanliness: 0 })
    expect(bearCanVisit(noStall, gameConfig)).toBe(false)
    expect(speciesWeight('bear', noStall, gameConfig)).toBe(0)
    expect(bearCanVisit(quiet, gameConfig)).toBe(false)
    expect(speciesWeight('bear', quiet, gameConfig)).toBe(0)
  })

  it('writes a letter only above letterSatisfaction', () => {
    const slots = streetWith().slots.slice()
    slots[1] = stall('fortune', 'fortune')
    slots[2] = decor('lantern')
    const ready = streetWith({ slots, cleanliness: 100 })
    const input = {
      species: 'cat' as const,
      stall: 'fortune' as const,
      decor: true,
      street: ready,
      config: gameConfig,
      drewGrade: null,
    }
    expect(gameConfig.letterAt).toBeGreaterThan(0)
    expect(letterFor({ ...input, satisfaction: gameConfig.letterAt })).not.toBeNull()
    expect(letterFor({ ...input, satisfaction: gameConfig.letterAt + 0.05 })).not.toBeNull()
    expect(letterFor({ ...input, satisfaction: gameConfig.letterAt - 0.01 })).toBeNull()
    expect(letterFor({ ...input, satisfaction: 0 })).toBeNull()
  })
})
