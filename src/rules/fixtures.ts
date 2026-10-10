import { createNewGame } from '../game/newGame'
import { gameConfig } from '../config'
import type { GameConfig, Placement, Species, Street } from './types'

export function streetWith(patch: Partial<Street> = {}, config: GameConfig = gameConfig): Street {
  const save = createNewGame({ playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 0, seed: 1 }, config)
  const slots = Array.from({ length: config.streetSlots }, () => null)
  return {
    ...save.street,
    arrivals: [],
    visitors: [],
    stock: {},
    box: null,
    ...patch,
    slots: patch.slots ?? slots,
  }
}

export function stall(stallType: Placement['stallType'], uid = stallType ?? 'stall'): Placement {
  return { uid, kind: 'stall', stallType, level: 1 }
}

export function decor(decorType: NonNullable<Placement['decorType']>, uid: string = decorType): Placement {
  return { uid, kind: 'decor', decorType, level: 1 }
}

export function ownedSet(ids: string[]): Record<string, number> {
  return Object.fromEntries(ids.map((id) => [id, 1]))
}

export function visitor(species: Species, position: number, target: number) {
  return {
    id: `v-${species}`,
    species,
    position,
    target,
    status: 'walk' as const,
    charged: false,
    liked: false,
    satisfaction: 0,
    spent: 0,
    fortune: null,
    drewGrade: null,
  }
}
