import { gameConfig } from '../config'
import { businessTick, fastForward } from '../rules/business'
import { isWishPondUnlocked } from '../rules/collection'
import { demandFor } from '../rules/demand'
import { createBox, refundAmount, selfDraw } from '../rules/ichiban'
import { buildDayLedger } from '../rules/ledger'
import { planRival } from '../rules/rival'
import { createRng } from '../rules/rng'
import type {
  Command,
  GameConfig,
  PrepDraft,
  SaveV2,
  SimState,
  StallSim,
  StallType,
  Weather,
} from '../rules/types'
import { calendarInfo, resolveWish, rollForecast, rollTrending, rollWeather } from '../rules/weather'

export interface ActionResult {
  ok: boolean
  save: SaveV2
  message: string
}

const WEATHER_LABEL: Record<Weather, string> = {
  sunny: '晴',
  hot: '熱',
  cold: '冷',
  rain: '雨',
}

export function createNewGame(
  input: { playerDog: 'white' | 'brown'; whiteName: string; brownName: string; seed?: number },
  config: GameConfig = gameConfig,
): SaveV2 {
  const white = cleanName(input.whiteName)
  const brown = cleanName(input.brownName)
  const rng = createRng(input.seed ?? nameSeed(input.playerDog, white, brown))
  const actualWeather = rollWeather(rng)
  const forecast = rollForecast(actualWeather, rng, config.forecastAccuracy)
  const trending = rollTrending(rng, config.iceCream.flavors.map((flavor) => flavor.id))
  const cans = Object.fromEntries(config.cans.types.map((type) => [type.id, 0]))
  return {
    schemaVersion: 2,
    playerDog: input.playerDog,
    names: { white, brown },
    money: config.startingMoney,
    day: 1,
    slotsUnlocked: config.startingSlots,
    placement: Array.from({ length: config.maxSlots }, () => null),
    fortuneLevel: 0,
    cans,
    collection: {},
    decorations: [],
    drawPrice: config.ichiban.referencePrice,
    activeBox: null,
    rivalMemory: { stalls: [], playerPrices: {} },
    ledgerHistory: [],
    phase: 'prep',
    rngState: rng.getState(),
    forecast,
    actualWeather,
    trending,
    presetNext: null,
    wishUsed: false,
    wishMessage: null,
    sim: null,
    draft: emptyDraft(config),
  }
}

export function placeStall(save: SaveV2, slot: number, type: StallType, config: GameConfig = gameConfig): SaveV2 {
  if (slot < 0 || slot >= save.slotsUnlocked) return save
  if (type === 'wish' && !wishUnlocked(save, config)) return save
  const placement = save.placement.map((current, index) => {
    if (current === type) return null
    return index === slot ? type : current
  })
  return { ...save, placement, draft: defaultsFor(save.draft, type, { ...save, placement }, config) }
}

export function clearSlot(save: SaveV2, slot: number): SaveV2 {
  if (slot < 0 || slot >= save.placement.length) return save
  const placement = save.placement.slice()
  placement[slot] = null
  return { ...save, placement }
}

export function patchDraft(save: SaveV2, patch: Partial<PrepDraft>): SaveV2 {
  return { ...save, draft: { ...save.draft, ...patch } }
}

export function unlockSlot(save: SaveV2, config: GameConfig = gameConfig): ActionResult {
  if (save.slotsUnlocked >= config.maxSlots) return { ok: false, save, message: '夜市格子已經滿了' }
  const cost = config.slotCosts[save.slotsUnlocked] ?? 0
  if (save.money < cost) return { ok: false, save, message: '遊戲幣不夠，還不能擴張' }
  return {
    ok: true,
    save: { ...save, money: save.money - cost, slotsUnlocked: save.slotsUnlocked + 1 },
    message: `多了一個攤位格，花了 ${cost} 遊戲幣`,
  }
}

export function upgradeFortune(save: SaveV2, config: GameConfig = gameConfig): ActionResult {
  const next = config.fortune.levels[save.fortuneLevel]
  if (!next) return { ok: false, save, message: '算力已經到頂了' }
  if (save.money < next.upgradeCost) return { ok: false, save, message: '遊戲幣不夠升級算力' }
  const verb = save.fortuneLevel === 0 ? '開攤' : '升級'
  return {
    ok: true,
    save: { ...save, money: save.money - next.upgradeCost, fortuneLevel: next.level },
    message: `${verb}完成，現在是算力 Lv${next.level}`,
  }
}

export function buyBox(save: SaveV2, boxId: string, config: GameConfig = gameConfig): ActionResult {
  if (save.phase === 'business') return { ok: false, save, message: '營業中不能換箱' }
  if (save.activeBox && save.activeBox.tickets.length > 0) {
    return { ok: false, save, message: '還有一箱沒結束，先抽完或退回' }
  }
  const def = config.ichiban.boxes.find((box) => box.id === boxId)
  if (!def) return { ok: false, save, message: '沒有這款箱子' }
  if (save.money < def.wholesale) return { ok: false, save, message: '遊戲幣不夠買這一箱' }
  const rng = createRng(save.rngState)
  const activeBox = createBox(def, rng)
  return {
    ok: true,
    save: { ...save, money: save.money - def.wholesale, activeBox, rngState: rng.getState() },
    message: `進了「${def.name}」，花了 ${def.wholesale} 遊戲幣`,
  }
}

export function refundBox(save: SaveV2, config: GameConfig = gameConfig): ActionResult {
  if (save.phase === 'business') return { ok: false, save, message: '營業中不能退箱' }
  if (!save.activeBox) return { ok: false, save, message: '現在沒有箱子' }
  const refund = refundAmount(save.activeBox, config.refundRate)
  return {
    ok: true,
    save: { ...save, money: save.money + refund, activeBox: null },
    message: `剩籤退回，拿回 ${refund} 遊戲幣`,
  }
}

export function drawForCollection(save: SaveV2, config: GameConfig = gameConfig): ActionResult {
  if (save.phase === 'business') return { ok: false, save, message: '營業中讓客人抽就好' }
  if (!save.activeBox || save.activeBox.tickets.length === 0) {
    return { ok: false, save, message: '沒有可以抽的籤' }
  }
  const drawn = selfDraw({
    box: save.activeBox,
    collection: save.collection,
    decorations: save.decorations,
    drawPrice: save.drawPrice,
    config,
  })
  const unlocked = !wishUnlocked(save, config) && isWishPondUnlocked(drawn.collection, figureIds(config))
  const extra = drawn.converted > 0 ? `重複了，換成 ${drawn.converted} 遊戲幣。` : `收進圖鑑：${drawn.ticket.label}。`
  const last = drawn.lastPrizeLabel ? `最後賞是${drawn.lastPrizeLabel}。` : ''
  const pond = unlocked ? '第一套集滿，流星許願池解鎖了。' : ''
  return {
    ok: true,
    save: {
      ...save,
      money: save.money + drawn.moneyDelta,
      collection: drawn.collection,
      decorations: drawn.decorations,
      activeBox: drawn.box.tickets.length === 0 ? drawn.box : drawn.box,
    },
    message: `${extra}${last}${pond}`,
  }
}

export function setDrawPrice(save: SaveV2, price: number): SaveV2 {
  const next = clampPrice(price)
  return { ...save, drawPrice: next, draft: { ...save.draft, ichibanPrice: next } }
}

export function describeOpening(save: SaveV2, config: GameConfig = gameConfig): { cost: number; message: string | null } {
  if (save.phase !== 'prep') return { cost: 0, message: '這一天已經開始了' }
  const placed = save.placement.slice(0, save.slotsUnlocked).filter((type): type is StallType => type != null)
  if (placed.length === 0) return { cost: 0, message: '先放一個攤位' }
  const iceFlavors = positiveEntries(save.draft.iceQty)
  if (placed.includes('ice') && iceFlavors.length > config.iceCream.maxFlavors) {
    return { cost: 0, message: `冰淇淋最多上架 ${config.iceCream.maxFlavors} 種口味` }
  }
  if (placed.includes('fortune') && save.fortuneLevel < 1) {
    return { cost: 0, message: '算命攤要先付開攤費，或先把這個格子空出來' }
  }
  if (placed.includes('ichiban') && (save.activeBox?.tickets.length ?? 0) === 0) {
    return { cost: 0, message: '一番賞要先買一箱，或先把這個格子空出來' }
  }
  if (placed.includes('wish') && !wishUnlocked(save, config)) {
    return { cost: 0, message: '流星許願池還沒解鎖' }
  }
  let cost = 0
  if (placed.includes('ice')) cost += iceFlavors.reduce((sum, [, qty]) => sum + qty, 0) * config.iceCream.cost
  const canBuy = placed.includes('can') ? positiveEntries(save.draft.canQty) : []
  cost += canBuy.reduce((sum, [, qty]) => sum + qty, 0) * config.cans.cost
  if (placed.includes('can')) {
    const total = config.cans.types.reduce(
      (sum, type) => sum + (save.cans[type.id] ?? 0) + (save.draft.canQty[type.id] ?? 0),
      0,
    )
    if (total > config.cans.warehouseCap) {
      return { cost, message: `罐頭倉庫最多 ${config.cans.warehouseCap} 罐` }
    }
  }
  if (placed.includes('fortune')) cost += fortuneLevel(save, config)?.dailyElectric ?? 0
  const operating =
    (placed.includes('ice') && iceFlavors.length > 0) ||
    (placed.includes('can') && canStocked(save, config)) ||
    placed.includes('charge') ||
    (placed.includes('fortune') && save.fortuneLevel > 0) ||
    (placed.includes('ichiban') && (save.activeBox?.tickets.length ?? 0) > 0) ||
    (placed.includes('wish') && wishUnlocked(save, config))
  if (!operating) return { cost, message: '至少要有一個攤今天進得了貨或開得了門' }
  if (save.money < cost) return { cost, message: '遊戲幣不夠付今天的進貨和電費' }
  return { cost, message: null }
}

export function startBusiness(save: SaveV2, config: GameConfig = gameConfig): ActionResult {
  if (save.phase !== 'prep') return { ok: false, save, message: '現在不是開市前' }
  const opening = describeOpening(save, config)
  if (opening.message) return { ok: false, save, message: opening.message }
  const calendar = calendarInfo(save.day, config)
  const stalls: StallSim[] = []
  save.placement.forEach((type, slot) => {
    if (slot >= save.slotsUnlocked || !type) return
    const stall = buildStall(type, slot, save, config)
    if (stall) stalls.push(stall)
  })
  const rivals = planRival({
    config,
    day: save.day,
    forecast: save.forecast,
    trending: save.trending,
    playerYesterdayPrices: save.rivalMemory.playerPrices,
  })
  const sim: SimState = {
    tick: 0,
    rngState: save.rngState,
    day: save.day,
    weather: save.actualWeather,
    forecast: save.forecast,
    calendarFactor: calendar.factor,
    trending: save.trending,
    stalls,
    rivals,
    playerCustomers: 0,
    rivalCustomers: 0,
    finished: false,
    lastFortune: null,
    lastPortrait: null,
    box: save.activeBox ? structuredClone(save.activeBox) : null,
    chargedShoppers: [],
  }
  return {
    ok: true,
    save: { ...save, money: save.money - opening.cost, phase: 'business', sim, rngState: save.rngState },
    message: '開市了',
  }
}

export function runTick(save: SaveV2, command: Command | null, config: GameConfig = gameConfig): SaveV2 {
  if (save.phase !== 'business' || !save.sim || save.sim.finished) return save
  const sim = businessTick(save.sim, command, config)
  const next = { ...save, sim, rngState: sim.rngState }
  if (!sim.finished) return next
  return closeBusiness(next, config)
}

export function skipToClose(save: SaveV2, config: GameConfig = gameConfig): SaveV2 {
  if (save.phase !== 'business' || !save.sim) return save
  const sim = fastForward(save.sim, config.dayTicks, config)
  return closeBusiness({ ...save, sim, rngState: sim.rngState }, config)
}

export function closeBusiness(save: SaveV2, config: GameConfig = gameConfig): SaveV2 {
  if (!save.sim) return save
  const sim = save.sim
  const ledger = buildDayLedger({
    day: save.day,
    stalls: sim.stalls,
    labels: config.stallLabels,
    playerCustomers: sim.playerCustomers,
    rivalCustomers: sim.rivalCustomers,
    box: sim.box,
    iceUnitCost: config.iceCream.cost,
    refundRate: config.refundRate,
  })
  const variable = sim.stalls.reduce((sum, stall) => sum + stall.variableCost, 0)
  const income = sim.stalls.reduce((sum, stall) => sum + stall.income, 0)
  const canStall = sim.stalls.find((stall) => stall.type === 'can')
  const cans = { ...save.cans }
  if (canStall) {
    for (const type of config.cans.types) cans[type.id] = canStall.stock[type.id] ?? 0
  }
  const playerPrices: Record<string, number> = {}
  for (const stall of sim.stalls) {
    if (stall.type !== 'ice' && stall.type !== 'can' && stall.type !== 'charge') continue
    for (const [productId, price] of Object.entries(stall.prices)) {
      playerPrices[`${stall.type}:${productId}`] = price
    }
  }
  return {
    ...save,
    money: save.money + income - variable,
    cans,
    activeBox: sim.box,
    phase: 'ledger',
    sim: null,
    rngState: sim.rngState,
    wishMessage: null,
    ledgerHistory: [...save.ledgerHistory, ledger],
    rivalMemory: {
      playerPrices,
      stalls: sim.rivals.map((rival) => ({
        kind: rival.kind,
        productId: rival.productId,
        price: rival.price,
        stockLeft: rival.stock,
      })),
    },
  }
}

export function nextDay(save: SaveV2, config: GameConfig = gameConfig): SaveV2 {
  const rng = createRng(save.rngState)
  let actualWeather = save.actualWeather
  let forecast = save.forecast
  if (save.presetNext) {
    actualWeather = save.presetNext.actual
    forecast = save.presetNext.forecast
  } else {
    actualWeather = rollWeather(rng)
    forecast = rollForecast(actualWeather, rng, config.forecastAccuracy)
  }
  const trending = rollTrending(rng, config.iceCream.flavors.map((flavor) => flavor.id))
  const advanced: SaveV2 = {
    ...save,
    day: save.day + 1,
    phase: 'prep',
    sim: null,
    actualWeather,
    forecast,
    trending,
    presetNext: null,
    wishUsed: false,
    wishMessage: null,
    rngState: rng.getState(),
  }
  return { ...advanced, draft: draftForPlacement(advanced, config) }
}

export function castWish(save: SaveV2, desired: Weather, config: GameConfig = gameConfig): ActionResult {
  if (!wishUnlocked(save, config)) return { ok: false, save, message: '流星許願池還沒解鎖' }
  if (save.phase !== 'ledger') return { ok: false, save, message: '收市之後才能許願' }
  if (save.wishUsed) return { ok: false, save, message: '今天已經許過願了' }
  const rng = createRng(save.rngState)
  const naturalActual = rollWeather(rng)
  const naturalForecast = rollForecast(naturalActual, rng, config.forecastAccuracy)
  const result = resolveWish({
    desired,
    naturalForecast,
    roll: rng.next(),
    successRate: config.wishSuccessRate,
  })
  const label = WEATHER_LABEL[result.actual]
  const message = result.success
    ? `願望實現了，明天是${label}天。`
    : `流星沒有回應，明天照原本的預報，是${label}天。`
  return {
    ok: true,
    save: {
      ...save,
      rngState: rng.getState(),
      presetNext: { actual: result.actual, forecast: result.forecast },
      wishUsed: true,
      wishMessage: message,
    },
    message,
  }
}

export function renameDogs(save: SaveV2, whiteName: string, brownName: string): ActionResult {
  try {
    const names = { white: cleanName(whiteName), brown: cleanName(brownName) }
    return { ok: true, save: { ...save, names }, message: '名字改好了' }
  } catch (error) {
    return { ok: false, save, message: error instanceof Error ? error.message : '名字不行' }
  }
}

export function forecastDemand(
  save: SaveV2,
  stall: StallType,
  productId: string,
  price: number,
  config: GameConfig = gameConfig,
): number {
  return demandFor({
    config,
    weather: save.forecast,
    calendarFactor: calendarInfo(save.day, config).factor,
    stall,
    productId,
    price,
    trending: save.trending,
    box: save.activeBox,
  })
}

export function wishUnlocked(save: SaveV2, config: GameConfig = gameConfig): boolean {
  return isWishPondUnlocked(save.collection, figureIds(config))
}

function figureIds(config: GameConfig): string[] {
  return config.figures.map((figure) => figure.id)
}

function nameSeed(playerDog: string, white: string, brown: string): number {
  let hash = 2166136261
  for (const char of `${playerDog}:${white}:${brown}`) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function cleanName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > 8) throw new Error('名字要 1 到 8 個字')
  return trimmed
}

function emptyDraft(config: GameConfig): PrepDraft {
  return {
    iceQty: Object.fromEntries(config.iceCream.flavors.map((flavor) => [flavor.id, 0])),
    icePrices: Object.fromEntries(config.iceCream.flavors.map((flavor) => [flavor.id, config.iceCream.referencePrice])),
    canQty: Object.fromEntries(config.cans.types.map((type) => [type.id, 0])),
    canPrices: Object.fromEntries(config.cans.types.map((type) => [type.id, config.cans.referencePrice])),
    chargePrice: config.charger.referencePrice,
    fortunePrice: config.fortune.referencePrice,
    ichibanPrice: config.ichiban.referencePrice,
    wishPrice: config.wish.referencePrice,
  }
}

function draftForPlacement(save: SaveV2, config: GameConfig): PrepDraft {
  const draft = {
    ...emptyDraft(config),
    ...save.draft,
    iceQty: { ...emptyDraft(config).iceQty, ...save.draft.iceQty },
    icePrices: { ...emptyDraft(config).icePrices, ...save.draft.icePrices },
    canQty: { ...emptyDraft(config).canQty, ...save.draft.canQty },
    canPrices: { ...emptyDraft(config).canPrices, ...save.draft.canPrices },
  }
  if (save.placement.includes('ice')) {
    for (const flavor of config.iceCream.flavors) draft.iceQty[flavor.id] = 0
    for (const id of save.trending.slice(0, config.iceCream.maxFlavors)) draft.iceQty[id] = 4
  }
  if (save.placement.includes('can')) {
    const match = config.cans.match[save.forecast]
    const buying = Object.values(draft.canQty).reduce((sum, qty) => sum + qty, 0)
    if (buying === 0 && (save.cans[match] ?? 0) === 0) draft.canQty[match] = 8
  }
  return draft
}

function positiveEntries(map: Record<string, number>): [string, number][] {
  return Object.entries(map).filter(([, qty]) => qty > 0)
}

function defaultsFor(draft: PrepDraft, type: StallType, save: SaveV2, config: GameConfig): PrepDraft {
  if (type === 'ice') {
    const iceQty = Object.fromEntries(config.iceCream.flavors.map((flavor) => [flavor.id, 0]))
    const icePrices = { ...draft.icePrices }
    for (const flavor of config.iceCream.flavors) {
      icePrices[flavor.id] = icePrices[flavor.id] || config.iceCream.referencePrice
    }
    for (const id of save.trending.slice(0, config.iceCream.maxFlavors)) iceQty[id] = 4
    return { ...draft, iceQty, icePrices }
  }
  if (type === 'can') {
    const canQty = { ...draft.canQty }
    const canPrices = { ...draft.canPrices }
    for (const can of config.cans.types) {
      canQty[can.id] = canQty[can.id] ?? 0
      canPrices[can.id] = canPrices[can.id] || config.cans.referencePrice
    }
    const match = config.cans.match[save.forecast]
    if ((canQty[match] ?? 0) === 0 && (save.cans[match] ?? 0) === 0) canQty[match] = 8
    return { ...draft, canQty, canPrices }
  }
  return draft
}

function canStocked(save: SaveV2, config: GameConfig): boolean {
  return config.cans.types.some((type) => (save.cans[type.id] ?? 0) + (save.draft.canQty[type.id] ?? 0) > 0)
}

function fortuneLevel(save: SaveV2, config: GameConfig) {
  return config.fortune.levels.find((level) => level.level === save.fortuneLevel) ?? null
}

function clampPrice(price: number): number {
  if (!Number.isFinite(price)) return 1
  return Math.max(1, Math.min(999, Math.round(price)))
}

function buildStall(type: StallType, slot: number, save: SaveV2, config: GameConfig): StallSim | null {
  const base: StallSim = {
    type,
    slot,
    prices: {},
    stock: {},
    initialStock: {},
    queue: [],
    serving: null,
    charges: [],
    serveTicks: 4,
    progress: 0,
    queueMax: 8,
    parallel: 1,
    boostUntilTick: 0,
    boostReadyTick: 0,
    repriced: false,
    served: 0,
    lost: 0,
    income: 0,
    variableCost: 0,
    bonusIncome: 0,
    purchaseCost: 0,
    dailyElectric: 0,
  }
  if (type === 'ice') {
    const chosen = positiveEntries(save.draft.iceQty).slice(0, config.iceCream.maxFlavors)
    if (chosen.length === 0) return null
    for (const [id, qty] of chosen) {
      base.prices[id] = clampPrice(save.draft.icePrices[id] ?? config.iceCream.referencePrice)
      base.stock[id] = qty
      base.initialStock[id] = qty
      base.purchaseCost += qty * config.iceCream.cost
    }
    base.serveTicks = config.iceCream.serveTicks
    base.queueMax = config.iceCream.queueMax
    return base
  }
  if (type === 'can') {
    for (const can of config.cans.types) {
      const qty = (save.cans[can.id] ?? 0) + (save.draft.canQty[can.id] ?? 0)
      if (qty <= 0) continue
      base.prices[can.id] = clampPrice(save.draft.canPrices[can.id] ?? config.cans.referencePrice)
      base.stock[can.id] = qty
      base.initialStock[can.id] = qty
      base.purchaseCost += (save.draft.canQty[can.id] ?? 0) * config.cans.cost
    }
    if (Object.keys(base.prices).length === 0) return null
    base.serveTicks = config.cans.serveTicks
    base.queueMax = config.cans.queueMax
    return base
  }
  if (type === 'charge') {
    base.prices.charge = clampPrice(save.draft.chargePrice)
    base.serveTicks = config.charger.serveTicks
    base.queueMax = config.charger.queueMax
    base.parallel = config.charger.capacity
    return base
  }
  if (type === 'fortune') {
    const level = fortuneLevel(save, config)
    if (!level) return null
    base.prices.fortune = clampPrice(save.draft.fortunePrice)
    base.serveTicks = Math.max(1, Math.round(60 / level.perMinute))
    base.queueMax = config.fortune.queueMax
    base.dailyElectric = level.dailyElectric
    return base
  }
  if (type === 'ichiban') {
    if ((save.activeBox?.tickets.length ?? 0) === 0) return null
    base.prices.draw = clampPrice(save.drawPrice)
    base.serveTicks = config.ichiban.serveTicks
    base.queueMax = config.ichiban.queueMax
    return base
  }
  base.prices.wish = clampPrice(save.draft.wishPrice)
  base.serveTicks = config.wish.serveTicks
  base.queueMax = config.wish.queueMax
  return base
}
