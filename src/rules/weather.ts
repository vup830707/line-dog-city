import type { Rng } from './rng'
import type { GameConfig, Phase, Weather } from './types'

export const PHASES: Phase[] = ['dusk', 'mid', 'late']
export const WEATHERS: Weather[] = ['sunny', 'hot', 'cold', 'rain']

export function isFestival(day: number, config: GameConfig): boolean {
  return config.festivals.some((festival) => festival.day === day)
}

export function festivalName(day: number, config: GameConfig): string | null {
  return config.festivals.find((festival) => festival.day === day)?.name ?? null
}

export function nextPhase(phase: Phase): Phase {
  const index = PHASES.indexOf(phase)
  return PHASES[(index + 1) % PHASES.length] ?? 'dusk'
}

export function rollWeather(rng: Rng): Weather {
  return WEATHERS[Math.floor(rng.next() * WEATHERS.length)] ?? 'sunny'
}

export function resolveWish(rate: number, desired: Weather, natural: Weather, roll: number): Weather {
  return roll < rate ? desired : natural
}
