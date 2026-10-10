import type { SimState, StallSim, StallType } from './types'

export function makeStall(over: Partial<StallSim> & Pick<StallSim, 'type' | 'slot'>): StallSim {
  return {
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
    ...over,
  }
}

export function makeSim(over: Partial<SimState> = {}): SimState {
  return {
    tick: 0,
    rngState: 1,
    day: 1,
    weather: 'sunny',
    forecast: 'sunny',
    calendarFactor: 1,
    trending: [],
    stalls: [],
    rivals: [],
    playerCustomers: 0,
    rivalCustomers: 0,
    finished: false,
    lastFortune: null,
    lastPortrait: null,
    box: null,
    chargedShoppers: [],
    ...over,
  }
}

export function queued(id: string, productId: string, arrivedTick = 0) {
  return { id, productId, patienceLeft: 20, arrivedTick, dreamFlavor: undefined }
}

export const stallTypes: StallType[] = ['ice', 'can', 'charge', 'fortune', 'ichiban', 'wish']
