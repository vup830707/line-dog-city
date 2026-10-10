import { isWishPondUnlocked } from './collection'
import { createBox, refundAmount } from './ichiban'
import { createRng } from './rng'
import { stockCap } from './staff'
import { rollWeather } from './weather'
import type { ActionResult, DecorType, GameConfig, Job, StallType, Street, Weather } from './types'

function fail(street: Street, reason: string): ActionResult {
  return { street, ok: false, reason }
}

export function placeItem(
  street: Street,
  slot: number,
  item: { kind: 'stall'; stallType: StallType } | { kind: 'decor'; decorType: DecorType },
  config: GameConfig,
): ActionResult {
  if (slot < 0 || slot >= config.streetSlots || street.slots[slot]) return fail(street, '這個位子已經有東西了')
  if (item.kind === 'stall') {
    if (street.slots.some((place) => place?.stallType === item.stallType)) return fail(street, '這種攤已經在街上了')
    if (item.stallType === 'wish' && !isWishPondUnlocked(street.collection, config.figures.map((figure) => figure.id))) {
      return fail(street, '集滿第一套造型才開得了流星許願池')
    }
    const cost = config.placeCost[item.stallType]
    if (street.money < cost) return fail(street, '金幣不夠')
    const uid = `${item.stallType}-${street.tick}-${slot}`
    const slots = street.slots.slice()
    slots[slot] = { uid, kind: 'stall', stallType: item.stallType, level: 1 }
    const stock = { ...street.stock }
    if (item.stallType !== 'ichiban') stock[uid] = stockCap(1, config)
    return { ok: true, street: { ...street, money: street.money - cost, slots, stock } }
  }
  if (item.decorType === 'star' && !isWishPondUnlocked(street.collection, config.figures.map((figure) => figure.id))) {
    return fail(street, '許願池解鎖後才買得到星星')
  }
  const cost = config.decorCost[item.decorType]
  if (street.money < cost) return fail(street, '金幣不夠')
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

export function castWish(street: Street, desired: Weather, config: GameConfig): ActionResult {
  const placed = street.slots.some((slot) => slot?.stallType === 'wish')
  if (!placed || !isWishPondUnlocked(street.collection, config.figures.map((figure) => figure.id))) {
    return fail(street, '許願池還沒開')
  }
  if (street.wishUsed) return fail(street, '今天已經許過願了')
  const rng = createRng(street.rngState)
  const natural = rollWeather(rng)
  const roll = rng.next()
  const succeeded = roll < config.wishSuccessRate
  const weather = succeeded ? desired : natural
  return {
    ok: true,
    street: {
      ...street,
      rngState: rng.getState(),
      pendingWeather: weather,
      wishUsed: true,
      wishMessage: succeeded ? '許願會帶進下一天的天氣。' : '這次沒中，下一天照原本的天氣走。',
    },
  }
}

export function closeBox(street: Street, config: GameConfig): ActionResult {
  if (!street.box) return fail(street, '現在沒有箱子')
  const refund = street.box.paid ? refundAmount(street.box, config.refundRate) : 0
  return {
    ok: true,
    street: { ...street, money: street.money + refund, box: null, boxRestock: 0 },
  }
}

export function openBox(street: Street, config: GameConfig): Street {
  const def = config.ichiban.boxes[0]
  if (!def) return street
  const rng = createRng(street.rngState)
  const box = { ...createBox(def, rng), paid: false, idleTicks: 0 }
  return { ...street, rngState: rng.getState(), box, boxRestock: 0 }
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
