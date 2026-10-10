import { useState } from 'react'
import { assetMap } from '../assets/assetMap'
import { PairArt, SpriteThumb } from './art'

export function TitleScreen({
  onStart,
}: {
  onStart: (input: { playerDog: 'white' | 'brown'; whiteName: string; brownName: string }) => void
}) {
  const [playerDog, setPlayerDog] = useState<'white' | 'brown' | null>(null)
  const [whiteName, setWhiteName] = useState('')
  const [brownName, setBrownName] = useState('')
  const [error, setError] = useState('')
  const ready = playerDog != null && whiteName.trim().length > 0 && brownName.trim().length > 0

  return (
    <main className="title-screen">
      <div>
        <p className="eyebrow">奇幻夜市</p>
        <h1>線條小狗模擬城市</h1>
        <PairArt />
        <p className="lede">選一隻當自己的主角，再幫兩隻小狗取名字。牠們會在夜市裡補貨、掃地、招呼自己走進來的小動物。</p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!playerDog || !ready) {
            setError('先選主角，並替兩隻狗取 1 到 8 個字的名字。')
            return
          }
          onStart({ playerDog, whiteName, brownName })
        }}
      >
        <div className="dog-pick">
          <button type="button" data-testid="dog-white" className={playerDog === 'white' ? 'dog-card selected' : 'dog-card'} onClick={() => setPlayerDog('white')}>
            <SpriteThumb sprite={assetMap.crops.temple} />
            <strong>白狗</strong>
            <span>老闆，表情溫和</span>
          </button>
          <button type="button" data-testid="dog-brown" className={playerDog === 'brown' ? 'dog-card selected' : 'dog-card'} onClick={() => setPlayerDog('brown')}>
            <SpriteThumb sprite={assetMap.crops.ichibanPartner} />
            <strong>咖啡色狗</strong>
            <span>搭檔，有點調皮</span>
          </button>
        </div>
        <label className="field" htmlFor="name-white">
          白狗的名字
          <input id="name-white" data-testid="name-white" maxLength={8} value={whiteName} onChange={(event) => setWhiteName(event.target.value)} />
        </label>
        <label className="field" htmlFor="name-brown">
          咖啡色狗的名字
          <input id="name-brown" data-testid="name-brown" maxLength={8} value={brownName} onChange={(event) => setBrownName(event.target.value)} />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" data-testid="start-game" disabled={!ready}>
          開始擺夜市
        </button>
      </form>
    </main>
  )
}
