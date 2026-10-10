import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { drawPlaza } from '../canvas/drawPlaza'
import {
  artSources,
  BG_SRC,
  coverTransform,
  DECOR_ART,
  layoutScene,
  pathPoint,
  PLAZA_SLOTS,
  STALL_ART,
  toScreen,
} from '../canvas/plaza'
import { gameConfig } from '../config'
import { assignJob, castWish, closeBox, hireStaff, placeItem, trainStaff, upgradeStall } from '../rules/actions'
import { isWishPondUnlocked, ownedCount } from '../rules/collection'
import { parseSave } from '../rules/save'
import type { DecorType, Job, SaveV3, Species, StallType, Weather } from '../rules/types'
import { festivalName } from '../rules/weather'
import { renameDogs } from '../game/newGame'
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
  const street = save.street
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
    const canvas = canvasRef.current
    if (!canvas) return
    let frame = 0
    const paint = (now: number) => {
      const dpr = window.devicePixelRatio || 1
      const width = view.w
      const height = view.h
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawPlaza(ctx, width, height, imagesRef.current.get(BG_SRC), imagesRef.current, layoutScene(street, now), now)
      }
      frame = window.requestAnimationFrame(paint)
    }
    frame = window.requestAnimationFrame(paint)
    return () => window.cancelAnimationFrame(frame)
  }, [street, view])

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
      {PLAZA_SLOTS.map((slot, index) => {
        const foot = toScreen(slot, cover)
        return (
          <button
            key={index}
            type="button"
            data-testid={`slot-${index}`}
            aria-label={`格子 ${index + 1}`}
            className={selectedSlot === index ? 'slot-hit selected' : 'slot-hit'}
            style={{ left: foot.x - 46, top: foot.y - 28, width: 92, height: 56 }}
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
      {street.visitors.map((visitor) => {
        const foot = toScreen(pathPoint(visitor.position), cover)
        return (
          <button
            key={visitor.id}
            type="button"
            data-testid={`animal-${visitor.species}`}
            className="animal-hit"
            style={{ left: foot.x - 28, top: foot.y - 72, width: 56, height: 76 }}
            onClick={() => setSelectedAnimal(visitor.id)}
          >
            {gameConfig.species.find((item) => item.id === visitor.species)?.name}
          </button>
        )
      })}
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
      {notice ? <p className="offline-note">{notice}</p> : null}
      {selected?.kind === 'stall' && selected.stallType ? (
        <div className="offline-note detail">
          <span>
            {gameConfig.stallLabels[selected.stallType]} Lv.{selected.level}
          </span>
          <button
            type="button"
            data-testid="upgrade-stall"
            onClick={() => {
              if (selectedSlot == null) return
              const result = upgradeStall(street, selectedSlot, gameConfig)
              setNotice(result.ok ? '' : result.reason ?? '')
              if (result.ok) onChange({ ...save, street: result.street })
            }}
          >
            升級
          </button>
          {selected.stallType === 'ichiban' ? (
            <button
              type="button"
              data-testid="close-box"
              onClick={() => {
                const result = closeBox(street, gameConfig)
                setNotice(result.ok ? '剩下的籤已退回 30%。' : result.reason ?? '')
                if (result.ok) onChange({ ...save, street: result.street })
              }}
            >
              收箱
            </button>
          ) : null}
          {selected.stallType === 'wish' ? (
            <span className="wish-row">
              {(['sunny', 'hot', 'cold', 'rain'] as Weather[]).map((weather) => (
                <button
                  key={weather}
                  type="button"
                  onClick={() => {
                    const result = castWish(street, weather, gameConfig)
                    setNotice(result.street.wishMessage ?? result.reason ?? '')
                    if (result.ok) onChange({ ...save, street: result.street })
                  }}
                >
                  {WEATHER_LABEL[weather]}
                </button>
              ))}
            </span>
          ) : null}
        </div>
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
        <StaffPanel save={save} onChange={onChange} onNotice={setNotice} onRename={onRename} onImport={onImport} onReset={onReset} />
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

function StaffPanel({
  save,
  onChange,
  onNotice,
  onRename,
  onImport,
  onReset,
}: {
  save: SaveV3
  onChange: (save: SaveV3) => void
  onNotice: (text: string) => void
  onRename: (white: string, brown: string) => void
  onImport: (raw: string) => string | null
  onReset: () => void
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
          <button
            type="button"
            onClick={() => {
              const result = trainStaff(save.street, member.id, gameConfig)
              onNotice(result.ok ? '' : result.reason ?? '')
              if (result.ok) onChange({ ...save, street: result.street })
            }}
          >
            訓練
          </button>
        </article>
      ))}
      <button
        type="button"
        data-testid="hire-staff"
        onClick={() => {
          const result = hireStaff(save.street, gameConfig)
          onNotice(result.ok ? '新員工來了。' : result.reason ?? '')
          if (result.ok) onChange({ ...save, street: result.street })
        }}
      >
        雇用
      </button>
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
        <button type="button" onClick={onReset}>
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
