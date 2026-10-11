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
import { streetTick } from '../src/rules/street'
import type { Species, Street } from '../src/rules/types'

const SEEDS = 32
const HOURS = 12
const LONG_HOURS = 72
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
  let maxQuiet = 0
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
    if (tick < 2 * TICKS_PER_HOUR && play) {
      if (buy && street.money < buy.cost) {
        quiet += 1
        maxQuiet = Math.max(maxQuiet, quiet)
      } else quiet = 0
    }
    street = streetTick(street, gameConfig)
    if (street.marketLevel > 1 && levels[street.marketLevel] == null) levels[street.marketLevel] = street.tick
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
    maxQuiet,
    letters: street.letters.map((letter) => letter.species),
    finalMoney: street.money,
    finalLevel: street.marketLevel,
  }
}

const idle = Array.from({ length: SEEDS }, (_, index) => simulate(index + 1, false, HOURS))
const play = Array.from({ length: SEEDS }, (_, index) => simulate(index + 1, true, HOURS))
const longPlay = Array.from({ length: SEEDS }, (_, index) => simulate(index + 1, true, LONG_HOURS))

function curve(rows: ReturnType<typeof simulate>[]): number[] {
  const hours = rows[0]?.money.length ?? 0
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
  maxUnaffordableMinutes: median(play.map((row) => row.maxQuiet / 60)),
  hedgehogLetters: play.filter((row) => row.letters.includes('hedgehog')).length,
  idleFinalLevel: median(idle.map((row) => row.finalLevel)),
  playFinalLevel: median(play.map((row) => row.finalLevel)),
}

const dir = '/opt/cursor/artifacts/growth'
mkdirSync(dir, { recursive: true })
writeFileSync(`${dir}/balance.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
