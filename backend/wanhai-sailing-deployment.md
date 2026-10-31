# PORT79 自訂 Google 船期看板（不再抓萬海網站）

## Google 船期表（已建立）
https://docs.google.com/spreadsheets/d/1AjgCs8QvADWYjJeWzJCEDsUaKtKlflNTI4ZQEK14Ipo/edit

「船期資料」第 1 列為固定欄位，從第 2 列開始填寫真實船期。表格保持私有，請不要設定成公開分享。
欄位：英文船名、中文船名、進港航次、出港航次、ETA 預計抵港、ETB 預計靠泊、ETD 預計離港、靠泊碼頭、船期狀態、備註、最後更新。

## Apps Script 最後一次更新（需已登入正式專案的人完成）
1. 開啟目前正式使用的「79號碼頭智慧系統」Apps Script，先備份原本的程式。
2. 點之前新增的 wanhai-sailing-readonly.gs，將整個檔案內容替換為 GitHub 的 backend/wanhai-sailing-readonly.gs 新版內容。
3. 在 `程式碼.gs` 的 `function doGet(e)` 裡，找到原先的 `if (action === 'wanHaiSailingSchedule')` 區塊（原本約 10 行 try/catch），**只替換此區塊**，其餘函式保持不變：

```javascript
if (action === 'wanHaiSailingSchedule') {
  return p79ShipScheduleOutput_(params);
}
```

   此函式在新版 `wanhai-sailing-readonly.gs` 中，正常狀態回 JSON，跨網域失敗時使用只讀 JS callback 備援；登入權限驗證仍在。
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
## 備援通道的安全限制
- Google Apps Script 的 ContentService 會重導向；部分瀏覽器可能無法直接 fetch 其跨網域 JSON，因此首頁在一般連線失敗時改用該 GAS 同一個網頁應用程式、需要有效 PORT79 登入 token 的只讀 callback。
- 僅針對「船期」這一個 action；不能用此通道修改人員、考勤、排班資料。
- 備援回應不包含 Google 船期表的自由文字「備註」欄位，以降低暴露風險。
- 如 GAS Web App 完全不允許這個瀏覽器載入，就仍可能失敗；不能因此把原本整個系統任意改成公開存取。
- **即使連線成功，表格仍須先填入船期；目前建立的船期表尚無正式資料列。**
