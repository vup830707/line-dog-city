/**
 * Live-market affinity pace. Idle never buys. Active buys the cheapest action
 * every 30 ticks and keeps 400 coins for hiring. Same decor is capped at 2.
 * Run: SEEDS=16 ACTIVE_HOURS=48 IDLE_HOURS=72 npx vite-node scripts/affinity-pace.ts
 */
import { gameConfig } from '../src/config'
import { createNewGame } from '../src/game/newGame'
import { eligibleSlots, hireStaff, placeItem, trainStaff, upgradeStall, type PlaceItem } from '../src/rules/actions'
import { heartCost } from '../src/rules/affinity'
import { decorNearby, isSpeciesUnlocked } from '../src/rules/animals'
import { buildOffers } from '../src/rules/build'
import { streetTick } from '../src/rules/street'
import type { Species, Street } from '../src/rules/types'

const SEEDS = Number(process.env.SEEDS ?? 16)
const ACTIVE_HOURS = Number(process.env.ACTIVE_HOURS ?? 48)
const IDLE_HOURS = Number(process.env.IDLE_HOURS ?? 72)
const TICKS_PER_HOUR = 3600
const RESERVE = 400
const SPECIES: Species[] = ['cat', 'rabbit', 'hamster', 'sparrow', 'otter', 'hedgehog', 'fox', 'bear']
const HEARTS = [3, 10, 25]

function decorCount(street: Street, decorType: string): number {
  return street.slots.filter((slot) => slot?.decorType === decorType).length
}

function fortuneSlot(street: Street, slots: number[]): number | undefined {
  if (slots.includes(4)) return 4
  return [...slots].sort((a, b) => Number(decorNearby(street, b, 'seat')) - Number(decorNearby(street, a, 'seat')) || a - b)[0]
}

function nextBuy(street: Street): { cost: number; hire: boolean; apply: (street: Street) => Street } | null {
  const options: { cost: number; hire: boolean; apply: (street: Street) => Street }[] = []
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
      hire: false,
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
      hire: false,
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
      hire: false,
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
      hire: true,
      apply: (current) => {
        const hiredResult = hireStaff(current, gameConfig)
        return hiredResult.ok ? hiredResult.street : current
      },
    })
  }
  options.sort((a, b) => a.cost - b.cost || Number(b.hire) - Number(a.hire))
  return options[0] ?? null
}

function canPay(street: Street, buy: { cost: number; hire: boolean }): boolean {
  if (street.money < buy.cost) return false
  if (buy.hire) return true
  return street.money - buy.cost >= RESERVE
}

function pipsOf(street: Street, species: Species): number {
  const hearts = street.affinity[species] ?? 0
  let sum = street.affinityProgress[species] ?? 0
  for (let heart = 0; heart < hearts; heart += 1) sum += heartCost(heart, gameConfig)
  return sum
}

function simulate(seed: number, play: boolean, hours: number) {
  let street = createNewGame({ playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 1, seed }, gameConfig).street
  const reached: Partial<Record<Species, number[]>> = {}
  const unlocked: Partial<Record<Species, number>> = {}
  for (const species of SPECIES) {
    reached[species] = HEARTS.map(() => -1)
    if (isSpeciesUnlocked(species, street, gameConfig)) unlocked[species] = 0
  }
  const limit = hours * TICKS_PER_HOUR
  for (let tick = 0; tick < limit; tick += 1) {
    if (play && tick % 30 === 0) {
      const buy = nextBuy(street)
      if (buy && canPay(street, buy)) {
        const bought = buy.apply(street)
        if (bought !== street) street = bought
      }
    }
    street = streetTick(street, gameConfig)
    for (const species of SPECIES) {
      if (unlocked[species] == null && isSpeciesUnlocked(species, street, gameConfig)) unlocked[species] = street.tick
      const hearts = street.affinity[species] ?? 0
      const marks = reached[species]
      if (!marks) continue
      for (let index = 0; index < HEARTS.length; index += 1) {
        const goal = HEARTS[index] ?? 0
        if ((marks[index] ?? -1) < 0 && hearts >= goal) marks[index] = street.tick
      }
    }
  }
  const pips: Partial<Record<Species, number>> = {}
  for (const species of SPECIES) pips[species] = pipsOf(street, species)
  return { seed, reached, unlocked, pips, money: street.money, level: street.marketLevel }
}

function median(values: number[]): { hours: number | null; n: number } {
  const ready = values.filter((value) => value >= 0).sort((a, b) => a - b)
  if (ready.length === 0) return { hours: null, n: 0 }
  const mid = ready[Math.floor((ready.length - 1) / 2)] ?? 0
  return { hours: Math.round((mid / TICKS_PER_HOUR) * 100) / 100, n: ready.length }
}

function cell(runs: ReturnType<typeof simulate>[], species: Species, index: number): string {
  const stat = median(runs.map((run) => run.reached[species]?.[index] ?? -1))
  if (stat.hours == null) return `— (${stat.n}/${runs.length})`
  return `${stat.hours} (${stat.n}/${runs.length})`
}

const names: Record<Species, string> = {
  cat: '三花貓',
  rabbit: '月兔',
  hamster: '倉鼠',
  sparrow: '夜鴨子',
  otter: '水獺',
  hedgehog: '刺蝟',
  fox: '小貓熊',
  bear: '浣熊',
}

console.log(`seeds ${SEEDS} active ${ACTIVE_HOURS}h idle ${IDLE_HOURS}h stride ${gameConfig.affinityStride} growth ${gameConfig.affinityHeartGrowth} base ${gameConfig.affinityPipBase} min ${gameConfig.affinityMin}`)
const active = Array.from({ length: SEEDS }, (_, index) => simulate(index + 1, true, ACTIVE_HOURS))
const idle = Array.from({ length: SEEDS }, (_, index) => simulate(index + 1, false, IDLE_HOURS))
console.log('| 動物 | active 3 / 10 / 25 | idle 3 / 10 / 25 | idle pips min |')
console.log('| --- | --- | --- | --- |')
for (const species of SPECIES) {
  const idlePips = idle.map((run) => run.pips[species] ?? 0)
  const unlockedAt = median(active.map((run) => run.unlocked[species] ?? -1))
  const gate = unlockedAt.hours == null ? 'gated' : `unlock ${unlockedAt.hours}h`
  console.log(
    `| ${names[species]} | ${HEARTS.map((_, index) => cell(active, species, index)).join(' / ')} | ${HEARTS.map((_, index) => cell(idle, species, index)).join(' / ')} | ${Math.min(...idlePips)} (${gate}) |`,
  )
}
const idleMoney = idle.map((run) => run.money).sort((a, b) => a - b)
console.log('idle money median', idleMoney[Math.floor((idleMoney.length - 1) / 2)])
