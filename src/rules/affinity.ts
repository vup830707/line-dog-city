import { AFFINITY_LETTERS } from '../content/affinityLetters'
import { isWishPondUnlocked } from './collection'
import { decorMarketLevel } from './market'
import type { DecorType, GameConfig, Species, Street } from './types'

export type AffinityReward = { kind: 'letter'; tier: 2 | 3 } | { kind: 'gift' }

/**
 * Hearts fill from satisfied purchases.
 * `affinityStride` purchases become one heart, so a regular who is happy
 * every visit on a one-minute night does not collect letters in the first few minutes.
 * Letters and the gift still fire at `affinityLetters` (3, 10, 25 hearts).
 */
export function affinityPoints(affinity: number, progress: number, stride: number): number {
  const step = Math.max(1, stride)
  return Math.max(0, affinity) + Math.max(0, progress) / step
}

/** One fill per threshold. The first heart fills from 0 to the first threshold. */
export function heartFills(points: number, thresholds: readonly number[]): number[] {
  const edges = [0, ...thresholds]
  return thresholds.map((_, index) => {
    const start = edges[index] ?? 0
    const end = edges[index + 1] ?? start + 1
    if (end <= start) return points >= end ? 1 : 0
    return Math.max(0, Math.min(1, (points - start) / (end - start)))
  })
}

export function rewardsForAffinity(before: number, after: number, thresholds: readonly number[]): AffinityReward[] {
  const rewards: AffinityReward[] = []
  thresholds.forEach((threshold, index) => {
    if (!(before < threshold && after >= threshold)) return
    if (index === 0) rewards.push({ kind: 'letter', tier: 2 })
    else if (index === 1) rewards.push({ kind: 'letter', tier: 3 })
    else rewards.push({ kind: 'gift' })
  })
  return rewards
}

/** A decoration the player can place at the current market level. */
export function giftDecorFor(species: Species, street: Street, config: GameConfig): DecorType {
  const liked = config.species.find((item) => item.id === species)?.decor ?? 'lantern'
  if (liked === 'star') {
    const figures = config.figures.map((figure) => figure.id)
    return isWishPondUnlocked(street.collection, figures) ? 'star' : 'lantern'
  }
  const needed = decorMarketLevel(liked, config)
  if (needed != null && street.marketLevel < needed) return 'lantern'
  return liked
}

export function applyPurchaseAffinity(street: Street, species: Species, satisfaction: number, config: GameConfig): Street {
  if (satisfaction < config.letterAt) return street
  return grantSatisfiedVisit(street, species, config)
}

export function grantSatisfiedVisit(street: Street, species: Species, config: GameConfig): Street {
  const stride = Math.max(1, Math.floor(config.affinityStride))
  const progress = (street.affinityProgress[species] ?? 0) + 1
  if (progress < stride) {
    return { ...street, affinityProgress: { ...street.affinityProgress, [species]: progress } }
  }
  const gained = Math.floor(progress / stride)
  const remain = progress % stride
  const before = street.affinity[species] ?? 0
  const after = before + gained
  const rewards = rewardsForAffinity(before, after, config.affinityLetters)
  const next: Street = {
    ...street,
    affinity: { ...street.affinity, [species]: after },
    affinityProgress: { ...street.affinityProgress, [species]: remain },
  }
  return grantRewards(next, species, rewards, config)
}

function grantRewards(street: Street, species: Species, rewards: readonly AffinityReward[], config: GameConfig): Street {
  let next = street
  const name = config.species.find((item) => item.id === species)?.name ?? '客人'
  for (const reward of rewards) {
    if (reward.kind === 'letter') {
      const topic = `${species}:affinity-${reward.tier}`
      if (next.sentTopics.includes(topic)) continue
      const text = AFFINITY_LETTERS[species]
      const body = reward.tier === 2 ? text.second : text.third
      next = {
        ...next,
        sentTopics: [...next.sentTopics, topic],
        letters: [
          ...next.letters,
          { id: `letter-${next.tick}-${species}-a${reward.tier}`, species, topic, body, tick: next.tick },
        ],
        pendingToasts: [...next.pendingToasts, `${name}又寫了一封信。`],
      }
      continue
    }
    const decor = giftDecorFor(species, next, config)
    next = {
      ...next,
      giftTokens: [...next.giftTokens, decor],
      pendingToasts: [...next.pendingToasts, `${name}送來了${config.decorLabels[decor]}，可以擺到廣場上。`],
    }
  }
  return next
}
