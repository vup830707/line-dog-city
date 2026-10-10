import { useEffect, useRef, useState } from 'react'
import { gameConfig } from './config'
import { applyOffline } from './rules/offline'
import { runTicks, spawnVisitor, streetTick } from './rules/street'
import type { SaveV3, Species } from './rules/types'
import { createNewGame } from './game/newGame'
import { clearGame, loadGame, storeGame } from './game/storage'
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
  const next = { ...loaded, street: applied.street, savedAt: Date.now() }
  if (applied.ticks > 0) storeGame(localStorage, next)
  booted = next
  return next
}

export function App() {
  const [save, setSave] = useState<SaveV3 | null>(loadInitial)
  const [notice, setNotice] = useState('')
  const saveRef = useRef(save)
  const pauseRef = useRef(false)
  saveRef.current = save

  function commit(next: SaveV3 | null) {
    booted = next
    saveRef.current = next
    if (next) storeGame(localStorage, { ...next, savedAt: Date.now() })
    else clearGame(localStorage)
    setSave(next)
  }

  useEffect(() => {
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
    const id = window.setInterval(() => {
      if (pauseRef.current) return
      const current = saveRef.current
      if (!current) return
      const next = { ...current, street: streetTick(current.street, gameConfig), savedAt: Date.now() }
      saveRef.current = next
      booted = next
      storeGame(localStorage, next)
      setSave(next)
    }, gameConfig.tickMs)
    return () => {
      window.clearInterval(id)
      delete window.__puppy
    }
  }, [])

  if (!save) {
    return (
      <TitleScreen
        onStart={(input) => {
          try {
            commit(createNewGame({ ...input, now: Date.now() }, gameConfig))
            setNotice('')
          } catch (error) {
            setNotice(error instanceof Error ? error.message : '沒辦法開始')
          }
        }}
      />
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
        onReset={() => commit(null)}
      />
    </>
  )
}
