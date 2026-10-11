import { createRng, type Rng } from './rng'
import { festivalName, upcomingFestival } from './weather'
import type { EventNote, GameConfig, NightEvent, NightEventKind, Phase, Species, Street, Weather } from './types'

/** Rare ichiban figures the fennec merchant may sell. */
export const MERCHANT_FIGURES = ['temple', 'dreamIce', 'starCap', 'weatherCan'] as const

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
      offer: { figureId: pickMerchantFigure(street.collection, rng), price: Math.max(0, config.merchantPrice) },
      bought: false,
    }
  }
  return { day, kind: 'rain', festival: null, offer: null, bought: false }
}

export function pickMerchantFigure(collection: Record<string, number>, rng: Rng): string {
  const unowned = MERCHANT_FIGURES.filter((id) => (collection[id] ?? 0) < 1)
  const pool = unowned.length > 0 ? unowned : MERCHANT_FIGURES
  return pool[Math.floor(rng.next() * pool.length)] ?? 'starCap'
}

export function describeNightEvent(event: NightEvent, tick: number, config: GameConfig): EventNote {
  if (event.kind === 'rain') {
    return {
      id: `event-${event.day}-rain`,
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
      id: `event-${event.day}-festival-eve`,
      day: event.day,
      kind: event.kind,
      title: '節日前夜，燈先掛上了',
      body: `明天是${name}，燈串先掛上了，廣場熱鬧了一點。`,
      tick,
    }
  }
  const figure = config.figures.find((item) => item.id === event.offer?.figureId)?.name ?? '稀有造型'
  return {
    id: `event-${event.day}-merchant`,
    day: event.day,
    kind: event.kind,
    title: '神秘商人走進來了',
    body: `耳廓狐商人帶來「${figure}」，今晚結束前可以用金幣換。`,
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
  const note = describeNightEvent(event, street.tick, config)
  return {
    ...street,
    phase: kind === 'merchant' ? 'mid' : kind === 'rain' ? 'late' : street.phase,
    phaseTick: kind === 'merchant' ? Math.max(1, Math.floor(config.phaseMinutes / 2)) : street.phaseTick,
    nightEvent: event,
    eventLog: [...street.eventLog.filter((item) => item.id !== note.id), note],
    pendingToasts: [...street.pendingToasts, note.title],
  }
}
