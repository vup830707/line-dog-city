import { FACES, HAIRS, ACCESSORIES, FORTUNE_LINES } from '../content/fortunes'
import { demandFor, referencePrice } from './demand'
import { drawTicket } from './ichiban'
import { decideVisit, priceCoefficient, visitProbability } from './pricing'
import { adjustRivalPrices, splitShare } from './rival'
import { createRng, sampleCount, type Rng } from './rng'
import type {
  Command,
  GameConfig,
  PendingPasser,
  QueuedCustomer,
  RivalKind,
  SimState,
  StallSim,
  StallType,
} from './types'

const KIND_OF: Partial<Record<StallType, RivalKind>> = {
  ice: 'ice',
  can: 'can',
  charge: 'charge',
}

export function fastForward(state: SimState, ticks: number, config: GameConfig): SimState {
  let next = state
  const steps = Math.max(0, Math.min(ticks, config.dayTicks - state.tick))
  for (let i = 0; i < steps; i++) {
    if (next.finished) break
    next = businessTick(next, null, config)
  }
  return next
}

export function peekPassers(state: SimState, config: GameConfig): PendingPasser[] {
  if (state.finished) return []
  const draft = structuredClone(state)
  if (draft.tick === Math.floor(config.dayTicks / 2) && draft.rivals.some((rival) => !rival.adjusted)) {
    draft.rivals = adjustRivalPrices(draft.rivals, draft.stalls, config)
  }
  const rng = createRng(draft.rngState)
  return spawnPassers(draft, rng, config)
}

export function businessTick(state: SimState, command: Command | null, config: GameConfig): SimState {
  if (state.finished) return state
  const next = structuredClone(state)
  if (next.tick === Math.floor(config.dayTicks / 2) && next.rivals.some((rival) => !rival.adjusted)) {
    next.rivals = adjustRivalPrices(next.rivals, next.stalls, config)
  }
  if (command && command.type !== 'attract') applySetupCommand(next, command, config)
  const rng = createRng(next.rngState)
  const pending = spawnPassers(next, rng, config)
  if (command?.type === 'attract') {
    const passer = pending.find((item) => item.id === command.passerId)
    if (passer) passer.attracted = true
  }
  resolvePassers(next, pending, rng, config)
  serveAll(next, rng, config)
  next.rngState = rng.getState()
  next.tick += 1
  if (next.tick >= config.dayTicks) next.finished = true
  return next
}

function applySetupCommand(state: SimState, command: Command, config: GameConfig): void {
  if (command.type === 'boost') {
    const stall = state.stalls.find((item) => item.slot === command.slot)
    if (!stall || state.tick < stall.boostReadyTick) return
    stall.boostUntilTick = state.tick + config.boostDuration
    stall.boostReadyTick = state.tick + config.boostCooldown
    return
  }
  if (command.type === 'reprice') {
    const stall = state.stalls.find((item) => item.slot === command.slot)
    if (!stall || stall.repriced) return
    const price = Math.round(command.price)
    if (price < 1 || price > 999) return
    if (stall.prices[command.productId] == null) return
    stall.prices[command.productId] = price
    stall.repriced = true
  }
}

function productIds(stall: StallSim): string[] {
  if (stall.type === 'charge') return ['charge']
  if (stall.type === 'fortune') return ['fortune']
  if (stall.type === 'wish') return ['wish']
  if (stall.type === 'ichiban') return ['draw']
  return Object.keys(stall.prices)
}

function spawnPassers(state: SimState, rng: Rng, config: GameConfig): PendingPasser[] {
  const list: PendingPasser[] = []
  for (const stall of state.stalls) {
    for (const productId of productIds(stall)) {
      const price = stall.prices[productId]
      if (price == null || price <= 0) continue
      if ((stall.type === 'ice' || stall.type === 'can') && (stall.stock[productId] ?? 0) <= 0) continue
      if (stall.type === 'ichiban' && (state.box?.tickets.length ?? 0) <= 0) continue
      const expected = demandFor({
        config,
        weather: state.weather,
        calendarFactor: state.calendarFactor,
        stall: stall.type,
        productId,
        price,
        trending: state.trending,
        box: state.box,
      })
      const coeff = priceCoefficient(referencePrice(stall.type, config), price, config.priceExponent)
      const visitP = visitProbability(coeff, config)
      const rate = visitP <= 0 ? 0 : expected / visitP / config.dayTicks
      const count = sampleCount(rate, rng)
      for (let i = 0; i < count; i++) {
        list.push({
          id: `p-${stall.slot}-${state.tick}-${productId}-${i}`,
          slot: stall.slot,
          productId,
          roll: rng.next(),
          attracted: false,
          dreamFlavor: stall.type === 'ice' ? pickFlavor(rng, config) : undefined,
        })
      }
    }
  }
  return list
}

function pickFlavor(rng: Rng, config: GameConfig): string {
  const flavors = config.iceCream.flavors
  const index = Math.floor(rng.next() * flavors.length)
  return flavors[index]?.id ?? 'fly'
}

function resolvePassers(state: SimState, pending: PendingPasser[], rng: Rng, config: GameConfig): void {
  for (const passer of pending) {
    const stall = state.stalls.find((item) => item.slot === passer.slot)
    if (!stall) continue
    const price = stall.prices[passer.productId]
    if (price == null) continue
    const coeff = priceCoefficient(referencePrice(stall.type, config), price, config.priceExponent)
    const visitP = visitProbability(coeff, config)
    if (!decideVisit(visitP, passer.roll, passer.attracted, config.attractBonus)) continue
    const kind = KIND_OF[stall.type]
    const rival = kind
      ? state.rivals.find((item) => item.kind === kind && item.productId === passer.productId && item.stock > 0)
      : undefined
    if (rival) {
      const share = splitShare(price, rival.price, config.priceExponent)
      if (rng.next() >= share) {
        state.rivalCustomers += 1
        rival.customers += 1
        rival.stock -= 1
        rival.served += 1
        let paid = rival.price
        const charger = state.rivals.find((item) => item.kind === 'charge' && item.stock > 0)
        if (rival.kind !== 'charge' && charger) paid = Math.round(rival.price * config.charger.adjacentBonus)
        rival.income += paid
        continue
      }
    }
    state.playerCustomers += 1
    admit(stall, state, passer, config)
  }
}

function pendingOf(stall: StallSim, productId: string): number {
  const queued = stall.queue.filter((customer) => customer.productId === productId).length
  const serving = stall.serving?.productId === productId ? 1 : 0
  return queued + serving
}

function admit(stall: StallSim, state: SimState, passer: PendingPasser, config: GameConfig): void {
  if (stall.type === 'ice' || stall.type === 'can') {
    if (pendingOf(stall, passer.productId) >= (stall.stock[passer.productId] ?? 0)) {
      stall.lost += 1
      return
    }
  }
  if (stall.type === 'ichiban') {
    const left = state.box?.tickets.length ?? 0
    const pending = stall.queue.length + (stall.serving ? 1 : 0)
    if (pending >= left) {
      stall.lost += 1
      return
    }
  }
  const active = stall.type === 'charge' ? stall.charges.length : stall.serving ? 1 : 0
  const cap = stall.type === 'charge' ? stall.parallel + stall.queueMax : stall.queueMax
  if (active + stall.queue.length >= cap) {
    stall.lost += 1
    return
  }
  const customer: QueuedCustomer = {
    id: passer.id,
    productId: passer.productId,
    dreamFlavor: passer.dreamFlavor,
    patienceLeft: config.fortune.patience,
    arrivedTick: state.tick,
  }
  if (stall.type === 'charge' && stall.charges.length < stall.parallel) {
    stall.charges.push({ progress: 0, customerId: customer.id })
    return
  }
  if (stall.type !== 'charge' && !stall.serving && stall.queue.length === 0) {
    stall.serving = customer
    return
  }
  stall.queue.push(customer)
}

function serveAll(state: SimState, rng: Rng, config: GameConfig): void {
  for (const stall of state.stalls) {
    if (stall.type === 'charge') serveCharger(stall, state, config)
    else serveSerial(stall, state, rng, config)
  }
}

function serveSerial(stall: StallSim, state: SimState, rng: Rng, config: GameConfig): void {
  if (stall.type === 'fortune') {
    const staying: QueuedCustomer[] = []
    for (const customer of stall.queue) {
      if (customer.arrivedTick < state.tick) customer.patienceLeft -= 1
      if (customer.patienceLeft <= 0) stall.lost += 1
      else staying.push(customer)
    }
    stall.queue = staying
  }
  const rate = state.tick < stall.boostUntilTick ? config.boostMultiplier : 1
  if (!stall.serving && stall.queue.length > 0) stall.serving = stall.queue.shift() ?? null
  if (!stall.serving) {
    stall.progress = 0
    return
  }
  stall.progress += rate
  while (stall.serving && stall.progress >= stall.serveTicks) {
    const done = stall.serving
    stall.serving = null
    completeSerial(stall, done, state, rng, config)
    stall.progress -= stall.serveTicks
    stall.serving = stall.queue.shift() ?? null
  }
  if (!stall.serving) stall.progress = 0
}

function serveCharger(stall: StallSim, state: SimState, config: GameConfig): void {
  const rate = state.tick < stall.boostUntilTick ? config.boostMultiplier : 1
  while (stall.charges.length < stall.parallel && stall.queue.length > 0) {
    const next = stall.queue.shift()
    if (!next) break
    stall.charges.push({ progress: 0, customerId: next.id })
  }
  const still = []
  for (const job of stall.charges) {
    job.progress += rate
    if (job.progress >= stall.serveTicks) {
      const price = stall.prices.charge ?? 0
      stall.income += price
      stall.variableCost += config.charger.electricCost
      stall.served += 1
      state.chargedShoppers.push({ sourceSlot: stall.slot })
    } else {
      still.push(job)
    }
  }
  stall.charges = still
}

function completeSerial(
  stall: StallSim,
  customer: QueuedCustomer,
  state: SimState,
  rng: Rng,
  config: GameConfig,
): void {
  if (stall.type === 'ice' || stall.type === 'can') {
    const left = stall.stock[customer.productId] ?? 0
    if (left <= 0) {
      stall.lost += 1
      return
    }
    stall.stock[customer.productId] = left - 1
  }
  if (stall.type === 'ichiban') {
    if (!state.box || state.box.tickets.length === 0) {
      stall.lost += 1
      return
    }
    const drawn = drawTicket(state.box)
    state.box = { ...drawn.box, income: drawn.box.income }
  }
  const base = stall.prices[customer.productId] ?? 0
  const sale = applyChargeBonus(stall, state, config, base)
  stall.income += sale.paid
  stall.bonusIncome += sale.bonus
  stall.served += 1
  if (stall.type === 'ice' && customer.dreamFlavor === customer.productId && rng.next() < config.iceCream.tipChance) {
    stall.income += Math.round(base * config.iceCream.tipRate)
  }
  if (stall.type === 'fortune') {
    stall.variableCost += config.fortune.variableCost
    const line = Math.floor(rng.next() * FORTUNE_LINES.length)
    state.lastFortune = FORTUNE_LINES[line] ?? null
    state.lastPortrait = {
      face: FACES[Math.floor(rng.next() * FACES.length)] ?? FACES[0],
      hair: HAIRS[Math.floor(rng.next() * HAIRS.length)] ?? HAIRS[0],
      accessory: ACCESSORIES[Math.floor(rng.next() * ACCESSORIES.length)] ?? ACCESSORIES[0],
    }
  }
  if (stall.type === 'ichiban' && state.box) {
    state.box = { ...state.box, income: state.box.income + base }
  }
}

function applyChargeBonus(
  stall: StallSim,
  state: SimState,
  config: GameConfig,
  base: number,
): { paid: number; bonus: number } {
  if (stall.type === 'charge' || state.chargedShoppers.length === 0) return { paid: base, bonus: 0 }
  const shopper = state.chargedShoppers.shift()
  if (!shopper) return { paid: base, bonus: 0 }
  const adjacent = Math.abs(shopper.sourceSlot - stall.slot) === 1
  const mult = adjacent ? config.charger.adjacentBonus : config.charger.otherBonus
  const paid = Math.round(base * mult)
  return { paid, bonus: paid - base }
}
