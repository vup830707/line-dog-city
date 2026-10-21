/**
 * Headless balance simulation. Drives the real street tick, placement, and wish
 * functions (it does not reimplement sales). Run:
 *   npx vite-node scripts/balance-sim.ts
 *
 * Policies:
 * - idle: the shipped new game, no purchases, default jobs
 * - reasonable: same new game; hire, train, upgrade, and place the wish pond
 * - blueprint: empty street and 800 gold, then a fixed layout that puts liked
 *   decorations beside stalls (the spec's "buy your first stall" start)
 * - refund: close every ichiban box the moment it appears (the unpaid refund)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { gameConfig } from '../src/config'
import { createNewGame } from '../src/game/newGame'
import { ambienceScore, expectedVisits } from '../src/rules/ambience'
import { isWishPondUnlocked, ownedCount } from '../src/rules/collection'
import { createRng } from '../src/rules/rng'
import { scheduleArrivals, streetTick } from '../src/rules/street'
import { applyOffline } from '../src/rules/offline'
import { runTicks } from '../src/rules/street'
import {
  assignJob,
  castWish,
  closeBox,
  hireStaff,
  placeItem,
  trainStaff,
  upgradeStall,
} from '../src/rules/actions'
import { isFestival, rollWeather } from '../src/rules/weather'
import type { DecorType, Job, Species, StallType, Street } from '../src/rules/types'

const SEEDS = 32
const HOURS = 12
const LONG_HOURS = 72
const TICKS_PER_HOUR = 3600
const RESERVE = 200
const FIGURE_IDS = gameConfig.figures.map((figure) => figure.id)
const SPECIES: Species[] = ['cat', 'rabbit', 'hamster', 'sparrow', 'otter', 'hedgehog', 'fox', 'bear']
const STALLS: StallType[] = ['ice', 'can', 'charge', 'fortune']
const DIRS = ['/opt/cursor/artifacts/qa-balance', join(process.cwd(), 'docs/qa/out')]

type Policy = 'idle' | 'reasonable' | 'blueprint' | 'refund'
type RGB = [number, number, number]

const BLUEPRINT: Array<{ slot: number; kind: 'stall'; id: StallType } | { slot: number; kind: 'decor'; id: DecorType }> = [
  { slot: 0, kind: 'decor', id: 'lantern' },
  { slot: 1, kind: 'stall', id: 'ice' },
  { slot: 2, kind: 'decor', id: 'flower' },
  { slot: 3, kind: 'stall', id: 'can' },
  { slot: 4, kind: 'decor', id: 'sign' },
  { slot: 5, kind: 'stall', id: 'charge' },
  { slot: 6, kind: 'decor', id: 'seat' },
  { slot: 7, kind: 'stall', id: 'fortune' },
  { slot: 8, kind: 'decor', id: 'lantern' },
  { slot: 9, kind: 'stall', id: 'ichiban' },
  { slot: 10, kind: 'decor', id: 'sign' },
  { slot: 11, kind: 'stall', id: 'wish' },
  { slot: 12, kind: 'decor', id: 'star' },
]

interface SeedResult {
  policy: Policy
  seed: number
  money: number[]
  gross: number[]
  collection: number[]
  stock: Record<(typeof STALLS)[number], number[]>
  tickets: number[]
  species: Record<Species, number>
  festivalSpawns: number
  festivalSpecies: Record<Species, number>
  wishSpawns: number
  bearWhileWish: number
  letters: Species[]
  milestones: Record<string, number | null>
  minOpDelta: number
  maxQuietTicks: number
  maxUnaffordableTicks: number
  boxOpens: number
  draws: number
  finalTickets: number | null
  lastPrize: boolean
  stallTick: number | null
  missing: string[]
  wishCasts: number
  wishHits: number
  safeInteger: boolean
  finalMoney: number
  finalDay: number
  visitFactorSamples: number[]
}

function emptySpecies(): Record<Species, number> {
  return { cat: 0, rabbit: 0, hamster: 0, sparrow: 0, otter: 0, hedgehog: 0, fox: 0, bear: 0 }
}

function dump(name: string, data: string | Buffer): void {
  for (const dir of DIRS) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, name), data)
  }
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * q
  const lo = Math.floor(index)
  const hi = Math.ceil(index)
  const left = sorted[lo] ?? 0
  const right = sorted[hi] ?? left
  if (lo === hi) return left
  return left * (1 - (index - lo)) + right * (index - lo)
}

function median(values: number[]): number {
  return quantile(values, 0.5)
}

function hasStall(street: Street, stallType: StallType): boolean {
  return street.slots.some((slot) => slot?.stallType === stallType)
}

function stallLevel(street: Street, stallType: StallType): number {
  return street.slots.find((slot) => slot?.stallType === stallType)?.level ?? 0
}

function stallStock(street: Street, stallType: StallType): number {
  const place = street.slots.find((slot) => slot?.stallType === stallType)
  if (!place) return 0
  return street.stock[place.uid] ?? 0
}

function firstEmpty(street: Street): number {
  return street.slots.findIndex((slot) => slot == null)
}

function decorCount(street: Street, decorType: DecorType): number {
  return street.slots.filter((slot) => slot?.decorType === decorType).length
}

function decorNeed(decorType: DecorType): number {
  if (decorType === 'lantern' || decorType === 'sign') return 2
  return 1
}

function reschedule(street: Street): Street {
  const rng = createRng(street.rngState)
  const arrivals = scheduleArrivals(
    expectedVisits(
      { ambience: ambienceScore(street, gameConfig), festival: isFestival(street.day, gameConfig) },
      gameConfig,
    ),
    gameConfig.phaseMinutes,
    rng,
  )
  return { ...street, arrivals, rngState: rng.getState() }
}

function blankStreet(seed: number): Street {
  const street = createNewGame(
    { playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 1, seed },
    gameConfig,
  ).street
  return reschedule({
    ...street,
    money: gameConfig.startingMoney,
    slots: Array.from({ length: gameConfig.streetSlots }, () => null),
    stock: {},
    visitors: [],
    box: null,
    boxRestock: 0,
    collection: {},
    ownedDecor: [],
    letters: [],
    sentTopics: [],
    nextVisitor: 1,
  })
}

function giftStreet(seed: number): Street {
  return createNewGame(
    { playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 1, seed },
    gameConfig,
  ).street
}

function nextBlueprint(street: Street): (typeof BLUEPRINT)[number] | null {
  for (const step of BLUEPRINT) {
    if (step.kind === 'stall' && hasStall(street, step.id)) continue
    if (step.kind === 'decor' && decorCount(street, step.id) >= decorNeed(step.id)) continue
    return step
  }
  return null
}

function stepCost(step: (typeof BLUEPRINT)[number]): number {
  return step.kind === 'stall' ? gameConfig.placeCost[step.id] : gameConfig.decorCost[step.id]
}

function stepLocked(street: Street, step: (typeof BLUEPRINT)[number]): boolean {
  if (step.kind === 'stall' && step.id === 'wish') return !isWishPondUnlocked(street.collection, FIGURE_IDS)
  if (step.kind === 'decor' && step.id === 'star') return !isWishPondUnlocked(street.collection, FIGURE_IDS)
  return false
}

function assignJobs(street: Street): Street {
  let next = street
  for (let index = 0; index < street.staff.length; index++) {
    const member = street.staff[index]
    if (!member) continue
    const job: Job = index === 0 ? (street.cleanliness < 98 ? 'clean' : 'greet') : 'restock'
    if (member.job === job) continue
    const result = assignJob(next, member.id, job)
    if (result.ok) next = result.street
  }
  return next
}

function develop(street: Street, policy: Policy): { street: Street; wishCast: boolean; wishHit: boolean } {
  if (policy === 'idle') return { street, wishCast: false, wishHit: false }
  if (policy === 'refund') {
    if (street.box && street.box.tickets.length > 0) {
      const closed = closeBox(street, gameConfig)
      if (closed.ok) return { street: closed.street, wishCast: false, wishHit: false }
    }
    return { street, wishCast: false, wishHit: false }
  }

  let next = assignJobs(street)
  if (policy === 'blueprint') {
    const step = nextBlueprint(next)
    if (step && !stepLocked(next, step) && next.money >= stepCost(step)) {
      const slot = next.slots[step.slot] ? firstEmpty(next) : step.slot
      if (slot >= 0) {
        const item = step.kind === 'stall' ? { kind: 'stall' as const, stallType: step.id } : { kind: 'decor' as const, decorType: step.id }
        const placed = placeItem(next, slot, item, gameConfig)
        if (placed.ok) next = placed.street
      }
    }
    if (nextBlueprint(next)) return { street: next, wishCast: false, wishHit: false }
  }

  const unlocked = isWishPondUnlocked(next.collection, FIGURE_IDS)
  if (!hasStall(next, 'wish') && unlocked) {
    const slot = firstEmpty(next)
    if (slot >= 0) {
      const placed = placeItem(next, slot, { kind: 'stall', stallType: 'wish' }, gameConfig)
      if (placed.ok) next = placed.street
    }
  }

  const decorOrder: DecorType[] = ['sign', 'seat', 'lantern', 'flower', 'star']
  for (const decorType of decorOrder) {
    const cap = decorType === 'lantern' || decorType === 'star' ? 2 : 1
    if (decorCount(next, decorType) >= cap) continue
    if (decorType === 'star' && !isWishPondUnlocked(next.collection, FIGURE_IDS)) continue
    if (next.money < gameConfig.decorCost[decorType] + RESERVE) continue
    const slot = firstEmpty(next)
    if (slot < 0) break
    const placed = placeItem(next, slot, { kind: 'decor', decorType }, gameConfig)
    if (placed.ok) {
      next = placed.street
      break
    }
  }

  const hired = next.staff.filter((member) => member.kind === 'hire').length
  const hireCost = gameConfig.hireCost[hired]
  if (hired < gameConfig.maxHires && hireCost != null && next.money >= hireCost + RESERVE) {
    const hiredResult = hireStaff(next, gameConfig)
    if (hiredResult.ok) next = hiredResult.street
  }

  const trainee = [...next.staff].sort((a, b) => a.level - b.level).find((member) => member.level < gameConfig.maxStaffLevel)
  if (trainee) {
    const cost = gameConfig.levelCost[trainee.level - 1]
    if (cost != null && next.money >= cost + RESERVE) {
      const trained = trainStaff(next, trainee.id, gameConfig)
      if (trained.ok) next = trained.street
    }
  }

  let best: { slot: number; cost: number } | null = null
  next.slots.forEach((place, slot) => {
    if (!place?.stallType) return
    const costs = gameConfig.upgradeCost[place.stallType]
    if (place.level >= costs.length + 1) return
    const cost = costs[place.level - 1]
    if (cost == null) return
    if (!best || cost < best.cost) best = { slot, cost }
  })
  if (best && next.money >= best.cost + RESERVE) {
    const upgraded = upgradeStall(next, best.slot, gameConfig)
    if (upgraded.ok) next = upgraded.street
  }

  let wishCast = false
  let wishHit = false
  if (hasStall(next, 'wish') && !next.wishUsed && isWishPondUnlocked(next.collection, FIGURE_IDS)) {
    const wished = castWish(next, 'sunny', gameConfig)
    if (wished.ok) {
      next = wished.street
      wishCast = true
      wishHit = next.pendingWeather === 'sunny'
    }
  }
  return { street: next, wishCast, wishHit }
}

function pendingCost(street: Street, policy: Policy): number | null {
  if (policy === 'idle' || policy === 'refund') return null
  if (policy === 'blueprint') {
    const step = nextBlueprint(street)
    if (step) return stepLocked(street, step) ? null : stepCost(step)
  }
  const costs: number[] = []
  const unlocked = isWishPondUnlocked(street.collection, FIGURE_IDS)
  if (!hasStall(street, 'wish') && unlocked && firstEmpty(street) >= 0) costs.push(gameConfig.placeCost.wish)
  for (const decorType of ['sign', 'seat', 'lantern', 'flower', 'star'] as const) {
    const cap = decorType === 'lantern' || decorType === 'star' ? 2 : 1
    if (decorCount(street, decorType) >= cap) continue
    if (decorType === 'star' && !unlocked) continue
    if (firstEmpty(street) < 0) break
    costs.push(gameConfig.decorCost[decorType])
  }
  const hired = street.staff.filter((member) => member.kind === 'hire').length
  const hireCost = gameConfig.hireCost[hired]
  if (hired < gameConfig.maxHires && hireCost != null) costs.push(hireCost)
  const trainee = street.staff.find((member) => member.level < gameConfig.maxStaffLevel)
  if (trainee) {
    const cost = gameConfig.levelCost[trainee.level - 1]
    if (cost != null) costs.push(cost)
  }
  for (const place of street.slots) {
    if (!place?.stallType) continue
    const costsForStall = gameConfig.upgradeCost[place.stallType]
    if (place.level >= costsForStall.length + 1) continue
    const cost = costsForStall[place.level - 1]
    if (cost != null) costs.push(cost)
  }
  if (costs.length === 0) return null
  return Math.min(...costs)
}

function noteMilestones(result: SeedResult, street: Street, tick: number): void {
  const mark = (name: string, ready: boolean) => {
    if (ready && result.milestones[name] == null) result.milestones[name] = tick
  }
  mark('hire-1', street.staff.filter((member) => member.kind === 'hire').length >= 1)
  mark('hire-2', street.staff.filter((member) => member.kind === 'hire').length >= 2)
  for (const stallType of ['ice', 'can', 'charge', 'fortune', 'ichiban', 'wish'] as const) {
    mark(`${stallType}-lv2`, stallLevel(street, stallType) >= 2)
    mark(`${stallType}-lv3`, stallLevel(street, stallType) >= 3)
  }
  mark('wish-placed', hasStall(street, 'wish'))
  mark('collection', ownedCount(street.collection, FIGURE_IDS) >= FIGURE_IDS.length)
  for (const species of SPECIES) mark(`letter-${species}`, street.letters.some((letter) => letter.species === species))
  mark('fox-seen', result.species.fox > 0)
  mark('bear-seen', result.species.bear > 0)
}

function freshResult(policy: Policy, seed: number, street: Street): SeedResult {
  const stock = { ice: [] as number[], can: [] as number[], charge: [] as number[], fortune: [] as number[] }
  return {
    policy,
    seed,
    money: [street.money],
    gross: [],
    collection: [ownedCount(street.collection, FIGURE_IDS)],
    stock,
    tickets: [street.box?.tickets.length ?? 0],
    species: emptySpecies(),
    festivalSpawns: 0,
    festivalSpecies: emptySpecies(),
    wishSpawns: 0,
    bearWhileWish: 0,
    letters: [],
    milestones: {},
    minOpDelta: 0,
    maxQuietTicks: 0,
    maxUnaffordableTicks: 0,
    boxOpens: 0,
    draws: 0,
    finalTickets: null,
    lastPrize: false,
    stallTick: null,
    missing: [],
    wishCasts: 0,
    wishHits: 0,
    safeInteger: true,
    finalMoney: street.money,
    finalDay: street.day,
    visitFactorSamples: [],
  }
}

function simulate(seed: number, policy: Policy, hours: number, origin: 'gift' | 'blank'): SeedResult {
  let street = origin === 'gift' ? giftStreet(seed) : blankStreet(seed)
  const seen = new Set(street.visitors.map((visitor) => visitor.id))
  const result = freshResult(policy, seed, street)
  let quiet = 0
  let unaffordable = 0
  let hourGross = 0
  let lastDrawTick = 0
  const total = hours * TICKS_PER_HOUR

  for (let tick = 1; tick <= total; tick++) {
    const beforeMoney = street.money
    const beforeTickets = street.box ? street.box.tickets.length : null
    street = streetTick(street, gameConfig)
    const tickGain = street.money - beforeMoney
    result.minOpDelta = Math.min(result.minOpDelta, tickGain)
    if (tickGain > 0) quiet = 0
    else {
      quiet += 1
      result.maxQuietTicks = Math.max(result.maxQuietTicks, quiet)
    }
    if (!Number.isSafeInteger(street.money)) result.safeInteger = false

    const afterTickets = street.box ? street.box.tickets.length : null
    if (beforeTickets == null && afterTickets != null) result.boxOpens += 1
    if (beforeTickets != null && afterTickets != null && afterTickets < beforeTickets) {
      result.draws += beforeTickets - afterTickets
      lastDrawTick = tick
    }
    if (beforeTickets != null && afterTickets == null) {
      result.draws += beforeTickets
      lastDrawTick = tick
    }
    if (
      result.boxOpens >= 1 &&
      street.box &&
      street.box.tickets.length > 0 &&
      lastDrawTick > 0 &&
      tick - lastDrawTick >= TICKS_PER_HOUR &&
      result.stallTick == null
    ) {
      result.stallTick = tick
    }

    for (const visitor of street.visitors) {
      if (seen.has(visitor.id)) continue
      seen.add(visitor.id)
      result.species[visitor.species] += 1
      if (isFestival(street.day, gameConfig)) {
        result.festivalSpawns += 1
        result.festivalSpecies[visitor.species] += 1
      }
      if (hasStall(street, 'wish')) {
        result.wishSpawns += 1
        if (visitor.species === 'bear') result.bearWhileWish += 1
      }
    }

    const afterTick = street.money
    if (tick % 10 === 0) {
      const acted = develop(street, policy)
      street = acted.street
      if (acted.wishCast) {
        result.wishCasts += 1
        if (acted.wishHit) result.wishHits += 1
      }
    }
    hourGross += Math.max(0, tickGain) + Math.max(0, street.money - afterTick)
    if (!Number.isSafeInteger(street.money)) result.safeInteger = false

    const wanted = pendingCost(street, policy)
    if (wanted != null && street.money < wanted) {
      unaffordable += 1
      result.maxUnaffordableTicks = Math.max(result.maxUnaffordableTicks, unaffordable)
    } else {
      unaffordable = 0
    }
    noteMilestones(result, street, tick)

    if (tick % TICKS_PER_HOUR === 0) {
      result.money.push(street.money)
      result.gross.push(hourGross)
      result.collection.push(ownedCount(street.collection, FIGURE_IDS))
      for (const stallType of STALLS) result.stock[stallType].push(stallStock(street, stallType))
      result.tickets.push(street.box?.tickets.length ?? 0)
      const ambience = ambienceScore(street, gameConfig)
      const factor = Math.min(gameConfig.ambienceCap, Math.max(gameConfig.ambienceFloor, ambience / gameConfig.ambienceTarget))
      result.visitFactorSamples.push(factor)
      hourGross = 0
    }
  }

  result.letters = [...new Set(street.letters.map((letter) => letter.species))]
  result.finalTickets = street.box ? street.box.tickets.length : null
  result.lastPrize = street.ownedDecor.includes('lantern') || Boolean(street.box?.lastPrize.awarded)
  result.missing = gameConfig.figures.filter((figure) => (street.collection[figure.id] ?? 0) < 1).map((figure) => figure.id)
  result.finalMoney = street.money
  result.finalDay = street.day
  return result
}

function column<T>(rows: T[], pick: (row: T) => number): number[] {
  return rows.map(pick)
}

function fit(xs: number[], ys: number[]): { slope: number; r2: number } {
  const n = xs.length
  if (n === 0) return { slope: 0, r2: 0 }
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n
  let num = 0
  let den = 0
  let spread = 0
  for (let i = 0; i < n; i++) {
    const x = (xs[i] ?? 0) - meanX
    const y = (ys[i] ?? 0) - meanY
    num += x * y
    den += x * x
    spread += y * y
  }
  const slope = den === 0 ? 0 : num / den
  const intercept = meanY - slope * meanX
  let residual = 0
  for (let i = 0; i < n; i++) {
    const yHat = slope * (xs[i] ?? 0) + intercept
    residual += ((ys[i] ?? 0) - yHat) ** 2
  }
  return { slope, r2: spread === 0 ? 1 : 1 - residual / spread }
}

function wishBench(trials: number): { trials: number; mechanismRate: number; outcomeRate: number } {
  const slots = Array.from({ length: gameConfig.streetSlots }, () => null)
  slots[0] = { uid: 'wish', kind: 'stall', stallType: 'wish', level: 1 }
  const collection = Object.fromEntries(FIGURE_IDS.map((id) => [id, 1]))
  const base = blankStreet(1)
  let mechanism = 0
  let outcome = 0
  let state = 1
  for (let i = 0; i < trials; i++) {
    const rng = createRng(state)
    rollWeather(rng)
    const roll = rng.next()
    const result = castWish(
      { ...base, slots, collection, wishUsed: false, rngState: state },
      'rain',
      gameConfig,
    )
    if (!result.ok) throw new Error(`wish rejected: ${result.reason ?? ''}`)
    if (roll < gameConfig.wishSuccessRate) mechanism += 1
    if (result.street.pendingWeather === 'rain') outcome += 1
    state = result.street.rngState
  }
  return { trials, mechanismRate: mechanism / trials, outcomeRate: outcome / trials }
}

function offlineBench(seeds: number): { seed: number; offline: number; online: number; match: boolean }[] {
  const rows = []
  for (let seed = 1; seed <= seeds; seed++) {
    const start = giftStreet(seed)
    const offline = applyOffline(start, 8 * 3_600_000, gameConfig)
    const online = runTicks(start, gameConfig, 8 * TICKS_PER_HOUR)
    rows.push({
      seed,
      offline: offline.earned,
      online: online.money - start.money,
      match: offline.street.money === online.money && offline.street.rngState === online.rngState && offline.street.tick === online.tick,
    })
  }
  return rows
}

function csv(rows: string[][]): string {
  return rows.map((row) => row.join(',')).join('\n') + '\n'
}

function hourHeader(): string[] {
  return ['policy', 'seed', 'hour', 'money', 'gross', 'collection', 'ice', 'can', 'charge', 'fortune', 'tickets']
}

const GLYPH: Record<string, number[]> = {
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [14, 17, 1, 6, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 14],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [14, 17, 16, 14, 1, 17, 14],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 12, 12],
  ':': [0, 12, 12, 0, 12, 12, 0],
  '/': [1, 2, 2, 4, 8, 8, 16],
  '%': [19, 19, 2, 4, 8, 25, 25],
  '+': [0, 4, 4, 31, 4, 4, 0],
  '?': [14, 17, 1, 2, 4, 0, 4],
}

class Plot {
  readonly pixels: Uint8Array
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Uint8Array(width * height * 4)
    this.fill(0, 0, width, height, [255, 250, 243])
  }

  fill(x: number, y: number, w: number, h: number, color: RGB): void {
    const x0 = Math.max(0, Math.floor(x))
    const y0 = Math.max(0, Math.floor(y))
    const x1 = Math.min(this.width, Math.ceil(x + w))
    const y1 = Math.min(this.height, Math.ceil(y + h))
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) this.set(px, py, color)
    }
  }

  set(x: number, y: number, color: RGB): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const index = (y * this.width + x) * 4
    this.pixels[index] = color[0]
    this.pixels[index + 1] = color[1]
    this.pixels[index + 2] = color[2]
    this.pixels[index + 3] = 255
  }

  line(x0: number, y0: number, x1: number, y1: number, color: RGB): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      const x = Math.round(x0 + (x1 - x0) * t)
      const y = Math.round(y0 + (y1 - y0) * t)
      this.set(x, y, color)
      this.set(x + 1, y, color)
      this.set(x, y + 1, color)
    }
  }

  text(value: string, x: number, y: number, color: RGB, scale = 2): void {
    let cursor = x
    for (const char of value.toUpperCase()) {
      if (char === ' ') {
        cursor += 4 * scale
        continue
      }
      const glyph = GLYPH[char] ?? GLYPH['?'] ?? []
      for (let row = 0; row < glyph.length; row++) {
        const bits = glyph[row] ?? 0
        for (let col = 0; col < 5; col++) {
          if ((bits & (1 << (4 - col))) === 0) continue
          this.fill(cursor + col * scale, y + row * scale, scale, scale, color)
        }
      }
      cursor += 6 * scale
    }
  }

  png(): Buffer {
    const raw = Buffer.alloc((this.width * 4 + 1) * this.height)
    for (let y = 0; y < this.height; y++) {
      const row = y * (this.width * 4 + 1)
      raw[row] = 0
      Buffer.from(this.pixels.buffer, this.pixels.byteOffset + y * this.width * 4, this.width * 4).copy(raw, row + 1)
    }
    return encodePng(this.width, this.height, raw)
  }
}

function encodePng(width: number, height: number, raw: Buffer): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))])
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function crc32(buf: Buffer): number {
  let crc = ~0
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i] ?? 0
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function formatNum(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${Math.round(value / 1000)}K`
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}K`
  return String(Math.round(value))
}

interface LineSeries {
  name: string
  color: RGB
  y: number[]
  band?: { low: number[]; high: number[]; color: RGB }
}

function plotLines(title: string, xLabel: string, yLabel: string, x: number[], series: LineSeries[]): Buffer {
  const plot = new Plot(960, 540)
  const left = 78
  const right = 930
  const top = 46
  const bottom = 470
  const ink: RGB = [36, 23, 15]
  const grid: RGB = [226, 214, 196]
  const ys = series.flatMap((item) => [...item.y, ...(item.band?.low ?? []), ...(item.band?.high ?? [])])
  let min = Math.min(...ys)
  let max = Math.max(...ys)
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0
    max = 1
  }
  if (min > 0 && min < max * 0.2) min = 0
  if (min === max) max = min + 1
  const pad = (max - min) * 0.06
  min -= pad
  max += pad
  const xOf = (value: number) => {
    const start = x[0] ?? 0
    const end = x[x.length - 1] ?? start + 1
    return left + ((value - start) / (end - start || 1)) * (right - left)
  }
  const yOf = (value: number) => bottom - ((value - min) / (max - min || 1)) * (bottom - top)
  plot.text(title, 24, 14, ink, 2)
  for (let step = 0; step <= 4; step++) {
    const value = min + ((max - min) * step) / 4
    const y = yOf(value)
    plot.line(left, y, right, y, grid)
    plot.text(formatNum(value), 8, y - 6, ink, 1)
  }
  plot.line(left, top, left, bottom, ink)
  plot.line(left, bottom, right, bottom, ink)
  for (const item of series) {
    if (item.band) {
      for (let i = 0; i < x.length; i++) {
        const low = item.band.low[i] ?? 0
        const high = item.band.high[i] ?? low
        plot.line(xOf(x[i] ?? 0), yOf(low), xOf(x[i] ?? 0), yOf(high), item.band.color)
      }
    }
    for (let i = 1; i < x.length; i++) {
      plot.line(xOf(x[i - 1] ?? 0), yOf(item.y[i - 1] ?? 0), xOf(x[i] ?? 0), yOf(item.y[i] ?? 0), item.color)
    }
  }
  series.forEach((item, index) => {
    const y = 18 + index * 16
    plot.fill(520, y, 18, 8, item.color)
    plot.text(item.name, 546, y - 4, ink, 1)
  })
  plot.text(xLabel, 430, 500, ink, 2)
  plot.text(yLabel, 8, 28, ink, 1)
  return plot.png()
}

function plotBars(title: string, labels: string[], series: { name: string; color: RGB; values: number[] }[]): Buffer {
  const plot = new Plot(960, 540)
  const ink: RGB = [36, 23, 15]
  const left = 70
  const right = 930
  const top = 50
  const bottom = 460
  const max = Math.max(1, ...series.flatMap((item) => item.values))
  plot.text(title, 24, 14, ink, 2)
  plot.line(left, top, left, bottom, ink)
  plot.line(left, bottom, right, bottom, ink)
  const group = (right - left) / labels.length
  const bar = Math.max(8, (group * 0.7) / series.length)
  labels.forEach((label, index) => {
    series.forEach((item, seriesIndex) => {
      const value = item.values[index] ?? 0
      const h = (value / max) * (bottom - top - 10)
      const x = left + index * group + 8 + seriesIndex * (bar + 2)
      plot.fill(x, bottom - h, bar, h, item.color)
    })
    plot.text(label, left + index * group + 6, 478, ink, 1)
  })
  series.forEach((item, index) => {
    plot.fill(520, 16 + index * 16, 18, 8, item.color)
    plot.text(item.name, 546, 12 + index * 16, ink, 1)
  })
  plot.text('PERCENT', 8, 28, ink, 1)
  return plot.png()
}

function seriesBand(rows: SeedResult[], pick: (row: SeedResult, hour: number) => number, hours: number): { mid: number[]; low: number[]; high: number[] } {
  const mid: number[] = []
  const low: number[] = []
  const high: number[] = []
  for (let hour = 0; hour <= hours; hour++) {
    const values = rows.map((row) => pick(row, hour))
    mid.push(median(values))
    low.push(quantile(values, 0.1))
    high.push(quantile(values, 0.9))
  }
  return { mid, low, high }
}

function share(rows: SeedResult[], species: Species, festival: boolean): number {
  let part = 0
  let total = 0
  for (const row of rows) {
    const bag = festival ? row.festivalSpecies : row.species
    const all = festival ? row.festivalSpawns : SPECIES.reduce((sum, id) => sum + row.species[id], 0)
    part += bag[species]
    total += all
  }
  return total === 0 ? 0 : (100 * part) / total
}

function completed(rows: SeedResult[]): number {
  return rows.filter((row) => row.milestones.collection != null).length
}

function main(): void {
  const started = Date.now()
  console.log(`sim seeds=${SEEDS} hours=${HOURS}`)
  const idle = Array.from({ length: SEEDS }, (_, index) => simulate(index + 1, 'idle', HOURS, 'gift'))
  console.log(`idle ${((Date.now() - started) / 1000).toFixed(1)}s`)
  const reasonable = Array.from({ length: SEEDS }, (_, index) => simulate(index + 1, 'reasonable', HOURS, 'gift'))
  console.log(`reasonable ${((Date.now() - started) / 1000).toFixed(1)}s`)
  const blueprint = Array.from({ length: SEEDS }, (_, index) => simulate(index + 1, 'blueprint', HOURS, 'blank'))
  console.log(`blueprint ${((Date.now() - started) / 1000).toFixed(1)}s`)
  const refund = Array.from({ length: 8 }, (_, index) => simulate(index + 1, 'refund', 3, 'gift'))
  const idleShort = idle.map((row) => ({ ...row, money: row.money.slice(0, 4), gross: row.gross.slice(0, 3) }))
  const longIdle = simulate(1, 'idle', LONG_HOURS, 'gift')
  const longReasonable = simulate(1, 'reasonable', LONG_HOURS, 'gift')
  console.log(`long ${((Date.now() - started) / 1000).toFixed(1)}s`)
  const wishes = wishBench(20_000)
  console.log(`wish ${((Date.now() - started) / 1000).toFixed(1)}s`)
  const offline = offlineBench(4)
  const levers = controlled(8, 2)
  console.log(`offline+levers ${((Date.now() - started) / 1000).toFixed(1)}s`)

  const groups: Record<string, SeedResult[]> = { idle, reasonable, blueprint, refund }
  const hourlyRows: string[][] = [hourHeader()]
  for (const rows of [idle, reasonable, blueprint, refund]) {
    for (const row of rows) {
      for (let hour = 0; hour < row.money.length; hour++) {
        hourlyRows.push([
          row.policy,
          String(row.seed),
          String(hour),
          String(row.money[hour] ?? 0),
          String(hour === 0 ? 0 : (row.gross[hour - 1] ?? 0)),
          String(row.collection[hour] ?? 0),
          String(hour === 0 ? '' : (row.stock.ice[hour - 1] ?? 0)),
          String(hour === 0 ? '' : (row.stock.can[hour - 1] ?? 0)),
          String(hour === 0 ? '' : (row.stock.charge[hour - 1] ?? 0)),
          String(hour === 0 ? '' : (row.stock.fortune[hour - 1] ?? 0)),
          String(row.tickets[hour] ?? 0),
        ])
      }
    }
  }
  dump('hourly.csv', csv(hourlyRows))

  const summaryRows: string[][] = [[
    'policy', 'seed', 'final_money', 'collection_hour', 'box_opens', 'draws', 'final_tickets', 'stall_hour',
    'missing', 'letters', 'min_op_delta', 'max_quiet_min', 'max_unaffordable_min', 'wish_casts', 'wish_hits',
    'fox', 'bear', 'spawns', 'safe_integer',
  ]]
  for (const rows of Object.values(groups)) {
    for (const row of rows) {
      const spawns = SPECIES.reduce((sum, species) => sum + row.species[species], 0)
      summaryRows.push([
        row.policy,
        String(row.seed),
        String(row.finalMoney),
        row.milestones.collection == null ? '' : (row.milestones.collection / TICKS_PER_HOUR).toFixed(3),
        String(row.boxOpens),
        String(row.draws),
        row.finalTickets == null ? '' : String(row.finalTickets),
        row.stallTick == null ? '' : (row.stallTick / TICKS_PER_HOUR).toFixed(3),
        row.missing.join('|'),
        row.letters.join('|'),
        String(row.minOpDelta),
        (row.maxQuietTicks / 60).toFixed(2),
        (row.maxUnaffordableTicks / 60).toFixed(2),
        String(row.wishCasts),
        String(row.wishHits),
        String(row.species.fox),
        String(row.species.bear),
        String(spawns),
        row.safeInteger ? '1' : '0',
      ])
    }
  }
  dump('summary.csv', csv(summaryRows))

  const milestoneNames = [
    'hire-1', 'hire-2', 'ice-lv2', 'ice-lv3', 'can-lv2', 'can-lv3', 'charge-lv2', 'charge-lv3',
    'fortune-lv2', 'fortune-lv3', 'ichiban-lv2', 'ichiban-lv3', 'wish-placed', 'wish-lv2', 'wish-lv3',
    'collection', 'letter-cat', 'letter-rabbit', 'letter-hamster', 'letter-sparrow', 'letter-otter',
    'letter-hedgehog', 'letter-fox', 'letter-bear', 'fox-seen', 'bear-seen',
  ]
  const milestoneRows: string[][] = [['policy', 'milestone', 'seeds', 'median_hour', 'p10_hour', 'p90_hour']]
  for (const [policy, rows] of Object.entries(groups)) {
    for (const name of milestoneNames) {
      const hoursHit = rows.flatMap((row) => {
        const tick = row.milestones[name]
        return tick == null ? [] : [tick / TICKS_PER_HOUR]
      })
      milestoneRows.push([
        policy,
        name,
        String(hoursHit.length),
        hoursHit.length ? median(hoursHit).toFixed(3) : '',
        hoursHit.length ? quantile(hoursHit, 0.1).toFixed(3) : '',
        hoursHit.length ? quantile(hoursHit, 0.9).toFixed(3) : '',
      ])
    }
  }
  dump('milestones.csv', csv(milestoneRows))

  const speciesRows: string[][] = [['policy', 'species', 'share_pct', 'festival_share_pct']]
  for (const policy of ['idle', 'reasonable', 'blueprint'] as const) {
    for (const species of SPECIES) {
      speciesRows.push([
        policy,
        species,
        share(groups[policy] ?? [], species, false).toFixed(3),
        share(groups[policy] ?? [], species, true).toFixed(3),
      ])
    }
  }
  dump('species.csv', csv(speciesRows))

  const offlineRows: string[][] = [['seed', 'offline_earned', 'online_earned', 'match']]
  for (const row of offline) offlineRows.push([String(row.seed), String(row.offline), String(row.online), row.match ? '1' : '0'])
  dump('offline.csv', csv(offlineRows))

  const longRows: string[][] = [['policy', 'hour', 'money', 'gross']]
  for (const row of [longIdle, longReasonable]) {
    for (let hour = 0; hour < row.money.length; hour++) {
      longRows.push([row.policy, String(hour), String(row.money[hour] ?? 0), String(hour === 0 ? 0 : (row.gross[hour - 1] ?? 0))])
    }
  }
  dump('long.csv', csv(longRows))

  const hours = Array.from({ length: HOURS + 1 }, (_, hour) => hour)
  const goldSeries = (['idle', 'reasonable', 'blueprint'] as const).map((policy) => {
    const band = seriesBand(groups[policy] ?? [], (row, hour) => row.money[hour] ?? 0, HOURS)
    const color: RGB = policy === 'idle' ? [196, 107, 44] : policy === 'reasonable' ? [31, 122, 77] : [44, 90, 160]
    const wash: RGB = policy === 'idle' ? [232, 196, 160] : policy === 'reasonable' ? [176, 214, 190] : [186, 204, 230]
    return { name: policy, color, y: band.mid, band: { low: band.low, high: band.high, color: wash } }
  })
  dump('gold-curve.png', plotLines('GOLD VS HOUR', 'HOUR', 'GOLD', hours, goldSeries))

  const incomeHours = Array.from({ length: HOURS }, (_, hour) => hour + 1)
  const incomeSeries = (['idle', 'reasonable', 'blueprint'] as const).map((policy) => {
    const rows = groups[policy] ?? []
    const color: RGB = policy === 'idle' ? [196, 107, 44] : policy === 'reasonable' ? [31, 122, 77] : [44, 90, 160]
    return {
      name: policy,
      color,
      y: incomeHours.map((hour) => median(rows.map((row) => row.gross[hour - 1] ?? 0))),
    }
  })
  dump('income-curve.png', plotLines('GROSS INCOME PER HOUR', 'HOUR', 'GOLD', incomeHours, incomeSeries))

  const stockSeries: LineSeries[] = [
    { name: 'ice', color: [196, 107, 44], y: [] },
    { name: 'can', color: [44, 90, 160], y: [] },
    { name: 'charge', color: [31, 122, 77], y: [] },
    { name: 'fortune', color: [128, 64, 128], y: [] },
  ]
  for (const stallType of STALLS) {
    const series = stockSeries.find((item) => item.name === stallType)
    if (!series) continue
    series.y = incomeHours.map((hour) => median(idle.map((row) => row.stock[stallType][hour - 1] ?? 0)))
  }
  dump('stock-idle.png', plotLines('IDLE SHELF STOCK', 'HOUR', 'STOCK', incomeHours, stockSeries))

  const collectionSeries: LineSeries[] = (['idle', 'reasonable', 'blueprint'] as const).map((policy) => {
    const rows = groups[policy] ?? []
    const color: RGB = policy === 'idle' ? [196, 107, 44] : policy === 'reasonable' ? [31, 122, 77] : [44, 90, 160]
    return {
      name: policy,
      color,
      y: hours.map((hour) => (100 * rows.filter((row) => (row.collection[hour] ?? 0) >= 8).length) / rows.length),
    }
  })
  dump('collection-rate.png', plotLines('FULL SET BY HOUR', 'HOUR', 'PERCENT', hours, collectionSeries))

  dump(
    'species-share.png',
    plotBars(
      'SPAWN SHARE',
      SPECIES,
      (['idle', 'reasonable', 'blueprint'] as const).map((policy) => ({
        name: policy,
        color: (policy === 'idle' ? [196, 107, 44] : policy === 'reasonable' ? [31, 122, 77] : [44, 90, 160]) as RGB,
        values: SPECIES.map((species) => share(groups[policy] ?? [], species, false)),
      })),
    ),
  )

  const refundHours = [0, 1, 2, 3]
  dump(
    'refund-gold.png',
    plotLines('REFUND LOOP VS IDLE', 'HOUR', 'GOLD', refundHours, [
      {
        name: 'idle',
        color: [196, 107, 44],
        y: refundHours.map((hour) => median(idleShort.map((row) => row.money[hour] ?? 0))),
      },
      {
        name: 'refund',
        color: [163, 32, 32],
        y: refundHours.map((hour) => median(refund.map((row) => row.money[hour] ?? 0))),
      },
    ]),
  )

  const longHours = Array.from({ length: LONG_HOURS + 1 }, (_, hour) => hour)
  dump(
    'gold-long.png',
    plotLines('ONE SEED FOR 72 HOURS', 'HOUR', 'GOLD', longHours, [
      { name: 'idle', color: [196, 107, 44], y: longIdle.money },
      { name: 'reasonable', color: [31, 122, 77], y: longReasonable.money },
    ]),
  )

  const missingCount: Record<string, number> = {}
  for (const row of idle) {
    for (const id of row.missing) missingCount[id] = (missingCount[id] ?? 0) + 1
  }
  const letterCount: Record<string, number> = {}
  for (const row of [...idle, ...reasonable, ...blueprint]) {
    for (const species of row.letters) {
      const key = `${row.policy}:${species}`
      letterCount[key] = (letterCount[key] ?? 0) + 1
    }
  }

  const longFitIdle = fit(longHours.slice(6), longIdle.money.slice(6))
  const longFitLog = fit(
    longHours.slice(6),
    longIdle.money.slice(6).map((value) => Math.log(Math.max(1, value))),
  )
  const summary = {
    seeds: SEEDS,
    hours: HOURS,
    elapsedSec: (Date.now() - started) / 1000,
    config: {
      offlineCapHours: gameConfig.offlineCapHours,
      tickMs: gameConfig.tickMs,
      wishSuccessRate: gameConfig.wishSuccessRate,
      ichibanRestockTicks: gameConfig.ichibanRestockTicks,
      startingMoney: gameConfig.startingMoney,
    },
    idle: policySnapshot(idle),
    reasonable: policySnapshot(reasonable),
    blueprint: policySnapshot(blueprint),
    refund: {
      ...policySnapshot(refund),
      goldPerHour: median(refund.map((row) => ((row.money[3] ?? 0) - (row.money[0] ?? 0)) / 3)),
      idleGoldPerHour: median(idle.map((row) => ((row.money[3] ?? 0) - (row.money[0] ?? 0)) / 3)),
    },
    missingFiguresIdle: missingCount,
    letters: letterCount,
    speciesIdle: Object.fromEntries(SPECIES.map((species) => [species, share(idle, species, false)])),
    speciesFestivalIdle: Object.fromEntries(SPECIES.map((species) => [species, share(idle, species, true)])),
    bearShareWhileWish: ratio(
      reasonable.reduce((sum, row) => sum + row.bearWhileWish, 0),
      reasonable.reduce((sum, row) => sum + row.wishSpawns, 0),
    ),
    wish: wishes,
    levers,
    reasonableWish: {
      casts: reasonable.reduce((sum, row) => sum + row.wishCasts, 0),
      hits: reasonable.reduce((sum, row) => sum + row.wishHits, 0),
    },
    offline,
    long: {
      idleMoney72: longIdle.finalMoney,
      reasonableMoney72: longReasonable.finalMoney,
      idleLinearSlopePerHour: longFitIdle.slope,
      idleLinearR2: longFitIdle.r2,
      idleLogR2: longFitLog.r2,
      idleMissing: longIdle.missing,
      idleTickets: longIdle.finalTickets,
      idleOpens: longIdle.boxOpens,
      reasonableOpens: longReasonable.boxOpens,
      reasonableMissing: longReasonable.missing,
      idleSafe: longIdle.safeInteger,
      reasonableSafe: longReasonable.safeInteger,
      idleMinDelta: longIdle.minOpDelta,
      reasonableMinDelta: longReasonable.minOpDelta,
    },
    visitFactor: {
      idleMin: Math.min(...idle.flatMap((row) => row.visitFactorSamples)),
      idleMax: Math.max(...idle.flatMap((row) => row.visitFactorSamples)),
      reasonableMin: Math.min(...reasonable.flatMap((row) => row.visitFactorSamples)),
      blueprintMin: Math.min(...blueprint.flatMap((row) => row.visitFactorSamples)),
    },
  }
  dump('summary.json', JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
}

function ratio(part: number, total: number): number {
  return total === 0 ? 0 : part / total
}

function policySnapshot(rows: SeedResult[]) {
  const money12 = column(rows, (row) => row.money[Math.min(12, row.money.length - 1)] ?? 0)
  const quiet = column(rows, (row) => row.maxQuietTicks / 60)
  const unaffordable = column(rows, (row) => row.maxUnaffordableTicks / 60)
  return {
    seeds: rows.length,
    finalMoneyMedian: median(money12),
    finalMoneyP10: quantile(money12, 0.1),
    finalMoneyP90: quantile(money12, 0.9),
    hour1Median: median(column(rows, (row) => row.money[Math.min(1, row.money.length - 1)] ?? 0)),
    hour3Median: median(column(rows, (row) => row.money[Math.min(3, row.money.length - 1)] ?? 0)),
    grossHourMedian: rows[0]?.gross.length
      ? incomeMedian(rows)
      : [],
    collectionComplete: completed(rows),
    collectionHourMedian: median(rows.flatMap((row) => (row.milestones.collection == null ? [] : [row.milestones.collection / TICKS_PER_HOUR]))),
    boxOpensMedian: median(column(rows, (row) => row.boxOpens)),
    boxOpensMax: Math.max(...column(rows, (row) => row.boxOpens)),
    drawsMedian: median(column(rows, (row) => row.draws)),
    finalTicketsMedian: median(rows.flatMap((row) => (row.finalTickets == null ? [] : [row.finalTickets]))),
    stalled: rows.filter((row) => row.stallTick != null).length,
    stallHourMedian: median(rows.flatMap((row) => (row.stallTick == null ? [] : [row.stallTick / TICKS_PER_HOUR]))),
    lastPrizeSeeds: rows.filter((row) => row.lastPrize).length,
    minOpDelta: Math.min(...column(rows, (row) => row.minOpDelta)),
    maxQuietMinMedian: median(quiet),
    maxQuietMinMax: Math.max(...quiet),
    maxUnaffordableMinMedian: median(unaffordable),
    maxUnaffordableMinMax: Math.max(...unaffordable),
    safeInteger: rows.every((row) => row.safeInteger),
    endStockMedian: Object.fromEntries(STALLS.map((stallType) => [stallType, median(column(rows, (row) => row.stock[stallType][row.stock[stallType].length - 1] ?? 0))])),
    milestones: Object.fromEntries(
      ['hire-1', 'hire-2', 'ice-lv2', 'can-lv2', 'charge-lv2', 'fortune-lv2', 'wish-placed', 'collection', 'letter-sparrow', 'letter-bear', 'bear-seen'].map((name) => {
        const hits = rows.flatMap((row) => (row.milestones[name] == null ? [] : [row.milestones[name] / TICKS_PER_HOUR]))
        return [name, { seeds: hits.length, medianHour: hits.length ? median(hits) : null }]
      }),
    ),
  }
}

function incomeMedian(rows: SeedResult[]): number[] {
  const hours = rows[0]?.gross.length ?? 0
  const values: number[] = []
  for (let hour = 0; hour < hours; hour++) values.push(median(rows.map((row) => row.gross[hour] ?? 0)))
  return values
}

/** Isolated levers on the shipped opening. Same seeds, no purchases. */
function controlled(seeds: number, hours: number): Record<string, { goldPerHour: number; spawnsPerHour: number; visitMin: number; visitMax: number; endStock: Record<string, number> }> {
  const variants = ['baseline', 'no-decor', 'stall-lv3', 'restock-lv3'] as const
  const out: Record<string, { goldPerHour: number; spawnsPerHour: number; visitMin: number; visitMax: number; endStock: Record<string, number> }> = {}
  for (const variant of variants) {
    const rows = Array.from({ length: seeds }, (_, index) => {
      let street = giftStreet(index + 1)
      if (variant === 'no-decor') {
        street = { ...street, slots: street.slots.map((slot) => (slot?.kind === 'decor' ? null : slot)) }
      }
      if (variant === 'stall-lv3') {
        const slots = street.slots.map((slot) => (slot?.kind === 'stall' ? { ...slot, level: 3 } : slot))
        const stock = { ...street.stock }
        for (const slot of slots) {
          if (slot?.kind === 'stall' && slot.stallType && slot.stallType !== 'ichiban') stock[slot.uid] = 3 * gameConfig.stockPerLevel
        }
        street = { ...street, slots, stock }
      }
      if (variant === 'restock-lv3') {
        street = {
          ...street,
          staff: street.staff.map((member) => (member.job === 'restock' ? { ...member, level: 3 } : member)),
        }
      }
      const seen = new Set(street.visitors.map((visitor) => visitor.id))
      let spawns = 0
      const startMoney = street.money
      const factors: number[] = []
      const total = hours * TICKS_PER_HOUR
      for (let tick = 1; tick <= total; tick++) {
        street = streetTick(street, gameConfig)
        for (const visitor of street.visitors) {
          if (seen.has(visitor.id)) continue
          seen.add(visitor.id)
          spawns += 1
        }
        if (tick % TICKS_PER_HOUR === 0) {
          const ambience = ambienceScore(street, gameConfig)
          factors.push(Math.min(gameConfig.ambienceCap, Math.max(gameConfig.ambienceFloor, ambience / gameConfig.ambienceTarget)))
        }
      }
      return {
        goldPerHour: (street.money - startMoney) / hours,
        spawnsPerHour: spawns / hours,
        visitMin: Math.min(...factors),
        visitMax: Math.max(...factors),
        endStock: Object.fromEntries(STALLS.map((stallType) => [stallType, stallStock(street, stallType)])),
      }
    })
    out[variant] = {
      goldPerHour: median(rows.map((row) => row.goldPerHour)),
      spawnsPerHour: median(rows.map((row) => row.spawnsPerHour)),
      visitMin: Math.min(...rows.map((row) => row.visitMin)),
      visitMax: Math.max(...rows.map((row) => row.visitMax)),
      endStock: Object.fromEntries(STALLS.map((stallType) => [stallType, median(rows.map((row) => row.endStock[stallType] ?? 0))])),
    }
  }
  return out
}

main()
