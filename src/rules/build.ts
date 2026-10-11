import { isWishPondUnlocked } from './collection'
import { decorPrice } from './actions'
import { decorMarketLevel, stallMarketLevel } from './market'
import { productsFor } from './products'
import type { DecorType, GameConfig, StallType, Street } from './types'

const STALLS: StallType[] = ['ice', 'can', 'charge', 'fortune', 'ichiban', 'wish', 'skewer']
const DECORS: DecorType[] = ['lantern', 'seat', 'sign', 'flower', 'star', 'string']

function stallBlurb(stall: StallType, config: GameConfig): string {
  const first = productsFor(stall, 1, config)[0]
  if (stall === 'ichiban') return '抽一番賞'
  if (stall === 'wish') return '許一個天氣'
  return first ? `賣${first.name}` : '擺一個攤'
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
  gift: boolean
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
  gift?: boolean
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
    gift: input.gift === true,
  }
}

/** Cards for the build strip. Locked and already-built stalls cannot be picked. */
export function buildOffers(street: Street, config: GameConfig): BuildOffer[] {
  const figureIds = config.figures.map((figure) => figure.id)
  const setReady = isWishPondUnlocked(street.collection, figureIds)
  const setReason = `集滿 ${figureIds.length} 款造型`
  const look = config.lookByLevel[0] ?? 0
  const stalls = STALLS.map((stallType) => {
    const needed = stallMarketLevel(stallType, config)
    const placed = street.slots.some((place) => place?.stallType === stallType)
    const levelLocked = !placed && needed != null && street.marketLevel < needed
    const setLocked = !placed && stallType === 'wish' && !setReady
    const locked = levelLocked || setLocked
    const lockReason = levelLocked ? `夜市 Lv.${needed}` : setLocked ? setReason : null
    return offer({
      id: stallType,
      kind: 'stall',
      stallType,
      name: config.stallLabels[stallType],
      cost: config.placeCost[stallType],
      effect: `${stallBlurb(stallType, config)}，熱鬧度 +${look}`,
      locked,
      placed,
      lockReason,
      money: street.money,
    })
  })
  const decor = DECORS.map((decorType) => {
    const needed = decorMarketLevel(decorType, config)
    const levelLocked = needed != null && street.marketLevel < needed
    const setLocked = decorType === 'star' && !setReady
    const locked = levelLocked || setLocked
    const lockReason = levelLocked ? `夜市 Lv.${needed}` : setLocked ? setReason : null
    const gifted = street.giftTokens.includes(decorType)
    return offer({
      id: decorType,
      kind: 'decor',
      decorType,
      name: config.decorLabels[decorType],
      cost: decorPrice(street, decorType, config),
      effect: gifted ? `熟客送來的禮物，熱鬧度 +${config.decorScore[decorType]}` : `熱鬧度 +${config.decorScore[decorType]}`,
      locked,
      placed: false,
      lockReason,
      money: street.money,
      gift: gifted,
    })
  })
  return [...stalls, ...decor]
}
