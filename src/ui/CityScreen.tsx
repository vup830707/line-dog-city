import { useState } from 'react'
import { gameConfig } from '../config'
import {
  clearSlot,
  describeOpening,
  forecastDemand,
  patchDraft,
  placeStall,
  unlockSlot,
  upgradeFortune,
  wishUnlocked,
  type ActionResult,
} from '../game/day'
import type { SaveV2, StallType } from '../rules/types'
import { calendarInfo } from '../rules/weather'
import { PlaceholderThumb } from './art'
import { moneyText, productName, stallName, WEATHER_LABEL } from './labels'
import { Stepper } from './Stepper'

const ORDER: StallType[] = ['ice', 'can', 'charge', 'fortune', 'ichiban', 'wish']

export function CityScreen({
  save,
  onChange,
  onAction,
  onStart,
}: {
  save: SaveV2
  onChange: (save: SaveV2) => void
  onAction: (result: ActionResult) => void
  onStart: () => void
}) {
  const [selected, setSelected] = useState<number | null>(0)
  const calendar = calendarInfo(save.day, gameConfig)
  const opening = describeOpening(save, gameConfig)
  const nextCost = save.slotsUnlocked < gameConfig.maxSlots ? gameConfig.slotCosts[save.slotsUnlocked] : null
  const selectedType = selected == null ? null : save.placement[selected]

  return (
    <>
      <section className="panel">
        <p className="eyebrow">
          第 {save.day} 天
          {calendar.festival ? `・${calendar.festival}` : calendar.weekend ? '・週末' : '・平日'}
        </p>
        <h2>開市前</h2>
        <p>
          預報 <strong>{WEATHER_LABEL[save.forecast]}</strong>
          ，大約八成會準。實際天氣等開市才知道。
        </p>
        <p>
          今日流行夢境：
          {save.trending.map((id) => (
            <span key={id} className="chip">
              {productName(id)}
            </span>
          ))}
        </p>
        <RivalYesterday save={save} />
      </section>

      <div className="slot-list">
        {save.placement.slice(0, gameConfig.maxSlots).map((type, index) => {
          const locked = index >= save.slotsUnlocked
          return (
            <button
              key={index}
              type="button"
              data-testid={`slot-${index}`}
              className={selected === index ? 'slot selected' : 'slot'}
              disabled={locked}
              onClick={() => setSelected(index)}
            >
              <span>第 {index + 1} 格</span>
              <strong>{locked ? '尚未擴張' : type ? stallName(type) : '空位'}</strong>
            </button>
          )
        })}
      </div>
      {nextCost != null ? (
        <button type="button" className="ghost" onClick={() => onAction(unlockSlot(save, gameConfig))}>
          擴張下一格（{moneyText(nextCost)}）
        </button>
      ) : null}

      {selected != null && selected < save.slotsUnlocked ? (
        <section className="panel">
          {selectedType == null ? (
            <>
              <h3>這個格子擺什麼？</h3>
              <div className="choice-grid">
                {ORDER.map((type) => {
                  if (type === 'wish' && !wishUnlocked(save, gameConfig)) return null
                  const art = gameConfig.stallLabels[type]
                  const accent =
                    type === 'ice' ? '#e7a0c4' : type === 'can' ? '#7eb6e0' : type === 'charge' ? '#f0d35a' : '#f0b27a'
                  return (
                    <button
                      key={type}
                      type="button"
                      data-testid={`place-${type}`}
                      className="choice"
                      onClick={() => onChange(placeStall(save, selected, type, gameConfig))}
                    >
                      <PlaceholderThumb label={art} accent={accent} />
                      <span>{stallName(type)}</span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <StallEditor
              save={save}
              type={selectedType}
              onChange={onChange}
              onAction={onAction}
              onClear={() => onChange(clearSlot(save, selected))}
            />
          )}
        </section>
      ) : null}

      <p className="fine">{opening.message ?? `今天預付 ${moneyText(opening.cost)}，開市後才看得到實際天氣。`}</p>
      <button type="button" className="primary" data-testid="start-day" disabled={opening.message != null} onClick={onStart}>
        開始營業
      </button>
    </>
  )
}

function RivalYesterday({ save }: { save: SaveV2 }) {
  if (save.rivalMemory.stalls.length === 0) return <p>對手還沒出過攤。</p>
  return (
    <p>
      對手昨天：
      {save.rivalMemory.stalls.map((stall) => (
        <span key={`${stall.kind}:${stall.productId}`} className="chip">
          {productName(stall.productId)} {stall.price} 幣
        </span>
      ))}
    </p>
  )
}

function StallEditor({
  save,
  type,
  onChange,
  onAction,
  onClear,
}: {
  save: SaveV2
  type: StallType
  onChange: (save: SaveV2) => void
  onAction: (result: ActionResult) => void
  onClear: () => void
}) {
  return (
    <>
      <h3>{stallName(type)}</h3>
      {type === 'ice'
        ? gameConfig.iceCream.flavors.map((flavor) => (
            <div key={flavor.id} className="stack">
              <Stepper
                label={`${flavor.name}${save.trending.includes(flavor.id) ? '（今日流行）' : ''} 進貨`}
                min={0}
                max={30}
                value={save.draft.iceQty[flavor.id] ?? 0}
                onChange={(qty) => onChange(patchDraft(save, { iceQty: { ...save.draft.iceQty, [flavor.id]: qty } }))}
              />
              <Stepper
                label={`${flavor.name} 售價`}
                min={1}
                max={999}
                value={save.draft.icePrices[flavor.id] ?? gameConfig.iceCream.referencePrice}
                onChange={(price) =>
                  onChange(patchDraft(save, { icePrices: { ...save.draft.icePrices, [flavor.id]: price } }))
                }
              />
              <p className="fine">
                照預報大約 {Math.round(forecastDemand(save, 'ice', flavor.id, save.draft.icePrices[flavor.id] ?? 55))}{' '}
                位客人。沒賣完會融化。
              </p>
            </div>
          ))
        : null}
      {type === 'can'
        ? gameConfig.cans.types.map((can) => {
            const match = gameConfig.cans.match[save.forecast] === can.id
            return (
              <div key={can.id} className="stack">
                <Stepper
                  label={`${can.name}罐${match ? '（預報對應）' : ''} 進貨`}
                  min={0}
                  max={40}
                  value={save.draft.canQty[can.id] ?? 0}
                  onChange={(qty) => onChange(patchDraft(save, { canQty: { ...save.draft.canQty, [can.id]: qty } }))}
                />
                <p className="fine">倉庫裡還有 {save.cans[can.id] ?? 0} 罐，上限 {gameConfig.cans.warehouseCap}。</p>
                <Stepper
                  label={`${can.name}罐 售價`}
                  min={1}
                  max={999}
                  value={save.draft.canPrices[can.id] ?? gameConfig.cans.referencePrice}
                  onChange={(price) =>
                    onChange(patchDraft(save, { canPrices: { ...save.draft.canPrices, [can.id]: price } }))
                  }
                />
              </div>
            )
          })
        : null}
      {type === 'charge' ? (
        <>
          <p>不用進貨。每次充電電費 {gameConfig.charger.electricCost}，同時 {gameConfig.charger.capacity} 位。</p>
          <p>充完的客人到左右鄰攤會多花 20%，到其他攤多花 5%。</p>
          <Stepper
            label="充電售價"
            min={1}
            max={999}
            value={save.draft.chargePrice}
            onChange={(chargePrice) => onChange(patchDraft(save, { chargePrice }))}
          />
        </>
      ) : null}
      {type === 'fortune' ? (
        <>
          <p>算力 Lv{save.fortuneLevel || '—'}。人多但要付電費，隊伍最長 12 人，等太久會走。</p>
          {save.fortuneLevel < 3 ? (
            <button type="button" onClick={() => onAction(upgradeFortune(save, gameConfig))}>
              {save.fortuneLevel === 0 ? '付開攤費' : '升級算力'}{' '}
              {moneyText(gameConfig.fortune.levels[save.fortuneLevel]?.upgradeCost ?? 0)}
            </button>
          ) : (
            <p>算力已滿。</p>
          )}
          <Stepper
            label="算命售價"
            min={1}
            max={999}
            value={save.draft.fortunePrice}
            onChange={(fortunePrice) => onChange(patchDraft(save, { fortunePrice }))}
          />
        </>
      ) : null}
      {type === 'ichiban' ? (
        <p>到「一番賞」買箱子、自抽或退回剩籤。一抽目前 {save.drawPrice} 幣。箱子還有 {save.activeBox?.tickets.length ?? 0} 張。</p>
      ) : null}
      {type === 'wish' ? (
        <>
          <p>不用進貨。收市後可以許一次願，試著指定明天的天氣。</p>
          <Stepper
            label="許願售價"
            min={1}
            max={999}
            value={save.draft.wishPrice}
            onChange={(wishPrice) => onChange(patchDraft(save, { wishPrice }))}
          />
        </>
      ) : null}
      <button type="button" className="ghost" onClick={onClear}>
        這個格子空出來
      </button>
    </>
  )
}
