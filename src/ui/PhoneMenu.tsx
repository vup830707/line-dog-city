import { useState } from 'react'
import { assetMap } from '../assets/assetMap'
import { ANIMAL_ART } from '../canvas/plaza'
import { FIGURE_SRC, PRODUCT_SRC } from '../assets/growthArt'
import { gameConfig } from '../config'
import { assignJob, hireBlock, hireStaff, trainBlock, trainStaff } from '../rules/actions'
import { restockStaffWarning } from '../rules/staff'
import { isWishPondUnlocked, ownedCount } from '../rules/collection'
import { affinityPoints, heartFills } from '../rules/affinity'
import { ambienceScore } from '../rules/ambience'
import { shownWeather } from '../rules/events'
import { levelRow, nextLevelRow } from '../rules/market'
import type { Job, SaveV3, Species, Weather } from '../rules/types'
import { festivalName, forecastLine } from '../rules/weather'
import { JOB_LABEL, PHASE_LABEL, WEATHER_LABEL } from './labels'

const artRoot = import.meta.env.BASE_URL

export type PhoneApp = 'staff' | 'collection' | 'letters' | 'settings' | 'market'

const APPS: { id: PhoneApp | 'build'; label: string; icon: string }[] = [
  { id: 'build', label: '建造', icon: assetMap.phone.apps.build },
  { id: 'staff', label: '員工', icon: assetMap.phone.apps.staff },
  { id: 'collection', label: '圖鑑', icon: assetMap.phone.apps.collection },
  { id: 'letters', label: '信件', icon: assetMap.phone.apps.letters },
  { id: 'settings', label: '設定', icon: assetMap.phone.apps.settings },
  { id: 'market', label: '夜市等級', icon: assetMap.phone.apps.market },
]

export function PhoneCharm({
  badge,
  reduceMotion,
  open,
  onClick,
}: {
  badge: boolean
  reduceMotion: boolean
  open: boolean
  onClick: () => void
}) {
  return (
    <span className="phone-charm-anchor">
      <img className={reduceMotion ? undefined : 'sway'} src={assetMap.phone.charm} alt="" />
      <button
        type="button"
        className="phone-charm"
        data-testid="phone-charm"
        aria-label={open ? '關閉手機' : '打開手機'}
        aria-pressed={open}
        onClick={onClick}
      />
      {badge ? <span className="phone-badge" data-testid="phone-badge" onClick={onClick} /> : null}
    </span>
  )
}

export function PhoneOverlay({
  closing,
  app,
  save,
  unread,
  reduceMotion,
  onClose,
  onBack,
  onBuild,
  onOpenApp,
  onChange,
  onRename,
  onImport,
  onNotice,
  onAskReset,
  onReduceMotion,
  onClosed,
}: {
  closing: boolean
  app: PhoneApp | null
  save: SaveV3
  unread: number
  reduceMotion: boolean
  onClose: () => void
  onBack: () => void
  onBuild: () => void
  onOpenApp: (app: PhoneApp) => void
  onChange: (save: SaveV3) => void
  onRename: (white: string, brown: string) => void
  onImport: (raw: string) => string | null
  onNotice: (text: string) => void
  onAskReset: () => void
  onReduceMotion: (on: boolean) => void
  onClosed: () => void
}) {
  const screen = assetMap.phone.screen
  const weather = shownWeather(save.street)
  return (
    <div className="phone-layer">
      <button type="button" className="phone-scrim" data-testid="phone-scrim" aria-label="關閉手機" onClick={onClose} />
      <div
        className={closing ? 'phone closing' : 'phone'}
        data-testid="phone"
        role="dialog"
        aria-label="手機"
        style={{ ['--phone-ratio' as string]: String(gameConfig.phoneHeightRatio) }}
        onClick={(event) => event.stopPropagation()}
        onAnimationEnd={() => {
          if (closing) onClosed()
        }}
      >
        <div
          className="phone-screen"
          style={{
            left: `${screen.left * 100}%`,
            top: `${screen.top * 100}%`,
            right: `${screen.right * 100}%`,
            bottom: `${screen.bottom * 100}%`,
          }}
        >
          <div className="phone-status" data-testid="phone-status">
            <span>{PHASE_LABEL[save.street.phase]}</span>
            <span className="phone-weather">
              <img src={assetMap.phone.weather[weather]} alt="" />
              {WEATHER_LABEL[weather]}
            </span>
          </div>
          <div className="phone-body">
            {app == null ? (
              <div className="phone-apps">
                {APPS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`phone-app-${item.id}`}
                    onClick={() => (item.id === 'build' ? onBuild() : onOpenApp(item.id))}
                  >
                    <img src={item.icon} alt="" />
                    <span>
                      {item.label}
                      {item.id === 'letters' && unread > 0 ? <i data-testid="letters-unread">{unread}</i> : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <button type="button" className="phone-back" data-testid="phone-back" onClick={onBack}>
                  返回
                </button>
                {app === 'staff' ? <StaffApp save={save} onChange={onChange} onNotice={onNotice} /> : null}
                {app === 'collection' ? <CollectionApp save={save} /> : null}
                {app === 'letters' ? <LettersApp save={save} /> : null}
                {app === 'settings' ? (
                  <SettingsApp
                    save={save}
                    reduceMotion={reduceMotion}
                    onRename={onRename}
                    onImport={onImport}
                    onNotice={onNotice}
                    onAskReset={onAskReset}
                    onReduceMotion={onReduceMotion}
                  />
                ) : null}
                {app === 'market' ? <MarketApp save={save} /> : null}
              </>
            )}
          </div>
          <button type="button" className="phone-home" data-testid="phone-home" onClick={onClose}>
            關閉
          </button>
        </div>
        <img className="phone-frame" src={assetMap.phone.frame} alt="" />
      </div>
    </div>
  )
}

function StaffApp({
  save,
  onChange,
  onNotice,
}: {
  save: SaveV3
  onChange: (save: SaveV3) => void
  onNotice: (text: string) => void
}) {
  return (
    <div className="phone-panel" data-testid="staff-panel">
      {restockStaffWarning(save.street) ? (
        <p className="restock-warning" data-testid="restock-warning">
          {restockStaffWarning(save.street)}
        </p>
      ) : null}
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

function CollectionApp({ save }: { save: SaveV3 }) {
  const [tab, setTab] = useState<'figures' | 'animals' | 'products'>('figures')
  const [species, setSpecies] = useState<Species | null>(null)
  const figureIds = gameConfig.figures.map((figure) => figure.id)
  const unlocked = isWishPondUnlocked(save.street.collection, figureIds)
  const tabs = [
    ['figures', '造型'],
    ['animals', '動物'],
    ['products', '商品'],
  ] as const
  return (
    <div className="phone-panel" data-testid="collection-panel">
      <div className="codex-tabs">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'on' : ''} data-testid={`codex-tab-${id}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'figures' ? (
        <>
          <p data-testid="collection-progress">
            {ownedCount(save.street.collection, figureIds)} / {figureIds.length}
            {unlocked ? '。流星許願池已解鎖。' : '。集滿就能開流星許願池。'}
          </p>
          <div className="collection-grid">
            {gameConfig.figures.map((figure) => {
              const owned = (save.street.collection[figure.id] ?? 0) >= 1
              const src = FIGURE_SRC[figure.id]
              return (
                <article key={figure.id}>
                  {owned && src ? <img src={`${artRoot}${src}`} alt="" /> : null}
                  <h3>{owned ? figure.name : '？？？'}</h3>
                  <p>{owned ? figure.blurb : '還沒抽到'}</p>
                </article>
              )
            })}
          </div>
        </>
      ) : null}
      {tab === 'animals' ? (
        <div className="collection-grid" data-testid="codex-animals">
          {gameConfig.species.map((item) => {
            const seen = save.street.seenSpecies.includes(item.id)
            const hearts = seen ? heartFills(save.street.affinity[item.id] ?? 0, gameConfig.affinityLetters) : []
            return (
              <button key={item.id} type="button" data-testid={`codex-animal-${item.id}`} onClick={() => setSpecies(item.id)}>
                {seen ? <img src={`${artRoot}${ANIMAL_ART[item.id].src}`} alt="" /> : null}
                <span>{seen ? item.name : '？？？'}</span>
                {seen ? <AffinityHearts species={item.id} fills={hearts} affinity={save.street.affinity[item.id] ?? 0} /> : null}
              </button>
            )
          })}
          {species ? <CodexAnimal save={save} species={species} /> : null}
        </div>
      ) : null}
      {tab === 'products' ? (
        <div className="collection-grid" data-testid="codex-products">
          {Object.values(gameConfig.products)
            .flat()
            .map((item) => {
              const seen = save.street.seenProducts.includes(item.id)
              const src = PRODUCT_SRC[item.id]
              return (
                <article key={item.id}>
                  {seen && src ? <img src={`${artRoot}${src}`} alt="" /> : null}
                  <h3>{seen ? item.name : '？？？'}</h3>
                  <p>{seen ? `${item.price} 幣` : '還沒看過'}</p>
                </article>
              )
            })}
        </div>
      ) : null}
    </div>
  )
}

function CodexAnimal({ save, species }: { save: SaveV3; species: Species }) {
  const spec = gameConfig.species.find((item) => item.id === species)
  const favourite = spec ? Object.values(gameConfig.products).flat().find((item) => item.id === spec.product) : undefined
  const known = spec ? save.street.seenProducts.includes(spec.product) : false
  const letters = save.street.letters.filter((letter) => letter.species === species)
  const affinity = save.street.affinity[species] ?? 0
  const progress = save.street.affinityProgress[species] ?? 0
  const points = affinityPoints(affinity, progress, gameConfig.affinityStride)
  const fills = heartFills(points, gameConfig.affinityLetters)
  const top = gameConfig.affinityLetters[gameConfig.affinityLetters.length - 1] ?? 1
  const meter = Math.max(0, Math.min(1, points / top))
  return (
    <article className="codex-detail" data-testid="codex-animal-card">
      <h3>{spec?.name}</h3>
      <AffinityHearts species={species} fills={fills} affinity={affinity} />
      <p data-testid={`affinity-count-${species}`}>好感 {affinity}</p>
      <p data-testid={`affinity-progress-${species}`}>
        滿意的光顧 {progress}/{Math.max(1, gameConfig.affinityStride)}
      </p>
      <span className="affinity-meter" data-testid={`affinity-meter-${species}`}>
        <i style={{ width: `${Math.round(meter * 100)}%` }} />
      </span>
      <p>最愛 {known && favourite ? favourite.name : '？'}</p>
      <p>滿意度 {Math.round((save.street.speciesSatisfaction[species] ?? 0) * 100)}</p>
      {letters.length === 0 ? <p>還沒有留下信。</p> : letters.map((letter) => <p key={letter.id}>{letter.body}</p>)}
    </article>
  )
}

function AffinityHearts({ species, fills, affinity }: { species: Species; fills: number[]; affinity: number }) {
  return (
    <span className="hearts" data-testid={`affinity-${species}`} data-affinity={affinity}>
      {fills.map((fill, index) => (
        <i key={index} className={fill >= 1 ? 'on' : undefined}>
          {fill >= 1 ? '♥' : '♡'}
        </i>
      ))}
    </span>
  )
}

function LettersApp({ save }: { save: SaveV3 }) {
  const empty = save.street.letters.length === 0 && save.street.eventLog.length === 0
  return (
    <div className="phone-panel" data-testid="letter-panel">
      {empty ? <p>還沒有信件。</p> : null}
      {save.street.letters.map((letter) => (
        <article key={letter.id} className="letter-sheet" data-testid="letter-card" style={{ backgroundImage: `url(${assetMap.phone.letterPaper})` }}>
          <h3>{gameConfig.species.find((item) => item.id === letter.species)?.name}</h3>
          <p>{letter.body}</p>
        </article>
      ))}
      {save.street.eventLog.map((note) => (
        <article key={note.id} className="letter-sheet" data-testid="event-note" style={{ backgroundImage: `url(${assetMap.phone.letterPaper})` }}>
          <h3>{note.title}</h3>
          <p>{note.body}</p>
        </article>
      ))}
    </div>
  )
}

function SettingsApp({
  save,
  reduceMotion,
  onRename,
  onImport,
  onNotice,
  onAskReset,
  onReduceMotion,
}: {
  save: SaveV3
  reduceMotion: boolean
  onRename: (white: string, brown: string) => void
  onImport: (raw: string) => string | null
  onNotice: (text: string) => void
  onAskReset: () => void
  onReduceMotion: (on: boolean) => void
}) {
  const [white, setWhite] = useState(save.whiteName)
  const [brown, setBrown] = useState(save.brownName)
  return (
    <div className="phone-panel" data-testid="settings-panel">
      <form
        className="rename"
        onSubmit={(event) => {
          event.preventDefault()
          onRename(white, brown)
        }}
      >
        <label>
          白狗的名字
          <input data-testid="rename-white" value={white} maxLength={8} onChange={(event) => setWhite(event.target.value)} />
        </label>
        <label>
          咖啡色狗的名字
          <input data-testid="rename-brown" value={brown} maxLength={8} onChange={(event) => setBrown(event.target.value)} />
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
      <label className="reduce-motion">
        <input
          type="checkbox"
          data-testid="reduce-motion"
          checked={reduceMotion}
          onChange={(event) => onReduceMotion(event.target.checked)}
        />
        減少動態效果
      </label>
    </div>
  )
}

function productName(id: string | undefined): string {
  if (!id) return '還沒決定'
  return Object.values(gameConfig.products).flat().find((item) => item.id === id)?.name ?? id
}

function MarketApp({ save }: { save: SaveV3 }) {
  const festival = festivalName(save.street.day, gameConfig)
  const weather = shownWeather(save.street)
  const tonight = save.street.nightEvent
  const eventLine = tonight
    ? save.street.eventLog.find((note) => note.day === tonight.day && note.kind === tonight.kind)?.title ?? '今晚有一件小事'
    : '今晚還沒有小事'
  const row = levelRow(save.street.marketLevel, gameConfig)
  const next = nextLevelRow(save.street.marketLevel, gameConfig)
  const span = next ? Math.max(1, next.bustleXp - row.bustleXp) : 1
  const gained = Math.max(0, save.street.bustleXp - row.bustleXp)
  const ratio = next ? Math.min(1, gained / span) : 1
  const unlocks = next
    ? [
        ...next.stalls.filter((id) => !save.street.slots.some((slot) => slot?.stallType === id)).map((id) => gameConfig.stallLabels[id]),
        ...next.decors.map((id) => gameConfig.decorLabels[id]),
      ]
    : []
  return (
    <div className="phone-panel" data-testid="market-panel">
      <p data-testid="market-level">夜市 Lv.{save.street.marketLevel}</p>
      <p data-testid="market-xp">
        累積熱鬧度 {save.street.bustleXp}
        {next ? ` / ${next.bustleXp}` : ''}
      </p>
      <div className="xp-bar" data-testid="market-xp-bar">
        <span style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <p data-testid="market-next">{next ? `下一級：${unlocks.join('、') || '更多格子'}，格子 ${next.slots}` : '夜市已經滿級'}</p>
      <p data-testid="market-day">
        第 {save.street.day} 天・{PHASE_LABEL[save.street.phase]}
      </p>
      <p className="market-weather" data-testid="market-weather">
        <img src={assetMap.phone.weather[weather]} alt="" />
        {WEATHER_LABEL[weather as Weather]}
      </p>
      <p data-testid="market-festival">{festival ? `節日 ${festival}` : '今天沒有節日'}</p>
      <p data-testid="market-event">{eventLine}</p>
      <p data-testid="market-forecast">{forecastLine(save.street.pendingWeather, WEATHER_LABEL)}</p>
      <p data-testid="market-bustle">熱鬧度 {ambienceScore(save.street, gameConfig)}</p>
      <p data-testid="market-limited">今夜限定 {productName(save.street.trending[0])}</p>
    </div>
  )
}
