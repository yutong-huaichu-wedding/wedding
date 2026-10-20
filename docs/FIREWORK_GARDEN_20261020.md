# 雙貓點煙火・百花齊放（2026-10-20）

## 這次調整

- 以使用者提供的兩隻橘白貓照片為角色參考，製作戴黑領結、一起點燃海洋藍煙火的 Q 版插圖，取代純文字發射按鈕。插圖具透明背景，網頁版 WebP 為 480 × 240，約 49 KB；圖檔已含在更新包，不需另行下載或上傳使用者原照。
- 每朵煙火在起飛時先保留一塊空位，飛往該位置並在原處綻放。後續煙火優先選與現有祝福距離較遠的空位，不再把全部文字集中於畫面中央。
- 寬投影依可用尺寸最多 3 欄 × 2 列，同時呈現六份祝福。一般桌面預覽與較小投影減少欄列；窄手機保留一欄，以閱讀為優先。空位在整段升空與閱讀期間都被保留，不會讓別朵煙火覆蓋。
- 點小貓每次增加一筆待發射需求。空間滿時仍可點擊排隊，顯示剩餘數量；最多容納 120 筆待發射，滿額時暫停接受新點擊。點擊升空中的煙火仍可提早綻放。
- 同批較早綻放的祝福會等後續煙火到齊，再共同保留閱讀時間：至少 6.5 秒，100 字祝福至少約 12.7 秒；同時顯示越多則會再延長時間，之後才一起淡出。文字會依空位調整字級，保留完整內容。當一批都讀完，約空 1.4 秒後再接下一批，不會快速蓋掉尚未讀完的內容。
- 自動播放會依序補入不同位置。新祝福優先、同時顯示時不重複同一則；輪播仍涵蓋整份清單，不只重複前幾則。換活動、分頁隱藏或螢幕轉向時停止舊動畫，保留待發射與中斷的祝福，恢復時繼續。

手機和電腦仍共用原本雲端祝福清單，各畫面的動畫、點擊與排隊各自進行。手機主持人仍可控制投影切換至煙火牆、小貓或麻將；不會由賓客點擊遠端控制另一台電腦的煙火。

## 上線

本包 wedding-firework-cats-garden-20261020.zip 已含之前海洋配色、樂透祝福與小貓載入修正。解壓縮，把 app、lib、public、tests、docs 資料夾上傳到原 GitHub 根目錄覆蓋並提交；不要只上傳 ZIP。等 Cloudflare 部署完成後，手機和電腦關閉舊分頁，再重新進入。

不需重新上傳影片，不調整資料庫或儲存空間。沿用賓客、留言、照片、彩券、登入與固定投影網址。已比對 GitHub main 8bc78a8 的上一版更新檔，與本地先前交付來源一致。

## 驗證

80 項自動測試通過。投影首次啟用時先顯示畫面，再量測可用空間，避免隱藏容器造成錯誤的單欄配置。

自動測試包含六個不重疊空位、不同高度與左右座標、自動填滿六格、連點 50 次全部播放、每則完整停留、每批之間的空檔、前九筆涵蓋九位不同賓客、100 字內容完整顯示與延長時間、手機單欄排隊、新留言優先、刪除不再展示、背景／活動切換／螢幕轉向保留隊伍，以及原網站功能回歸。另執行 TypeScript 與正式建置。

互動測試使用可控時鐘與模擬 DOM，未在實際手機、投影瀏覽器完成視覺驗證。部署後請試短祝福與 100 字祝福，確認投影比例、文字大小及小貓按鈕位置。

## 圖案來源與生成說明

使用內建 imagegen 產生。輸入圖片僅用於兩隻橘白貓的角色特徵，不保留背景人物、拍照機台與螢幕內容。

專案資產：`public/firework-cats-v1.webp`，網頁依既有資源路徑載入。

生成提示：

> Use case: illustration-story. Project-bound asset: transparent cutout mascot for an elegant ocean-blue wedding website firework launch button. Use the two orange-and-white cats in the supplied image only as character references: preserve two distinct cute orange tabby and white cats, their white muzzles and chests, pink noses, green-gold eyes, and black bow ties. Draw BOTH cats together as charming polished chibi mascots with oversized rounded heads, short plush bodies and neat expressive faces, modern clean hand-drawn illustration with warm fine outlines and soft restrained shading, no photorealism. They cooperate to light ONE small decorative blue-and-pearl firework rocket standing between them; one cat holds a tiny glowing sparkler touching the fuse, the other excitedly presents the rocket. Joyful wedding mood. Both entire cats including ears/paws/tails and whole rocket visible; compact wide horizontal composition, roughly 2:1 silhouette, generous transparent padding around the group. Must remain readable when rendered about 170 px wide. Transparent background, no background scenery, no floor, no words or lettering or logo, no button border. No people, screen, thumbs or camera equipment from reference. Make this a reusable web UI illustration.
