export type Weather = 'sunny' | 'hot' | 'cold' | 'rain'
export type Phase = 'dusk' | 'mid' | 'late'
export type StallType = 'ice' | 'can' | 'charge' | 'fortune' | 'ichiban' | 'wish' | 'skewer'
export type DecorType = 'lantern' | 'seat' | 'sign' | 'flower' | 'star' | 'string'
export type Rarity = 'common' | 'uncommon' | 'rare'
export type Job = 'restock' | 'clean' | 'greet' | 'rest'
export type Species = 'cat' | 'rabbit' | 'hamster' | 'sparrow' | 'otter' | 'hedgehog' | 'fox' | 'bear'
export type HireSpecies = 'munia' | 'ferret'
export type Grade = 'A' | 'B' | 'C' | 'D'

export interface PrizeDef {
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
  prizes: PrizeDef[]
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
  /** Missing on older saves. Only a box opened by paying wholesale refunds. */
  paid?: boolean
  /** Ticks since the last draw. Missing means 0. */
  idleTicks?: number
}

export interface Placement {
  uid: string
  kind: 'stall' | 'decor'
  stallType?: StallType
  decorType?: DecorType
  level: number
}

export interface Visitor {
  id: string
  species: Species
  position: number
  target: number
  status: 'walk' | 'leave'
  charged: boolean
  liked: boolean
  satisfaction: number
  spent: number
  fortune: string | null
  drewGrade: Grade | null
  productId?: string | null
}

export interface StaffMember {
  id: string
  name: string
  kind: 'dog' | 'hire'
  dog?: 'white' | 'brown'
  hireSpecies?: HireSpecies
  job: Job
  level: number
}

export interface Letter {
  id: string
  species: Species
  topic: string
  body: string
  tick: number
}

export interface Street {
  tick: number
  day: number
  phase: Phase
  phaseTick: number
  weather: Weather
  pendingWeather: Weather | null
  wishUsed: boolean
  wishMessage: string | null
  money: number
  cleanliness: number
  slots: (Placement | null)[]
  stock: Record<string, number>
  visitors: Visitor[]
  staff: StaffMember[]
  letters: Letter[]
  sentTopics: string[]
  collection: Record<string, number>
  ownedDecor: string[]
  box: BoxState | null
  boxRestock: number
  arrivals: number[]
  trending: string[]
  rngState: number
  nextVisitor: number
  offlineNote: string | null
  lastOfflineTicks: number
  marketLevel: number
  bustleXp: number
  seenSpecies: Species[]
  seenProducts: string[]
  ackedSpecies: Species[]
  pendingToasts: string[]
  levelUpBanner: number | null
  speciesSatisfaction: Partial<Record<Species, number>>
}

export interface SaveV4 {
  schemaVersion: 4
  playerDog: 'white' | 'brown'
  whiteName: string
  brownName: string
  savedAt: number
  street: Street
}

/** Current on-disk save. v3 files are migrated on read. */
export type SaveV3 = SaveV4

export interface ProductDef {
  id: string
  name: string
  price: number
  level: number
}

export type SpeciesUnlock =
  | { kind: 'start' }
  | { kind: 'seats'; count: number }
  | { kind: 'stallLevel'; level: number }
  | { kind: 'ichibanDecor'; decor: number }
  | { kind: 'wishAmbience'; ambience: number }

export interface SpeciesDef {
  id: Species
  name: string
  stall: StallType
  product: string
  decor: DecorType
  topic: string
  rarity: Rarity
  unlock: SpeciesUnlock
}

export interface MarketLevelDef {
  level: number
  bustleXp: number
  slots: number
  stalls: StallType[]
  decors: DecorType[]
  visitCap: number
}

export interface GameConfig {
  tickMs: number
  phaseMinutes: number
  offlineCapHours: number
  startingMoney: number
  streetSlots: number
  baseVisitsPerPhase: number
  ambienceFloor: number
  /** Added to visit liveliness per market level above 1. Not part of bustleXp. */
  visitLivelinessPerLevel: number
  ambienceCap: number
  ambienceTarget: number
  cleanDropPerPhase: number
  cleanDropPerVisitor: number
  cleanlinessWeight: number
  saveEveryTicks: number
  titleLightMs: number
  phoneHeightRatio: number
  buildAnimMs: number
  ichibanIdleTicks: number
  walkSpeed: number
  restockCostRatio: number
  wishSuccessRate: number
  refundRate: number
  festivalBonus: number
  letterAt: number
  decorationDuplicateValue: number
  duplicateValue: Record<Grade, number>
  satisfaction: {
    base: number
    liked: number
    decor: number
    clean: number
    cleanAt: number
    greet: number
    favorite: number
    limited: number
  }
  topProductChance: number
  favoriteBonus: number
  tipRate: number
  chargeBonus: number
  spendMultiplier: Record<Rarity, number>
  products: Record<StallType, ProductDef[]>
  marketLevels: MarketLevelDef[]
  slotOrder: number[]
  ichibanRestockByLevel: number[]
  speciesWeights: {
    base: Record<Species, number>
    weather: Record<Species, Record<Weather, number>>
    phase: Record<Species, Record<Phase, number>>
  }
  prices: Record<StallType, number>
  placeCost: Record<StallType, number>
  upgradeCost: Record<StallType, number[]>
  decorCost: Record<DecorType, number>
  /** Price of a decoration after the player already owns one of that kind. */
  decorNextCost: Record<DecorType, number>
  decorScore: Record<DecorType, number>
  lookByLevel: number[]
  stockPerLevel: number
  restockEvery: number[]
  cleanGain: number[]
  hireCost: number[]
  levelCost: number[]
  maxStaffLevel: number
  maxHires: number
  ichibanRestockTicks: number
  calendarLength: number
  festivals: { day: number; name: string }[]
  flavors: { id: string; name: string }[]
  stallLabels: Record<StallType, string>
  decorLabels: Record<DecorType, string>
  species: SpeciesDef[]
  hireSpecies: { id: HireSpecies; name: string }[]
  figures: { id: string; name: string; grade: Grade; blurb: string }[]
  ichiban: { boxes: BoxDef[] }
}

export interface ActionResult {
  street: Street
  ok: boolean
  reason?: string
}
