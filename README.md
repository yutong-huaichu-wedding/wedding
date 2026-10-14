# 宇童 ♡ 懷筑｜婚禮網站

這個分支準備取代原本 GitHub Pages 的單一 `index.html` 網站。原版保留在 Git 提交 `aa6d00a`。新網站包含賓客報到、頭像、婚禮相簿、祝福彈幕、快問快答、大樂透與主持人控制台。

## 架構

- GitHub：保存程式碼。
- Cloudflare Workers：執行網站與 API。
- Cloudflare D1：保存賓客、留言、題目、答題與彩券。
- Cloudflare R2：保存賓客上傳的照片與頭像。

GitHub Pages 無法單獨執行本專案的 API。完成 Workers 部署後，可把 GitHub Pages 原網址轉址到 Workers 網址；此分支尚未設定轉址，避免在 Worker 上線前中斷原網站。

## 首次部署（Cloudflare 帳號持有人執行）

1. 使用 Node.js 22.13 以上，執行 `npm ci`。
2. 執行 `npx wrangler login`，登入你的 Cloudflare 帳號。
3. 建立 D1：`npx wrangler d1 create yutong-huaichu-wedding`。把回傳的 `database_id` 填入 `wrangler.jsonc`，取代全 0 的測試 ID。
4. 建立 R2：`npx wrangler r2 bucket create yutong-huaichu-wedding-photos`。
5. 依序執行：
   - `npx wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0000_cold_namorita.sql`
   - `npx wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0001_yielding_magus.sql`
6. 執行 `npm run build`，接著執行 `npx wrangler deploy --config dist/server/wrangler.json`。
7. 執行 `npx wrangler secret put ADMIN_PASSWORD --name yutong-huaichu-wedding`，在提示時輸入一組新的強密碼。密碼不要提交到 GitHub。

部署後先用兩台手機測試姓名與頭像報到、照片上傳、留言、遊戲與主持人登入，再安排 100 位以上的壓力測試。婚禮當天建議使用 Workers Paid，並在 Cloudflare 控制台設定費用提醒。

## 更新網站

本分支已推送至 GitHub。確認 Cloudflare Workers 正常運作、D1/R2 綁定與主持人密碼已設定後，再把部署分支合併至 `main`，並設定原本 GitHub Pages 網址的轉址。不要在 Worker 就緒前刪除現有 GitHub 首頁。

目前已完成本機編譯並上傳 GitHub；尚未登入使用者的 Cloudflare 帳號，也尚未建立該帳號內的 D1/R2 資源或部署正式網站。
