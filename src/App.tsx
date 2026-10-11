import { useEffect, useRef, useState } from 'react'
import { gameConfig } from './config'
import { applyOffline } from './rules/offline'
import { presentNightEvent } from './rules/events'
import { runTicks, spawnVisitor, streetTick } from './rules/street'
import type { SaveV3, Species } from './rules/types'
import { debugHooksEnabled } from './game/debug'
import { createNewGame } from './game/newGame'
import { clearGame, loadGame, shouldPersistTick, storeGame } from './game/storage'
import { applyRename, importSave, StreetScreen } from './ui/StreetScreen'
import { TitleScreen } from './ui/TitleScreen'

let booted: SaveV3 | null | undefined

function loadInitial(): SaveV3 | null {
  if (booted !== undefined) return booted
  const loaded = loadGame(localStorage)
  if (!loaded) {
    booted = null
    return null
  }
  const applied = applyOffline(loaded.street, Date.now() - loaded.savedAt, gameConfig)
  if (applied.ticks === 0) {
    booted = loaded
    return loaded
  }
  const next = { ...loaded, street: applied.street, savedAt: Date.now() }
  storeGame(localStorage, next)
  booted = next
  return next
}

export function App() {
  const [save, setSave] = useState<SaveV3 | null>(loadInitial)
  const [playing, setPlaying] = useState(false)
  const [notice, setNotice] = useState('')
  const saveRef = useRef(save)
  const pauseRef = useRef(false)
  const playingRef = useRef(false)
  const ticksSinceSave = useRef(0)
  saveRef.current = save

  function enterGame() {
    try {
      if (!saveRef.current) commit(createNewGame({ now: Date.now() }, gameConfig))
      playingRef.current = true
      setPlaying(true)
      setNotice('')
    } catch (error) {
      playingRef.current = false
      setNotice(error instanceof Error ? error.message : '沒辦法開始')
    }
  }

  function commit(next: SaveV3 | null) {
    booted = next
    saveRef.current = next
    if (next) storeGame(localStorage, { ...next, savedAt: Date.now() })
    else clearGame(localStorage)
    setSave(next)
  }

  useEffect(() => {
    const persist = () => {
      const current = saveRef.current
      if (!current || !playingRef.current) return
      // A paused debug session may have rewound savedAt. Reloading fires pagehide, and stamping "now" would erase that.
      const stamped = pauseRef.current ? current : { ...current, savedAt: Date.now() }
      storeGame(localStorage, stamped)
      saveRef.current = stamped
      booted = stamped
      ticksSinceSave.current = 0
    }
    if (debugHooksEnabled(window.location.search, import.meta.env.MODE)) {
      window.__puppy = {
        pause() {
          pauseRef.current = true
        },
        resume() {
          pauseRef.current = false
        },
        runTicks(count: number) {
          const current = saveRef.current
          if (!current) return
          pauseRef.current = true
          commit({ ...current, street: runTicks(current.street, gameConfig, count) })
        },
        rewindClock(ms: number) {
          const current = saveRef.current
          if (!current) return
          const next = { ...current, savedAt: Date.now() - ms }
          saveRef.current = next
          booted = next
          storeGame(localStorage, next)
          setSave(next)
        },
        setMoney(amount: number) {
          const current = saveRef.current
          if (!current || !Number.isFinite(amount)) return
          pauseRef.current = true
          commit({ ...current, street: { ...current.street, money: Math.max(0, Math.floor(amount)) } })
        },
        setStallLevel(index: number, level: number) {
          const current = saveRef.current
          if (!current) return
          const place = current.street.slots[index]
          if (!place || place.kind !== 'stall') return
          pauseRef.current = true
          const slots = current.street.slots.slice()
          slots[index] = { ...place, level }
          commit({ ...current, street: { ...current.street, slots } })
        },
        showLevel(level: number) {
          const current = saveRef.current
          if (!current) return
          pauseRef.current = true
          commit({ ...current, street: { ...current.street, levelUpBanner: level, pendingToasts: [`夜市升到 Lv.${level}！`] } })
        },
        showEvent(kind: string) {
          const current = saveRef.current
          if (!current) return
          if (kind !== 'rain' && kind !== 'festival-eve' && kind !== 'merchant') return
          pauseRef.current = true
          commit({ ...current, street: presentNightEvent(current.street, kind, gameConfig) })
        },
        tune(patch: { weather?: string; phase?: string; day?: number; clearEvent?: boolean }) {
          const current = saveRef.current
          if (!current) return
          pauseRef.current = true
          const weather = patch.weather
          const phase = patch.phase
          const street = {
            ...current.street,
            weather: weather === 'sunny' || weather === 'hot' || weather === 'cold' || weather === 'rain' ? weather : current.street.weather,
            phase: phase === 'dusk' || phase === 'mid' || phase === 'late' ? phase : current.street.phase,
            day: Number.isFinite(patch.day) ? Math.max(1, Math.floor(patch.day ?? current.street.day)) : current.street.day,
            nightEvent: patch.clearEvent ? null : current.street.nightEvent,
          }
          commit({ ...current, street })
        },
        setAffinity(species: string, hearts: number, progress = 0) {
          const current = saveRef.current
          if (!current) return
          const id = species as Species
          if (!gameConfig.species.some((item) => item.id === id)) return
          pauseRef.current = true
          const seen = current.street.seenSpecies.includes(id) ? current.street.seenSpecies : [...current.street.seenSpecies, id]
          commit({
            ...current,
            street: {
              ...current.street,
              seenSpecies: seen,
              affinity: { ...current.street.affinity, [id]: Math.max(0, Math.floor(hearts)) },
              affinityProgress: { ...current.street.affinityProgress, [id]: Math.max(0, Math.floor(progress)) },
            },
          })
        },
        clearSlot(index: number) {
          const current = saveRef.current
          if (!current || index < 0 || index >= current.street.slots.length) return
          pauseRef.current = true
          const slots = current.street.slots.slice()
          slots[index] = null
          commit({ ...current, street: { ...current.street, slots } })
        },
        spawn(species: string) {
          const current = saveRef.current
          if (!current) return
          pauseRef.current = true
          const street = spawnVisitor(current.street, gameConfig, species as Species)
          const visitor = street.visitors[street.visitors.length - 1]
          const visitors = visitor
            ? street.visitors.map((item) => (item.id === visitor.id ? { ...item, position: item.target } : item))
            : street.visitors
          const stock = { ...street.stock }
          for (const place of street.slots) {
            if (place?.kind === 'stall' && place.stallType && place.stallType !== 'ichiban') stock[place.uid] = 12
          }
          commit({ ...current, street: { ...street, visitors, stock } })
        },
      }
    }
    window.addEventListener('pagehide', persist)
    const id = window.setInterval(() => {
      if (pauseRef.current || !playingRef.current) return
      const current = saveRef.current
      if (!current) return
      ticksSinceSave.current += 1
      const write = shouldPersistTick(ticksSinceSave.current, gameConfig.saveEveryTicks)
      const next = {
        ...current,
        street: streetTick(current.street, gameConfig),
        savedAt: write ? Date.now() : current.savedAt,
      }
      saveRef.current = next
      booted = next
      if (write) {
        storeGame(localStorage, next)
        ticksSinceSave.current = 0
      }
      setSave(next)
    }, gameConfig.tickMs)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('pagehide', persist)
      delete window.__puppy
    }
  }, [])

  if (!playing || !save) {
    return (
      <>
        {notice ? <p className="notice banner">{notice}</p> : null}
        <TitleScreen hasSave={save != null} onBegin={enterGame} />
      </>
    )
  }

  return (
    <>
      {notice ? <p className="notice banner">{notice}</p> : null}
      <StreetScreen
        save={save}
        onChange={(next) => commit(next)}
        onRename={(white, brown) => {
          const next = applyRename(save, white, brown)
          if (!next) setNotice('名字要 1 到 8 個字')
          else commit(next)
        }}
        onImport={(raw) => {
          const result = importSave(raw)
          if (result.save) commit({ ...result.save, savedAt: Date.now() })
          return result.message
        }}
        onReset={() => {
          playingRef.current = false
          setPlaying(false)
          commit(null)
        }}
      />
    </>
  )
}
