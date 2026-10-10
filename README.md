# 動物夜市

給自己和朋友玩的奇幻夜市。這一版是電腦瀏覽器上的放置經營：小動物自己走進來，金幣拿去佈置街道。單人、可離線安裝的 PWA，沒有後端。

企劃在 [docs/plan.md](docs/plan.md)，這一版怎麼切在 [docs/mvp-implementation.md](docs/mvp-implementation.md)。

兩隻小狗是原創線條角色。遊戲名稱是「動物夜市」。

## 本地

```bash
npm ci
npm run dev
```

瀏覽器開 `http://127.0.0.1:5173`，用整個視窗玩。正式包：

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

## 線上

公開站：https://vup830707.github.io/line-dog-city/

推上 `main` 會跑 [`.github/workflows/pages.yml`](.github/workflows/pages.yml)：`npm ci`、單元測試、再用 `VITE_BASE=/line-dog-city/` 執行 `npm run build`，把 `dist` 部署到 GitHub Pages。Actions 頁也可以手動跑同一個 workflow。端到端測試只在本機跑，不進 CI。

本機開發不要設 `VITE_BASE`，站點在根路徑。要預覽跟線上一樣的子路徑：

```bash
VITE_BASE=/line-dog-city/ npm run build
npx vite preview --host 127.0.0.1 --port 4173 --base /line-dog-city/
```

瀏覽器開 `http://127.0.0.1:4173/line-dog-city/`。`npm run test:e2e` 也是用這組指令。
