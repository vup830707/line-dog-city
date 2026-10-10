import { gameConfig } from '../config'
import { castWish, wishUnlocked, type ActionResult } from '../game/day'
import type { SaveV2, Weather } from '../rules/types'
import { moneyText, playerName, WEATHER_LABEL } from './labels'

const WISHES: Weather[] = ['sunny', 'hot', 'cold', 'rain']

export function LedgerScreen({
  save,
  onAction,
  onNext,
}: {
  save: SaveV2
  onAction: (result: ActionResult) => void
  onNext: () => void
}) {
  const ledger = save.ledgerHistory[save.ledgerHistory.length - 1]
  if (!ledger) return <p>還沒有帳。先去夜市開一天。</p>
  const share = ledger.playerShare == null ? '今天沒有跟對手搶同一種東西' : `你分到客人的 ${Math.round(ledger.playerShare * 100)}%`
  return (
    <>
      <p className="eyebrow">第 {ledger.day} 天收市</p>
      <h2>{playerName(save)}的帳本</h2>
      <p className="profit" data-testid="ledger-profit">
        利潤 {moneyText(ledger.profit)}
      </p>
      <p data-testid="ledger-income">營收 {moneyText(ledger.totalIncome)}</p>
      <p>成本 {moneyText(ledger.totalExpense)}</p>
      {ledger.wasteValue > 0 ? <p>報廢（已含在進貨成本裡）{moneyText(ledger.wasteValue)}</p> : null}
      <p>充電帶來的加價 {moneyText(ledger.chargerBonus)}</p>
      <p>{share}</p>
      <ul className="ledger-list">
        {ledger.lines.map((line) => (
          <li key={`${line.stall}-${line.label}`}>
            <strong>{line.label}</strong>
            <span>營收 {moneyText(line.income)}</span>
            <span>成本 {moneyText(line.expense)}</span>
            <span>
              服務 {line.served}・流失 {line.lost}
              {line.wasteQty > 0 ? `・報廢 ${line.wasteQty}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {ledger.ichiban ? (
        <p>
          {ledger.ichiban.name} 今天抽了 {ledger.ichiban.drawsToday} 張，營收 {moneyText(ledger.ichiban.incomeToday)}
          ，剩下 {ledger.ichiban.leftover} 張，現在退回大約 {moneyText(ledger.ichiban.refundIfReturned)}。
        </p>
      ) : null}
      {wishUnlocked(save, gameConfig) && save.phase === 'ledger' ? (
        <section className="panel">
          <h3>流星許願池</h3>
          <p>指定明天的天氣，成功率 {Math.round(gameConfig.wishSuccessRate * 100)}%。失敗就照原本的預報。</p>
          {save.wishMessage ? <p>{save.wishMessage}</p> : null}
          <div className="choice-grid">
            {WISHES.map((weather) => (
              <button key={weather} type="button" disabled={save.wishUsed} onClick={() => onAction(castWish(save, weather))}>
                許願：{WEATHER_LABEL[weather]}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {save.phase === 'ledger' ? (
        <button type="button" className="primary" onClick={onNext}>
          進入下一天
        </button>
      ) : (
        <p className="fine">這是最近一次收市的紀錄。</p>
      )}
    </>
  )
}
