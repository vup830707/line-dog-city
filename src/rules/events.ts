import { createRng, type Rng } from './rng'
import { festivalName, upcomingFestival } from './weather'
import type { DecorType, EventNote, GameConfig, MerchantOffer, NightEvent, NightEventKind, Phase, Species, Street, Weather } from './types'

const GIFT_DECORS: DecorType[] = ['lantern', 'seat', 'sign', 'flower', 'star', 'string']

/**
 * Events use a day seed derived from the street RNG.
 * The roll is deterministic and does not steal draws from customers.
 */
export function eventSeed(rngState: number, day: number): number {
  const mixed = Math.imul(rngState ^ Math.imul(day, 0x9e3779b1), 0x85ebca6b)
  return (mixed ^ (mixed >>> 13)) >>> 0
}

export function rollNightEvent(rngState: number, day: number, street: Street, config: GameConfig): NightEvent | null {
  const rng = createRng(eventSeed(rngState, day))
  if (rng.next() >= config.eventChance) return null
  const kinds: NightEventKind[] = ['rain', 'festival-eve', 'merchant']
  const kind = kinds[Math.floor(rng.next() * kinds.length)] ?? 'rain'
  return buildNightEvent(kind, day, street, config, rng)
}

export function buildNightEvent(kind: NightEventKind, day: number, street: Street, config: GameConfig, rng: Rng): NightEvent {
  if (kind === 'festival-eve') {
    return { day, kind, festival: upcomingFestival(day, config)?.name ?? '元宵', offer: null, bought: false }
  }
  if (kind === 'merchant') {
    return {
      day,
      kind,
      festival: null,
      offer: pickMerchantOffer(street.collection, rng, config),
      bought: false,
    }
  }
  return { day, kind: 'rain', festival: null, offer: null, bought: false }
}

/** Dog skins in the ichiban box. Stickers and the last prize are not skins. */
export function ichibanDogSkins(config: GameConfig): string[] {
  const ids: string[] = []
  for (const box of config.ichiban.boxes) {
    for (const prize of box.prizes) {
      if (prize.figureId && !ids.includes(prize.figureId)) ids.push(prize.figureId)
    }
  }
  return ids
}

/** Pull price times tickets in the box, divided by the skin tickets. */
export function expectedIchibanSkinCost(config: GameConfig): number {
  let tickets = 0
  let skins = 0
  for (const box of config.ichiban.boxes) {
    for (const prize of box.prizes) {
      const count = Math.max(0, prize.count)
      tickets += count
      if (prize.figureId) skins += count
    }
  }
  const pull = Math.max(0, config.prices.ichiban)
  if (skins <= 0) return pull
  return (tickets * pull) / skins
}

export function merchantAsk(config: GameConfig): number {
  const mult = Number.isFinite(config.merchantPriceMultiplier) ? config.merchantPriceMultiplier : 1.75
  return Math.max(0, Math.round(expectedIchibanSkinCost(config) * mult))
}

/** One missing dog skin, or a placeable decoration once every skin is owned. */
export function pickMerchantOffer(collection: Record<string, number>, rng: Rng, config: GameConfig): MerchantOffer {
  const unowned = ichibanDogSkins(config).filter((id) => (collection[id] ?? 0) < 1)
  if (unowned.length > 0) {
    const figureId = unowned[Math.floor(rng.next() * unowned.length)] ?? unowned[0] ?? null
    return { figureId, decorType: null, price: merchantAsk(config) }
  }
  const decorType = GIFT_DECORS[Math.floor(rng.next() * GIFT_DECORS.length)] ?? 'lantern'
  return { figureId: null, decorType, price: 0 }
}

export function describeNightEvent(event: NightEvent, tick: number, config: GameConfig, seq: number): EventNote {
  if (event.kind === 'rain') {
    return {
      id: `event-${seq}`,
      seq,
      day: event.day,
      kind: event.kind,
      title: '突然下雨了',
      body: '傘下的長椅熱了起來，喜歡雨的動物更願意進來。',
      tick,
    }
  }
  if (event.kind === 'festival-eve') {
    const name = event.festival ?? '節日'
    return {
      id: `event-${seq}`,
      seq,
      day: event.day,
      kind: event.kind,
      title: '節日前夜，燈先掛上了',
      body: `明天是${name}，燈串先掛上了，廣場熱鬧了一點。`,
      tick,
    }
  }
  const offer = event.offer
  const figure = config.figures.find((item) => item.id === offer?.figureId)?.name
  const decor = offer?.decorType ? config.decorLabels[offer.decorType] : null
  const brought = figure ? `「${figure}」` : decor ? `一份${decor}` : '一件禮物'
  return {
    id: `event-${seq}`,
    seq,
    day: event.day,
    kind: event.kind,
    title: '神秘商人走進來了',
    body: figure
      ? `耳廓狐商人帶來${brought}，今晚結束前可以用金幣換。`
      : `耳廓狐商人帶來${brought}，今晚可以收下。`,
    tick,
  }
}

/** Rain-lovers and bench-lovers get heavier. Everyone else stays put. Never below 1. */
export function eventSpeciesMultiplier(species: Species, street: Street, config: GameConfig): number {
  if (street.nightEvent?.kind !== 'rain') return 1
  let bonus = 1
  const love = config.speciesWeights.weather[species].rain
  if (love > 1) bonus *= Math.max(1, config.rainLoverBonus)
  const decor = config.species.find((item) => item.id === species)?.decor
  if (decor === 'seat') bonus *= Math.max(1, config.rainSeatBonus)
  return Math.max(1, bonus)
}

export function eventAmbienceBonus(street: Street, config: GameConfig): number {
  if (street.nightEvent?.kind !== 'festival-eve') return 0
  return Math.max(0, config.eventBustle)
}

/** Sudden rain draws as rain. The stored weather is left alone so nobody is penalised. */
export function shownWeather(street: Street): Weather {
  return street.nightEvent?.kind === 'rain' ? 'rain' : street.weather
}

export function hangingFestival(street: Street, config: GameConfig): string | null {
  const today = festivalName(street.day, config)
  if (today) return today
  if (street.nightEvent?.kind === 'festival-eve' && street.nightEvent.festival) return street.nightEvent.festival
  return null
}

export function merchantPose(phase: Phase, phaseTick: number, phaseMinutes: number): { mode: 'in' | 'stay' | 'out'; t: number } {
  const span = Math.max(1, phaseMinutes)
  const t = Math.max(0, Math.min(1, phaseTick / span))
  if (phase === 'late') return { mode: 'out', t }
  if (phase === 'mid') return { mode: 'stay', t: 1 }
  return { mode: 'in', t }
}

/** Smooth the walk across the tick boundary. `phaseTick` is the value after the last tick. */
export function merchantProgress(phase: Phase, phaseTick: number, alpha: number, phaseMinutes: number): { mode: 'in' | 'stay' | 'out'; t: number } {
  const shown = Math.max(0, phaseTick - 1) + Math.max(0, Math.min(1, alpha))
  return merchantPose(phase, shown, phaseMinutes)
}

/** Debug and screenshots. Replaces tonight's event and announces it. */
export function presentNightEvent(street: Street, kind: NightEventKind, config: GameConfig): Street {
  const event = buildNightEvent(kind, street.day, street, config, createRng(eventSeed(street.rngState, street.day)))
  const seq = (street.eventSeq ?? 0) + 1
  const note = describeNightEvent(event, street.tick, config, seq)
  return {
    ...street,
    phase: kind === 'merchant' ? 'mid' : kind === 'rain' ? 'late' : street.phase,
    phaseTick: kind === 'merchant' ? Math.max(1, Math.floor(config.phaseMinutes / 2)) : street.phaseTick,
    nightEvent: event,
    eventSeq: seq,
    eventLog: [...street.eventLog.filter((item) => item.id !== note.id), note].slice(-60),
    pendingToasts: [...street.pendingToasts, note.title],
  }
}
