import { assetMap } from '../assets/assetMap'
import { DECOR_ART, STALL_ART } from '../canvas/plaza'
import type { BuildOffer } from '../rules/build'
import { shortfallText } from '../rules/build'
import type { PlaceItem } from '../rules/actions'

const artRoot = import.meta.env.BASE_URL

export function BuildStrip({
  offers,
  tab,
  selectedId,
  onTab,
  onSelect,
  onCancel,
}: {
  offers: BuildOffer[]
  tab: 'stall' | 'decor'
  selectedId: string | null
  onTab: (tab: 'stall' | 'decor') => void
  onSelect: (offer: BuildOffer) => void
  onCancel: () => void
}) {
  const cards = offers.filter((offer) => offer.kind === tab)
  return (
    <section className="build-strip" data-testid="build-strip">
      <div className="build-strip-bar">
        <button type="button" className={tab === 'stall' ? 'on' : ''} data-testid="build-tab-stall" onClick={() => onTab('stall')}>
          攤位
        </button>
        <button type="button" className={tab === 'decor' ? 'on' : ''} data-testid="build-tab-decor" onClick={() => onTab('decor')}>
          裝飾
        </button>
        <button type="button" data-testid="build-cancel" onClick={onCancel}>
          取消
        </button>
      </div>
      <div className="build-cards">
        {cards.map((offer) => {
          const src = offer.kind === 'stall' && offer.stallType ? STALL_ART[offer.stallType].src : offer.decorType ? DECOR_ART[offer.decorType].src : ''
          const item: PlaceItem | null =
            offer.kind === 'stall' && offer.stallType
              ? { kind: 'stall', stallType: offer.stallType }
              : offer.decorType
                ? { kind: 'decor', decorType: offer.decorType }
                : null
          return (
            <button
              key={offer.id}
              type="button"
              className={selectedId === offer.id ? 'build-card selected' : 'build-card'}
              data-testid={`build-${offer.id}`}
              disabled={!offer.affordable}
              aria-pressed={selectedId === offer.id}
              draggable={offer.affordable}
              onClick={() => onSelect(offer)}
              onDragStart={(event) => {
                if (!item) return
                event.dataTransfer.setData('text/plain', JSON.stringify(item))
                event.dataTransfer.effectAllowed = 'copy'
              }}
            >
              <img src={src ? `${artRoot}${src}` : assetMap.phone.coin} alt="" />
              <span className="build-name">{offer.name}</span>
              <span className="build-cost">{offer.gift ? '禮物' : `${offer.cost} 幣`}</span>
              <span className="build-effect">{offer.effect}</span>
              {offer.shortfall > 0 ? (
                <span className="build-shortfall" data-testid={`build-shortfall-${offer.id}`}>
                  {shortfallText(offer.shortfall)}
                </span>
              ) : null}
              {offer.lockReason ? (
                <span className="build-lock" data-testid={`build-lock-${offer.id}`}>
                  鎖 {offer.lockReason}
                </span>
              ) : null}
              {offer.placed ? <span className="build-lock">已經在夜市裡</span> : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
