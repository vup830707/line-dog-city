# 線條小狗模擬城市

給自己和朋友玩的奇幻夜市經營遊戲。第一版是單人、可離線安裝的 PWA，沒有後端。

企劃在 [docs/plan.md](docs/plan.md)，這一版怎麼切在 [docs/mvp-implementation.md](docs/mvp-implementation.md)。

兩隻小狗是原創線條角色。「線條小狗」和「模擬城市」都是別人的名稱，現在只私下玩；若要公開發布，需要先改名。

## 本地

```bash
npm ci
npm run dev
```

瀏覽器開 `http://127.0.0.1:5173`。正式包：

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

`npm run build` 會順便檢查 `dist` 裡有沒有 manifest 和 service worker。端到端：

```bash
npx playwright install chromium
npm run test:e2e
```

可調的數字都在根目錄 `config.json`。規則在 `src/rules/`，是純函式。畫面用的圖先裁概念圖，對照表在 `src/assets/assetMap.ts`，之後換成 AI 成圖只改那一張表。

存檔在瀏覽器的 `localStorage`（鍵名 `puppy-city-save`，目前是第 2 版）。設定裡可以匯出、匯入 JSON。

## 免費靜態空間（私人倉庫）

這一版沒有接上任何托管。下面都是免費方案，私人 GitHub 倉庫也可以用前三個。

| 方案 | 適合 | 限制 |
|---|---|---|
| Cloudflare Pages | 私人倉庫、免費額度大方、自帶 HTTPS | 要有 Cloudflare 帳號；建置指令用 `npm run build`，輸出目錄 `dist` |
| Vercel | 和 Vite 很合，預覽每個 commit | 免費方案有商業使用與頻寬上限；私人倉庫可以，但要登入 Vercel |
| Netlify | 同上，拖曳 `dist` 也能先試 | 免費方案有頻寬與建置分鐘數；表格單等功能這遊戲用不到 |
| GitHub Pages | 不用再註冊別的服務 | 免費版通常要公開倉庫才好用；私人倉庫的 Pages 依方案可能要付費，所以若預算是零，要嘛把倉庫改成公開，要嘛用上面三個 |

都是靜態檔，不需要伺服器。PWA 的 service worker 需要 HTTPS（本機 `localhost` 除外），這四個都有。
