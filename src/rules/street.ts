import { FORTUNE_LINES } from '../content/fortunes'
import { ambienceScore, expectedVisits } from './ambience'
import { decorNearby, letterFor, pickSpecies, satisfactionOf, speciesDef } from './animals'
import { openBox } from './actions'
import { customerDraw } from './ichiban'
import { createRng, sampleCount } from './rng'
import { applyStaff, greetLevel, stockCap } from './staff'
import { isFestival, nextPhase, rollWeather } from './weather'
import type { GameConfig, Grade, Species, StallType, Street, Visitor } from './types'

export function scheduleArrivals(rate: number, minutes: number, rng: ReturnType<typeof createRng>): number[] {
  const count = sampleCount(rate, rng)
  const ticks: number[] = []
  for (let i = 0; i < count; i++) ticks.push(Math.floor(rng.next() * Math.max(1, minutes)))
  ticks.sort((a, b) => a - b)
  return ticks
}

function stallSlots(street: Street): number[] {
  return street.slots.flatMap((place, index) => (place?.kind === 'stall' ? [index] : []))
}

function stallHasGoods(street: Street, index: number): boolean {
  const place = street.slots[index]
  if (!place || place.kind !== 'stall') return false
  if (place.stallType === 'ichiban') return (street.box?.tickets.length ?? 0) > 0
  return (street.stock[place.uid] ?? 0) > 0
}

export function stallSalePrice(stallType: StallType, level: number, config: GameConfig): number {
  const index = Math.max(0, level - 1)
  const mult = config.levelPriceMultiplier[index] ?? config.levelPriceMultiplier[config.levelPriceMultiplier.length - 1] ?? 1
  return Math.round(config.prices[stallType] * mult)
}

function coins(value: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function targetFor(street: Street, species: Species, config: GameConfig): number {
  const slots = stallSlots(street)
  const ichiban = slots.find((index) => street.slots[index]?.stallType === 'ichiban')
  const box = street.box
  if (ichiban != null && box && box.tickets.length > 0 && (box.idleTicks ?? 0) >= config.ichibanIdleTicks) return ichiban
  const liked = speciesDef(species, config).stall
  const favourite = slots.find((index) => street.slots[index]?.stallType === liked)
  if (favourite != null && stallHasGoods(street, favourite)) return favourite
  const stocked = slots.find((index) => stallHasGoods(street, index))
  return stocked ?? favourite ?? slots[0] ?? 0
}

function anotherStocked(street: Street, except: number): number | null {
  return stallSlots(street).find((index) => index !== except && stallHasGoods(street, index)) ?? null
}

export function spawnVisitor(street: Street, config: GameConfig, species: Species): Street {
  const target = targetFor(street, species, config)
  let next = street
  if (next.box && next.slots[target]?.stallType === 'ichiban' && (next.box.idleTicks ?? 0) >= config.ichibanIdleTicks) {
    next = { ...next, box: { ...next.box, idleTicks: 0 } }
  }
  const visitor: Visitor = {
    id: `v-${next.nextVisitor}`,
    species,
    position: Math.max(0, target - 3),
    target,
    status: 'walk',
    charged: false,
    liked: false,
    satisfaction: 0,
    spent: 0,
    fortune: null,
    drewGrade: null,
  }
  return { ...next, nextVisitor: next.nextVisitor + 1, visitors: [...next.visitors, visitor] }
}

function shop(street: Street, visitor: Visitor, config: GameConfig, rng: ReturnType<typeof createRng>): { street: Street; visitor: Visitor } {
  const index = visitor.target
  const place = street.slots[index]
  if (!place || place.kind !== 'stall' || !place.stallType) {
    return { street, visitor: { ...visitor, status: 'leave', target: config.streetSlots } }
  }
  const liked = speciesDef(visitor.species, config).stall === place.stallType
  const decor = decorNearby(street, index, speciesDef(visitor.species, config).decor)
  let money = coins(street.money)
  let stock = street.stock
  let box = street.box
  let collection = street.collection
  let ownedDecor = street.ownedDecor
  let drewGrade: Grade | null = visitor.drewGrade
  let fortune = visitor.fortune
  let spent = 0

  if (place.stallType === 'ichiban') {
    if (!box || box.tickets.length === 0) {
      const alt = anotherStocked(street, index)
      if (alt != null) return { street, visitor: { ...visitor, status: 'walk', target: alt } }
      return { street, visitor: { ...visitor, status: 'leave', target: config.streetSlots } }
    }
    const drawn = customerDraw({
      box,
      collection,
      ownedDecor,
      drawPrice: stallSalePrice('ichiban', place.level, config),
      config,
    })
    money += drawn.moneyDelta
    spent = drawn.moneyDelta
    box = drawn.box
    collection = drawn.collection
    ownedDecor = drawn.ownedDecor
    drewGrade = drawn.grade
  } else {
    const have = stock[place.uid] ?? 0
    if (have <= 0) {
      const alt = anotherStocked(street, index)
      if (alt != null) return { street, visitor: { ...visitor, status: 'walk', target: alt } }
      return { street, visitor: { ...visitor, status: 'leave', target: config.streetSlots } }
    }
    const price = stallSalePrice(place.stallType, place.level, config)
    const cost = Math.round(price * config.restockCostRatio)
    let gain = price - cost
    if (visitor.charged) gain = Math.round(gain * 1.2)
    money += gain
    spent = gain
    stock = { ...stock, [place.uid]: have - 1 }
    if (place.stallType === 'fortune' && FORTUNE_LINES.length > 0) {
      fortune = FORTUNE_LINES[Math.floor(rng.next() * FORTUNE_LINES.length)] ?? null
    }
  }

  const satisfaction = satisfactionOf({
    liked,
    decor,
    cleanliness: street.cleanliness,
    greet: false,
    greetLevel: greetLevel(street),
    config,
  })
  const letter = letterFor({
    species: visitor.species,
    stall: place.stallType,
    decor,
    street,
    config,
    drewGrade,
    satisfaction,
  })
  let letters = street.letters
  let sentTopics = street.sentTopics
  if (letter) {
    const key = `${visitor.species}:${letter.topic}`
    sentTopics = [...sentTopics, key]
    letters = [...letters, { id: `letter-${street.tick}-${visitor.id}`, species: visitor.species, topic: letter.topic, body: letter.body, tick: street.tick }]
  }

  let status: Visitor['status'] = 'leave'
  let target = config.streetSlots
  let charged = visitor.charged
  if (place.stallType === 'charge' && !visitor.charged) {
    const neighbor = [index - 1, index + 1].find((slot) => street.slots[slot]?.kind === 'stall' && street.slots[slot]?.stallType !== 'charge')
    if (neighbor != null) {
      status = 'walk'
      target = neighbor
      charged = true
    }
  }

  return {
    street: { ...street, money, stock, box, collection, ownedDecor, letters, sentTopics },
    visitor: { ...visitor, status, target, charged, liked, satisfaction, spent, fortune, drewGrade },
  }
}

function moveVisitors(street: Street, config: GameConfig, rng: ReturnType<typeof createRng>): Street {
  let current = street
  const visitors: Visitor[] = []
  for (const visitor of street.visitors) {
    if (visitor.status === 'leave' && visitor.position >= config.streetSlots) continue
    let next = visitor
    if (visitor.position < visitor.target) {
      next = { ...visitor, position: Math.min(visitor.target, visitor.position + config.walkSpeed) }
    }
    if (next.position >= next.target && next.status === 'walk') {
      const shopped = shop(current, next, config, rng)
      current = shopped.street
      next = shopped.visitor
    } else if (next.status === 'leave') {
      next = { ...next, position: next.position + config.walkSpeed }
    }
    if (!(next.status === 'leave' && next.position >= config.streetSlots)) visitors.push(next)
  }
  return { ...current, visitors }
}

function advancePhase(street: Street, config: GameConfig, rng: ReturnType<typeof createRng>): Street {
  const phase = nextPhase(street.phase)
  let day = street.day
  let weather = street.weather
  let pendingWeather = street.pendingWeather
  let wishUsed = street.wishUsed
  let wishMessage = street.wishMessage
  let trending = street.trending
  if (street.phase === 'late') {
    day = (street.day % config.calendarLength) + 1
    weather = pendingWeather ?? rollWeather(rng)
    pendingWeather = null
    wishUsed = false
    wishMessage = null
    const first = config.flavors[Math.floor(rng.next() * config.flavors.length)]?.id ?? 'fly'
    const second = config.flavors[Math.floor(rng.next() * config.flavors.length)]?.id ?? first
    trending = first === second ? [first] : [first, second]
  }
  const cleanliness = Math.max(0, street.cleanliness - config.cleanDropPerPhase - street.arrivals.length * config.cleanDropPerVisitor)
  const draft = { ...street, phase, day, weather, cleanliness }
  const arrivals = scheduleArrivals(
    expectedVisits(
      { ambience: ambienceScore(draft, config), cleanliness: draft.cleanliness, festival: isFestival(day, config) },
      config,
    ),
    config.phaseMinutes,
    rng,
  )
  return { ...draft, pendingWeather, wishUsed, wishMessage, trending, arrivals, phaseTick: 0 }
}

function noteIchibanIdle(street: Street, ticketsBefore: number | null): Street {
  const box = street.box
  if (!box) return street
  if (ticketsBefore == null) return { ...street, box: { ...box, idleTicks: box.idleTicks ?? 0 } }
  if (box.tickets.length < ticketsBefore) return { ...street, box: { ...box, idleTicks: 0 } }
  return { ...street, box: { ...box, idleTicks: (box.idleTicks ?? 0) + 1 } }
}

function restockIchiban(street: Street, config: GameConfig): Street {
  const placed = street.slots.some((slot) => slot?.stallType === 'ichiban')
  if (!placed || street.box) return street
  const boxRestock = street.boxRestock + 1
  if (boxRestock < config.ichibanRestockTicks) return { ...street, boxRestock }
  return openBox({ ...street, boxRestock }, config)
}

export function streetTick(state: Street, config: GameConfig): Street {
  const rng = createRng(state.rngState)
  let street = state.phaseTick >= config.phaseMinutes ? advancePhase(state, config, rng) : state
  const index = street.phaseTick
  street = applyStaff(street, config)
  const ticketsBefore = street.box?.tickets.length ?? null
  street = moveVisitors(street, config, rng)
  const spawns = street.arrivals.filter((tick) => tick === index).length
  for (let i = 0; i < spawns; i++) street = spawnVisitor(street, config, pickSpecies(street, config, rng))
  street = restockIchiban(street, config)
  street = noteIchibanIdle(street, ticketsBefore)
  return {
    ...street,
    rngState: rng.getState(),
    tick: state.tick + 1,
    phaseTick: index + 1,
  }
}

export function runTicks(state: Street, config: GameConfig, count: number): Street {
  let street = state
  for (let i = 0; i < count; i++) street = streetTick(street, config)
  return street
}

export function stockCapFor(level: number, config: GameConfig): number {
  return stockCap(level, config)
}
