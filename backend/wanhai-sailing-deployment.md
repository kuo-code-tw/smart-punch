# PORT79 首頁：讀取萬海網站實際船期

目標來源（固定、不可從請求任意替換）：
https://khhtml.wanhai.com/web/SailingScheduleList

## 前端已完成
- 首頁「萬海網站船期」直接以外部網站的船名／航次／ETA／ETD／碼頭／狀態填表，不使用 PORT79 船舶完工紀錄假裝船期。
- 使用既有登入中的 `port79_gas_url` 對 Google Apps Script 送 `action=wanHaiSailingSchedule`，後端回傳原網站 HTML，前端用 DOMParser 讀可識別表格。
- 未取得表格時顯示失敗及原站入口，**絕不顯示捏造船期**。
- 首次進入首頁載入一次，之後按「↻ 手動更新」才重讀，不開啟 setInterval。
- 沒有任何新寫入考勤、排班、船舶正式資料庫的操作。

## 還需要啟用的後端步驟（不可略過）
GitHub Pages 只是靜態前端。因萬海網站可能不提供 CORS，**須在正在使用的 Google Apps Script 正式部署**唯讀橋接，否則前端只能嘗試直接 CORS 並可能失敗。

1. 從**實際正在運作、最新版** PORT79 Apps Script 專案完整匯出程式並備份。不要使用較舊的 `PORT79_GAS_V73.gs` 直接覆蓋目前正式系統。
2. 若是合併成單一 `.gs` 主檔，執行：
   `node scripts/apply-gas-wanhai-sailing.cjs LIVE_Code.gs PATCHED_Code.gs`
   工具會只在 `doGet` 注入固定路由、附加 `backend/wanhai-sailing-readonly.gs`；有多個錨點或已裝過時會拒絕更動。
   若專案採多檔案，可新增 `backend/wanhai-sailing-readonly.gs` 至同一 GAS 專案，並在現行 `doGet`（取得 action 後）插入：
   `if(action==='wanHaiSailingSchedule'){try{return jsonOutput(p79WanHaiSailingGet_(params));}catch(e){return jsonOutput({ok:false,error:String(e.message||e)});}}`
3. 保留現有部署執行身分與存取權限，**只更新現有 Web App 部署版本**；不要建立公開匿名資料代理或更動現有登入與資料庫路由。
4. 以具 `history.view` 與 `history.vessel.view` 的已登入帳號，在同一個既有 GAS 網址讀 `action=wanHaiSailingSchedule`；核對來源網址、HTTP 狀態及返回 HTML 是否有真正的船期表格。
5. 在首頁按「手動更新」，確認顯示與萬海原站一致的船名、航次、日期，且 0 筆／被擋時不顯示假資料。以沒有權限的帳號驗證拒絕。
6. 如果來源網站內容是前端 JavaScript 動態呼叫 API 才會出現表格（GAS 回來的 HTML 只有空框），需先取得**確實使用中的來源資料端點與授權方式**，才能修改解析器。此程式沒有假設或杜撰萬海的內部 API。

## 注意
部署 GitHub Pages 不能自動更新 Apps Script 正式版本；Repo 的 `.gs` 檔只代表**已備妥補丁**，不能聲稱正式後端已上線。
