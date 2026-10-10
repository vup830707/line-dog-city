import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { parseSave, SCHEMA_VERSION, serializeSave } from './save'
import type { SaveV2 } from './types'

function sampleSave(overrides: Partial<SaveV2> = {}): SaveV2 {
  return {
    schemaVersion: 2,
    playerDog: 'white',
    names: { white: '雪球', brown: '可可' },
    money: 3600,
    day: 2,
    slotsUnlocked: 3,
    placement: ['ice', null, null, null, null, null, null, null],
    fortuneLevel: 0,
    cans: { sun: 0, breeze: 0, warm: 0, drop: 0 },
    collection: { temple: 1 },
    decorations: ['lantern'],
    drawPrice: 50,
    activeBox: null,
    rivalMemory: { stalls: [], playerPrices: { 'ice:fly': 55 } },
    ledgerHistory: [],
    phase: 'prep',
    rngState: 99,
    forecast: 'rain',
    actualWeather: 'hot',
    trending: ['fly'],
    presetNext: null,
    wishUsed: false,
    wishMessage: null,
    sim: null,
    draft: {
      iceQty: { fly: 4 },
      icePrices: { fly: 55 },
      canQty: {},
      canPrices: {},
      chargePrice: gameConfig.charger.referencePrice,
      fortunePrice: gameConfig.fortune.referencePrice,
      ichibanPrice: gameConfig.ichiban.referencePrice,
      wishPrice: gameConfig.wish.referencePrice,
    },
    ...overrides,
  }
}

describe('save / load', () => {
  it('round-trips a versioned save', () => {
    const save = sampleSave()
    const loaded = parseSave(serializeSave(save))
    expect(loaded).toEqual(save)
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('migrates a v1 save by filling decorations, wish fields, and the new version', () => {
    const current = sampleSave()
    const { decorations, wishUsed, presetNext, wishMessage, ...rest } = current
    void decorations
    void wishUsed
    void presetNext
    void wishMessage
    const v1 = { ...rest, schemaVersion: 1 }
    const loaded = parseSave(JSON.stringify(v1))
    expect(loaded.schemaVersion).toBe(2)
    expect(loaded.decorations).toEqual([])
    expect(loaded.wishUsed).toBe(false)
    expect(loaded.presetNext).toBeNull()
    expect(loaded.wishMessage).toBeNull()
    expect(loaded.names).toEqual(current.names)
    expect(loaded.money).toBe(current.money)
    expect(loaded.collection).toEqual(current.collection)
  })

  it('rejects unreadable payloads', () => {
    expect(() => parseSave('{')).toThrow(/JSON/)
    expect(() => parseSave('null')).toThrow(/存檔/)
    expect(() => parseSave({ schemaVersion: 99 })).toThrow(/版本/)
    expect(() => parseSave({ schemaVersion: 2 })).toThrow(/名字/)
  })
})
