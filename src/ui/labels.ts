import { gameConfig } from '../config'
import type { SaveV2, StallType, Weather } from '../rules/types'

export const WEATHER_LABEL: Record<Weather, string> = {
  sunny: '晴',
  hot: '熱',
  cold: '冷',
  rain: '雨',
}

export function moneyText(value: number): string {
  return `${Math.round(value).toLocaleString('zh-Hant')} 幣`
}

export function playerName(save: SaveV2): string {
  return save.playerDog === 'white' ? save.names.white : save.names.brown
}

export function partnerName(save: SaveV2): string {
  return save.playerDog === 'white' ? save.names.brown : save.names.white
}

export function productName(id: string): string {
  return (
    gameConfig.iceCream.flavors.find((flavor) => flavor.id === id)?.name ??
    gameConfig.cans.types.find((type) => type.id === id)?.name ??
    (id === 'charge' ? '充電' : id === 'fortune' ? '算命' : id === 'draw' ? '一抽' : id === 'wish' ? '許願' : id)
  )
}

export function stallName(type: StallType): string {
  return gameConfig.stallLabels[type]
}
