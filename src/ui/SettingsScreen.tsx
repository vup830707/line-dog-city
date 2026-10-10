import { useState } from 'react'
import { renameDogs, type ActionResult } from '../game/day'
import { parseSave, serializeSave } from '../rules/save'
import type { SaveV2 } from '../rules/types'

export function SettingsScreen({
  save,
  onAction,
  onImport,
  onReset,
}: {
  save: SaveV2
  onAction: (result: ActionResult) => void
  onImport: (save: SaveV2) => void
  onReset: () => void
}) {
  const [whiteName, setWhiteName] = useState(save.names.white)
  const [brownName, setBrownName] = useState(save.names.brown)
  const [error, setError] = useState('')

  return (
    <>
      <h2>設定</h2>
      <label className="field" htmlFor="rename-white">
        白狗的名字
        <input id="rename-white" value={whiteName} maxLength={8} onChange={(event) => setWhiteName(event.target.value)} />
      </label>
      <label className="field" htmlFor="rename-brown">
        咖啡色狗的名字
        <input id="rename-brown" value={brownName} maxLength={8} onChange={(event) => setBrownName(event.target.value)} />
      </label>
      <button type="button" onClick={() => onAction(renameDogs(save, whiteName, brownName))}>
        儲存名字
      </button>
      <button
        type="button"
        onClick={() => {
          const blob = new Blob([serializeSave(save)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `puppy-city-day-${save.day}.json`
          link.click()
          URL.revokeObjectURL(url)
        }}
      >
        匯出存檔
      </button>
      <label className="file-button">
        匯入存檔
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            void file.text().then((text) => {
              try {
                onImport(parseSave(text))
                setError('')
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : '讀不了這個存檔')
              }
            })
          }}
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button type="button" className="ghost" onClick={onReset}>
        清除存檔，重新開始
      </button>
    </>
  )
}
