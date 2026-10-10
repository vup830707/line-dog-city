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

function catalogUnitCost(ticket: Ticket, def: BoxDef): number {
  const prize = def.prizes.find(
    (item) => item.grade === ticket.grade && item.figureId === ticket.figureId && item.label === ticket.label,
  )
  return prize?.unitCost ?? 0
}

/** Remaining value comes from the catalog wholesale, never from a saved unitCost. */
export function refundAmount(box: BoxState, refundRate: number, config: GameConfig): number {
  const def = config.ichiban.boxes.find((item) => item.id === box.boxId) ?? config.ichiban.boxes[0]
  if (!def) return 0
  const ticketCost = box.tickets.reduce((sum, ticket) => sum + catalogUnitCost(ticket, def), 0)
  const last = !box.lastPrize.awarded && box.lastPrize.id === def.lastPrize.id ? def.lastPrize.unitCost : 0
  const remaining = Math.min(def.wholesale, ticketCost + last)
  return Math.round(remaining * refundRate)
}

export function duplicateCoins(grade: Grade, config: GameConfig): number {
  return config.duplicateValue[grade]
}

export interface CustomerDraw {
  box: BoxState | null
  collection: Record<string, number>
  ownedDecor: string[]
  moneyDelta: number
  ticket: Ticket
  converted: number
  grade: Grade
}

/** A visitor pays the draw price. Duplicates add coins and do not increase the collection count. */
export function customerDraw(input: {
  box: BoxState
  collection: Record<string, number>
  ownedDecor: string[]
  drawPrice: number
  config: GameConfig
}): CustomerDraw {
  const drawn = drawTicket(input.box)
  let moneyDelta = input.drawPrice
  let converted = 0
  const collection = { ...input.collection }
  const ownedDecor = [...input.ownedDecor]
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
  if (drawn.lastPrize) {
    if (ownedDecor.includes(drawn.lastPrize.id)) {
      moneyDelta += input.config.decorationDuplicateValue
      converted += input.config.decorationDuplicateValue
    } else {
      ownedDecor.push(drawn.lastPrize.id)
    }
  }
  const box: BoxState = { ...drawn.box, income: drawn.box.income + input.drawPrice }
  return {
    box: box.tickets.length === 0 ? null : box,
    collection,
    ownedDecor,
    moneyDelta,
    ticket,
    converted,
    grade: ticket.grade,
  }
}
