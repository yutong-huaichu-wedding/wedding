# LINE外部瀏覽器與20GB原圖相簿（2026-10-22）

## QR與報到

入席QR：https://yutong-huaichu-wedding.yutong-huaizhu-1212.workers.dev/wedding_1212?openExternalBrowser=1
遊戲QR：https://yutong-huaichu-wedding.yutong-huaizhu-1212.workers.dev/wedding_1212?play=1&openExternalBrowser=1

兩個入口加LINE官方支援的openExternalBrowser=1參數，適用該LINE版本／情境時改用預設瀏覽器。仍停在LINE且尚無報到憑證時，頁頂提示先用Safari／Chrome開啟，附外開連結與右上角選單操作說明。已在LINE報到者不再跳提示，避免誤以為切瀏覽器能自動帶走身分。未傳送憑證到網址，也沒有自動搬移LINE報到資料或接入LINE帳號登入。

請改用QR-code內新版：wedding-qr-ocean.png海洋雙貓入席海報、wedding-qr-only.png入席純QR、wedding-game-qr.png遊戲純QR。public/game-qr.png與public/wedding-qr.png同步更新。舊印刷QR仍是原連結，不能遠端改內容。入席海報／純圖／灰階／600像素海報及遊戲原圖／600／300像素皆以獨立zxing解碼驗證新網址；未實測實體iPhone／Android掃碼行為。

## 相簿

每位報到賓客最多20張（含先前已上傳的照片）；每張選取的原圖最多30MB（程式以1024換算），支援JPG、PNG、WebP、HEIC／HEIF。照片與頭像合計的程式容量上限為20GiB，介面簡稱20GB。R2實際帳務依其GB-month與操作量計費，這次只修改程式，未購買或變更方案。小貓素材仍沿用原有儲存與配額邏輯。

一次可選多張，逐張產生縮圖及上傳，顯示進度、成功數與失敗項目。R2保留瀏覽器交給網頁的原始File位元組，並另存長邊最多1200像素、600KB以下JPEG縮圖；相簿先載縮圖，按「下載原圖」取得原檔及原檔名。瀏覽器若無法解碼HEIC，產生標示用縮圖，原檔仍保存供下載。原本已壓縮的舊照片不會恢復原始畫質，也不重編碼或刪除。

每次顯示最新60張，可按「載入更多」逐次增加60張，最多3000張（150人×20張），主持人照片管理也可載入更多。舊照片沒有新縮圖時，自動用原儲存圖片回退顯示。

## 一致性與清理

沿用既有photos、media、settings，無資料表遷移。上傳先在單一DB交易預留照片名額與原圖＋縮圖容量，photoPending設定讓未寫完的照片不會顯示；避免多人同時讀舊額度而超限。R2使用File/Blob，不在Worker額外轉整張原圖ArrayBuffer；檔案前64 bytes檢查圖片格式，單檔與縮圖大小都由伺服器驗證。

檔案上傳識別碼固定，網路失敗重試不重複新增；成功項目不重送，失敗項目可單獨重試。寫入失敗會釋放資料庫預留及清除已寫的物件；中斷超過30分鐘的預留會在後續上傳時清理，同一逾時識別碼請求回410讓前端換新識別碼重試。刪自己的照片／主持刪任何照片都保留伺服器權限驗證，會一併刪原圖、縮圖與容量紀錄；既有清空示範資料流程也補清縮圖。未執行任何正式站清理。

## 驗證與部署

157項自動測試、TypeScript及正式建置通過。涵蓋21筆同時上傳只准20筆、共享容量剩最後一份只能一筆通過、原圖位元組及中文下載檔名、縮圖分離、原HEIC與預覽不相混、上傳失敗回滾、重複請求不覆蓋已完成照片、過期預留清理、照片150張後仍能載入、原擁有者／主持人刪除權限、多選／失敗重試、LINE提示與外開參數。以上為本地模擬DB與R2測試，未實測正式站壓力。

使用 wedding-external-browser-album-20261022.zip 累積包，將app、lib、public、tests、docs及README依原路徑覆蓋至原GitHub專案，等待既有Cloudflare部署完成，再重新開手機與投影。本次尚未直接部署。請特別確認兩個app/api/photo路由、新photo-album.js/css及browser-entry.js都有上傳，並換用新版QR。
