import { ambienceScore, expectedVisits } from '../rules/ambience'
import { createRng } from '../rules/rng'
import { scheduleArrivals } from '../rules/street'
import type { DecorType, GameConfig, Placement, SaveV3, Species, StallType, Street, Visitor } from '../rules/types'
import { isFestival, rollWeather } from '../rules/weather'

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
  input: { playerDog: 'white' | 'brown'; whiteName: string; brownName: string; now?: number; seed?: number },
  config: GameConfig,
): SaveV3 {
  const whiteName = cleanName(input.whiteName)
  const brownName = cleanName(input.brownName)
  if (!whiteName || !brownName) throw new Error('名字要 1 到 8 個字')
  const rng = createRng(input.seed ?? hashSeed(`${input.playerDog}|${whiteName}|${brownName}`))
  const weather = rollWeather(rng)
  const first = config.flavors[Math.floor(rng.next() * config.flavors.length)]?.id ?? 'fly'
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
    trending: [first],
    rngState: rng.getState(),
    nextVisitor: opening.visitors.length + 1,
    offlineNote: null,
    lastOfflineTicks: 0,
  }
  street.arrivals = scheduleArrivals(
    expectedVisits(
      { ambience: ambienceScore(street, config), cleanliness: street.cleanliness, festival: isFestival(street.day, config) },
      config,
    ),
    config.phaseMinutes,
    rng,
  )
  street.rngState = rng.getState()
  return {
    schemaVersion: 3,
    playerDog: input.playerDog,
    whiteName,
    brownName,
    savedAt: input.now ?? 0,
    street,
  }
}

/** A full market on the back arc and sides. The opening is a gift, so it does not spend coins. */
function openingPlaza(config: GameConfig): { slots: (Placement | null)[]; stock: Record<string, number>; visitors: Visitor[] } {
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
  place(0, 'decor', 'lantern')
  place(1, 'stall', 'ice')
  place(2, 'stall', 'can')
  place(3, 'stall', 'charge')
  place(4, 'stall', 'fortune')
  place(5, 'stall', 'ichiban')
  place(6, 'decor', 'lantern')
  place(7, 'decor', 'flower')
  place(8, 'decor', 'star')
  place(9, 'decor', 'seat')
  place(10, 'decor', 'star')
  place(13, 'decor', 'seat')
  place(14, 'decor', 'lantern')
  place(15, 'decor', 'star')

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
  return {
    slots,
    stock,
    visitors: [
      guest(1, 'rabbit', 1),
      guest(2, 'hamster', 2),
      guest(3, 'otter', 3),
      guest(4, 'cat', 4),
      guest(5, 'hedgehog', 9),
      guest(6, 'sparrow', 5, true),
    ],
  }
}

export function renameDogs(save: SaveV3, whiteName: string, brownName: string): SaveV3 | null {
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
