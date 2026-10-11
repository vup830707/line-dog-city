import { isWishPondUnlocked } from './collection'
import { createBox, refundAmount } from './ichiban'
import { decorMarketLevel, isSlotOpen, stallMarketLevel } from './market'
import { createRng, type Rng } from './rng'
import { stockCap } from './staff'
import { rollWeather } from './weather'
import type { ActionResult, DecorType, GameConfig, Job, StallType, Street, Weather } from './types'

function fail(street: Street, reason: string): ActionResult {
  return { street, ok: false, reason }
}

export type PlaceItem = { kind: 'stall'; stallType: StallType } | { kind: 'decor'; decorType: DecorType }

/** Why this card cannot go on this slot. `null` means the click will build it. */
export function placeBlock(street: Street, slot: number, item: PlaceItem, config: GameConfig): string | null {
  if (slot < 0 || slot >= config.streetSlots) return '這個位子已經有東西了'
  if (!isSlotOpen(slot, street.marketLevel, config)) return '這個位子還沒開放'
  if (street.slots[slot]) return '這個位子已經有東西了'
  const figures = config.figures.map((figure) => figure.id)
  if (item.kind === 'stall') {
    if (street.slots.some((place) => place?.stallType === item.stallType)) return '這種攤已經在街上了'
    const needed = stallMarketLevel(item.stallType, config)
    if (needed != null && street.marketLevel < needed) return `夜市 Lv.${needed} 才蓋得了${config.stallLabels[item.stallType]}`
    if (item.stallType === 'wish' && !isWishPondUnlocked(street.collection, figures)) {
      return '集滿第一套造型才開得了流星許願池'
    }
    if (street.money < config.placeCost[item.stallType]) return '金幣不夠'
    return null
  }
  const decorLevel = decorMarketLevel(item.decorType, config)
  if (decorLevel != null && street.marketLevel < decorLevel) return `夜市 Lv.${decorLevel} 才買得到${config.decorLabels[item.decorType]}`
  if (item.decorType === 'star' && !isWishPondUnlocked(street.collection, figures)) {
    return '許願池解鎖後才買得到星星'
  }
  if (street.money < decorPrice(street, item.decorType, config)) return '金幣不夠'
  return null
}

/** The first copy uses decorCost. Another copy of the same kind uses decorNextCost. */
export function decorPrice(street: Street, decor: DecorType, config: GameConfig): number {
  const owned = street.slots.filter((slot) => slot?.decorType === decor).length
  return owned >= 1 ? config.decorNextCost[decor] : config.decorCost[decor]
}

export function canPlace(street: Street, slot: number, item: PlaceItem, config: GameConfig): boolean {
  return placeBlock(street, slot, item, config) === null
}

/** Empty slots that light up once the player picks a card. */
export function eligibleSlots(street: Street, item: PlaceItem, config: GameConfig): number[] {
  const slots: number[] = []
  for (let index = 0; index < street.slots.length; index += 1) {
    if (canPlace(street, index, item, config)) slots.push(index)
  }
  return slots
}

export function placeItem(street: Street, slot: number, item: PlaceItem, config: GameConfig): ActionResult {
  const reason = placeBlock(street, slot, item, config)
  if (reason) return fail(street, reason)
  if (item.kind === 'stall') {
    const cost = config.placeCost[item.stallType]
    const uid = `${item.stallType}-${street.tick}-${slot}`
    const slots = street.slots.slice()
    slots[slot] = { uid, kind: 'stall', stallType: item.stallType, level: 1 }
    const stock = { ...street.stock }
    if (item.stallType !== 'ichiban') stock[uid] = stockCap(1, config)
    return { ok: true, street: { ...street, money: street.money - cost, slots, stock } }
  }
  const cost = decorPrice(street, item.decorType, config)
  const slots = street.slots.slice()
  slots[slot] = { uid: `${item.decorType}-${street.tick}-${slot}`, kind: 'decor', decorType: item.decorType, level: 1 }
  return { ok: true, street: { ...street, money: street.money - cost, slots } }
}

export function upgradeStall(street: Street, slot: number, config: GameConfig): ActionResult {
  const place = street.slots[slot]
  if (!place || place.kind !== 'stall' || !place.stallType) return fail(street, '這裡沒有攤位')
  const costs = config.upgradeCost[place.stallType]
  if (place.level >= costs.length + 1) return fail(street, '已經升到最高')
  const cost = costs[place.level - 1] ?? 0
  if (street.money < cost) return fail(street, '金幣不夠')
  const slots = street.slots.slice()
  slots[slot] = { ...place, level: place.level + 1 }
  return { ok: true, street: { ...street, money: street.money - cost, slots } }
}

export function assignJob(street: Street, staffId: string, job: Job): ActionResult {
  if (!street.staff.some((member) => member.id === staffId)) return fail(street, '找不到這位員工')
  return {
    ok: true,
    street: {
      ...street,
      staff: street.staff.map((member) => (member.id === staffId ? { ...member, job } : member)),
    },
  }
}

export function trainStaff(street: Street, staffId: string, config: GameConfig): ActionResult {
  const member = street.staff.find((item) => item.id === staffId)
  if (!member) return fail(street, '找不到這位員工')
  if (member.level >= config.maxStaffLevel) return fail(street, '已經升到最高')
  const cost = config.levelCost[member.level - 1] ?? 0
  if (street.money < cost) return fail(street, '金幣不夠')
  return {
    ok: true,
    street: {
      ...street,
      money: street.money - cost,
      staff: street.staff.map((item) => (item.id === staffId ? { ...item, level: item.level + 1 } : item)),
    },
  }
}

export function hireStaff(street: Street, config: GameConfig): ActionResult {
  const hired = street.staff.filter((member) => member.kind === 'hire')
  if (hired.length >= config.maxHires) return fail(street, '員工已經滿了')
  const cost = config.hireCost[hired.length] ?? 0
  if (street.money < cost) return fail(street, '金幣不夠')
  const species = config.hireSpecies[hired.length]
  if (!species) return fail(street, '沒有可雇的動物')
  return {
    ok: true,
    street: {
      ...street,
      money: street.money - cost,
      staff: [
        ...street.staff,
        { id: `hire-${species.id}`, name: species.name, kind: 'hire', hireSpecies: species.id, job: 'restock', level: 1 },
      ],
    },
  }
}

export function castWish(street: Street, desired: Weather, config: GameConfig, rng?: Rng): ActionResult {
  const placed = street.slots.some((slot) => slot?.stallType === 'wish')
  if (!placed || !isWishPondUnlocked(street.collection, config.figures.map((figure) => figure.id))) {
    return fail(street, '許願池還沒開')
  }
  if (street.wishUsed) return fail(street, '今天已經許過願了')
  const live = rng ?? createRng(street.rngState)
  const natural = rollWeather(live)
  const roll = live.next()
  const succeeded = roll < config.wishSuccessRate
  const weather = succeeded ? desired : natural
  return {
    ok: true,
    street: {
      ...street,
      rngState: live.getState(),
      pendingWeather: weather,
      wishUsed: true,
      wishMessage: succeeded ? '許願會帶進下一天的天氣。' : '這次沒中，下一天照原本的天氣走。',
    },
  }
}

export function closeBox(street: Street, config: GameConfig): ActionResult {
  if (!street.box) return fail(street, '現在沒有箱子')
  const refund = street.box.paid ? refundAmount(street.box, config.refundRate, config) : 0
  return {
    ok: true,
    street: { ...street, money: street.money + refund, box: null, boxRestock: 0 },
  }
}

export function openBox(street: Street, config: GameConfig, rng?: Rng): Street {
  const def = config.ichiban.boxes[0]
  if (!def) return street
  const live = rng ?? createRng(street.rngState)
  const box = { ...createBox(def, live), paid: false, idleTicks: 0 }
  return { ...street, rngState: live.getState(), box, boxRestock: 0 }
}

/** Pay the full wholesale price to open a box now. Only this box refunds when it is put away. */
export function buyBox(street: Street, config: GameConfig): ActionResult {
  if (!street.slots.some((slot) => slot?.stallType === 'ichiban')) return fail(street, '還沒有一番賞攤')
  if (street.box) return fail(street, '現在已經有一箱')
  const def = config.ichiban.boxes[0]
  if (!def) return fail(street, '沒有箱子')
  const cost = def.wholesale
  if (street.money < cost) return fail(street, `還差 ${cost - street.money} 幣`)
  const rng = createRng(street.rngState)
  const box = { ...createBox(def, rng), paid: true, idleTicks: 0 }
  return {
    ok: true,
    street: { ...street, rngState: rng.getState(), money: street.money - cost, box, boxRestock: 0 },
  }
}

export function upgradeBlock(street: Street, slot: number, config: GameConfig): string | null {
  const place = street.slots[slot]
  if (!place || place.kind !== 'stall' || !place.stallType) return '這裡沒有攤位'
  const costs = config.upgradeCost[place.stallType]
  if (place.level >= costs.length + 1) return '已經升到最高'
  const cost = costs[place.level - 1] ?? 0
  if (street.money < cost) return `還差 ${cost - street.money} 幣`
  return null
}

export function trainBlock(street: Street, staffId: string, config: GameConfig): string | null {
  const member = street.staff.find((item) => item.id === staffId)
  if (!member) return '找不到這位員工'
  if (member.level >= config.maxStaffLevel) return '已經升到最高'
  const cost = config.levelCost[member.level - 1] ?? 0
  if (street.money < cost) return `還差 ${cost - street.money} 幣`
  return null
}

export function hireBlock(street: Street, config: GameConfig): string | null {
  const hired = street.staff.filter((member) => member.kind === 'hire').length
  if (hired >= config.maxHires) return '員工已經滿了'
  const cost = config.hireCost[hired] ?? 0
  if (!config.hireSpecies[hired]) return '沒有可雇的動物'
  if (street.money < cost) return `還差 ${cost - street.money} 幣`
  return null
}

export function wishBlock(street: Street, config: GameConfig): string | null {
  const placed = street.slots.some((slot) => slot?.stallType === 'wish')
  if (!placed || !isWishPondUnlocked(street.collection, config.figures.map((figure) => figure.id))) return '許願池還沒開'
  if (street.wishUsed) return '今天已經許過願了'
  return null
}

export function buyBoxBlock(street: Street, config: GameConfig): string | null {
  if (!street.slots.some((slot) => slot?.stallType === 'ichiban')) return '還沒有一番賞攤'
  if (street.box) return '現在已經有一箱'
  const cost = config.ichiban.boxes[0]?.wholesale ?? 0
  if (street.money < cost) return `還差 ${cost - street.money} 幣`
  return null
}
