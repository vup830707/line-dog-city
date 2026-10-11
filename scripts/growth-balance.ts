/**
 * 32-seed growth check. Idle never buys. Play buys the cheapest unlocked action.
 * Run: npx vite-node scripts/growth-balance.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { gameConfig } from '../src/config'
import { createNewGame } from '../src/game/newGame'
import { eligibleSlots, hireStaff, placeItem, trainStaff, upgradeStall, type PlaceItem } from '../src/rules/actions'
import { buildOffers } from '../src/rules/build'
import { ownedCount } from '../src/rules/collection'
import { decorNearby, isSpeciesUnlocked } from '../src/rules/animals'
import { ambienceScore } from '../src/rules/ambience'
import { streetTick } from '../src/rules/street'
import type { Species, Street } from '../src/rules/types'

const SEEDS = Number(process.env.SEEDS ?? 32)
const PLAY_HOURS = Number(process.env.HOURS ?? 12)
const IDLE_HOURS = Number(process.env.IDLE_HOURS ?? 72)
const LONG_HOURS = Number(process.env.LONG_HOURS ?? PLAY_HOURS)
const TICKS_PER_HOUR = 3600
const PURCHASE_BUCKETS = 12
const BUCKET_TICKS = 600
const FIGURES = gameConfig.figures.map((figure) => figure.id)
const SPECIES: Species[] = ['cat', 'rabbit', 'hamster', 'sparrow', 'otter', 'hedgehog', 'fox', 'bear']

function median(values: number[]): number | null {
  const ready = values.filter((value) => value >= 0).sort((a, b) => a - b)
  if (ready.length === 0) return null
  return ready[Math.floor((ready.length - 1) / 2)] ?? null
}

function hourOf(tick: number): number {
  return Math.round((tick / TICKS_PER_HOUR) * 10) / 10
}

/** Slot 4 sits in front of the opening bench. Otherwise use the empty slot beside a seat. */
function fortuneSlot(street: Street, slots: number[]): number | undefined {
  if (slots.includes(4)) return 4
  return [...slots].sort((a, b) => Number(decorNearby(street, b, 'seat')) - Number(decorNearby(street, a, 'seat')) || a - b)[0]
}

function decorCount(street: Street, decorType: string): number {
  return street.slots.filter((slot) => slot?.decorType === decorType).length
}

function nextBuy(street: Street): { cost: number; apply: (street: Street) => Street } | null {
  const options: { cost: number; apply: (street: Street) => Street }[] = []
  for (const offer of buildOffers(street, gameConfig)) {
    if (offer.locked || offer.placed) continue
    if (offer.decorType && decorCount(street, offer.decorType) >= 2) continue
    const item: PlaceItem | null =
      offer.kind === 'stall' && offer.stallType
        ? { kind: 'stall', stallType: offer.stallType }
        : offer.decorType
          ? { kind: 'decor', decorType: offer.decorType }
          : null
    if (!item) continue
    const slots = eligibleSlots(street, item, gameConfig)
    const slot = offer.stallType === 'fortune' ? fortuneSlot(street, slots) : slots[0]
    if (slot == null) continue
    options.push({
      cost: offer.cost,
      apply: (current) => {
        const placed = placeItem(current, slot, item, gameConfig)
        return placed.ok ? placed.street : current
      },
    })
  }
  street.slots.forEach((place, slot) => {
    if (!place?.stallType) return
    const costs = gameConfig.upgradeCost[place.stallType]
    if (place.level >= costs.length + 1) return
    const cost = costs[place.level - 1]
    if (cost == null) return
    options.push({
      cost,
      apply: (current) => {
        const upgraded = upgradeStall(current, slot, gameConfig)
        return upgraded.ok ? upgraded.street : current
      },
    })
  })
  for (const member of street.staff) {
    if (member.level >= gameConfig.maxStaffLevel) continue
    const cost = gameConfig.levelCost[member.level - 1]
    if (cost == null) continue
    options.push({
      cost,
      apply: (current) => {
        const trained = trainStaff(current, member.id, gameConfig)
        return trained.ok ? trained.street : current
      },
    })
  }
  const hired = street.staff.filter((member) => member.kind === 'hire').length
  const hireCost = gameConfig.hireCost[hired]
  if (hired < gameConfig.maxHires && hireCost != null) {
    options.push({
      cost: hireCost,
      apply: (current) => {
        const hiredResult = hireStaff(current, gameConfig)
        return hiredResult.ok ? hiredResult.street : current
      },
    })
  }
  options.sort((a, b) => a.cost - b.cost)
  return options[0] ?? null
}

function simulate(seed: number, play: boolean, hours: number) {
  let street = createNewGame({ playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 1, seed }, gameConfig).street
  const money: number[] = [street.money]
  const levels: Record<number, number> = { 1: 0 }
  const animals: Partial<Record<Species, number>> = {}
  let collectionTick: number | null = null
  let quiet = 0
  let maxQuietEarly = 0
  let maxQuietToLv5 = 0
  let gapCost = 0
  const ambienceAt: Record<number, number> = {}
  const purchases = Array.from({ length: PURCHASE_BUCKETS }, () => 0)
  const levelMoney: Record<number, { tick: number; money: number }> = { 1: { tick: 0, money: street.money } }
  const levelRate: Record<number, number> = {}
  const limit = hours * TICKS_PER_HOUR
  for (const species of SPECIES) {
    if (isSpeciesUnlocked(species, street, gameConfig)) animals[species] = 0
  }
  for (let tick = 0; tick < limit; tick += 1) {
    if (play && tick % 30 === 0) {
      const buy = nextBuy(street)
      if (buy && street.money >= buy.cost) {
        const bought = buy.apply(street)
        if (bought !== street) {
          street = bought
          const bucket = Math.floor(tick / BUCKET_TICKS)
          if (bucket < purchases.length) purchases[bucket] += 1
        }
      }
    }
    const buy = nextBuy(street)
    if (play && levels[5] == null) {
      if (buy && street.money < buy.cost) {
        quiet += 1
        if (tick < 2 * TICKS_PER_HOUR && quiet >= maxQuietEarly) {
          maxQuietEarly = quiet
          gapCost = buy.cost
        }
        if (quiet >= maxQuietToLv5) {
          maxQuietToLv5 = quiet
          gapCost = buy.cost
        }
      } else quiet = 0
    }
    street = streetTick(street, gameConfig)
    for (let level = 2; level <= street.marketLevel; level += 1) {
      if (levels[level] == null) {
        levels[level] = street.tick
        ambienceAt[level] = ambienceScore(street, gameConfig)
        const previous = levelMoney[level - 1]
        if (previous && levelRate[level - 1] == null && street.tick > previous.tick) {
          levelRate[level - 1] = ((street.money - previous.money) / (street.tick - previous.tick)) * TICKS_PER_HOUR
        }
        levelMoney[level] = { tick: street.tick, money: street.money }
      }
    }
    for (const species of SPECIES) {
      if (animals[species] == null && isSpeciesUnlocked(species, street, gameConfig)) animals[species] = street.tick
    }
    if (collectionTick == null && ownedCount(street.collection, FIGURES) >= FIGURES.length) collectionTick = street.tick
    if ((tick + 1) % TICKS_PER_HOUR === 0) money.push(street.money)
  }
  const sitting = levelMoney[street.marketLevel]
  if (sitting && levelRate[street.marketLevel] == null && street.tick > sitting.tick) {
    levelRate[street.marketLevel] = ((street.money - sitting.money) / (street.tick - sitting.tick)) * TICKS_PER_HOUR
  }
  return {
    seed,
    money,
    levels,
    animals,
    collectionTick,
    maxQuietEarly,
    maxQuietToLv5,
    gapCost,
    ambienceAt,
    purchases,
    levelRate,
    letters: street.letters.map((letter) => letter.species),
    finalMoney: street.money,
    finalLevel: street.marketLevel,
  }
}

const idle = Array.from({ length: SEEDS }, (_, index) => simulate(index + 1, false, IDLE_HOURS))
const play = Array.from({ length: SEEDS }, (_, index) => simulate(index + 1, true, PLAY_HOURS))
const longPlay =
  LONG_HOURS === PLAY_HOURS
    ? play
    : LONG_HOURS > 0
      ? Array.from({ length: SEEDS }, (_, index) => simulate(index + 1, true, LONG_HOURS))
      : play

function curve(rows: ReturnType<typeof simulate>[]): number[] {
  const hours = Math.min(13, rows[0]?.money.length ?? 0)
  return Array.from({ length: hours }, (_, hour) => median(rows.map((row) => row.money[hour] ?? 0)) ?? 0)
}

const report = {
  seeds: SEEDS,
  idleMoneyByHour: curve(idle),
  playMoneyByHour: curve(play),
  marketLevelMedianHour: [1, 2, 3, 4, 5].map((level) => ({
    level,
    idle: median(idle.map((row) => (row.levels[level] == null ? -1 : hourOf(row.levels[level] ?? 0)))),
    play: median(play.map((row) => (row.levels[level] == null ? -1 : hourOf(row.levels[level] ?? 0)))),
  })),
  animalMedianHour: SPECIES.map((species) => ({
    species,
    play: median(play.map((row) => (row.animals[species] == null ? -1 : hourOf(row.animals[species] ?? 0)))),
    playSeeds: play.filter((row) => row.animals[species] != null).length,
  })),
  collectionMedianHour: median(longPlay.map((row) => (row.collectionTick == null ? -1 : hourOf(row.collectionTick)))),
  collectionSeeds: longPlay.filter((row) => row.collectionTick != null).length,
  idleCollectionMedianHour: median(idle.map((row) => (row.collectionTick == null ? -1 : hourOf(row.collectionTick)))),
  idleCollectionSeeds: idle.filter((row) => row.collectionTick != null).length,
  purchasesPer10Min: Array.from({ length: PURCHASE_BUCKETS }, (_, bucket) => median(play.map((row) => row.purchases[bucket] ?? 0)) ?? 0),
  idleIncomePerHourAtLevel: [1, 2, 3, 4, 5].map((level) => ({
    level,
    income: median(idle.map((row) => row.levelRate[level] ?? -1)),
  })),
  idleMoneyAt: {
    h1: median(idle.map((row) => (row.money.length > 1 ? row.money[1] ?? -1 : -1))),
    h12: median(idle.map((row) => (row.money.length > 12 ? row.money[12] ?? -1 : -1))),
    h72: median(idle.map((row) => (row.money.length > 72 ? row.money[72] ?? -1 : -1))),
  },
  maxUnaffordableMinutesFirst2h: median(play.map((row) => row.maxQuietEarly / 60)),
  maxUnaffordableMinutesToLv5: median(play.map((row) => (row.levels[5] == null ? -1 : row.maxQuietToLv5 / 60))),
  gapCostMedian: median(play.map((row) => row.gapCost)),
  playAmbienceAtLevel: [2, 3, 4, 5].map((level) => ({
    level,
    ambience: median(play.map((row) => row.ambienceAt[level] ?? -1)),
  })),
  hedgehogLetters: play.filter((row) => row.letters.includes('hedgehog')).length,
  idleFinalLevel: median(idle.map((row) => row.finalLevel)),
  playFinalLevel: median(play.map((row) => row.finalLevel)),
}

const dir = '/opt/cursor/artifacts/growth'
mkdirSync(dir, { recursive: true })
writeFileSync(`${dir}/balance.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
