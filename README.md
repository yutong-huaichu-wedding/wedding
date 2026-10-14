# 宇童 ♡ 懷筑｜婚禮網站

這個網站已取代原本 GitHub Pages 的單一 `index.html` 網站。原版保留在 Git 提交 `aa6d00a`。新網站包含賓客報到、頭像、婚禮相簿、祝福彈幕、快問快答、大樂透與主持人控制台。

## 架構

- GitHub：保存程式碼。
- Cloudflare Workers：執行網站與 API。
- Cloudflare D1：保存賓客、留言、題目、答題與彩券。
- Cloudflare R2：保存賓客上傳的照片與頭像。

GitHub Pages 無法單獨執行本專案的 API。根目錄的 `index.html` 會把原網址 `https://yutong-huaichu-wedding.github.io/wedding/` 轉到 Cloudflare Workers。婚禮 QR Code 指向 GitHub Pages 原網址，以便將來更換 Workers 網址時不用重印。

對外分享的免費短入口為 `https://yutong-huaichu-wedding1212.pages.dev/`，其原始碼在 `short-url/index.html`。這是 Cloudflare Pages 的靜態轉址頁，訪客進站後瀏覽器會顯示較長的 Workers 網址；所有互動與資料仍由原本的 Worker、D1 與 R2 處理。已產生的 QR Code 仍指向 GitHub Pages 原網址，繼續可用。若日後更改 Worker 網址，需同步修改 `short-url/index.html` 與根目錄 `index.html`。

## 首次部署（Cloudflare 帳號持有人執行）

1. 使用 Node.js 22.13 以上，執行 `npm ci`。
2. 執行 `npx wrangler login`，登入你的 Cloudflare 帳號。
3. 建立 D1：`npx wrangler d1 create yutong-huaichu-wedding`。把回傳的 `database_id` 填入 `wrangler.jsonc`，取代全 0 的測試 ID。
4. 建立 R2：`npx wrangler r2 bucket create yutong-huaichu-wedding-photos`。
5. 依序執行：
   - `npx wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0000_cold_namorita.sql`
   - `npx wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0001_yielding_magus.sql`
6. 執行 `npm run build`，接著執行 `npx wrangler deploy --config dist/server/wrangler.json`。
7. 執行 `npx wrangler secret put ADMIN_PASSWORD --name yutong-huaichu-wedding`，在提示時設定主持人密碼。密碼不要提交到 GitHub。

部署後先用兩台手機測試姓名與頭像報到、照片上傳、留言、遊戲與主持人登入，再安排 100 位以上的壓力測試。

相簿會在瀏覽器壓縮照片，單張最多 600 KB、每位賓客最多 4 張；頭像最多 120 KB。伺服器以 D1 的 `media` 表記錄已使用容量，達 1 GB 後拒絕新上傳。R2 bucket 使用 Standard 儲存類別。一般頁面每 60 秒更新一次，遊戲頁每 8 秒、祝福牆每 10 秒、主持人畫面每 3 秒，背景分頁每 120 秒更新一次。這些限制控制儲存量、寫入次數與一般瀏覽的請求量，但不能保證讀取次數永遠不超過免費額度。Cloudflare 的帳單提醒是通知，不是自動停用服務的硬上限。

## 更新網站

修改網站後，在專案資料夾執行 `npm run build`，接著執行 `npx wrangler deploy --config dist/server/wrangler.json` 來更新 Cloudflare 網站。程式碼要另外提交並推送至 GitHub。若更改 Cloudflare 網址，也要更新根目錄 `index.html` 的轉址目標。

目前 D1 資料庫、R2 Standard bucket、主持人密碼及 `workers.dev` 網址都已建立。網站網址是 `https://yutong-huaichu-wedding.yutong-huaizhu-1212.workers.dev/wedding_1212`。GitHub 的 `main` 已換成轉址首頁。QR 圖檔放在上一層婚禮資料夾：`婚禮報到_QR.png` 與 `婚禮報到_QR.svg`。

## 現場畫面與操作

| 功能 | 賓客手機 | 主持人控制台 | 現場投影 |
| --- | --- | --- | --- |
| 快問快答 | 等待出題；開放時點選 A–D，一人每題只能答一次；截止後看正確答案及自己的累計分數。 | 編輯與排序題庫，按「公布下一題／開啟作答」及「停止作答／顯示答案」，查看得分排行榜。 | 顯示目前題目與選項。 |
| 幸福大樂透 | 開放時從 1–49 選六碼並送出一張彩券；截止後保留自己的號碼；開獎時逐顆看到號碼及六碼全中者。 | 依序開放、截止、開獎；看有效彩券與投注名單。開獎會從已送出的完整彩券中抽一張。 | 逐顆顯示開出的六碼，最後顯示得獎者。 |
| 祝福牆 | 送出祝福、瀏覽留言與緩慢飄過的彈幕。 | 查看或刪除留言，開啟祝福牆投影。 | 祝福與姓名、頭像以彈幕飄過。 |

主持人在控制台按「試玩模式」，可在自己的分頁操作快問快答與大樂透，右側同步顯示賓客手機畫面的模擬版。試玩不寫入 D1，也不會出現在正式賓客或投影畫面；關閉試玩後模擬資料清空。投影畫面須由主持人電腦連接現場螢幕，再從控制台開啟。
