import type { Rng } from './rng'
import type { GameConfig, ProductDef, Rarity, StallType, Species } from './types'

export function productsFor(stall: StallType, level: number, config: GameConfig): ProductDef[] {
  return (config.products[stall] ?? []).filter((item) => item.level <= level)
}

function topProduct(list: ProductDef[]): ProductDef {
  let best = list[0] as ProductDef
  let bestIndex = 0
  list.forEach((item, index) => {
    const higherPrice = item.price > best.price
    const samePriceLater = item.price === best.price && item.level === best.level && index > bestIndex
    const samePriceHigherLevel = item.price === best.price && item.level > best.level
    if (higherPrice || samePriceHigherLevel || samePriceLater) {
      best = item
      bestIndex = index
    }
  })
  return best
}

/** Favourite product when it is sold; otherwise the top product at `topProductChance`, else any unlocked product. */
export function chooseProduct(
  species: Species,
  stall: StallType,
  level: number,
  config: GameConfig,
  rng: Rng,
): ProductDef | null {
  const unlocked = productsFor(stall, level, config)
  if (unlocked.length === 0) return null
  const favouriteId = config.species.find((item) => item.id === species)?.product
  const favourite = unlocked.find((item) => item.id === favouriteId)
  if (favourite) return favourite
  if (rng.next() < config.topProductChance) return topProduct(unlocked)
  const index = Math.min(unlocked.length - 1, Math.floor(rng.next() * unlocked.length))
  return unlocked[index] ?? unlocked[0] ?? null
}

export function productNet(input: {
  price: number
  config: GameConfig
  rarity: Rarity
  favorite: boolean
  charged: boolean
  tip: boolean
  ichiban?: boolean
}): number {
  const price = input.price
  const base = input.ichiban ? price : price - Math.round(price * input.config.restockCostRatio)
  let gain = Math.round(base * input.config.spendMultiplier[input.rarity])
  if (input.favorite) gain = Math.round(gain * input.config.favoriteBonus)
  if (input.charged && !input.ichiban) gain = Math.round(gain * input.config.chargeBonus)
  if (input.tip) gain = Math.round(gain * (1 + input.config.tipRate))
  return gain
}

export function rollLimitedProduct(config: GameConfig, rng: Rng): string {
  const all = Object.values(config.products).flat()
  const index = Math.min(all.length - 1, Math.floor(rng.next() * all.length))
  return all[index]?.id ?? 'vanilla'
}

export function ichibanRestockFor(level: number, config: GameConfig): number {
  const table = config.ichibanRestockByLevel
  const index = Math.max(0, Math.min(table.length - 1, level - 1))
  const listed = table[index]
  const base = table[0]
  if (listed == null || base == null || base <= 0) return config.ichibanRestockTicks
  if (config.ichibanRestockTicks !== base) return Math.max(1, Math.round((listed / base) * config.ichibanRestockTicks))
  return listed
}

/** What the upgrade button promises. Ichiban Lv3 speeds the box again; there is no second box. */
export function upgradeAdds(stall: StallType, level: number, config: GameConfig): string {
  const costs = config.upgradeCost[stall]
  if (level >= costs.length + 1) return '已經升到最高'
  const look = level <= 1 ? '加上彩旗和串燈' : '加上金邊招牌和燈籠'
  if (stall === 'ichiban') {
    const from = ichibanRestockFor(level, config)
    const to = ichibanRestockFor(level + 1, config)
    return `補箱從 ${from} 縮到 ${to}，${look}`
  }
  const added = productsFor(stall, level + 1, config).filter((item) => item.level === level + 1)
  if (added.length === 0) return look
  const names = added.map((item) => `${item.name}（${item.price}）`).join('、')
  return `解鎖${names}，${look}`
}
