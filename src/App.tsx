import { useEffect, useRef, useState } from 'react'
import { gameConfig } from './config'
import { createNewGame, nextDay, runTick, skipToClose, startBusiness, type ActionResult } from './game/day'
import { clearGame, loadGame, storeGame } from './game/storage'
import type { Command, SaveV2 } from './rules/types'
import { BusinessScreen } from './ui/BusinessScreen'
import { CityScreen } from './ui/CityScreen'
import { CollectionScreen } from './ui/CollectionScreen'
import { IchibanScreen } from './ui/IchibanScreen'
import { LedgerScreen } from './ui/LedgerScreen'
import { moneyText, partnerName, playerName } from './ui/labels'
import { SettingsScreen } from './ui/SettingsScreen'
import { TitleScreen } from './ui/TitleScreen'

type Screen = 'title' | 'city' | 'business' | 'ledger' | 'collection' | 'ichiban' | 'settings'

export function App() {
  const [save, setSave] = useState<SaveV2 | null>(() => loadGame(localStorage))
  const [screen, setScreen] = useState<Screen>(() => initialScreen(loadGame(localStorage)))
  const [banner, setBanner] = useState('')
  const saveRef = useRef(save)
  saveRef.current = save
  const commandRef = useRef<Command | null>(null)
  const skipRef = useRef(false)
  const phase = save?.phase

  function commit(next: SaveV2, nextScreen?: Screen) {
    const previous = saveRef.current
    storeGame(localStorage, next)
    saveRef.current = next
    setSave(next)
    if (nextScreen) setScreen(nextScreen)
    else if (previous?.phase === 'business' && next.phase === 'ledger') setScreen('ledger')
  }

  function apply(result: ActionResult, nextScreen?: Screen) {
    setBanner(result.message)
    if (result.ok) commit(result.save, nextScreen)
  }

  const commitRef = useRef(commit)
  commitRef.current = commit

  useEffect(() => {
    if (phase !== 'business') return
    skipRef.current = false
    const id = window.setInterval(() => {
      if (skipRef.current) return
      const current = saveRef.current
      if (!current || current.phase !== 'business') return
      const command = commandRef.current
      commandRef.current = null
      commitRef.current(runTick(current, command, gameConfig))
    }, gameConfig.tickMs)
    return () => window.clearInterval(id)
  }, [phase])

  if (!save || screen === 'title') {
    return (
      <div className="app">
        <TitleScreen
          onStart={(input) => {
            try {
              commit(createNewGame({ ...input }, gameConfig), 'city')
              setBanner('夜市的燈籠亮了。')
            } catch (error) {
              setBanner(error instanceof Error ? error.message : '沒辦法開始')
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <strong data-testid="player-name">{playerName(save)}</strong>
          <span className="fine">
            {' '}
            與{partnerName(save)}
          </span>
        </div>
        <div data-testid="money">{moneyText(save.money)}</div>
      </header>
      {banner ? <p className="banner">{banner}</p> : null}
      <main className="main">
        {screen === 'city' ? (
          <CityScreen
            save={save}
            onChange={(next) => commit(next)}
            onAction={apply}
            onStart={() => {
              const result = startBusiness(save, gameConfig)
              apply(result, result.ok ? 'business' : undefined)
            }}
          />
        ) : null}
        {screen === 'business' ? (
          <BusinessScreen
            save={save}
            queueCommand={(command) => {
              commandRef.current = command
              setBanner(command.type === 'boost' ? '下一秒會催餐' : command.type === 'attract' ? '下一秒會招攬這位' : '下一秒會改價')
            }}
            onFastForward={() => {
              const current = saveRef.current
              if (!current) return
              skipRef.current = true
              commit(skipToClose(current, gameConfig), 'ledger')
            }}
          />
        ) : null}
        {screen === 'ledger' ? <LedgerScreen save={save} onAction={apply} onNext={() => commit(nextDay(save, gameConfig), 'city')} /> : null}
        {screen === 'collection' ? <CollectionScreen save={save} /> : null}
        {screen === 'ichiban' ? <IchibanScreen save={save} onChange={(next) => commit(next)} onAction={apply} /> : null}
        {screen === 'settings' ? (
          <SettingsScreen
            save={save}
            onAction={apply}
            onImport={(next) => {
              commit(next, next.phase === 'business' ? 'business' : next.phase === 'ledger' ? 'ledger' : 'city')
              setBanner('存檔讀進來了')
            }}
            onReset={() => {
              clearGame(localStorage)
              saveRef.current = null
              setSave(null)
              setScreen('title')
              setBanner('')
            }}
          />
        ) : null}
      </main>
      <nav className="dock">
        <NavButton current={screen} id="city" label="夜市" onNavigate={setScreen} testId="nav-city" />
        <NavButton current={screen} id="ledger" label="帳本" onNavigate={setScreen} testId="nav-ledger" />
        <NavButton current={screen} id="collection" label="圖鑑" onNavigate={setScreen} testId="nav-collection" />
        <NavButton current={screen} id="ichiban" label="一番賞" onNavigate={setScreen} testId="nav-ichiban" />
        <NavButton current={screen} id="settings" label="設定" onNavigate={setScreen} testId="nav-settings" />
      </nav>
    </div>
  )
}

function NavButton({
  current,
  id,
  label,
  testId,
  onNavigate,
}: {
  current: Screen
  id: Screen
  label: string
  testId: string
  onNavigate: (screen: Screen) => void
}) {
  return (
    <button type="button" data-testid={testId} className={current === id ? 'nav current' : 'nav'} onClick={() => onNavigate(id)}>
      {label}
    </button>
  )
}

function initialScreen(save: SaveV2 | null): Screen {
  if (!save) return 'title'
  if (save.phase === 'business') return 'business'
  if (save.phase === 'ledger') return 'ledger'
  return 'city'
}
