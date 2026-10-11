/**
 * 32-seed growth check. Idle never buys. Play buys the cheapest unlocked action.
 * Run: npx vite-node scripts/growth-balance.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { gameConfig } from '../src/config'
import { createNewGame } from '../src/game/newGame'
import { eligibleSlots, hireStaff, placeItem, upgradeStall, type PlaceItem } from '../src/rules/actions'
import { buildOffers } from '../src/rules/build'
import { ownedCount } from '../src/rules/collection'
import { isSpeciesUnlocked } from '../src/rules/animals'
import { ambienceScore } from '../src/rules/ambience'
import { streetTick } from '../src/rules/street'
import type { Species, Street } from '../src/rules/types'

const SEEDS = Number(process.env.SEEDS ?? 32)
const PLAY_HOURS = Number(process.env.HOURS ?? 12)
const IDLE_HOURS = Number(process.env.IDLE_HOURS ?? 30)
const LONG_HOURS = Number(process.env.LONG_HOURS ?? PLAY_HOURS)
const TICKS_PER_HOUR = 3600
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
    const slot = offer.stallType === 'fortune' ? (slots.includes(4) ? 4 : slots[0]) : slots[0]
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
  const limit = hours * TICKS_PER_HOUR
  for (const species of SPECIES) {
    if (isSpeciesUnlocked(species, street, gameConfig)) animals[species] = 0
  }
  for (let tick = 0; tick < limit; tick += 1) {
    if (play && tick % 30 === 0) {
      const buy = nextBuy(street)
      if (buy && street.money >= buy.cost) street = buy.apply(street)
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
      }
    }
    for (const species of SPECIES) {
      if (animals[species] == null && isSpeciesUnlocked(species, street, gameConfig)) animals[species] = street.tick
    }
    if (collectionTick == null && ownedCount(street.collection, FIGURES) >= FIGURES.length) collectionTick = street.tick
    if ((tick + 1) % TICKS_PER_HOUR === 0) money.push(street.money)
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
