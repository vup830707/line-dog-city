import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { drawPlaza } from '../canvas/drawPlaza'
import {
  artSources,
  BG_SRC,
  bobOffset,
  coverTransform,
  DECOR_ART,
  layoutScene,
  PLAZA_SLOTS,
  screenRect,
  slotFrame,
  spriteScreenRect,
  STALL_ART,
  toScreen,
} from '../canvas/plaza'
import { gameConfig } from '../config'
import {
  assignJob,
  buyBox,
  buyBoxBlock,
  castWish,
  closeBox,
  hireBlock,
  hireStaff,
  placeItem,
  trainBlock,
  trainStaff,
  upgradeBlock,
  upgradeStall,
  wishBlock,
} from '../rules/actions'
import { isWishPondUnlocked, ownedCount } from '../rules/collection'
import { refundAmount } from '../rules/ichiban'
import { parseSave } from '../rules/save'
import { stockCap } from '../rules/staff'
import type { DecorType, Job, SaveV3, Species, StallType, Street } from '../rules/types'
import { festivalName } from '../rules/weather'
import { renameDogs } from '../game/newGame'
import { StallCard } from './StallCard'
import { DECOR_ORDER, JOB_LABEL, PHASE_LABEL, STALL_ORDER, WEATHER_LABEL } from './labels'

type Tab = 'build' | 'staff' | 'collection' | 'letters'
type DragPayload = { kind: 'stall'; stallType: StallType } | { kind: 'decor'; decorType: DecorType }

const artRoot = import.meta.env.BASE_URL

export function StreetScreen({
  save,
  onChange,
  onRename,
  onImport,
  onReset,
}: {
  save: SaveV3
  onChange: (save: SaveV3) => void
  onRename: (white: string, brown: string) => void
  onImport: (raw: string) => string | null
  onReset: () => void
}) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imagesRef = useRef(new Map<string, HTMLImageElement>())
  const [view, setView] = useState({ w: 1280, h: 720 })
  const [artReady, setArtReady] = useState(false)
  const [tab, setTab] = useState<Tab | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [selectedAnimal, setSelectedAnimal] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [pendingReset, setPendingReset] = useState(false)
  const street = save.street
  const streetRef = useRef(street)
  const viewRef = useRef(view)
  const selectedRef = useRef(selectedSlot)
  const hitsRef = useRef<HTMLDivElement | null>(null)
  streetRef.current = street
  viewRef.current = view
  selectedRef.current = selectedSlot
  const figureIds = gameConfig.figures.map((figure) => figure.id)
  const unlocked = isWishPondUnlocked(street.collection, figureIds)
  const festival = festivalName(street.day, gameConfig)
  const selected = selectedSlot != null ? street.slots[selectedSlot] : null
  const animal = street.visitors.find((visitor) => visitor.id === selectedAnimal) ?? null
  const cover = coverTransform(view.w, view.h)
  const far = toScreen(PLAZA_SLOTS[0] ?? { x: 0, y: 0 }, cover)
  const near = toScreen(PLAZA_SLOTS[8] ?? { x: 0, y: 0 }, cover)

  useLayoutEffect(() => {
    const el = shellRef.current
    if (!el) return
    const apply = () => setView({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) })
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    const pending = artSources()
    let left = pending.length
    for (const src of pending) {
      if (imagesRef.current.has(src)) {
        left -= 1
        continue
      }
      const image = new Image()
      image.onload = () => {
        imagesRef.current.set(src, image)
        left -= 1
        if (!cancelled && left <= 0) setArtReady(true)
      }
      image.onerror = () => {
        left -= 1
        if (!cancelled && left <= 0) setArtReady(true)
      }
      image.src = `${artRoot}${src}`
    }
    if (left <= 0) setArtReady(true)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(id)
  }, [notice])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let frame = 0
    const sized = { w: 0, h: 0, dpr: 0 }
    const paint = (now: number) => {
      const width = viewRef.current.w
      const height = viewRef.current.h
      const dpr = window.devicePixelRatio || 1
      if (sized.w !== width || sized.h !== height || sized.dpr !== dpr) {
        canvas.width = Math.floor(width * dpr)
        canvas.height = Math.floor(height * dpr)
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
        sized.w = width
        sized.h = height
        sized.dpr = dpr
      }
      const ctx = canvas.getContext('2d')
      const scene = layoutScene(streetRef.current, now)
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        const frames = streetRef.current.slots.flatMap((place, index) => {
          const selected = selectedRef.current === index
          if (!place && !selected) return []
          const stallType = place?.kind === 'stall' ? place.stallType : null
          return [{ frame: slotFrame(index, stallType), selected }]
        })
        drawPlaza(ctx, width, height, imagesRef.current.get(BG_SRC), imagesRef.current, scene, now, frames)
      }
      const layer = hitsRef.current
      if (layer) {
        const coverNow = coverTransform(width, height)
        layer.querySelectorAll<HTMLButtonElement>('[data-visitor]').forEach((button) => {
          const sprite = scene.find((item) => item.id === `visitor-${button.dataset.visitor}`)
          if (!sprite) return
          const bob = sprite.bob ? bobOffset(now, sprite.seed) * coverNow.scale : 0
          const rect = spriteScreenRect(sprite, coverNow, bob)
          button.style.left = `${rect.left}px`
          button.style.top = `${rect.top}px`
          button.style.width = `${rect.width}px`
          button.style.height = `${rect.height}px`
        })
      }
      frame = window.requestAnimationFrame(paint)
    }
    frame = window.requestAnimationFrame(paint)
    return () => window.cancelAnimationFrame(frame)
  }, [])

  function dropOn(slot: number, raw: string) {
    let payload: DragPayload
    try {
      payload = JSON.parse(raw) as DragPayload
    } catch {
      setNotice('放不下這個。')
      return
    }
    const result = placeItem(street, slot, payload, gameConfig)
    if (!result.ok) {
      setNotice(result.reason ?? '放不下')
      return
    }
    setNotice('')
    setSelectedSlot(slot)
    onChange({ ...save, street: result.street })
  }

  function toggle(next: Tab) {
    setTab((current) => (current === next ? null : next))
  }

  return (
    <div
      className="plaza-shell"
      ref={shellRef}
      data-testid="street-metrics"
      data-scene-width={view.w}
      data-scene-height={view.h}
      data-bg-scale={cover.scale}
      data-far-slot-y={Math.round(far.y)}
      data-near-slot-y={Math.round(near.y)}
      data-art-ready={artReady ? '1' : '0'}
    >
      <canvas
        ref={canvasRef}
        className="plaza-canvas"
        data-testid="street-canvas"
        onClick={() => {
          setSelectedSlot(null)
          setSelectedAnimal(null)
        }}
      />
      {PLAZA_SLOTS.map((_, index) => {
        const place = street.slots[index]
        const stallType = place?.kind === 'stall' ? place.stallType : null
        const rect = screenRect(slotFrame(index, stallType), cover)
        return (
          <button
            key={index}
            type="button"
            data-testid={`slot-${index}`}
            aria-label={`格子 ${index + 1}`}
            className={selectedSlot === index ? 'slot-hit selected' : 'slot-hit'}
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
            onClick={() => setSelectedSlot(index)}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }}
            onDrop={(event) => {
              event.preventDefault()
              dropOn(index, event.dataTransfer.getData('text/plain'))
            }}
          />
        )
      })}
      <div ref={hitsRef}>
        {street.visitors.map((visitor) => (
          <button
            key={visitor.id}
            type="button"
            data-visitor={visitor.id}
            data-testid={`animal-${visitor.species}`}
            aria-label={gameConfig.species.find((item) => item.id === visitor.species)?.name}
            className="animal-hit"
            onClick={() => setSelectedAnimal(visitor.id)}
          />
        ))}
      </div>
      <header className="hud">
        <p className="hud-chip" data-testid="player-name">
          {save.playerDog === 'white' ? save.whiteName : save.brownName}
        </p>
        <p className="hud-chip">
          {save.whiteName} 與 {save.brownName}
        </p>
        <p className="hud-chip">
          第 {street.day} 天・{PHASE_LABEL[street.phase]}・{WEATHER_LABEL[street.weather]}
          {festival ? `・${festival}` : ''}
        </p>
        <p className="hud-chip" data-testid="money">
          {street.money} 幣
        </p>
        <nav className="hud-actions">
          <button type="button" data-testid="tab-build" className={tab === 'build' ? 'on' : ''} onClick={() => toggle('build')}>
            建造
          </button>
          <button type="button" data-testid="tab-staff" className={tab === 'staff' ? 'on' : ''} onClick={() => toggle('staff')}>
            員工
          </button>
          <button type="button" data-testid="tab-collection" className={tab === 'collection' ? 'on' : ''} onClick={() => toggle('collection')}>
            圖鑑
          </button>
          <button type="button" data-testid="tab-letters" className={tab === 'letters' ? 'on' : ''} onClick={() => toggle('letters')}>
            信件
          </button>
        </nav>
      </header>
      {street.offlineNote ? (
        <p className="offline-note" data-testid="offline-note" data-offline-ticks={street.lastOfflineTicks}>
          {street.offlineNote}
        </p>
      ) : null}
      {notice ? (
        <p className="toast" data-testid="toast">
          {notice}
        </p>
      ) : null}
      {selected?.kind === 'stall' && selected.stallType && selectedSlot != null ? (
        <StallCard
          key={selected.uid}
          title={`${gameConfig.stallLabels[selected.stallType]} Lv.${selected.level}`}
          goods={goodsLine(street, selectedSlot)}
          anchor={screenRect(slotFrame(selectedSlot, selected.stallType), cover)}
          view={view}
          upgradeReason={upgradeBlock(street, selectedSlot, gameConfig)}
          onUpgrade={() => {
            const result = upgradeStall(street, selectedSlot, gameConfig)
            setNotice(result.ok ? '' : result.reason ?? '')
            if (result.ok) onChange({ ...save, street: result.street })
          }}
          ichiban={
            selected.stallType === 'ichiban'
              ? {
                  tickets: street.box?.tickets.length ?? 0,
                  refund: street.box?.paid ? refundAmount(street.box, gameConfig.refundRate) : 0,
                  buyReason: buyBoxBlock(street, gameConfig),
                  closeReason: street.box ? null : '現在沒有箱子',
                  onClose: () => {
                    const refund = street.box?.paid ? refundAmount(street.box, gameConfig.refundRate) : 0
                    const result = closeBox(street, gameConfig)
                    setNotice(result.ok ? (refund > 0 ? `剩下的籤已退回 ${refund} 幣。` : '免費箱沒有退幣。') : result.reason ?? '')
                    if (result.ok) onChange({ ...save, street: result.street })
                  },
                  onBuy: () => {
                    const result = buyBox(street, gameConfig)
                    setNotice(result.ok ? '新的一箱開了。' : result.reason ?? '')
                    if (result.ok) onChange({ ...save, street: result.street })
                  },
                }
              : null
          }
          wish={
            selected.stallType === 'wish'
              ? {
                  reason: wishBlock(street, gameConfig),
                  onWish: (weather) => {
                    const result = castWish(street, weather, gameConfig)
                    if (!result.ok) {
                      setNotice(result.reason ?? '')
                      return
                    }
                    setNotice(result.street.wishMessage ?? '')
                    onChange({ ...save, street: result.street })
                  },
                }
              : null
          }
        />
      ) : null}
      {tab === 'build' ? (
        <div className="build-dock" data-testid="build-panel">
          {STALL_ORDER.map((stallType) => (
            <button
              key={stallType}
              type="button"
              draggable
              data-testid={`build-${stallType}`}
              disabled={stallType === 'wish' && !unlocked}
              title={gameConfig.stallLabels[stallType]}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'stall', stallType }))
                event.dataTransfer.effectAllowed = 'copy'
              }}
            >
              <img src={`${artRoot}${STALL_ART[stallType].src}`} alt={gameConfig.stallLabels[stallType]} />
            </button>
          ))}
          {DECOR_ORDER.map((decorType) => (
            <button
              key={decorType}
              type="button"
              draggable
              data-testid={`build-${decorType}`}
              disabled={decorType === 'star' && !unlocked}
              title={gameConfig.decorLabels[decorType]}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'decor', decorType }))
                event.dataTransfer.effectAllowed = 'copy'
              }}
            >
              <img src={`${artRoot}${DECOR_ART[decorType].src}`} alt={gameConfig.decorLabels[decorType]} />
            </button>
          ))}
        </div>
      ) : null}
      {animal ? <AnimalCard species={animal.species} satisfaction={animal.satisfaction} fortune={animal.fortune} /> : null}
      {tab === 'staff' ? (
        <StaffPanel save={save} onChange={onChange} onNotice={setNotice} onRename={onRename} onImport={onImport} onAskReset={() => setPendingReset(true)} />
      ) : null}
      {pendingReset ? (
        <div className="confirm-layer" role="dialog" data-testid="confirm-new-game">
          <div className="confirm-card">
            <p>現在的夜市會清掉，確定要重來嗎？</p>
            <div className="stall-actions">
              <button type="button" data-testid="confirm-new-game-yes" onClick={onReset}>
                確定重來
              </button>
              <button type="button" onClick={() => setPendingReset(false)}>
                先不要
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {tab === 'collection' ? (
        <div className="hud-card" data-testid="collection-panel">
          <p data-testid="collection-progress">
            {ownedCount(street.collection, figureIds)} / {figureIds.length}
            {unlocked ? '。流星許願池已解鎖。' : '。集滿就能開流星許願池。'}
          </p>
          <div className="collection-grid">
            {gameConfig.figures.map((figure) => {
              const owned = (street.collection[figure.id] ?? 0) >= 1
              return (
                <article key={figure.id}>
                  <h3>{owned ? figure.name : '？？？'}</h3>
                  <p>{owned ? figure.blurb : '還沒抽到'}</p>
                </article>
              )
            })}
          </div>
        </div>
      ) : null}
      {tab === 'letters' ? (
        <div className="hud-card" data-testid="letter-panel">
          {street.letters.length === 0 ? <p>還沒有信件。</p> : null}
          {street.letters.map((letter) => (
            <article key={letter.id} data-testid="letter-card">
              <h3>{gameConfig.species.find((item) => item.id === letter.species)?.name}</h3>
              <p>{letter.body}</p>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function TrainButton({
  save,
  memberId,
  onChange,
  onNotice,
}: {
  save: SaveV3
  memberId: string
  onChange: (save: SaveV3) => void
  onNotice: (text: string) => void
}) {
  const reason = trainBlock(save.street, memberId, gameConfig)
  return (
    <>
      <button
        type="button"
        data-testid={`train-${memberId}`}
        disabled={reason != null}
        title={reason ?? undefined}
        onClick={() => {
          const result = trainStaff(save.street, memberId, gameConfig)
          onNotice(result.ok ? '' : result.reason ?? '')
          if (result.ok) onChange({ ...save, street: result.street })
        }}
      >
        訓練
      </button>
      {reason ? (
        <p className="block-reason" data-testid={`train-reason-${memberId}`}>
          {reason}
        </p>
      ) : null}
    </>
  )
}

function HireButton({
  save,
  onChange,
  onNotice,
}: {
  save: SaveV3
  onChange: (save: SaveV3) => void
  onNotice: (text: string) => void
}) {
  const reason = hireBlock(save.street, gameConfig)
  return (
    <>
      <button
        type="button"
        data-testid="hire-staff"
        disabled={reason != null}
        title={reason ?? undefined}
        onClick={() => {
          const result = hireStaff(save.street, gameConfig)
          onNotice(result.ok ? '新員工來了。' : result.reason ?? '')
          if (result.ok) onChange({ ...save, street: result.street })
        }}
      >
        雇用
      </button>
      {reason ? (
        <p className="block-reason" data-testid="hire-reason">
          {reason}
        </p>
      ) : null}
    </>
  )
}

function AnimalCard({ species, satisfaction, fortune }: { species: Species; satisfaction: number; fortune: string | null }) {
  const spec = gameConfig.species.find((item) => item.id === species)
  return (
    <article className="hud-card animal-card" data-testid="animal-card">
      <h2>{spec?.name}</h2>
      <p>
        喜歡 {spec ? gameConfig.stallLabels[spec.stall] : ''} 和 {spec ? gameConfig.decorLabels[spec.decor] : ''}
      </p>
      <p>這次的滿意度 {Math.round(satisfaction * 100)}</p>
      {fortune ? <p>{fortune}</p> : null}
    </article>
  )
}

function goodsLine(street: Street, slot: number): string {
  const place = street.slots[slot]
  if (!place || place.kind !== 'stall' || !place.stallType) return ''
  if (place.stallType === 'ichiban') {
    return street.box ? `這箱還有 ${street.box.tickets.length} 抽` : '現在沒有箱子'
  }
  if (place.stallType === 'wish') return '一天可以許一次天氣'
  const have = street.stock[place.uid] ?? 0
  return `存貨 ${have} / ${stockCap(place.level, gameConfig)}`
}

function StaffPanel({
  save,
  onChange,
  onNotice,
  onRename,
  onImport,
  onAskReset,
}: {
  save: SaveV3
  onChange: (save: SaveV3) => void
  onNotice: (text: string) => void
  onRename: (white: string, brown: string) => void
  onImport: (raw: string) => string | null
  onAskReset: () => void
}) {
  const [white, setWhite] = useState(save.whiteName)
  const [brown, setBrown] = useState(save.brownName)
  return (
    <div className="hud-card" data-testid="staff-panel">
      {save.street.staff.map((member) => (
        <article key={member.id} data-testid={`staff-${member.id}`}>
          <h3>
            {member.name}・Lv.{member.level}
          </h3>
          <div className="job-row">
            {(['restock', 'clean', 'greet', 'rest'] as Job[]).map((job) => (
              <button
                key={job}
                type="button"
                className={member.job === job ? 'on' : ''}
                onClick={() => {
                  const result = assignJob(save.street, member.id, job)
                  if (result.ok) onChange({ ...save, street: result.street })
                }}
              >
                {JOB_LABEL[job]}
              </button>
            ))}
          </div>
          <TrainButton save={save} memberId={member.id} onChange={onChange} onNotice={onNotice} />
        </article>
      ))}
      <HireButton save={save} onChange={onChange} onNotice={onNotice} />
      <form
        className="rename"
        onSubmit={(event) => {
          event.preventDefault()
          onRename(white, brown)
        }}
      >
        <label>
          白狗的名字
          <input value={white} maxLength={8} onChange={(event) => setWhite(event.target.value)} />
        </label>
        <label>
          咖啡色狗的名字
          <input value={brown} maxLength={8} onChange={(event) => setBrown(event.target.value)} />
        </label>
        <button type="submit">改名</button>
      </form>
      <div className="file-row">
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([JSON.stringify(save)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = 'puppy-city-save.json'
            link.click()
            URL.revokeObjectURL(url)
          }}
        >
          匯出
        </button>
        <label className="import">
          匯入
          <input
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              void file.text().then((text) => {
                const message = onImport(text)
                if (message) onNotice(message)
              })
            }}
          />
        </label>
        <button type="button" data-testid="new-game" onClick={onAskReset}>
          新遊戲
        </button>
      </div>
    </div>
  )
}

export function importSave(raw: string): { save: SaveV3 | null; message: string | null } {
  const parsed = parseSave(raw)
  if (!parsed.ok) return { save: null, message: parsed.message }
  return { save: parsed.save, message: null }
}

export function applyRename(save: SaveV3, white: string, brown: string): SaveV3 | null {
  return renameDogs(save, white, brown)
}
