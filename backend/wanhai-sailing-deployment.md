# PORT79 自訂 Google 船期看板（不再抓萬海網站）

## Google 船期表（已建立）
https://docs.google.com/spreadsheets/d/1AjgCs8QvADWYjJeWzJCEDsUaKtKlflNTI4ZQEK14Ipo/edit

「船期資料」第 1 列為固定欄位，從第 2 列開始填寫真實船期。表格保持私有，請不要設定成公開分享。
欄位：英文船名、中文船名、進港航次、出港航次、ETA 預計抵港、ETB 預計靠泊、ETD 預計離港、靠泊碼頭、船期狀態、備註、最後更新。

## Apps Script 最後一次更新（需已登入正式專案的人完成）
1. 開啟目前正式使用的「79號碼頭智慧系統」Apps Script，先備份原本的程式。
2. 點之前新增的 wanhai-sailing-readonly.gs，將整個檔案內容替換為 GitHub 的 backend/wanhai-sailing-readonly.gs 新版內容。
3. 原本程式碼.gs 內的 doGet(e) 不需要修改！已有 wanHaiSailingSchedule 路由會呼叫同名 p79WanHaiSailingGet_ 函式。
4. 按 Ctrl+S，點「部署 → 管理部署 → 原部署 → 編輯（鉛筆）→ 新版本 → 部署」。保留原先 Web App URL、執行身分及安全設定。
5. GAS 執行帳號必須對新 Google 船期表有檢視權限；若和 Google 表格建立者不同，只將表格分享給該執行帳號，不要對所有人公開。
6. 在 Google 表格填入已確認船期，回 PORT79 首頁按「↻ 手動更新」。

## 功能與範圍
- 首頁更名為「自訂船期看板」；支援查看全部與 Google 表格編輯連結。
- 讀取表格中的 ETA、ETB、ETD、靠泊碼頭、中文／英文船名及進出港航次。
- 首次進入頁面讀取一次；後續只有按手動更新才會重讀，不做背景輪詢。
- 仍使用既有登入與船舶檢視權限；不修改考勤、排班、船舶作業歷史。
- 不會抓萬海的 HTML、圖片、JSON 或 Eways_GetVesselSchedule。
- Google Sheet 與 GitHub 首頁已更新，但不能將 GitHub Pages 部署當成正式 GAS 已更新。