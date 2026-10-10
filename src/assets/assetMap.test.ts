import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { assetMap } from './assetMap'

describe('asset map', () => {
  it('has a swap point for every figure and stall', () => {
    for (const figure of gameConfig.figures) {
      expect(assetMap.figures[figure.id as keyof typeof assetMap.figures]).toBeDefined()
    }
    for (const stall of Object.keys(gameConfig.stallLabels)) {
      expect(assetMap.stalls[stall as keyof typeof assetMap.stalls]).toBeDefined()
    }
    expect(assetMap.note.length).toBeGreaterThan(0)
    expect(assetMap.sheets.duo).toBe(`${import.meta.env.BASE_URL}assets/concept-duo.jpg`)
    expect(assetMap.sheets.figures).toBe(`${import.meta.env.BASE_URL}assets/concept-white.jpg`)
    expect(assetMap.crops.temple.src).toContain('concept-white')
    expect(assetMap.crops.balloon.label).toContain('氣球狗')
    expect(assetMap.title.unlit).toBe(`${import.meta.env.BASE_URL}assets/art25/title/bg-unlit.jpg`)
    expect(assetMap.title.lit).toBe(`${import.meta.env.BASE_URL}assets/art25/title/bg-lit.jpg`)
    expect(assetMap.title.logo).toBe(`${import.meta.env.BASE_URL}assets/art25/title/logo.png`)
    expect(assetMap.title.groundUnlit).toBe(`${import.meta.env.BASE_URL}assets/art25/title/ground-unlit.jpg`)
    expect(assetMap.title.groundLit).toBe(`${import.meta.env.BASE_URL}assets/art25/title/ground-lit.jpg`)
    expect(existsSync('public/assets/art25/title/bg-unlit.jpg')).toBe(true)
    expect(existsSync('public/assets/art25/title/bg-lit.jpg')).toBe(true)
    expect(existsSync('public/assets/art25/title/logo.png')).toBe(true)
    expect(existsSync('public/assets/art25/title/ground-unlit.jpg')).toBe(true)
    expect(existsSync('public/assets/art25/title/ground-lit.jpg')).toBe(true)
    const manifest = JSON.parse(readFileSync('public/assets/art25/manifest.json', 'utf8')) as { assets: { path: string }[] }
    const paths = manifest.assets.map((item) => item.path)
    expect(paths).toContain('title/bg-unlit.jpg')
    expect(paths).toContain('title/bg-lit.jpg')
    expect(paths).toContain('title/logo.png')
    expect(paths).toContain('title/ground-unlit.jpg')
    expect(paths).toContain('title/ground-lit.jpg')
    for (const species of gameConfig.species) {
      expect(assetMap.animals[species.id]).toBeDefined()
    }
    for (const decor of Object.keys(gameConfig.decorLabels)) {
      expect(assetMap.decor[decor as keyof typeof assetMap.decor]).toBeDefined()
    }
  })
})
