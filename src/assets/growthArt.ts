/** Cut from the PR D sheets. Skewer snacks reuse the wish icons. */

export const PRODUCT_SRC: Record<string, string> = {
  vanilla: 'assets/growth/products/vanilla.png',
  strawberry: 'assets/growth/products/strawberry.png',
  chocolate: 'assets/growth/products/chocolate.png',
  sundae: 'assets/growth/products/sundae.png',
  sunny: 'assets/growth/products/sunny.png',
  breeze: 'assets/growth/products/breeze.png',
  warm: 'assets/growth/products/warm.png',
  raindrop: 'assets/growth/products/raindrop.png',
  quick: 'assets/growth/products/quick.png',
  starlight: 'assets/growth/products/starlight.png',
  dream: 'assets/growth/products/dream.png',
  slip: 'assets/growth/products/slip.png',
  portrait: 'assets/growth/products/portrait.png',
  chart: 'assets/growth/products/chart.png',
  small: 'assets/growth/products/small.png',
  starwish: 'assets/growth/products/starwish.png',
  meteor: 'assets/growth/products/meteor.png',
  draw: 'assets/growth/coin.png',
  'skewer-small': 'assets/growth/products/skewer-small.png',
  'skewer-double': 'assets/growth/products/skewer-double.png',
  'skewer-meteor': 'assets/growth/products/skewer-meteor.png',
}

export const FIGURE_SRC: Record<string, string> = {
  temple: 'assets/growth/figures/temple.png',
  dreamIce: 'assets/growth/figures/dreamIce.png',
  starCap: 'assets/growth/figures/starCap.png',
  pajama: 'assets/growth/figures/pajama.png',
  weatherCan: 'assets/growth/figures/weatherCan.png',
  chargeTail: 'assets/growth/figures/chargeTail.png',
  chicken: 'assets/growth/figures/chicken.png',
  milkTea: 'assets/growth/figures/milkTea.png',
}

export const OVERLAY_SRC = {
  bunting: 'assets/growth/overlay-bunting.png',
  bulbs: 'assets/growth/overlay-bulbs.png',
  frame: 'assets/growth/overlay-frame.png',
  lanterns: 'assets/growth/overlay-lanterns.png',
  crest: 'assets/growth/overlay-crest.png',
} as const

export const BLOCKER_SRC = [
  'assets/growth/blocker-fence.png',
  'assets/growth/blocker-bush.png',
  'assets/growth/blocker-crates.png',
] as const

export const BANNER_SRC = 'assets/growth/banner.png'

export function growthSources(): string[] {
  return [...Object.values(PRODUCT_SRC), ...Object.values(FIGURE_SRC), ...Object.values(OVERLAY_SRC), ...BLOCKER_SRC, BANNER_SRC]
}
