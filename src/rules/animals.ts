import { LETTERS } from '../content/letters'
import { ambienceScore } from './ambience'
import { isWishPondUnlocked } from './collection'
import type { Rng } from './rng'
import { isFestival } from './weather'
import type { DecorType, GameConfig, Grade, Phase, Species, StallType, Street, Weather } from './types'

const BASE: Record<Species, number> = {
  cat: 3,
  rabbit: 3,
  hamster: 3,
  sparrow: 3,
  otter: 2,
  hedgehog: 2,
  fox: 4,
  bear: 4,
}

const WEATHER: Record<Species, Record<Weather, number>> = {
  cat: { sunny: 1, hot: 1, cold: 1, rain: 2 },
  rabbit: { sunny: 2, hot: 1.4, cold: 1, rain: 1 },
  hamster: { sunny: 1, hot: 1, cold: 1, rain: 1 },
  sparrow: { sunny: 1.4, hot: 1, cold: 1, rain: 1 },
  otter: { sunny: 1, hot: 1, cold: 1.2, rain: 2 },
  hedgehog: { sunny: 1, hot: 1.2, cold: 2, rain: 1 },
  fox: { sunny: 1, hot: 1, cold: 1.2, rain: 1 },
  bear: { sunny: 2, hot: 1, cold: 1.2, rain: 1 },
}

const PHASE: Record<Species, Record<Phase, number>> = {
  cat: { dusk: 1.6, mid: 1, late: 1 },
  rabbit: { dusk: 1, mid: 1.6, late: 1 },
  hamster: { dusk: 1, mid: 1, late: 1 },
  sparrow: { dusk: 1.8, mid: 1, late: 1 },
  otter: { dusk: 1, mid: 1.2, late: 1 },
  hedgehog: { dusk: 1, mid: 1, late: 1.8 },
  fox: { dusk: 1, mid: 1.2, late: 1.2 },
  bear: { dusk: 1, mid: 1, late: 1.4 },
}

export function speciesDef(species: Species, config: GameConfig) {
  const found = config.species.find((item) => item.id === species)
  if (!found) throw new Error(`unknown species ${species}`)
  return found
}

export function foxCanVisit(street: Street, config: GameConfig): boolean {
  if (!isFestival(street.day, config)) return false
  if (!street.box) return false
  return street.box.tickets.some((ticket) => ticket.grade === 'A' || ticket.grade === 'B')
}

export function bearCanVisit(street: Street, config: GameConfig): boolean {
  const placed = street.slots.some((slot) => slot?.kind === 'stall' && slot.stallType === 'wish')
  if (!placed) return false
  const ids = config.figures.map((figure) => figure.id)
  if (!isWishPondUnlocked(street.collection, ids)) return false
  return ambienceScore(street, config) >= config.ambienceTarget
}

export function speciesWeight(species: Species, street: Street, config: GameConfig): number {
  if (species === 'fox' && !foxCanVisit(street, config)) return 0
  if (species === 'bear' && !bearCanVisit(street, config)) return 0
  return BASE[species] * WEATHER[species][street.weather] * PHASE[species][street.phase]
}

export function pickSpecies(street: Street, config: GameConfig, rng: Rng): Species {
  const weights = config.species.map((item) => speciesWeight(item.id, street, config))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) return 'hamster'
  let roll = rng.next() * total
  for (let i = 0; i < config.species.length; i++) {
    roll -= weights[i] ?? 0
    if (roll < 0) return config.species[i]?.id ?? 'hamster'
  }
  return config.species[config.species.length - 1]?.id ?? 'hamster'
}

export function decorNearby(street: Street, slot: number, decor: DecorType): boolean {
  return street.slots.some((place, index) => {
    if (!place || place.kind !== 'decor' || place.decorType !== decor) return false
    return Math.abs(index - slot) <= 1
  })
}

export function satisfactionOf(input: {
  liked: boolean
  decor: boolean
  cleanliness: number
  greet: boolean
  greetLevel?: number
  config: GameConfig
}): number {
  const weights = input.config.satisfaction
  let score = weights.base
  if (input.liked) score += weights.liked
  if (input.decor) score += weights.decor
  if (input.cleanliness >= weights.cleanAt) score += weights.clean
  const level = input.greetLevel != null ? input.greetLevel : input.greet ? 1 : 0
  if (level > 0) score += weights.greet * level
  return score
}

export function letterFor(input: {
  species: Species
  stall: StallType
  decor: boolean
  street: Street
  config: GameConfig
  drewGrade: Grade | null
  satisfaction: number
}): { topic: string; body: string } | null {
  if (input.satisfaction < input.config.letterAt) return null
  const spec = speciesDef(input.species, input.config)
  if (input.stall !== spec.stall || !input.decor) return null
  if (input.species === 'hedgehog' && input.street.phase !== 'late') return null
  if (input.species === 'fox' && input.drewGrade !== 'A' && input.drewGrade !== 'B' && input.drewGrade !== 'C') return null
  if (input.species === 'sparrow' && input.stall !== 'ice' && input.stall !== 'wish') return null
  const topic = spec.topic
  if (input.street.sentTopics.includes(`${input.species}:${topic}`)) return null
  return { topic, body: LETTERS[topic] ?? '留下了一張短信。' }
}
