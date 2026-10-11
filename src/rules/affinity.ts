import { AFFINITY_LETTERS } from '../content/affinityLetters'
import { isWishPondUnlocked } from './collection'
import { decorMarketLevel } from './market'
import type { DecorType, GameConfig, Species, Street } from './types'

export type AffinityReward = { kind: 'letter'; tier: 2 | 3 } | { kind: 'gift' }

/**
 * Hearts fill from purchase pips.
 * A score below `affinityMin` earns nothing. At or above it,
 * pips = round(affinityPipBase * satisfaction), so a full score earns the most.
 * The first heart costs `affinityStride` pips. Each heart already earned
 * raises the next cost by `affinityHeartGrowth`, so later hearts take longer.
 * Letters and the gift still fire at `affinityLetters` (3, 10, 25 hearts).
 */
export function affinityPips(satisfaction: number, config: GameConfig): number {
  if (!(satisfaction >= config.affinityMin)) return 0
  const base = Number.isFinite(config.affinityPipBase) ? config.affinityPipBase : 0
  return Math.max(0, Math.round(base * satisfaction))
}

/** Pips required to earn the next heart after `hearts` are already filled. */
export function heartCost(hearts: number, config: GameConfig): number {
  const stride = Math.max(1, Math.floor(config.affinityStride))
  const growth = Number.isFinite(config.affinityHeartGrowth) ? Math.max(0, config.affinityHeartGrowth) : 0
  const earned = Math.max(0, Math.floor(hearts))
  return Math.max(1, Math.round(stride * (1 + earned * growth)))
}

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
  return addAffinityPips(street, species, affinityPips(satisfaction, config), config)
}

/** One pip. Threshold tests use this with a stride of 1 and no heart growth. */
export function grantSatisfiedVisit(street: Street, species: Species, config: GameConfig): Street {
  return addAffinityPips(street, species, 1, config)
}

export function addAffinityPips(street: Street, species: Species, pips: number, config: GameConfig): Street {
  if (pips <= 0) return street
  let hearts = street.affinity[species] ?? 0
  let progress = (street.affinityProgress[species] ?? 0) + pips
  const before = hearts
  while (progress >= heartCost(hearts, config)) {
    progress -= heartCost(hearts, config)
    hearts += 1
  }
  const next: Street = {
    ...street,
    affinity: { ...street.affinity, [species]: hearts },
    affinityProgress: { ...street.affinityProgress, [species]: progress },
  }
  return grantRewards(next, species, rewardsForAffinity(before, hearts, config.affinityLetters), config)
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
