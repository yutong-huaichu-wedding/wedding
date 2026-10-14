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

部署後先用兩台手機測試姓名與頭像報到、照片上傳、留言、遊戲與主持人登入，再安排 100 位以上的壓力測試。

相簿會在瀏覽器壓縮照片，單張最多 600 KB、每位賓客最多 4 張；頭像最多 120 KB。伺服器以 D1 的 `media` 表記錄已使用容量，達 1 GB 後拒絕新上傳。R2 bucket 使用 Standard 儲存類別。一般頁面每 60 秒更新一次，遊戲頁每 8 秒、祝福牆每 10 秒、主持人畫面每 3 秒，背景分頁每 120 秒更新一次。這些限制控制儲存量、寫入次數與一般瀏覽的請求量，但不能保證讀取次數永遠不超過免費額度。Cloudflare 的帳單提醒是通知，不是自動停用服務的硬上限。

## 更新網站

先將本機尚未提交的相簿限制修改上傳到 GitHub，再執行 `npm run build` 及 `npx wrangler deploy --config dist/server/wrangler.json`。確認 Cloudflare Workers 正常運作、D1/R2 綁定與主持人密碼已設定後，再把部署分支合併至 `main`，並設定原本 GitHub Pages 網址的轉址。不要在 Worker 就緒前刪除現有 GitHub 首頁。

目前 D1 資料庫、R2 bucket、主持人密碼及 `workers.dev` 網址都已建立。測試網址是 `https://yutong-huaichu-wedding.yutong-huaizhu-1212.workers.dev/wedding_1212.html`。Cloudflare 回報部署成功，但建立網址後立即從此工作環境連線時 TLS 交握失敗，尚未完成瀏覽器實測。上述相簿限制修改目前只在本機，尚未提交或推送至 GitHub，也尚未重新部署。GitHub 的 `main` 仍是舊網站。
