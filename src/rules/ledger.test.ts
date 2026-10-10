import { describe, expect, it } from 'vitest'
import { makeStall } from './fixtures'
import { buildDayLedger, iceWaste, ledgerTotals } from './ledger'

describe('ledger', () => {
  it('sums income and expenses, and keeps spoilage out of the profit subtraction', () => {
    const totals = ledgerTotals([
      { income: 100, expense: 40, wasteValue: 20 },
      { income: 50, expense: 10, wasteValue: 0 },
    ])
    expect(totals).toEqual({ income: 150, expense: 50, profit: 100, wasteValue: 20 })
  })

  it('values unsold ice cream at its wholesale cost', () => {
    expect(iceWaste({ fly: 2, exam: 1 }, 20)).toEqual({ qty: 3, value: 60 })
  })

  it('builds a day report with purchase cost, electric, waste, and rival share', () => {
    const ledger = buildDayLedger({
      day: 3,
      labels: { ice: '夢境冰淇淋', fortune: 'AI 算命攤' },
      playerCustomers: 6,
      rivalCustomers: 4,
      box: null,
      iceUnitCost: 20,
      refundRate: 0.3,
      stalls: [
        makeStall({
          type: 'ice',
          slot: 0,
          income: 200,
          purchaseCost: 80,
          stock: { fly: 1 },
          served: 4,
          lost: 1,
          bonusIncome: 22,
        }),
        makeStall({
          type: 'fortune',
          slot: 1,
          income: 80,
          dailyElectric: 50,
          variableCost: 5,
          served: 1,
        }),
      ],
    })
    expect(ledger.totalIncome).toBe(280)
    expect(ledger.totalExpense).toBe(135)
    expect(ledger.profit).toBe(145)
    expect(ledger.wasteValue).toBe(20)
    expect(ledger.lines[0]).toMatchObject({ wasteQty: 1, wasteValue: 20, expense: 80 })
    expect(ledger.playerShare).toBeCloseTo(0.6)
    expect(ledger.chargerBonus).toBe(22)
    expect(ledger.ichiban).toBeNull()
  })
})
