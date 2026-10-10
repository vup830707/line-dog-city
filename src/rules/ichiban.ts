import type { Rng } from './rng'
import type { BoxDef, BoxState, GameConfig, Grade, Ticket } from './types'

export function boxWholesale(def: BoxDef): number {
  const prizes = def.prizes.reduce((sum, prize) => sum + prize.count * prize.unitCost, 0)
  return prizes + def.lastPrize.unitCost
}

export function createBox(def: BoxDef, rng: Rng): BoxState {
  const tickets: Ticket[] = []
  for (const prize of def.prizes) {
    for (let i = 0; i < prize.count; i++) {
      tickets.push({
        grade: prize.grade,
        figureId: prize.figureId,
        label: prize.label,
        unitCost: prize.unitCost,
      })
    }
  }
  for (let i = tickets.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const swap = tickets[i]
    tickets[i] = tickets[j] as Ticket
    tickets[j] = swap as Ticket
  }
  return {
    boxId: def.id,
    name: def.name,
    wholesale: def.wholesale,
    tickets,
    lastPrize: { ...def.lastPrize, awarded: false },
    draws: 0,
    income: 0,
    selfIncome: 0,
    selfDraws: 0,
  }
}

export function drawTicket(box: BoxState): {
  box: BoxState
  ticket: Ticket
  lastPrize: { id: string; label: string; unitCost: number } | null
} {
  if (box.tickets.length === 0) throw new Error('empty box')
  const ticket = box.tickets[0] as Ticket
  const tickets = box.tickets.slice(1)
  let lastPrize = box.lastPrize
  let awarded: { id: string; label: string; unitCost: number } | null = null
  if (tickets.length === 0 && !lastPrize.awarded) {
    awarded = { id: lastPrize.id, label: lastPrize.label, unitCost: lastPrize.unitCost }
    lastPrize = { ...lastPrize, awarded: true }
  }
  return {
    box: { ...box, tickets, lastPrize, draws: box.draws + 1 },
    ticket,
    lastPrize: awarded,
  }
}

export function refundAmount(box: BoxState, refundRate: number): number {
  const ticketCost = box.tickets.reduce((sum, ticket) => sum + ticket.unitCost, 0)
  const last = box.lastPrize.awarded ? 0 : box.lastPrize.unitCost
  return Math.round((ticketCost + last) * refundRate)
}

export function duplicateCoins(grade: Grade, config: GameConfig): number {
  return config.duplicateValue[grade]
}

export interface SelfDrawResult {
  box: BoxState
  collection: Record<string, number>
  decorations: string[]
  moneyDelta: number
  ticket: Ticket
  converted: number
  lastPrizeLabel: string | null
}

/** Player spends the draw price and the stall records the same amount, so cash is unchanged except duplicates. */
export function selfDraw(input: {
  box: BoxState
  collection: Record<string, number>
  decorations: string[]
  drawPrice: number
  config: GameConfig
}): SelfDrawResult {
  const drawn = drawTicket(input.box)
  let moneyDelta = 0
  let converted = 0
  const collection = { ...input.collection }
  const decorations = [...input.decorations]
  const ticket = drawn.ticket
  if (ticket.figureId) {
    const owned = collection[ticket.figureId] ?? 0
    if (owned >= 1) {
      converted = duplicateCoins(ticket.grade, input.config)
      moneyDelta += converted
    } else {
      collection[ticket.figureId] = 1
    }
  }
  let lastPrizeLabel: string | null = null
  if (drawn.lastPrize) {
    lastPrizeLabel = drawn.lastPrize.label
    if (decorations.includes(drawn.lastPrize.id)) {
      moneyDelta += input.config.decorationDuplicateValue
      converted += input.config.decorationDuplicateValue
    } else {
      decorations.push(drawn.lastPrize.id)
    }
  }
  const box: BoxState = {
    ...drawn.box,
    income: drawn.box.income + input.drawPrice,
    selfIncome: drawn.box.selfIncome + input.drawPrice,
    selfDraws: drawn.box.selfDraws + 1,
  }
  return { box, collection, decorations, moneyDelta, ticket, converted, lastPrizeLabel }
}
