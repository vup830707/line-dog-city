import { isWishPondUnlocked } from './collection'
import type { DecorType, GameConfig, StallType, Street } from './types'

const STALLS: StallType[] = ['ice', 'can', 'charge', 'fortune', 'ichiban', 'wish']
const DECORS: DecorType[] = ['lantern', 'seat', 'sign', 'flower', 'star']

const STALL_BLURB: Record<StallType, string> = {
  ice: '賣香草冰淇淋',
  can: '賣晴天罐',
  charge: '賣快充',
  fortune: '賣一句籤',
  ichiban: '抽一番賞',
  wish: '許一個天氣',
}

export interface BuildOffer {
  id: string
  kind: 'stall' | 'decor'
  stallType?: StallType
  decorType?: DecorType
  name: string
  cost: number
  effect: string
  locked: boolean
  placed: boolean
  lockReason: string | null
  shortfall: number
  affordable: boolean
}

export function shortfallText(shortfall: number): string {
  return `還差 ${shortfall} 幣`
}

function offer(input: {
  id: string
  kind: 'stall' | 'decor'
  stallType?: StallType
  decorType?: DecorType
  name: string
  cost: number
  effect: string
  locked: boolean
  placed: boolean
  lockReason: string | null
  money: number
}): BuildOffer {
  const shortfall = input.locked || input.placed ? 0 : Math.max(0, input.cost - input.money)
  return {
    id: input.id,
    kind: input.kind,
    stallType: input.stallType,
    decorType: input.decorType,
    name: input.name,
    cost: input.cost,
    effect: input.effect,
    locked: input.locked,
    placed: input.placed,
    lockReason: input.lockReason,
    shortfall,
    affordable: !input.locked && !input.placed && shortfall === 0,
  }
}

/** Cards for the build strip. Locked and already-built stalls cannot be picked. */
export function buildOffers(street: Street, config: GameConfig): BuildOffer[] {
  const figureIds = config.figures.map((figure) => figure.id)
  const unlocked = isWishPondUnlocked(street.collection, figureIds)
  const lockReason = `集滿 ${figureIds.length} 款造型`
  const look = config.lookByLevel[0] ?? 0
  const stalls = STALLS.map((stallType) => {
    const locked = stallType === 'wish' && !unlocked
    const placed = street.slots.some((place) => place?.stallType === stallType)
    return offer({
      id: stallType,
      kind: 'stall',
      stallType,
      name: config.stallLabels[stallType],
      cost: config.placeCost[stallType],
      effect: `${STALL_BLURB[stallType]}，熱鬧度 +${look}`,
      locked,
      placed,
      lockReason: locked ? lockReason : null,
      money: street.money,
    })
  })
  const decor = DECORS.map((decorType) => {
    const locked = decorType === 'star' && !unlocked
    return offer({
      id: decorType,
      kind: 'decor',
      decorType,
      name: config.decorLabels[decorType],
      cost: config.decorCost[decorType],
      effect: `熱鬧度 +${config.decorScore[decorType]}`,
      locked,
      placed: false,
      lockReason: locked ? lockReason : null,
      money: street.money,
    })
  })
  return [...stalls, ...decor]
}
