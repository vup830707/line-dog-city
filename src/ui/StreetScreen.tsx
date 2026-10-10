import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { assetMap } from '../assets/assetMap'
import { drawStreet, layoutStreet } from '../canvas/drawStreet'
import { gameConfig } from '../config'
import { assignJob, castWish, closeBox, hireStaff, placeItem, trainStaff, upgradeStall } from '../rules/actions'
import { isWishPondUnlocked, ownedCount } from '../rules/collection'
import { parseSave } from '../rules/save'
import type { DecorType, Job, SaveV3, Species, StallType, Weather } from '../rules/types'
import { festivalName } from '../rules/weather'
import { renameDogs } from '../game/newGame'
import { Swatch } from './art'
import { DECOR_ORDER, JOB_LABEL, PHASE_LABEL, STALL_ORDER, WEATHER_LABEL } from './labels'

type Tab = 'build' | 'staff' | 'collection' | 'letters'
type DragPayload = { kind: 'stall'; stallType: StallType } | { kind: 'decor'; decorType: DecorType }

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<{ x: number; left: number } | null>(null)
  const [viewHeight, setViewHeight] = useState(640)
  const [tab, setTab] = useState<Tab>('build')
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [selectedAnimal, setSelectedAnimal] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const street = save.street
  const figureIds = gameConfig.figures.map((figure) => figure.id)
  const unlocked = isWishPondUnlocked(street.collection, figureIds)
  const festival = festivalName(street.day, gameConfig)
  const selected = selectedSlot != null ? street.slots[selectedSlot] : null
  const animal = street.visitors.find((visitor) => visitor.id === selectedAnimal) ?? null
  const layout = useMemo(() => layoutStreet(viewHeight), [viewHeight])
  const sceneWidth = gameConfig.streetSlots * layout.slotW

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const apply = () => setViewHeight(Math.max(360, Math.floor(el.clientHeight)))
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(sceneWidth * dpr)
    canvas.height = Math.floor(layout.height * dpr)
    canvas.style.width = `${sceneWidth}px`
    canvas.style.height = `${layout.height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawStreet(ctx, street, gameConfig, layout)
  }, [street, layout, sceneWidth])

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

  return (
    <div className="shell">
      <section className="street-column">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              第 {street.day} 天・{PHASE_LABEL[street.phase]}・{WEATHER_LABEL[street.weather]}
              {festival ? `・${festival}` : ''}
            </p>
            <h1 data-testid="player-name">{save.playerDog === 'white' ? save.whiteName : save.brownName}</h1>
            <p>
              {save.whiteName} 與 {save.brownName}
            </p>
          </div>
          <p data-testid="money">{street.money} 幣</p>
        </header>
        {street.offlineNote ? (
          <p className="offline-note" data-testid="offline-note" data-offline-ticks={street.lastOfflineTicks}>
            {street.offlineNote}
          </p>
        ) : null}
        <div
          className="street-scroll"
          data-testid="street-scroll"
          ref={scrollerRef}
          onWheel={(event) => {
            const el = event.currentTarget
            if (el.scrollWidth <= el.clientWidth + 1) return
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
            el.scrollLeft += event.deltaY
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            const target = event.target
            if (target instanceof Element && target.closest('button')) return
            panRef.current = { x: event.clientX, left: event.currentTarget.scrollLeft }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const pan = panRef.current
            if (!pan) return
            event.currentTarget.scrollLeft = pan.left - (event.clientX - pan.x)
          }}
          onPointerUp={() => {
            panRef.current = null
          }}
          onPointerCancel={() => {
            panRef.current = null
          }}
        >
          <div
            className="street-stage"
            data-testid="street-metrics"
            data-ground-y={layout.groundY}
            data-scene-height={layout.height}
            data-slot-w={layout.slotW}
            data-animal-r={layout.animalR}
            style={{ width: sceneWidth, height: layout.height }}
          >
            <canvas ref={canvasRef} data-testid="street-canvas" />
            {street.slots.map((place, index) => (
              <button
                key={index}
                type="button"
                data-testid={`slot-${index}`}
                className={selectedSlot === index ? 'slot-hit selected' : 'slot-hit'}
                style={{
                  left: index * layout.slotW,
                  width: layout.slotW,
                  top: layout.stallTop,
                  height: layout.stallH,
                  fontSize: layout.font,
                }}
                onClick={() => setSelectedSlot(index)}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  dropOn(index, event.dataTransfer.getData('text/plain'))
                }}
              >
                <span>{place ? '' : index + 1}</span>
              </button>
            ))}
            {street.visitors.map((visitor) => (
              <button
                key={visitor.id}
                type="button"
                data-testid={`animal-${visitor.species}`}
                className="animal-hit"
                style={{
                  left: visitor.position * layout.slotW + layout.slotW / 2 - layout.animalR,
                  top: layout.animalY - layout.animalR,
                  width: layout.animalR * 2,
                  height: layout.animalR * 2,
                }}
                onClick={() => {
                  setSelectedAnimal(visitor.id)
                  setTab('build')
                }}
              >
                {gameConfig.species.find((item) => item.id === visitor.species)?.name}
              </button>
            ))}
          </div>
        </div>
      </section>
      <aside className="panel">
        <nav className="tabs">
          <button type="button" data-testid="tab-build" className={tab === 'build' ? 'on' : ''} onClick={() => setTab('build')}>
            建造
          </button>
          <button type="button" data-testid="tab-staff" className={tab === 'staff' ? 'on' : ''} onClick={() => setTab('staff')}>
            員工
          </button>
          <button type="button" data-testid="tab-collection" className={tab === 'collection' ? 'on' : ''} onClick={() => setTab('collection')}>
            圖鑑
          </button>
          <button type="button" data-testid="tab-letters" className={tab === 'letters' ? 'on' : ''} onClick={() => setTab('letters')}>
            信件
          </button>
        </nav>
        {notice ? <p className="notice">{notice}</p> : null}
        {tab === 'build' ? (
          <div data-testid="build-panel">
            <p className="fine">把攤位或裝飾拖到街道的空格。售價是固定的，升級只讓攤位更好看、貨更多。</p>
            <div className="build-grid">
              {STALL_ORDER.map((stallType) => (
                <button
                  key={stallType}
                  type="button"
                  draggable
                  data-testid={`build-${stallType}`}
                  disabled={stallType === 'wish' && !unlocked}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'stall', stallType }))
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                >
                  <Swatch accent={assetMap.stalls[stallType].accent} label={gameConfig.stallLabels[stallType]} />
                  <span>{gameConfig.stallLabels[stallType]}</span>
                  <small>{stallType === 'wish' && !unlocked ? '集滿解鎖' : `${gameConfig.placeCost[stallType]} 幣`}</small>
                </button>
              ))}
              {DECOR_ORDER.map((decorType) => (
                <button
                  key={decorType}
                  type="button"
                  draggable
                  data-testid={`build-${decorType}`}
                  disabled={decorType === 'star' && !unlocked}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'decor', decorType }))
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                >
                  <Swatch accent={assetMap.decor[decorType].accent} label={gameConfig.decorLabels[decorType]} />
                  <span>{gameConfig.decorLabels[decorType]}</span>
                  <small>{gameConfig.decorCost[decorType]} 幣</small>
                </button>
              ))}
            </div>
            {selected?.kind === 'stall' && selected.stallType ? (
              <div className="detail">
                <h2>{gameConfig.stallLabels[selected.stallType]}</h2>
                <p>等級 {selected.level}・售價 {gameConfig.prices[selected.stallType]} 幣</p>
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
                    收箱並退回 30%
                  </button>
                ) : null}
                {selected.stallType === 'wish' ? (
                  <div className="wish-row">
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
                        許願{WEATHER_LABEL[weather]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {animal ? <AnimalCard species={animal.species} satisfaction={animal.satisfaction} fortune={animal.fortune} /> : null}
          </div>
        ) : null}
        {tab === 'staff' ? (
          <StaffPanel
            save={save}
            onChange={onChange}
            onNotice={setNotice}
            onRename={onRename}
            onImport={onImport}
            onReset={onReset}
          />
        ) : null}
        {tab === 'collection' ? (
          <div data-testid="collection-panel">
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
          <div data-testid="letter-panel">
            {street.letters.length === 0 ? <p>還沒有信件。把動物喜歡的裝飾放在攤位旁邊，牠們滿意了就會寫。</p> : null}
            {street.letters.map((letter) => (
              <article key={letter.id} data-testid="letter-card">
                <h3>{gameConfig.species.find((item) => item.id === letter.species)?.name}</h3>
                <p>{letter.body}</p>
              </article>
            ))}
          </div>
        ) : null}
      </aside>
    </div>
  )
}

function AnimalCard({ species, satisfaction, fortune }: { species: Species; satisfaction: number; fortune: string | null }) {
  const spec = gameConfig.species.find((item) => item.id === species)
  return (
    <article className="animal-card" data-testid="animal-card">
      <h2>{spec?.name}</h2>
      <p>喜歡 {spec ? gameConfig.stallLabels[spec.stall] : ''} 和 {spec ? gameConfig.decorLabels[spec.decor] : ''}</p>
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
    <div data-testid="staff-panel">
      <p className="fine">兩隻狗都可以補貨、掃地或招呼。還可以再雇文鳥和雪貂，牠們不是來逛街的客人。</p>
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
        雇用小動物
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
