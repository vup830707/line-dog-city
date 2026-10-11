import { ambienceScore, expectedVisits } from '../rules/ambience'
import { visitCapFor } from '../rules/market'
import { rollLimitedProduct } from '../rules/products'
import { createRng } from '../rules/rng'
import { scheduleArrivals } from '../rules/street'
import type { DecorType, GameConfig, Placement, SaveV4, Species, StallType, Street, Visitor } from '../rules/types'
import { isFestival, rollWeather } from '../rules/weather'

export const DEFAULT_WHITE_NAME = '小白'
export const DEFAULT_BROWN_NAME = '可可'
export const DEFAULT_PLAYER_DOG = 'white' as const

export function cleanName(value: string): string | null {
  const name = value.trim()
  if (name.length < 1 || name.length > 8) return null
  return name
}

function hashSeed(text: string): number {
  let hash = 2166136261
  for (const char of text) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function createNewGame(
  input: { playerDog?: 'white' | 'brown'; whiteName?: string; brownName?: string; now?: number; seed?: number } = {},
  config: GameConfig,
): SaveV4 {
  const playerDog = input.playerDog ?? DEFAULT_PLAYER_DOG
  const whiteName = cleanName(input.whiteName ?? DEFAULT_WHITE_NAME)
  const brownName = cleanName(input.brownName ?? DEFAULT_BROWN_NAME)
  if (!whiteName || !brownName) throw new Error('名字要 1 到 8 個字')
  const rng = createRng(input.seed ?? hashSeed(`${playerDog}|${whiteName}|${brownName}|${input.now ?? 0}`))
  const weather = rollWeather(rng)
  const limited = rollLimitedProduct(config, rng)
  const opening = openingPlaza(config)
  const street: Street = {
    tick: 0,
    day: 1,
    phase: 'dusk',
    phaseTick: 0,
    weather,
    pendingWeather: null,
    wishUsed: false,
    wishMessage: null,
    money: config.startingMoney,
    cleanliness: 100,
    slots: opening.slots,
    stock: opening.stock,
    visitors: opening.visitors,
    staff: [
      { id: 'dog-white', name: whiteName, kind: 'dog', dog: 'white', job: 'restock', level: 1 },
      { id: 'dog-brown', name: brownName, kind: 'dog', dog: 'brown', job: 'clean', level: 1 },
    ],
    letters: [],
    sentTopics: [],
    collection: {},
    ownedDecor: [],
    box: null,
    boxRestock: 0,
    arrivals: [],
    trending: [limited],
    rngState: rng.getState(),
    nextVisitor: opening.visitors.length + 1,
    offlineNote: null,
    lastOfflineTicks: 0,
    marketLevel: 1,
    bustleXp: 0,
    seenSpecies: opening.seen,
    seenProducts: [],
    ackedSpecies: opening.seen,
    pendingToasts: [],
    levelUpBanner: null,
    speciesSatisfaction: {},
    affinity: {},
    affinityProgress: {},
    giftTokens: [],
    nightEvent: null,
    eventLog: [],
  }
  street.arrivals = scheduleArrivals(
    expectedVisits(
      {
        ambience: ambienceScore(street, config),
        cleanliness: street.cleanliness,
        festival: isFestival(street.day, config),
        visitCap: visitCapFor(street.marketLevel, config),
      },
      config,
    ),
    config.phaseMinutes,
    rng,
  )
  street.rngState = rng.getState()
  return {
    schemaVersion: 5,
    playerDog,
    whiteName,
    brownName,
    savedAt: input.now ?? 0,
    street,
  }
}

/**
 * Gifted opening: ice and the charge station share the back stall row so the
 * charge neighbor bonus (the next slot index) has a real stall to walk to.
 * The bench sits in the front row, in front of slot 4, where a fortune stall
 * later counts as 「長椅旁」 by plaza distance. It does not spend coins.
 */
function openingPlaza(config: GameConfig): {
  slots: (Placement | null)[]
  stock: Record<string, number>
  visitors: Visitor[]
  seen: Species[]
} {
  const slots: (Placement | null)[] = Array.from({ length: config.streetSlots }, () => null)
  const stock: Record<string, number> = {}
  const place = (index: number, kind: 'stall' | 'decor', id: StallType | DecorType) => {
    const uid = `open-${id}-${index}`
    if (kind === 'stall') {
      const stallType = id as StallType
      slots[index] = { uid, kind: 'stall', stallType, level: 1 }
      if (stallType !== 'ichiban') stock[uid] = config.stockPerLevel
    } else {
      slots[index] = { uid, kind: 'decor', decorType: id as DecorType, level: 1 }
    }
  }
  place(1, 'stall', 'ice')
  place(2, 'stall', 'charge')
  place(10, 'decor', 'lantern')
  place(12, 'decor', 'seat')

  const guest = (n: number, species: Species, slot: number, wander = false): Visitor => ({
    id: `open-${n}`,
    species,
    position: wander ? slot - 1.4 : slot,
    target: slot,
    status: 'walk',
    charged: false,
    liked: false,
    satisfaction: 0,
    spent: 0,
    fortune: null,
    drewGrade: null,
  })
  const seen: Species[] = ['rabbit', 'hamster', 'cat', 'sparrow']
  return {
    slots,
    stock,
    seen,
    visitors: [guest(1, 'rabbit', 1), guest(2, 'hamster', 1, true), guest(3, 'cat', 2), guest(4, 'sparrow', 10, true)],
  }
}

export function renameDogs(save: SaveV4, whiteName: string, brownName: string): SaveV4 | null {
  const white = cleanName(whiteName)
  const brown = cleanName(brownName)
  if (!white || !brown) return null
  return {
    ...save,
    whiteName: white,
    brownName: brown,
    street: {
      ...save.street,
      staff: save.street.staff.map((member) => {
        if (member.dog === 'white') return { ...member, name: white }
        if (member.dog === 'brown') return { ...member, name: brown }
        return member
      }),
    },
  }
}
