import { useLayoutEffect, useRef, useState } from 'react'
import type { ScreenRect } from '../canvas/plaza'
import type { Weather } from '../rules/types'
import { WEATHER_LABEL } from './labels'

export const STALL_CARD_SIZE = { w: 280, h: 240 }

/** Place the stall card above its sprite, flipping below when the top edge would leave the window. */
export function stallCardBox(
  anchor: ScreenRect,
  view: { w: number; h: number },
  card: { w: number; h: number } = STALL_CARD_SIZE,
  hudBottom = 0,
): { left: number; top: number; width: number; flipped: boolean } {
  const width = Math.min(card.w, Math.max(160, view.w - 16))
  const clearance = Math.max(8, hudBottom + 8)
  let left = anchor.left + anchor.width / 2 - width / 2
  let top = anchor.top - card.h - 8
  const flipped = top < clearance
  if (flipped) top = anchor.top + anchor.height + 8
  left = Math.max(8, Math.min(left, view.w - width - 8))
  const maxTop = Math.max(clearance, view.h - card.h - 8)
  top = Math.max(clearance, Math.min(top, maxTop))
  return { left, top, width, flipped }
}

export function StallCard({
  title,
  goods,
  anchor,
  view,
  upgradeReason,
  onUpgrade,
  hudBottom = 0,
  ichiban,
  wish,
}: {
  title: string
  goods: string
  anchor: ScreenRect
  view: { w: number; h: number }
  upgradeReason: string | null
  onUpgrade: () => void
  hudBottom?: number
  ichiban: {
    tickets: number
    refund: number
    buyReason: string | null
    closeReason: string | null
    onClose: () => void
    onBuy: () => void
  } | null
  wish: {
    reason: string | null
    onWish: (weather: Weather) => void
  } | null
}) {
  const [confirmClose, setConfirmClose] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [cardHeight, setCardHeight] = useState(0)
  const measureKey = [
    title,
    goods,
    upgradeReason ?? '',
    confirmClose ? '1' : '0',
    ichiban ? `${ichiban.tickets}:${ichiban.refund}:${ichiban.buyReason ?? ''}:${ichiban.closeReason ?? ''}` : '',
    wish?.reason ?? '',
    view.w,
    view.h,
    hudBottom,
  ].join('|')
  useLayoutEffect(() => {
    const next = cardRef.current?.offsetHeight ?? 0
    if (next > 0) setCardHeight((height) => (height === next ? height : next))
  }, [measureKey])
  const box = stallCardBox(anchor, view, { w: STALL_CARD_SIZE.w, h: cardHeight || 1 }, hudBottom)
  return (
    <div
      ref={cardRef}
      className="stall-card"
      data-testid="stall-card"
      data-flipped={box.flipped ? '1' : '0'}
      style={{ left: box.left, top: box.top, width: box.width }}
    >
      <h2>{title}</h2>
      <p data-testid="stall-goods">{goods}</p>
      <div className="stall-actions">
        <button type="button" data-testid="upgrade-stall" disabled={upgradeReason != null} title={upgradeReason ?? undefined} onClick={onUpgrade}>
          升級
        </button>
        {ichiban ? (
          <button type="button" data-testid="close-box" disabled={ichiban.closeReason != null} title={ichiban.closeReason ?? undefined} onClick={() => setConfirmClose(true)}>
            收起這箱
          </button>
        ) : null}
        {ichiban ? (
          <button type="button" data-testid="buy-box" disabled={ichiban.buyReason != null} title={ichiban.buyReason ?? undefined} onClick={ichiban.onBuy}>
            立刻開新箱
          </button>
        ) : null}
        {wish
          ? (['sunny', 'hot', 'cold', 'rain'] as Weather[]).map((weather) => (
              <button
                key={weather}
                type="button"
                data-testid={`wish-${weather}`}
                disabled={wish.reason != null}
                title={wish.reason ?? undefined}
                onClick={() => wish.onWish(weather)}
              >
                {WEATHER_LABEL[weather]}
              </button>
            ))
          : null}
      </div>
      {upgradeReason ? (
        <p className="block-reason" data-testid="upgrade-reason">
          {upgradeReason}
        </p>
      ) : null}
      {ichiban?.closeReason ? <p className="block-reason">{ichiban.closeReason}</p> : null}
      {ichiban?.buyReason ? (
        <p className="block-reason" data-testid="buy-box-reason">
          {ichiban.buyReason}
        </p>
      ) : null}
      {wish?.reason ? (
        <p className="block-reason" data-testid="wish-reason">
          {wish.reason}
        </p>
      ) : null}
      {confirmClose && ichiban ? (
        <div className="confirm-card" role="dialog" data-testid="confirm-close-box">
          <p>{`收起後這箱剩下 ${ichiban.tickets} 抽會清掉，退回 ${ichiban.refund} 幣（免費箱不退）。`}</p>
          <div className="stall-actions">
            <button
              type="button"
              data-testid="confirm-close-box-yes"
              onClick={() => {
                setConfirmClose(false)
                ichiban.onClose()
              }}
            >
              確定收起
            </button>
            <button type="button" onClick={() => setConfirmClose(false)}>
              先不要
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
