import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { expectedVisits } from './ambience'
import { bearCanVisit, foxCanVisit, letterFor, satisfactionOf, speciesWeight } from './animals'
import { decor, ownedSet, stall, streetWith } from './fixtures'
import type { BoxState, Species, Weather } from './types'

const EVERYDAY: Species[] = ['cat', 'rabbit', 'hamster', 'sparrow', 'otter', 'hedgehog']
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
    const busy = slots.slice()
    busy[0] = decor('star', 'star-a')
    busy[1] = decor('star', 'star-b')
    busy[2] = decor('star', 'star-c')
    busy[4] = decor('star', 'star-d')
    const ready = streetWith({ slots: busy, collection: ownedSet(ids), cleanliness: 100 })
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

  it('changes visitor weights with the weather and keeps the visit count at or above the ambience floor', () => {
    const rain = streetWith({ weather: 'rain', phase: 'mid' })
    const sun = streetWith({ weather: 'sunny', phase: 'mid' })
    expect(speciesWeight('cat', rain, gameConfig)).toBeGreaterThan(speciesWeight('cat', sun, gameConfig))
    expect(speciesWeight('otter', rain, gameConfig)).toBeGreaterThan(speciesWeight('otter', sun, gameConfig))
    expect(speciesWeight('rabbit', sun, gameConfig)).toBeGreaterThan(speciesWeight('rabbit', rain, gameConfig))
    const floor = gameConfig.baseVisitsPerPhase * gameConfig.ambienceFloor
    for (const weather of WEATHERS) {
      const street = streetWith({ weather, phase: 'mid' })
      for (const species of EVERYDAY) expect(speciesWeight(species, street, gameConfig)).toBeGreaterThan(0)
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
    expect(speciesWeight('hedgehog', late, gameConfig)).toBeGreaterThan(speciesWeight('hedgehog', dusk, gameConfig))
    const floor = gameConfig.baseVisitsPerPhase * gameConfig.ambienceFloor
    for (const street of [dusk, mid, late]) {
      for (const species of EVERYDAY) expect(speciesWeight(species, street, gameConfig)).toBeGreaterThan(0)
      const visits = expectedVisits({ ambience: 0, festival: false }, gameConfig)
      expect(visits).toBeGreaterThanOrEqual(floor)
    }
    expect(expectedVisits({ ambience: gameConfig.ambienceTarget, festival: false }, gameConfig)).toBe(gameConfig.baseVisitsPerPhase)
  })

  it('changes the fox weight and the visit count on a festival without going under the ambience floor', () => {
    const festival = streetWith({ day: 15, weather: 'sunny', phase: 'mid', box: boxWith(['A']) })
    const quiet = streetWith({ day: 1, weather: 'sunny', phase: 'mid', box: boxWith(['A']) })
    expect(speciesWeight('fox', festival, gameConfig)).toBeGreaterThan(speciesWeight('fox', quiet, gameConfig))
    expect(speciesWeight('fox', quiet, gameConfig)).toBe(0)
    for (const species of EVERYDAY) expect(speciesWeight(species, festival, gameConfig)).toBeGreaterThan(0)
    const floor = gameConfig.baseVisitsPerPhase * gameConfig.ambienceFloor
    const calm = expectedVisits({ ambience: 0, festival: false }, gameConfig)
    const busy = expectedVisits({ ambience: 0, festival: true }, gameConfig)
    expect(calm).toBe(floor)
    expect(busy).toBeGreaterThan(calm)
    expect(busy).toBeGreaterThanOrEqual(floor)
    expect(busy).toBeCloseTo(floor * gameConfig.festivalBonus)
  })

  it('triggers the fox when a festival still has an A or B prize', () => {
    const festival = streetWith({ day: 15, box: boxWith(['B']) })
    expect(foxCanVisit(festival, gameConfig)).toBe(true)
    expect(speciesWeight('fox', festival, gameConfig)).toBeGreaterThan(0)
  })

  it('does not trigger the fox off a festival or after A and B are gone', () => {
    const quiet = streetWith({ day: 1, box: boxWith(['A', 'B']) })
    const leftovers = streetWith({ day: 22, box: boxWith(['C', 'D']) })
    const empty = streetWith({ day: 30, box: null })
    expect(foxCanVisit(quiet, gameConfig)).toBe(false)
    expect(speciesWeight('fox', quiet, gameConfig)).toBe(0)
    expect(foxCanVisit(leftovers, gameConfig)).toBe(false)
    expect(speciesWeight('fox', leftovers, gameConfig)).toBe(0)
    expect(foxCanVisit(empty, gameConfig)).toBe(false)
  })

  it('triggers the cloud bear when the wish pond, the full set, and the ambience target line up', () => {
    const ids = gameConfig.figures.map((figure) => figure.id)
    const slots = streetWith().slots.slice()
    slots[3] = stall('wish', 'wish')
    const busy = slots.slice()
    busy[0] = decor('star', 'star-a')
    busy[1] = decor('star', 'star-b')
    busy[2] = decor('star', 'star-c')
    busy[4] = decor('star', 'star-d')
    const ready = streetWith({ slots: busy, collection: ownedSet(ids), cleanliness: gameConfig.ambienceTarget })
    expect(bearCanVisit(ready, gameConfig)).toBe(true)
    expect(speciesWeight('bear', ready, gameConfig)).toBeGreaterThan(0)
  })

  it('does not trigger the cloud bear when the pond, the set, or the ambience is missing', () => {
    const ids = gameConfig.figures.map((figure) => figure.id)
    const slots = streetWith().slots.slice()
    slots[3] = stall('wish', 'wish')
    const noStall = streetWith({ collection: ownedSet(ids), cleanliness: 100 })
    const incomplete = streetWith({ slots, collection: { temple: 1 }, cleanliness: 100 })
    const dirty = streetWith({ slots, collection: ownedSet(ids), cleanliness: 0 })
    expect(bearCanVisit(noStall, gameConfig)).toBe(false)
    expect(speciesWeight('bear', noStall, gameConfig)).toBe(0)
    expect(bearCanVisit(incomplete, gameConfig)).toBe(false)
    expect(speciesWeight('bear', incomplete, gameConfig)).toBe(0)
    expect(bearCanVisit(dirty, gameConfig)).toBe(false)
    expect(speciesWeight('bear', dirty, gameConfig)).toBe(0)
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
