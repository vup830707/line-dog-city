import { expectedVisits } from '../rules/ambience'
import { createRng } from '../rules/rng'
import { scheduleArrivals } from '../rules/street'
import type { GameConfig, SaveV3, Street } from '../rules/types'
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
    slots: Array.from({ length: config.streetSlots }, () => null),
    stock: {},
    visitors: [],
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
    nextVisitor: 1,
    offlineNote: null,
    lastOfflineTicks: 0,
  }
  const ambience = street.cleanliness
  street.arrivals = scheduleArrivals(
    expectedVisits({ ambience, festival: isFestival(street.day, config) }, config),
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
