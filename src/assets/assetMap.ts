/** Swap `src` for a finished AI image later. Crops point at the concept sheets. */

export interface Sprite {
  src: string
  /** CSS background-size, e.g. "400% 100%" while the sheet is still a contact sheet. */
  size: string
  position: string
  label: string
}

export interface PlaceholderArt {
  kind: 'placeholder'
  id: string
  label: string
  accent: string
}

export type ArtRef = { kind: 'sprite'; sprite: Sprite } | PlaceholderArt

const root = import.meta.env.BASE_URL
const duo = `${root}assets/concept-duo.jpg`
const figures = `${root}assets/concept-white.jpg`

export const assetMap = {
  note: '概念圖裁切與佔位。換上 AI 成圖時，只改這個檔的 src／size／position。',
  sheets: {
    duo,
    figures,
  },
  crops: {
    stallDuo: { src: duo, size: '200% 200%', position: '0% 0%', label: '老闆與搭檔' },
    stinkyTofu: { src: duo, size: '200% 200%', position: '100% 0%', label: '臭豆腐小狗' },
    ichibanPartner: { src: duo, size: '200% 200%', position: '0% 100%', label: '一番賞搭檔' },
    balloon: { src: duo, size: '200% 200%', position: '100% 100%', label: '氣球狗（對手）' },
    chicken: { src: figures, size: '400% 100%', position: '0% 0%', label: '雞排小狗' },
    milkTea: { src: figures, size: '400% 100%', position: '33.333% 0%', label: '珍奶小狗' },
    temple: { src: figures, size: '400% 100%', position: '66.666% 0%', label: '廟會小狗' },
    pajama: { src: figures, size: '400% 100%', position: '100% 0%', label: '睡衣小狗' },
  } satisfies Record<string, Sprite>,
  figures: {
    temple: { kind: 'sprite', spriteKey: 'temple' },
    pajama: { kind: 'sprite', spriteKey: 'pajama' },
    milkTea: { kind: 'sprite', spriteKey: 'milkTea' },
    chicken: { kind: 'sprite', spriteKey: 'chicken' },
    dreamIce: { kind: 'placeholder', id: 'dream-ice', accent: '#e7a0c4' },
    starCap: { kind: 'placeholder', id: 'star-cap', accent: '#e2b657' },
    weatherCan: { kind: 'placeholder', id: 'weather-can', accent: '#7eb6e0' },
    chargeTail: { kind: 'placeholder', id: 'charge-tail', accent: '#f0d35a' },
  },
  stalls: {
    ice: { kind: 'placeholder', id: 'stall-ice', accent: '#e7a0c4' },
    can: { kind: 'placeholder', id: 'stall-can', accent: '#7eb6e0' },
    charge: { kind: 'placeholder', id: 'stall-charge', accent: '#f0d35a' },
    fortune: { kind: 'placeholder', id: 'stall-fortune', accent: '#c9b6f2' },
    ichiban: { kind: 'placeholder', id: 'stall-ichiban', accent: '#f0b27a' },
    wish: { kind: 'placeholder', id: 'stall-wish', accent: '#8fd0c4' },
  },
  characters: {
    playerPair: 'stallDuo',
    rival: 'balloon',
  },
  /** Pixel rects for Canvas drawImage, matching the sheets above. */
  canvasCrops: {
    stallDuo: { sx: 0, sy: 0, sw: 640, sh: 360 },
    balloon: { sx: 640, sy: 360, sw: 640, sh: 360 },
    ichibanPartner: { sx: 0, sy: 360, sw: 640, sh: 360 },
    temple: { sx: 640, sy: 0, sw: 320, sh: 720 },
  },
} as const

export type FigureArtId = keyof typeof assetMap.figures
