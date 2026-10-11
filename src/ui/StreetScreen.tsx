import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { assetMap } from '../assets/assetMap'
import { drawPlaza } from '../canvas/drawPlaza'
import { buildPopScale } from '../canvas/fx'
import {
  artSources,
  BG_SRC,
  bobOffset,
  clampPan,
  panRange,
  panToShowSlots,
  PAN_TAP_SLOP,
  plazaTransform,
  type CameraPan,
  layoutScene,
  PATH_ENTRANCE,
  PLAZA_PATH,
  PLAZA_SLOTS,
  screenRect,
  glowSlotHit,
  slotFrame,
  slotHitRect,
  spriteScreenRect,
  staffDestination,
  toScreen,
  type PoseSample,
  type StaffPlacement,
} from '../canvas/plaza'
import { staffWalkPoint, trackStalls, type StaffTrip } from '../canvas/walk'
import { gameConfig } from '../config'
import {
  buyBox,
  buyBoxBlock,
  castWish,
  closeBox,
  eligibleSlots,
  placeItem,
  upgradeBlock,
  upgradeStall,
  wishBlock,
  type PlaceItem,
} from '../rules/actions'
import { buildOffers } from '../rules/build'
import { refundAmount } from '../rules/ichiban'
import { parseSave } from '../rules/save'
import { emptyShelfHint, stockCap } from '../rules/staff'
import type { SaveV3, Species, Street } from '../rules/types'
import { renameDogs } from '../game/newGame'
import { BuildStrip } from './BuildStrip'
import { PhoneCharm, PhoneOverlay, type PhoneApp } from './PhoneMenu'
import { BANNER_SRC, PRODUCT_SRC } from '../assets/growthArt'
import { productsFor, upgradeAdds } from '../rules/products'
import { StallCard } from './StallCard'
import { WEATHER_LABEL } from './labels'

const artRoot = import.meta.env.BASE_URL
const SEEN_LETTERS = 'puppy-seen-letter-ids'
const REDUCE_MOTION = 'puppy-reduce-motion'
const PAN_IGNORE = '.hud, .phone, .phone-scrim, .phone-charm, .build-strip, .stall-card, .animal-card, .offline-note, .level-banner, .confirm-layer, .toast, .restock-hint'

function plazaGestureTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !target.closest(PAN_IGNORE)
}

function readSeenLetters(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_LETTERS)
    const ids = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(ids)
  } catch {
    return new Set()
  }
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

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
  const [pan, setPan] = useState<CameraPan>({ x: 0, y: 0 })
  const [pannedOnce, setPannedOnce] = useState(false)
  const [artReady, setArtReady] = useState(false)
  const [phone, setPhone] = useState<'closed' | 'open' | 'closing'>('closed')
  const [phoneApp, setPhoneApp] = useState<PhoneApp | null>(null)
  const [buildMode, setBuildMode] = useState(false)
  const [buildTab, setBuildTab] = useState<'stall' | 'decor'>('stall')
  const [buildItem, setBuildItem] = useState<PlaceItem | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [selectedAnimal, setSelectedAnimal] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [pendingReset, setPendingReset] = useState(false)
  const [seenLetters, setSeenLetters] = useState(readSeenLetters)
  const [reduceMotion, setReduceMotion] = useState(() => {
    try {
      return localStorage.getItem(REDUCE_MOTION) === '1'
    } catch {
      return false
    }
  })
  const street = save.street
  const streetRef = useRef(street)
  const viewRef = useRef(view)
  const selectedRef = useRef(selectedSlot)
  const hitsRef = useRef<HTMLDivElement | null>(null)
  const hudRef = useRef<HTMLElement | null>(null)
  const glowSlotsRef = useRef<number[]>([])
  const buildModeRef = useRef(false)
  const panRef = useRef<CameraPan>({ x: 0, y: 0 })
  const dragRef = useRef<{
    id: number
    x: number
    y: number
    pan: CameraPan
    moved: boolean
    lastX: number
    lastY: number
    lastT: number
    vx: number
    vy: number
  } | null>(null)
  const suppressClickRef = useRef(false)
  const coastRef = useRef(0)
  const easeRef = useRef(0)
  const pannedOnceRef = useRef(false)
  const buildFxRef = useRef<{ slot: number; start: number } | null>(null)
  const reduceRef = useRef(false)
  const motionRef = useRef<{
    tick: number
    tickAt: number
    previous: Street | null
    current: Street | null
    leaving: Map<string, number>
    staff: Map<string, StaffTrip>
    pose: Map<string, PoseSample>
  }>({ tick: -1, tickAt: 0, previous: null, current: null, leaving: new Map(), staff: new Map(), pose: new Map() })
  const [hudBottom, setHudBottom] = useState(64)
  streetRef.current = street
  viewRef.current = view
  selectedRef.current = selectedSlot
  const offers = buildOffers(street, gameConfig)
  const glowSlots = buildItem ? eligibleSlots(street, buildItem, gameConfig) : []
  glowSlotsRef.current = glowSlots
  buildModeRef.current = buildMode
  reduceRef.current = reduceMotion || prefersReducedMotion()
  const selectedOfferId = buildItem ? (buildItem.kind === 'stall' ? buildItem.stallType : buildItem.decorType) : null
  const letterKey = street.letters.map((letter) => letter.id).join('|')
  const unread = street.letters.filter((letter) => !seenLetters.has(letter.id)).length
  const upgradeReady = street.slots.some((place, index) => place?.kind === 'stall' && upgradeBlock(street, index, gameConfig) === null)
  const selected = selectedSlot != null ? street.slots[selectedSlot] : null
  const animal = street.visitors.find((visitor) => visitor.id === selectedAnimal) ?? null
  const cover = plazaTransform(view.w, view.h, buildMode, pan)
  const cameraRange = panRange(view.w, view.h)
  const freshSpecies = street.seenSpecies.some((id) => !street.ackedSpecies.includes(id))
  const toastText = street.pendingToasts[street.pendingToasts.length - 1] ?? ''
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    if (!toastText) return
    const current = saveRef.current
    setNotice(toastText)
    onChange({ ...current, street: { ...current.street, pendingToasts: [] } })
  }, [toastText, onChange])
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

  useLayoutEffect(() => {
    const shell = shellRef.current
    const hud = hudRef.current
    if (!shell || !hud) return
    const apply = () => {
      const shellBox = shell.getBoundingClientRect()
      const hudBox = hud.getBoundingClientRect()
      setHudBottom(Math.max(0, hudBox.bottom - shellBox.top))
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(hud)
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
      const streetNow = streetRef.current
      const motion = motionRef.current
      const reduce = reduceRef.current
      trackStalls(motion.leaving, streetNow.visitors, PLAZA_SLOTS.length)
      if (motion.tick !== streetNow.tick) {
        motion.previous = motion.current
        motion.current = streetNow
        motion.tick = streetNow.tick
        motion.tickAt = now
      } else {
        motion.current = streetNow
      }
      const alpha = motion.previous ? Math.min(1, Math.max(0, (now - motion.tickAt) / gameConfig.tickMs)) : 1
      const staffAt: Record<string, StaffPlacement> = {}
      for (const member of streetNow.staff) {
        const dest = staffDestination(streetNow, member.id)
        let trip = motion.staff.get(member.id)
        if (!trip || trip.key !== dest.key) {
          const from = trip ? staffWalkPoint(trip, now, PLAZA_PATH, reduce).point : PATH_ENTRANCE
          trip = { key: dest.key, from, to: dest.point, started: now }
          motion.staff.set(member.id, trip)
        }
        const visual = staffWalkPoint(trip, now, PLAZA_PATH, reduce)
        staffAt[member.id] = {
          x: visual.point.x,
          y: visual.point.y,
          walking: visual.walking,
          faceX: visual.tangent.x,
          faceY: visual.tangent.y,
        }
      }
      for (const id of [...motion.staff.keys()]) {
        if (!streetNow.staff.some((member) => member.id === id)) motion.staff.delete(id)
      }
      const scene = layoutScene(streetNow, now, {
        alpha,
        previous: motion.previous,
        reduceMotion: reduce,
        leavingFrom: motion.leaving,
        staffAt,
        pose: motion.pose,
      })
      const glow = new Set(glowSlotsRef.current)
      const viewCover = plazaTransform(width, height, buildModeRef.current, panRef.current)
      let spark: { x: number; y: number; t: number } | null = null
      const fx = buildFxRef.current
      if (fx) {
        const elapsed = now - fx.start
        const duration = gameConfig.buildAnimMs
        if (reduceRef.current || elapsed >= duration) buildFxRef.current = null
        else {
          const built = scene.find((item) => item.id === `slot-${fx.slot}`)
          if (built) built.drawH *= buildPopScale(elapsed, duration)
          const foot = toScreen(PLAZA_SLOTS[fx.slot] ?? { x: 0, y: 0 }, viewCover)
          spark = { x: foot.x, y: foot.y, t: elapsed / duration }
        }
      }
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        const frames = streetRef.current.slots.flatMap((place, index) => {
          const selected = selectedRef.current === index && !buildModeRef.current
          const glowing = glow.has(index)
          if (!place && !selected && !glowing) return []
          const stallType = place?.kind === 'stall' ? place.stallType : null
          return [{ frame: slotFrame(index, stallType), selected, glow: glowing }]
        })
        drawPlaza(ctx, width, height, imagesRef.current.get(BG_SRC), imagesRef.current, scene, now, frames, spark, viewCover)
      }
      const layer = hitsRef.current
      if (layer) {
        const coverNow = viewCover
        layer.querySelectorAll<HTMLButtonElement>('[data-visitor]').forEach((button) => {
          const sprite = scene.find((item) => item.id === `visitor-${button.dataset.visitor}`)
          if (!sprite) return
          const bob = sprite.bob ? bobOffset(now, sprite.seed, true, gameConfig.walkFps) * coverNow.scale : 0
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

  useEffect(() => {
    if (phone !== 'closing') return
    const id = window.setTimeout(() => {
      setPhone('closed')
      setPhoneApp(null)
    }, reduceMotion || prefersReducedMotion() ? 0 : 320)
    return () => window.clearTimeout(id)
  }, [phone, reduceMotion])

  useEffect(() => {
    if (phoneApp !== 'letters') return
    const ids = letterKey ? letterKey.split('|') : []
    localStorage.setItem(SEEN_LETTERS, JSON.stringify(ids))
    setSeenLetters(new Set(ids))
  }, [phoneApp, letterKey])

  useEffect(() => {
    return () => {
      if (coastRef.current) window.cancelAnimationFrame(coastRef.current)
      if (easeRef.current) window.cancelAnimationFrame(easeRef.current)
    }
  }, [])

  useLayoutEffect(() => {
    const next = clampPan(view.w, view.h, panRef.current)
    if (next.x === panRef.current.x && next.y === panRef.current.y) return
    panRef.current = next
    setPan(next)
  }, [view.w, view.h])

  const glowKey = glowSlots.join(',')
  useEffect(() => {
    if (!buildMode || dragRef.current) return
    const slots = glowSlotsRef.current
    if (slots.length === 0) return
    const next = panToShowSlots(view.w, view.h, panRef.current, slots, true)
    if (next.x === panRef.current.x && next.y === panRef.current.y) return
    if (easeRef.current) window.cancelAnimationFrame(easeRef.current)
    if (coastRef.current) window.cancelAnimationFrame(coastRef.current)
    coastRef.current = 0
    const from = panRef.current
    if (reduceRef.current) {
      panRef.current = next
      setPan(next)
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      if (dragRef.current) return
      const t = Math.min(1, (now - start) / 280)
      const eased = 1 - (1 - t) * (1 - t)
      const sample = clampPan(viewRef.current.w, viewRef.current.h, {
        x: from.x + (next.x - from.x) * eased,
        y: from.y + (next.y - from.y) * eased,
      })
      panRef.current = sample
      setPan(sample)
      if (t < 1) easeRef.current = window.requestAnimationFrame(step)
      else easeRef.current = 0
    }
    easeRef.current = window.requestAnimationFrame(step)
    return () => {
      if (easeRef.current) window.cancelAnimationFrame(easeRef.current)
      easeRef.current = 0
    }
  }, [buildMode, glowKey, view.w, view.h])

  useEffect(() => {
    if (!buildItem) return
    const id = buildItem.kind === 'stall' ? buildItem.stallType : buildItem.decorType
    const still = buildOffers(street, gameConfig).find((offer) => offer.id === id)
    if (still && !still.affordable) setBuildItem(null)
  }, [buildItem, street])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (phone !== 'closed') {
        if (reduceMotion || prefersReducedMotion()) {
          setPhone('closed')
          setPhoneApp(null)
        } else setPhone('closing')
        return
      }
      if (buildMode) {
        setBuildMode(false)
        setBuildItem(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phone, buildMode, reduceMotion])

  function commitPlace(slot: number, item: PlaceItem) {
    const result = placeItem(street, slot, item, gameConfig)
    if (!result.ok) {
      setNotice(result.reason ?? '放不下')
      return
    }
    const gain = item.kind === 'decor' ? gameConfig.decorScore[item.decorType] : (gameConfig.lookByLevel[0] ?? 0)
    setNotice(`熱鬧度 +${gain}`)
    setSelectedSlot(null)
    buildFxRef.current = { slot, start: performance.now() }
    if (item.kind === 'stall') {
      setBuildMode(false)
      setBuildItem(null)
    }
    onChange({ ...save, street: result.street })
  }

  function dropOn(slot: number, raw: string) {
    let payload: PlaceItem
    try {
      payload = JSON.parse(raw) as PlaceItem
    } catch {
      setNotice('放不下這個。')
      return
    }
    commitPlace(slot, payload)
  }

  function closePhone() {
    if (phone === 'closed') return
    if (reduceMotion || prefersReducedMotion()) {
      setPhone('closed')
      setPhoneApp(null)
      return
    }
    setPhone('closing')
  }

  function exitBuild() {
    setBuildMode(false)
    setBuildItem(null)
  }

  function startBuild() {
    setBuildMode(true)
    setBuildTab('stall')
    setBuildItem(null)
    setSelectedSlot(null)
    setSelectedAnimal(null)
    closePhone()
  }

  function setMotion(on: boolean) {
    localStorage.setItem(REDUCE_MOTION, on ? '1' : '0')
    setReduceMotion(on)
  }

  function stopCoast() {
    if (coastRef.current) window.cancelAnimationFrame(coastRef.current)
    if (easeRef.current) window.cancelAnimationFrame(easeRef.current)
    coastRef.current = 0
    easeRef.current = 0
  }

  function commitPan(next: CameraPan): CameraPan {
    const clamped = clampPan(viewRef.current.w, viewRef.current.h, next)
    if (clamped.x === panRef.current.x && clamped.y === panRef.current.y) return panRef.current
    panRef.current = clamped
    setPan(clamped)
    return clamped
  }

  function coast(vx: number, vy: number) {
    if (Math.hypot(vx, vy) < 0.12) return
    let vxNow = vx
    let vyNow = vy
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(34, now - last)
      last = now
      const decay = Math.pow(0.9, dt / 16)
      vxNow *= decay
      vyNow *= decay
      const before = panRef.current
      const next = commitPan({ x: before.x + vxNow * dt, y: before.y + vyNow * dt })
      if ((next.x === before.x && next.y === before.y) || Math.hypot(vxNow, vyNow) < 0.02) {
        coastRef.current = 0
        return
      }
      coastRef.current = window.requestAnimationFrame(step)
    }
    coastRef.current = window.requestAnimationFrame(step)
  }

  function onPlazaPointerDown(event: ReactPointerEvent) {
    if (!event.isPrimary || event.button !== 0) return
    const range = panRange(viewRef.current.w, viewRef.current.h)
    if (range.maxX === 0 && range.minX === 0 && range.maxY === 0 && range.minY === 0) return
    if (!plazaGestureTarget(event.target)) return
    stopCoast()
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pan: panRef.current,
      moved: false,
      lastX: event.clientX,
      lastY: event.clientY,
      lastT: event.timeStamp,
      vx: 0,
      vy: 0,
    }
  }

  function onPlazaPointerMove(event: ReactPointerEvent) {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < PAN_TAP_SLOP) return
    if (!drag.moved) {
      drag.moved = true
      shellRef.current?.setPointerCapture(event.pointerId)
      if (!pannedOnceRef.current) {
        pannedOnceRef.current = true
        setPannedOnce(true)
      }
    }
    const dt = event.timeStamp - drag.lastT
    if (dt > 0) {
      drag.vx = (event.clientX - drag.lastX) / dt
      drag.vy = (event.clientY - drag.lastY) / dt
    }
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    drag.lastT = event.timeStamp
    commitPan({ x: drag.pan.x + dx, y: drag.pan.y + dy })
    event.preventDefault()
  }

  function onPlazaPointerUp(event: ReactPointerEvent) {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    dragRef.current = null
    if (!drag.moved) return
    suppressClickRef.current = true
    coast(drag.vx, drag.vy)
  }

  function onPlazaClickCapture(event: ReactMouseEvent) {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
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
      data-tick={street.tick}
      data-reduce-motion={reduceRef.current ? '1' : '0'}
      data-pan-x={pan.x.toFixed(1)}
      data-pan-y={pan.y.toFixed(1)}
      data-pan-max-x={cameraRange.maxX.toFixed(1)}
      onPointerDown={onPlazaPointerDown}
      onPointerMove={onPlazaPointerMove}
      onPointerUp={onPlazaPointerUp}
      onPointerCancel={onPlazaPointerUp}
      onClickCapture={onPlazaClickCapture}
      onContextMenu={(event) => {
        if (!buildMode) return
        event.preventDefault()
        exitBuild()
      }}
    >
      <canvas
        ref={canvasRef}
        className="plaza-canvas"
        data-testid="street-canvas"
        onClick={() => {
          if (buildMode) return
          setSelectedSlot(null)
          setSelectedAnimal(null)
        }}
      />
      {cameraRange.maxX > 0 && pan.x < cameraRange.maxX - 1 ? (
        <div className={pannedOnce ? 'pan-hint pan-hint-left' : 'pan-hint pan-hint-left is-fresh'} data-testid="pan-hint-left" aria-hidden="true">
          <span className="pan-chevron" />
        </div>
      ) : null}
      {cameraRange.maxX > 0 && pan.x > cameraRange.minX + 1 ? (
        <div className={pannedOnce ? 'pan-hint pan-hint-right' : 'pan-hint pan-hint-right is-fresh'} data-testid="pan-hint-right" aria-hidden="true">
          <span className="pan-chevron" />
        </div>
      ) : null}
      {PLAZA_SLOTS.map((_, index) => {
        const place = street.slots[index]
        const stallType = place?.kind === 'stall' ? place.stallType : null
        const frame = slotFrame(index, stallType)
        const glowing = glowSlots.includes(index)
        const rect = glowing ? glowSlotHit(frame, cover, view.w, view.h) : slotHitRect(frame, cover)
        return (
          <button
            key={index}
            type="button"
            data-testid={`slot-${index}`}
            data-kind={place?.kind ?? ''}
            data-item={place?.stallType ?? place?.decorType ?? ''}
            data-glow={glowSlots.includes(index) ? '1' : '0'}
            aria-label={`格子 ${index + 1}`}
            className={selectedSlot === index ? 'slot-hit selected' : 'slot-hit'}
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
            onClick={() => {
              if (buildItem && glowSlots.includes(index)) {
                commitPlace(index, buildItem)
                return
              }
              if (buildMode) return
              setSelectedSlot(index)
              setSelectedAnimal(null)
            }}
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
      <header className="hud" ref={hudRef}>
        <p className="hud-chip money-chip" data-testid="money">
          <img src={assetMap.phone.coin} alt="" />
          {street.money} 幣
        </p>
        <p className="hud-chip weather-chip" data-testid="weather">
          <img src={assetMap.phone.weather[street.weather]} alt="" />
          {WEATHER_LABEL[street.weather]}
        </p>
      </header>
      {street.offlineNote ? (
        <p className="offline-note" data-testid="offline-note" data-offline-ticks={street.lastOfflineTicks}>
          {street.offlineNote}
        </p>
      ) : null}
      {street.levelUpBanner != null ? (
        <button
          type="button"
          className="level-banner"
          data-testid="level-banner"
          onClick={() => onChange({ ...save, street: { ...street, levelUpBanner: null } })}
        >
          <img src={`${artRoot}${BANNER_SRC}`} alt="" />
          夜市升到 Lv.{street.levelUpBanner}！
        </button>
      ) : null}
      {notice ? (
        <p className="toast" data-testid="toast">
          {notice}
        </p>
      ) : null}
      {emptyShelfHint(street) ? (
        <p className={notice ? 'restock-hint below-toast' : 'restock-hint'} data-testid="restock-hint">
          {emptyShelfHint(street)}
        </p>
      ) : null}
      {!buildMode && selected?.kind === 'stall' && selected.stallType && selectedSlot != null ? (
        <StallCard
          key={selected.uid}
          title={`${gameConfig.stallLabels[selected.stallType]} Lv.${selected.level}`}
          goods={goodsLine(street, selectedSlot)}
          products={productsFor(selected.stallType, selected.level, gameConfig).map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            src: PRODUCT_SRC[item.id] ?? '',
          }))}
          upgradeLabel={upgradeAdds(selected.stallType, selected.level, gameConfig)}
          anchor={screenRect(slotFrame(selectedSlot, selected.stallType), cover)}
          view={view}
          upgradeReason={upgradeBlock(street, selectedSlot, gameConfig)}
          hudBottom={hudBottom}
          onUpgrade={() => {
            const result = upgradeStall(street, selectedSlot, gameConfig)
            setNotice(result.ok ? '' : result.reason ?? '')
            if (result.ok) onChange({ ...save, street: result.street })
          }}
          ichiban={
            selected.stallType === 'ichiban'
              ? {
                  tickets: street.box?.tickets.length ?? 0,
                  refund: street.box?.paid ? refundAmount(street.box, gameConfig.refundRate, gameConfig) : 0,
                  buyReason: buyBoxBlock(street, gameConfig),
                  closeReason: street.box ? null : '現在沒有箱子',
                  onClose: () => {
                    const refund = street.box?.paid ? refundAmount(street.box, gameConfig.refundRate, gameConfig) : 0
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
      {animal && !buildMode ? (
        <AnimalCard street={street} species={animal.species} satisfaction={animal.satisfaction} fortune={animal.fortune} />
      ) : null}
      {buildMode ? (
        <BuildStrip
          offers={offers}
          tab={buildTab}
          selectedId={selectedOfferId ?? null}
          onTab={setBuildTab}
          onSelect={(offer) => {
            if (!offer.affordable) return
            if (offer.kind === 'stall' && offer.stallType) setBuildItem({ kind: 'stall', stallType: offer.stallType })
            if (offer.kind === 'decor' && offer.decorType) setBuildItem({ kind: 'decor', decorType: offer.decorType })
          }}
          onCancel={exitBuild}
        />
      ) : null}
      <PhoneCharm
        badge={unread > 0 || upgradeReady || freshSpecies}
        reduceMotion={reduceRef.current}
        open={phone !== 'closed'}
        onClick={() => {
          if (phone === 'closed') {
            setPhone('open')
            setPhoneApp(null)
            return
          }
          closePhone()
        }}
      />
      {phone !== 'closed' ? (
        <PhoneOverlay
          closing={phone === 'closing'}
          app={phoneApp}
          save={save}
          unread={unread}
          reduceMotion={reduceRef.current}
          onClose={closePhone}
          onBack={() => setPhoneApp(null)}
          onBuild={startBuild}
          onOpenApp={(app) => {
            setPhoneApp(app)
            if (app === 'collection' && freshSpecies) {
              onChange({ ...save, street: { ...street, ackedSpecies: [...street.seenSpecies] } })
            }
          }}
          onChange={onChange}
          onRename={onRename}
          onImport={onImport}
          onNotice={setNotice}
          onAskReset={() => setPendingReset(true)}
          onReduceMotion={setMotion}
          onClosed={() => {
            setPhone('closed')
            setPhoneApp(null)
          }}
        />
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
    </div>
  )
}

function AnimalCard({
  street,
  species,
  satisfaction,
  fortune,
}: {
  street: Street
  species: Species
  satisfaction: number
  fortune: string | null
}) {
  const spec = gameConfig.species.find((item) => item.id === species)
  const favourite = spec ? Object.values(gameConfig.products).flat().find((item) => item.id === spec.product) : undefined
  const known = spec ? street.seenProducts.includes(spec.product) : false
  const score = street.speciesSatisfaction[species] ?? satisfaction
  const letters = street.letters.filter((letter) => letter.species === species)
  return (
    <article className="hud-card animal-card" data-testid="animal-card">
      <h2>{spec?.name}</h2>
      <p data-testid="animal-favorite">最愛 {known && favourite ? favourite.name : '？'}</p>
      <p>滿意度 {Math.round(score * 100)}</p>
      {letters.length === 0 ? <p>還沒有留下信。</p> : letters.map((letter) => <p key={letter.id}>{letter.body}</p>)}
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

export function importSave(raw: string): { save: SaveV3 | null; message: string | null } {
  const parsed = parseSave(raw)
  if (!parsed.ok) return { save: null, message: parsed.message }
  return { save: parsed.save, message: null }
}

export function applyRename(save: SaveV3, white: string, brown: string): SaveV3 | null {
  return renameDogs(save, white, brown)
}
