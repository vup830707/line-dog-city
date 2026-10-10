import { gameConfig } from '../config'
import { ownedCount, isWishPondUnlocked } from '../rules/collection'
import type { SaveV2 } from '../rules/types'
import { FigureArt } from './art'

export function CollectionScreen({ save }: { save: SaveV2 }) {
  const ids = gameConfig.figures.map((figure) => figure.id)
  const owned = ownedCount(save.collection, ids)
  const unlocked = isWishPondUnlocked(save.collection, ids)
  return (
    <>
      <p className="eyebrow">第一套・奇幻夜市</p>
      <h2>圖鑑</h2>
      <p data-testid="collection-progress">
        {owned} / {ids.length}
        {unlocked ? '。流星許願池已解鎖。' : '。集滿就能開流星許願池。'}
      </p>
      <div className="collection-grid">
        {gameConfig.figures.map((figure) => {
          const count = save.collection[figure.id] ?? 0
          return (
            <article key={figure.id} className={count > 0 ? 'figure owned' : 'figure locked'}>
              <FigureArt figureId={figure.id} name={figure.name} />
              <h3>{count > 0 ? figure.name : '？？？'}</h3>
              <p>{count > 0 ? figure.blurb : '還沒抽到'}</p>
              <p className="fine">
                {figure.grade} 賞{count > 0 ? '・已收藏' : ''}
              </p>
            </article>
          )
        })}
      </div>
      {save.decorations.length > 0 ? <p>裝飾：{save.decorations.includes('lantern') ? '夜市燈籠' : save.decorations.join('、')}</p> : null}
    </>
  )
}
