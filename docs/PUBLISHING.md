# 婚禮網站上線方式

查核日期：2026/10/15。此處將「上限」理解為「上線」。

2026/10/15 晚間核對：GitHub `main` 最新為 `5b14072`，已包含網站主要功能與小貓素材；正式入口目前也能開啟原 Worker 的小貓頁。本機補充的交接文件、影片測試與素材處理工具整理於 `codex/cat-meme-handoff` 分支，尚未合入 `main` 或重新部署。正式網站的影片上傳試播與現場投影仍待驗收。

## 現在最快：沿用原本能部署的電腦／Codex

把完整修改檔交給原本已登入 Cloudflare 的 Codex，請它：

> 將這份修改與婚禮專案最新版比對整合，測試及建置通過後，更新原本的 Cloudflare Worker，並把程式碼送回原 GitHub 儲存庫。保留正式賓客、相片、留言、彩券、問答紀錄、既有 D1／R2 綁定、主持人密碼與分享入口。不執行清空、重設、重建或資料庫初始化。不要把主持人密碼或登入憑證寫進 GitHub。完成後回報實際的提交及部署結果。

原專案已具備更新指令。由有權限的人在完成整合的專案資料夾中執行：

```bash
npm ci
npm test
npx tsc --noEmit
npm run deploy
```

`npm run deploy` 會先建置，再用 `dist/server/wrangler.json` 更新網站。電腦須使用 Node.js 22.13 以上，且已登入正確 Cloudflare 帳號；未登入時，先由帳號持有人執行 `npx wrangler login`。

本次功能沒有新增資料表，不需要執行 D1 遷移或首次建站步驟。

## 日後方便：在 Cloudflare 連接 GitHub 自動更新

這是 Cloudflare 與 GitHub 的連接，不需要安裝 ChatGPT 的 GitHub 外掛。這項設定尚未替你操作。

1. 先將本次修改與最新版整合，保存到 `yutong-huaichu-wedding/wedding` 儲存庫。
2. 登入 Cloudflare，進入「Workers & Pages」，選原本的 `yutong-huaichu-wedding` Worker。
3. 進入「Settings → Builds → Connect」，授權正確的 GitHub 儲存庫。
4. 設定以下內容：

| 項目 | 本專案使用內容 |
| --- | --- |
| 儲存庫 | `yutong-huaichu-wedding/wedding` |
| 正式分支 | `main` |
| 專案目錄 | 根目錄（`/`） |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy --config dist/server/wrangler.json` |
| Worker 名稱 | `yutong-huaichu-wedding`，與設定檔一致 |
| Node.js | 22.13 以上 |

5. 確認建置／部署成功。之後正式分支的新提交可觸發自動更新。

第一次連接可能執行建置或部署，因此先確認選的是原 Worker、正確儲存庫與已整合的分支。若你希望每次都先人工檢查，可先使用儲存版本的部署方式；這項進階設定交給部署者依 Cloudflare 官方文件處理。

## 保留原網站與資料

- 沿用同一個 Worker、同一份 D1 資料庫、同一個 R2 相簿空間。
- 現有分享入口 `https://yutong-huaichu-wedding1212.pages.dev/` 繼續轉到原 Worker，無須更改或重印 QR Code。
- 主持人密碼保留在原 Worker 的 Secret，不放在 GitHub、壓縮檔或聊天訊息。
- 本次只更新程式及內建小貓素材，不執行資料清除、重設測驗或重開樂透。
- 上線後先唯讀確認首頁、照片顯示與主持人登入；遊戲操作先用試玩模式。正式多人同步驗收另安排測試時段。
- 小貓題庫的自訂內容仍存在主持人電腦。換電腦、瀏覽器或網址前，先匯出題庫；到現場用同一份備份匯入。
- 質問貓原音目前待補，不應在婚禮前誤認為已備妥。

## 官方說明

- 更新原 Worker 的命令：https://developers.cloudflare.com/workers/wrangler/commands/workers/
- 原 Worker 連接 GitHub：https://developers.cloudflare.com/workers/ci-cd/builds/
- 建置與部署設定：https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- 主持人密碼等 Secret：https://developers.cloudflare.com/workers/configuration/secrets/
