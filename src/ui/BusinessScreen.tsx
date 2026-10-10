import { useEffect, useRef, useState } from 'react'
import { assetMap } from '../assets/assetMap'
import { drawBusiness, type Rect } from '../canvas/drawBusiness'
import { gameConfig } from '../config'
import { peekPassers } from '../rules/business'
import type { Command, SaveV2 } from '../rules/types'
import { productName, stallName, WEATHER_LABEL } from './labels'

export function BusinessScreen({
  save,
  queueCommand,
  onFastForward,
}: {
  save: SaveV2
  queueCommand: (command: Command) => void
  onFastForward: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hits = useRef<{ stalls: Rect[]; passers: Rect[] }>({ stalls: [], passers: [] })
  const [images, setImages] = useState<{ duo: HTMLImageElement | null; figures: HTMLImageElement | null }>({
    duo: null,
    figures: null,
  })
  const sim = save.sim

  useEffect(() => {
    const duo = new Image()
    const figures = new Image()
    duo.src = assetMap.sheets.duo
    figures.src = assetMap.sheets.figures
    duo.onload = () => setImages((current) => ({ ...current, duo }))
    figures.onload = () => setImages((current) => ({ ...current, figures }))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !sim) return
    const draw = () => {
      const parent = canvas.parentElement
      const width = parent?.clientWidth ?? 360
      const height = 460
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const passers = peekPassers(sim, gameConfig).slice(0, 8)
      hits.current = drawBusiness(ctx, width, height, sim, passers, images)
    }
    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [sim, images])

  if (!sim) return <p>今天還沒開市。</p>
  const passers = peekPassers(sim, gameConfig).slice(0, 6)

  return (
    <>
      <p className="eyebrow" data-testid="tick">
        營業中 {sim.tick} / {gameConfig.dayTicks} 秒・實際{WEATHER_LABEL[sim.weather]}（預報{WEATHER_LABEL[sim.forecast]}）
      </p>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          data-testid="business-canvas"
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect()
            const x = event.clientX - bounds.left
            const y = event.clientY - bounds.top
            const passer = hits.current.passers.find((rect) => inside(x, y, rect))
            if (passer?.passerId) {
              queueCommand({ type: 'attract', passerId: passer.passerId })
              return
            }
            const stall = hits.current.stalls.find((rect) => inside(x, y, rect))
            if (stall?.slot != null) queueCommand({ type: 'boost', slot: stall.slot })
          }}
        />
      </div>
      <p className="fine">點攤位催餐（快 20%，冷卻 15 秒），點路人招攬。每攤每天能改一次價。不操作也會自己賣。</p>
      {sim.stalls.map((stall) => (
        <div key={stall.slot} className="manual-row">
          <strong>{stallName(stall.type)}</strong>
          <button
            type="button"
            disabled={sim.tick < stall.boostReadyTick}
            onClick={() => queueCommand({ type: 'boost', slot: stall.slot })}
          >
            {sim.tick < stall.boostReadyTick ? `催餐冷卻 ${stall.boostReadyTick - sim.tick}s` : '催餐'}
          </button>
          {Object.entries(stall.prices).map(([productId, price]) => (
            <label key={productId} className="inline-price">
              {productName(productId)}
              <input
                inputMode="numeric"
                defaultValue={price}
                aria-label={`${stallName(stall.type)}${productName(productId)}改價`}
                disabled={stall.repriced}
                onBlur={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isFinite(next) && next !== price) {
                    queueCommand({ type: 'reprice', slot: stall.slot, productId, price: next })
                  }
                }}
              />
            </label>
          ))}
        </div>
      ))}
      <div className="passer-row">
        {passers.map((passer) => (
          <button key={passer.id} type="button" onClick={() => queueCommand({ type: 'attract', passerId: passer.id })}>
            招攬{productName(passer.productId)}
          </button>
        ))}
      </div>
      {sim.lastFortune ? <p className="fortune-line">{sim.lastFortune}</p> : null}
      <button type="button" className="primary" data-testid="fast-forward" onClick={onFastForward}>
        快轉到收市
      </button>
    </>
  )
}

function inside(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
}
