import { FORTUNE_LINES } from '../content/fortunes'
import { ambienceScore, expectedVisits, visitAmbience } from './ambience'
import { applyPurchaseAffinity } from './affinity'
import { decorNearby, letterFor, pickSpecies, satisfactionOf, speciesDef } from './animals'
import { eligibleSlots, openBox, placeItem } from './actions'
import { accrueBustle, stallMarketLevel, visitCapFor } from './market'
import { customerDraw } from './ichiban'
import { chooseProduct, ichibanRestockFor, productNet, rollLimitedProduct } from './products'
import { createRng, sampleCount } from './rng'
import { applyStaff, greetLevel, stockCap } from './staff'
import { describeNightEvent, rollNightEvent } from './events'
import { isFestival, nextPhase, rollWeather } from './weather'
import type { GameConfig, Grade, Species, Street, Visitor } from './types'

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

function coins(value: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** A snack shelf with stock. The free ichiban box is not an overflow shelf. */
function snackStocked(street: Street, index: number): boolean {
  const place = street.slots[index]
  if (!place || place.kind !== 'stall' || !place.stallType || place.stallType === 'ichiban') return false
  return (street.stock[place.uid] ?? 0) > 0
}

function targetFor(street: Street, species: Species, config: GameConfig): number {
  const slots = stallSlots(street)
  const ichiban = slots.find((index) => street.slots[index]?.stallType === 'ichiban')
  const box = street.box
  if (ichiban != null && box && box.tickets.length > 0 && (box.idleTicks ?? 0) >= config.ichibanIdleTicks) return ichiban
  const liked = speciesDef(species, config).stall
  const favourite = slots.find((index) => street.slots[index]?.stallType === liked)
  if (favourite != null && stallHasGoods(street, favourite)) return favourite
  const stocked = slots.find((index) => snackStocked(street, index))
  return stocked ?? favourite ?? slots[0] ?? 0
}

function anotherStocked(street: Street, except: number): number | null {
  return stallSlots(street).find((index) => index !== except && snackStocked(street, index)) ?? null
}

export function spawnVisitor(street: Street, config: GameConfig, species: Species): Street {
  const target = targetFor(street, species, config)
  let next = street
  if (!next.seenSpecies.includes(species)) {
    const name = speciesDef(species, config).name
    next = {
      ...next,
      seenSpecies: [...next.seenSpecies, species],
      pendingToasts: [...next.pendingToasts, `新客人：${name}！`],
    }
  }
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
  const spec = speciesDef(visitor.species, config)
  const liked = spec.stall === place.stallType
  const decor = decorNearby(street, index, spec.decor)
  let money = coins(street.money)
  let stock = street.stock
  let box = street.box
  let collection = street.collection
  let ownedDecor = street.ownedDecor
  let drewGrade: Grade | null = visitor.drewGrade
  let fortune = visitor.fortune
  let spent = 0
  let seenProducts = street.seenProducts
  const product = chooseProduct(visitor.species, place.stallType, place.level, config, rng)
  if (!product) {
    const alt = anotherStocked(street, index)
    if (alt != null) return { street, visitor: { ...visitor, status: 'walk', target: alt } }
    return { street, visitor: { ...visitor, status: 'leave', target: config.streetSlots } }
  }
  const favorite = product.id === spec.product
  const limited = street.trending.includes(product.id)

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
      drawPrice: product.price,
      config,
    })
    const extras = drawn.moneyDelta - product.price
    const satisfactionPreview = satisfactionOf({
      liked,
      decor,
      cleanliness: street.cleanliness,
      greet: false,
      greetLevel: greetLevel(street),
      favorite,
      limited,
      config,
    })
    const gain = productNet({
      price: product.price,
      config,
      rarity: spec.rarity,
      favorite,
      charged: false,
      tip: satisfactionPreview >= config.letterAt,
      ichiban: true,
    })
    money += gain + extras
    spent = gain + extras
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
    const satisfactionPreview = satisfactionOf({
      liked,
      decor,
      cleanliness: street.cleanliness,
      greet: false,
      greetLevel: greetLevel(street),
      favorite,
      limited,
      config,
    })
    const gain = productNet({
      price: product.price,
      config,
      rarity: spec.rarity,
      favorite,
      charged: visitor.charged,
      tip: satisfactionPreview >= config.letterAt,
    })
    money += gain
    spent = gain
    stock = { ...stock, [place.uid]: have - 1 }
    if (place.stallType === 'fortune' && FORTUNE_LINES.length > 0) {
      fortune = FORTUNE_LINES[Math.floor(rng.next() * FORTUNE_LINES.length)] ?? null
    }
  }
  if (!seenProducts.includes(product.id)) seenProducts = [...seenProducts, product.id]

  const satisfaction = satisfactionOf({
    liked,
    decor,
    cleanliness: street.cleanliness,
    greet: false,
    greetLevel: greetLevel(street),
    favorite,
    limited,
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
    productId: product.id,
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

  const speciesSatisfaction = {
    ...street.speciesSatisfaction,
    [visitor.species]: Math.max(street.speciesSatisfaction[visitor.species] ?? 0, satisfaction),
  }
  const paid = applyPurchaseAffinity(
    { ...street, money, stock, box, collection, ownedDecor, letters, sentTopics, seenProducts, speciesSatisfaction },
    visitor.species,
    satisfaction,
    config,
  )
  return {
    street: paid,
    visitor: { ...visitor, status, target, charged, liked, satisfaction, spent, fortune, drewGrade, productId: product.id },
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
  const grown = accrueBustle(street, config)
  const phase = nextPhase(grown.phase)
  let day = grown.day
  let weather = grown.weather
  let pendingWeather = grown.pendingWeather
  let wishUsed = grown.wishUsed
  let wishMessage = grown.wishMessage
  let trending = grown.trending
  let nightEvent = grown.nightEvent
  let eventLog = grown.eventLog
  let pendingToasts = grown.pendingToasts
  if (grown.phase === 'late') {
    day = (grown.day % config.calendarLength) + 1
    weather = pendingWeather ?? rollWeather(rng)
    pendingWeather = null
    wishUsed = false
    wishMessage = null
    trending = [rollLimitedProduct(config, rng)]
    const rolled = rollNightEvent(grown.rngState, day, grown, config)
    nightEvent = rolled
    if (rolled) {
      const note = describeNightEvent(rolled, grown.tick, config)
      eventLog = [...eventLog, note].slice(-60)
      pendingToasts = [...pendingToasts, note.title]
    }
  }
  const cleanliness = Math.max(0, grown.cleanliness - config.cleanDropPerPhase - grown.arrivals.length * config.cleanDropPerVisitor)
  const draft = { ...grown, phase, day, weather, cleanliness, nightEvent, eventLog, pendingToasts }
  const arrivals = scheduleArrivals(
    expectedVisits(
      {
        ambience: visitAmbience(ambienceScore(draft, config), draft.marketLevel, config),
        cleanliness: draft.cleanliness,
        festival: isFestival(day, config),
        visitCap: visitCapFor(draft.marketLevel, config),
      },
      config,
    ),
    config.phaseMinutes,
    rng,
  )
  return { ...grantIchiban(draft, config), pendingWeather, wishUsed, wishMessage, trending, arrivals, phaseTick: 0 }
}

/** Reaching the ichiban level opens the booth on an empty slot, without charging coins. */
function grantIchiban(street: Street, config: GameConfig): Street {
  const needed = stallMarketLevel('ichiban', config)
  if (needed == null || street.marketLevel < needed) return street
  if (street.slots.some((slot) => slot?.stallType === 'ichiban')) return street
  const open = eligibleSlots(
    { ...street, money: street.money + config.placeCost.ichiban },
    { kind: 'stall', stallType: 'ichiban' },
    config,
  )
  const slot = open.find((index) => index !== 4) ?? open[0]
  if (slot == null) return street
  const placed = placeItem(
    { ...street, money: street.money + config.placeCost.ichiban },
    slot,
    { kind: 'stall', stallType: 'ichiban' },
    config,
  )
  if (!placed.ok) return street
  return {
    ...placed.street,
    money: street.money,
    pendingToasts: [...placed.street.pendingToasts, '一番賞開張了！'],
  }
}

function noteIchibanIdle(street: Street, ticketsBefore: number | null): Street {
  const box = street.box
  if (!box) return street
  if (ticketsBefore == null) return { ...street, box: { ...box, idleTicks: box.idleTicks ?? 0 } }
  if (box.tickets.length < ticketsBefore) return { ...street, box: { ...box, idleTicks: 0 } }
  return { ...street, box: { ...box, idleTicks: (box.idleTicks ?? 0) + 1 } }
}

function restockIchiban(street: Street, config: GameConfig, rng: ReturnType<typeof createRng>): Street {
  const place = street.slots.find((slot) => slot?.stallType === 'ichiban')
  if (!place || street.box) return street
  const boxRestock = street.boxRestock + 1
  if (boxRestock < ichibanRestockFor(place.level, config)) return { ...street, boxRestock }
  return openBox({ ...street, boxRestock }, config, rng)
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
  street = restockIchiban(street, config, rng)
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
