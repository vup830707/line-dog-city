import { refundAmount } from './ichiban'
import type { BoxState, DayLedger, LedgerLine, StallSim } from './types'

export function ledgerTotals(lines: Pick<LedgerLine, 'income' | 'expense' | 'wasteValue'>[]): {
  income: number
  expense: number
  profit: number
  wasteValue: number
} {
  const income = lines.reduce((sum, line) => sum + line.income, 0)
  const expense = lines.reduce((sum, line) => sum + line.expense, 0)
  const wasteValue = lines.reduce((sum, line) => sum + line.wasteValue, 0)
  return { income, expense, profit: income - expense, wasteValue }
}

export function iceWaste(stock: Record<string, number>, unitCost: number): { qty: number; value: number } {
  const qty = Object.values(stock).reduce((sum, count) => sum + count, 0)
  return { qty, value: qty * unitCost }
}

export function buildDayLedger(input: {
  day: number
  stalls: StallSim[]
  labels: Record<string, string>
  playerCustomers: number
  rivalCustomers: number
  box: BoxState | null
  iceUnitCost: number
  refundRate: number
}): DayLedger {
  const lines: LedgerLine[] = input.stalls.map((stall) => {
    const waste = stall.type === 'ice' ? iceWaste(stall.stock, input.iceUnitCost) : { qty: 0, value: 0 }
    return {
      stall: stall.type,
      label: input.labels[stall.type] ?? stall.type,
      income: stall.income,
      expense: stall.purchaseCost + stall.dailyElectric + stall.variableCost,
      wasteQty: waste.qty,
      wasteValue: waste.value,
      served: stall.served,
      lost: stall.lost,
      bonusIncome: stall.bonusIncome,
    }
  })
  const totals = ledgerTotals(lines)
  const contested = input.playerCustomers + input.rivalCustomers
  return {
    day: input.day,
    lines,
    totalIncome: totals.income,
    totalExpense: totals.expense,
    profit: totals.profit,
    wasteValue: totals.wasteValue,
    playerShare: contested === 0 ? null : input.playerCustomers / contested,
    chargerBonus: lines.reduce((sum, line) => sum + line.bonusIncome, 0),
    ichiban: input.box
      ? {
          name: input.box.name,
          drawsToday: input.stalls.find((stall) => stall.type === 'ichiban')?.served ?? 0,
          incomeToday: input.stalls.find((stall) => stall.type === 'ichiban')?.income ?? 0,
          leftover: input.box.tickets.length,
          refundIfReturned: refundAmount(input.box, input.refundRate),
        }
      : null,
  }
}
