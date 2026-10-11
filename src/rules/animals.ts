import { LETTERS } from '../content/letters'
import { PLAZA_SLOTS } from '../canvas/plaza'
import { ambienceScore } from './ambience'
import type { Rng } from './rng'
import { isFestival } from './weather'
import type { DecorType, GameConfig, Grade, Species, StallType, Street } from './types'

/**
 * Plaza distance that still counts as 「旁」.
 * Index-adjacent stalls in the back row are about 230px apart.
 * The slot standing in front of a back-row stall is at most about 395px away
 * (slot 3 → slot 11). 400px covers both, and leaves the opposite corner out.
 */
export const DECOR_NEAR_PX = 400

const LETTER_PRODUCT: Partial<Record<Species, string>> = {
  rabbit: 'strawberry',
  hamster: 'sunny',
  sparrow: 'vanilla',
}

export function speciesDef(species: Species, config: GameConfig) {
  const found = config.species.find((item) => item.id === species)
  if (!found) throw new Error(`unknown species ${species}`)
  return found
}

export function isSpeciesUnlocked(species: Species, street: Street, config: GameConfig): boolean {
  const rule = speciesDef(species, config).unlock
  if (rule.kind === 'start') return true
  if (rule.kind === 'seats') return street.slots.filter((slot) => slot?.decorType === 'seat').length >= rule.count
  if (rule.kind === 'stallLevel') return street.slots.some((slot) => slot?.kind === 'stall' && slot.level >= rule.level)
  if (rule.kind === 'ichibanDecor') {
    const ichiban = street.slots.some((slot) => slot?.stallType === 'ichiban')
    const decor = street.slots.filter((slot) => slot?.kind === 'decor').length
    return ichiban && decor >= rule.decor
  }
  const wish = street.slots.some((slot) => slot?.stallType === 'wish')
  return wish && ambienceScore(street, config) >= rule.ambience
}

export function foxCanVisit(street: Street, config: GameConfig): boolean {
  return isSpeciesUnlocked('fox', street, config)
}

export function bearCanVisit(street: Street, config: GameConfig): boolean {
  return isSpeciesUnlocked('bear', street, config)
}

function boxHasRarePrize(street: Street): boolean {
  return street.box?.tickets.some((ticket) => ticket.grade === 'A' || ticket.grade === 'B') ?? false
}

export function speciesWeight(species: Species, street: Street, config: GameConfig): number {
  if (!isSpeciesUnlocked(species, street, config)) return 0
  const weights = config.speciesWeights
  let weight = weights.base[species] * weights.weather[species][street.weather] * weights.phase[species][street.phase]
  if (species === 'fox' && isFestival(street.day, config) && boxHasRarePrize(street)) weight *= 2
  return weight
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
  const here = PLAZA_SLOTS[slot]
  if (!here) return false
  return street.slots.some((place, index) => {
    if (!place || place.kind !== 'decor' || place.decorType !== decor) return false
    const there = PLAZA_SLOTS[index]
    if (!there) return false
    return Math.hypot(here.x - there.x, here.y - there.y) <= DECOR_NEAR_PX
  })
}

export function satisfactionOf(input: {
  liked: boolean
  decor: boolean
  cleanliness: number
  greet: boolean
  greetLevel?: number
  favorite?: boolean
  limited?: boolean
  config: GameConfig
}): number {
  const weights = input.config.satisfaction
  let score = weights.base
  if (input.liked) score += weights.liked
  if (input.decor) score += weights.decor
  if (input.cleanliness >= weights.cleanAt) score += weights.clean
  const level = input.greetLevel != null ? input.greetLevel : input.greet ? 1 : 0
  if (level > 0) score += weights.greet * level
  if (input.favorite) score += weights.favorite
  if (input.limited) score += weights.limited
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
  productId?: string | null
}): { topic: string; body: string } | null {
  if (input.satisfaction < input.config.letterAt) return null
  const spec = speciesDef(input.species, input.config)
  if (input.stall !== spec.stall || !input.decor) return null
  if (input.species === 'hedgehog' && input.street.phase !== 'late') return null
  if (input.species === 'fox' && input.drewGrade !== 'A' && input.drewGrade !== 'B' && input.drewGrade !== 'C') return null
  if (input.species === 'bear' && !input.street.wishUsed) return null
  const needed = LETTER_PRODUCT[input.species]
  if (needed && input.productId !== needed) return null
  const topic = spec.topic
  if (input.street.sentTopics.includes(`${input.species}:${topic}`)) return null
  return { topic, body: LETTERS[topic] ?? '留下了一張短信。' }
}
