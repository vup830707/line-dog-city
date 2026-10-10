import { gameConfig } from '../config'
import { buyBox, drawForCollection, refundBox, setDrawPrice, type ActionResult } from '../game/day'
import { refundAmount } from '../rules/ichiban'
import type { SaveV2 } from '../rules/types'
import { moneyText } from './labels'
import { Stepper } from './Stepper'
import { SpriteThumb } from './art'
import { assetMap } from '../assets/assetMap'

export function IchibanScreen({
  save,
  onChange,
  onAction,
}: {
  save: SaveV2
  onChange: (save: SaveV2) => void
  onAction: (result: ActionResult) => void
}) {
  const box = save.activeBox
  return (
    <>
      <p className="eyebrow">自抽的造型才會進圖鑑</p>
      <h2>一番賞</h2>
      <SpriteThumb sprite={assetMap.crops.ichibanPartner} className="sprite-wide" />
      <p>客人抽走的獎品歸客人。你想收藏，就自己抽。重複的小狗換成遊戲幣，剩籤可退回進價的 30%。</p>
      <Stepper
        label="一抽售價"
        min={1}
        max={999}
        value={save.drawPrice}
        onChange={(price) => onChange(setDrawPrice(save, price))}
      />
      {box ? (
        <section className="panel" data-testid="ichiban-box">
          <h3>{box.name}</h3>
          <p>
            剩下 {box.tickets.length} 張・已抽 {box.draws}・這箱營收 {moneyText(box.income)}
            （自抽 {moneyText(box.selfIncome)}，這部分現金是自己付自己）
          </p>
          <p>現在退回可拿 {moneyText(refundAmount(box, gameConfig.refundRate))}</p>
          <table className="odds">
            <thead>
              <tr>
                <th>賞</th>
                <th>獎品</th>
                <th>剩餘</th>
              </tr>
            </thead>
            <tbody>
              {remainingRows(save).map((row) => (
                <tr key={row.label}>
                  <td>{row.grade}</td>
                  <td>{row.label}</td>
                  <td>{row.left}</td>
                </tr>
              ))}
              <tr>
                <td>最後</td>
                <td>{box.lastPrize.label}</td>
                <td>{box.lastPrize.awarded ? '已發出' : '抽完最後一張附贈'}</td>
              </tr>
            </tbody>
          </table>
          <button type="button" data-testid="self-draw" onClick={() => onAction(drawForCollection(save, gameConfig))}>
            自己抽一張（{save.drawPrice} 幣）
          </button>
          <button type="button" className="ghost" onClick={() => onAction(refundBox(save, gameConfig))}>
            退回剩籤
          </button>
        </section>
      ) : (
        <div className="choice-grid">
          {gameConfig.ichiban.boxes.map((def) => (
            <button key={def.id} type="button" data-testid={`buy-${def.id}`} onClick={() => onAction(buyBox(save, def.id))}>
              買「{def.name}」
              <br />
              {moneyText(def.wholesale)}・{def.prizes.reduce((sum, prize) => sum + prize.count, 0)} 抽
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function remainingRows(save: SaveV2): { grade: string; label: string; left: number }[] {
  const box = save.activeBox
  if (!box) return []
  const def = gameConfig.ichiban.boxes.find((item) => item.id === box.boxId)
  const labels = def?.prizes ?? []
  return labels.map((prize) => ({
    grade: prize.grade,
    label: prize.label,
    left: box.tickets.filter((ticket) => ticket.label === prize.label && ticket.grade === prize.grade).length,
  }))
}
