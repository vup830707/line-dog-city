export type Weather = 'sunny' | 'hot' | 'cold' | 'rain'
export type StallType = 'ice' | 'can' | 'charge' | 'fortune' | 'ichiban' | 'wish'
export type Grade = 'A' | 'B' | 'C' | 'D'
export type RivalKind = 'ice' | 'can' | 'charge'

export interface GameConfig {
  dayTicks: number
  tickMs: number
  priceExponent: number
  startingMoney: number
  startingSlots: number
  maxSlots: number
  slotCosts: number[]
  forecastAccuracy: number
  baseCrowd: number
  marketWeather: Record<Weather, number>
  weekendFactor: number
  festivalFactor: number
  festivals: { day: number; name: string }[]
  calendarLength: number
  visitScale: number
  visitMin: number
  visitMax: number
  attractBonus: number
  boostMultiplier: number
  boostDuration: number
  boostCooldown: number
  rivalStockFactor: number
  rivalUndercut: number
  rivalFloorMultiplier: number
  rivalSoldOutMarkup: number
  rivalOverstockDiscount: number
  rivalOverstockRatio: number
  wishSuccessRate: number
  duplicateValue: Record<Grade, number>
  decorationDuplicateValue: number
  refundRate: number
  stallLabels: Record<StallType, string>
  iceCream: IceConfig
  cans: CanConfig
  charger: ChargerConfig
  fortune: FortuneConfig
  ichiban: IchibanConfig
  wish: WishConfig
  figures: FigureDef[]
}

export interface IceConfig {
  cost: number
  priceMin: number
  priceMax: number
  referencePrice: number
  serveTicks: number
  queueMax: number
  maxFlavors: number
  trendingBoost: number
  otherFactor: number
  tipChance: number
  tipRate: number
  stallMultiplier: number
  weather: Record<Weather, number>
  flavors: { id: string; name: string }[]
}

export interface CanConfig {
  cost: number
  priceMin: number
  priceMax: number
  referencePrice: number
  serveTicks: number
  queueMax: number
  warehouseCap: number
  matchFactor: number
  otherFactor: number
  sunnyMatchPenalty: number
  stallMultiplier: number
  types: { id: string; name: string }[]
  match: Record<Weather, string>
}

export interface ChargerConfig {
  electricCost: number
  priceMin: number
  priceMax: number
  referencePrice: number
  serveTicks: number
  capacity: number
  queueMax: number
  adjacentBonus: number
  otherBonus: number
  stallMultiplier: number
  weather: Record<Weather, number>
}

export interface FortuneLevel {
  level: 1 | 2 | 3
  upgradeCost: number
  perMinute: number
  dailyElectric: number
}

export interface FortuneConfig {
  priceMin: number
  priceMax: number
  referencePrice: number
  variableCost: number
  patience: number
  queueMax: number
  stallMultiplier: number
  weather: Record<Weather, number>
  levels: FortuneLevel[]
}

export interface BoxPrize {
  grade: Grade
  figureId: string | null
  label: string
  count: number
  unitCost: number
}

export interface BoxDef {
  id: string
  name: string
  wholesale: number
  lastPrize: { id: string; label: string; unitCost: number }
  prizes: BoxPrize[]
}

export interface IchibanConfig {
  priceMin: number
  priceMax: number
  referencePrice: number
  serveTicks: number
  queueMax: number
  weather: Record<Weather, number>
  factorAPresent: number
  factorAGone: number
  factorABGone: number
  lastStretchAt: number
  lastStretchFactor: number
  boxes: BoxDef[]
}

export interface WishConfig {
  priceMin: number
  priceMax: number
  referencePrice: number
  serveTicks: number
  queueMax: number
  cost: number
  stallMultiplier: number
  weather: Record<Weather, number>
}

export interface FigureDef {
  id: string
  name: string
  grade: Grade
  blurb: string
}

export interface Ticket {
  grade: Grade
  figureId: string | null
  label: string
  unitCost: number
}

export interface BoxState {
  boxId: string
  name: string
  wholesale: number
  tickets: Ticket[]
  lastPrize: { id: string; label: string; unitCost: number; awarded: boolean }
  draws: number
  income: number
  selfIncome: number
  selfDraws: number
}

export interface QueuedCustomer {
  id: string
  productId: string
  dreamFlavor?: string
  patienceLeft: number
  arrivedTick: number
}

export interface ChargeJob {
  progress: number
  customerId: string
}

export interface StallSim {
  type: StallType
  slot: number
  prices: Record<string, number>
  stock: Record<string, number>
  initialStock: Record<string, number>
  queue: QueuedCustomer[]
  serving: QueuedCustomer | null
  charges: ChargeJob[]
  serveTicks: number
  progress: number
  queueMax: number
  parallel: number
  boostUntilTick: number
  boostReadyTick: number
  repriced: boolean
  served: number
  lost: number
  income: number
  variableCost: number
  bonusIncome: number
  purchaseCost: number
  dailyElectric: number
}

export interface RivalSim {
  kind: RivalKind
  slot: number
  productId: string
  price: number
  stock: number
  initialStock: number
  cost: number
  income: number
  customers: number
  served: number
  adjusted: boolean
}

export interface ChargedShopper {
  sourceSlot: number
}

export interface Portrait {
  face: string
  hair: string
  accessory: string
}

export interface SimState {
  tick: number
  rngState: number
  day: number
  weather: Weather
  forecast: Weather
  calendarFactor: number
  trending: string[]
  stalls: StallSim[]
  rivals: RivalSim[]
  playerCustomers: number
  rivalCustomers: number
  finished: boolean
  lastFortune: string | null
  lastPortrait: Portrait | null
  box: BoxState | null
  chargedShoppers: ChargedShopper[]
}

export type Command =
  | { type: 'boost'; slot: number }
  | { type: 'reprice'; slot: number; productId: string; price: number }
  | { type: 'attract'; passerId: string }

export interface PendingPasser {
  id: string
  slot: number
  productId: string
  roll: number
  attracted: boolean
  dreamFlavor?: string
}

export interface LedgerLine {
  stall: StallType
  label: string
  income: number
  expense: number
  wasteQty: number
  wasteValue: number
  served: number
  lost: number
  bonusIncome: number
}

export interface IchibanDayNote {
  name: string
  drawsToday: number
  incomeToday: number
  leftover: number
  refundIfReturned: number
}

export interface DayLedger {
  day: number
  lines: LedgerLine[]
  totalIncome: number
  totalExpense: number
  profit: number
  wasteValue: number
  playerShare: number | null
  chargerBonus: number
  ichiban: IchibanDayNote | null
}

export interface PrepDraft {
  iceQty: Record<string, number>
  icePrices: Record<string, number>
  canQty: Record<string, number>
  canPrices: Record<string, number>
  chargePrice: number
  fortunePrice: number
  ichibanPrice: number
  wishPrice: number
}

export interface RivalMemoryStall {
  kind: RivalKind
  productId: string
  price: number
  stockLeft: number
}

export interface SaveV2 {
  schemaVersion: 2
  playerDog: 'white' | 'brown'
  names: { white: string; brown: string }
  money: number
  day: number
  slotsUnlocked: number
  placement: (StallType | null)[]
  fortuneLevel: 0 | 1 | 2 | 3
  cans: Record<string, number>
  collection: Record<string, number>
  decorations: string[]
  drawPrice: number
  activeBox: BoxState | null
  rivalMemory: {
    stalls: RivalMemoryStall[]
    playerPrices: Record<string, number>
  }
  ledgerHistory: DayLedger[]
  phase: 'prep' | 'business' | 'ledger'
  rngState: number
  forecast: Weather
  actualWeather: Weather
  trending: string[]
  presetNext: { actual: Weather; forecast: Weather } | null
  wishUsed: boolean
  wishMessage: string | null
  sim: SimState | null
  draft: PrepDraft
}
