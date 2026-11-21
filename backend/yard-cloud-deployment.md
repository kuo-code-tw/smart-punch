# 碼頭儲量：真實雲端資料顯示

## 已完成資料救援（2026-11-21）
私人 Google Sheet `PORT79｜碼頭儲量管理資料庫`（ID `1kyWW6WDk_L39b92Wv0uk6MPiVak0gekKpKP-JgTnqsU`）的「每日儲量」從 11/16 歷史備份恢復 2026-11-01 至 11/16 共 16 天、每筆 52 欄原值。保留原始備份，正式索引已補來源。**不能宣稱這是今天即時場存。**

## 為什麼 Windows 仍可能顯示「—」
前端首頁呼叫同一個 Google Apps Script Web App 的 `yardAccountRead`；此前正式 GAS 程式尚未提供可驗證的儲量 read/write 路由。GitHub Pages 更新、Windows 正式 Release 都**不會**自動部署 GAS。

## 安全部署至既有正式 GAS
1. 把 `backend/yard-cloud-store.gs` 加入既有正式 PORT79 Google Apps Script 專案。**不得**建立匿名、公開讀取儲量的 Web App。
2. 在原有 `doPost` JSON 解碼及 action 分派處（請保持其他 action 原狀），加入：
   ```js
   if (parsedData.action === 'yardAccountRead' || parsedData.action === 'yardAccountWrite') {
     try { return jsonOutput(p79YardAccountRequest_(parsedData)); }
     catch (error) { return jsonOutput({ok:false,version:1,error:String(error.message||error)}); }
   }
   ```
3. 保留原本 `gcRequireSystemPermission_()`、`getSpreadsheet_(true)`，以登入 Token 核實 admin/superadmin、效率管理授權以及登入帳號一致。
4. 更新**同一個正式 GAS deployment**版本，保留原先 `script.google.com/macros/s/.../exec` URL。完成後，前端不需要另一個更新按鈕。
5. 用管理員登入 Windows/WebView2，驗證 `yardAccountRead` 回傳 16 筆、`version:1`，最新 `date:'2026-11-16'`；首頁要顯示重櫃 12,320 TEU、空櫃 2,111.25 TEU、容量 19,200／5,350 TEU 並標示「歷史資料（不是今日即時場存）」。
6. 驗證一般員工、不同帳號、無效 Token 均不得取得營運數字。以新 Excel 匯入時，只對相同日期更新並保留其他日期，再重新登入確定跨裝置能讀到新資料。

## 上線風險與回退
- 先保留 GAS 舊部署版本與私有儲量備份。上線不影響其他打卡與排班的 action。
- 不得將 `yard.xlsx` 或復原後原始數字放入公開 GitHub/Windows ZIP。
- 讀取未接通時首頁只說明尚未連線，不捏造數字。
- 目前在這個對話可修改 Google Sheet、GitHub，但**沒有可部署 Apps Script 的連線工具**。所以此模組雖有 Node 模擬測試，仍需由有正式 GAS 編輯權限的人完成第 1～4 步；不能把 PR 合併視為 GAS 已上線。
