# PORT79 Gate 進出站櫃量匯入：正式資料庫與部署

## 正式 Google 試算表（已建立）

https://docs.google.com/spreadsheets/d/19umma1xq4XCLm68Wzkk-OvcRkKdZ1V88x238djXNiHc/edit

- 「每日進出站」：日期、月份、年度、交空、領空、交重、領重、總櫃量、進站拖車車次、來源。
- 「每月累計」及「年度累計」：使用 QUERY 公式動態加總每日資料，新增或修正日期時同步重算。
- 「匯入紀錄」：記錄來源檔、日期範圍、新增／更新日期數。
- 已寫入 gate.xlsx 2026/11/01～11/06 六天，交空 1124、領空 995、交重 2736、領重 1680、總櫃 6535、進站拖車 5344 車次。每日期均已和原表小計核對。

## 使用者匯入入口（GitHub Pages 前端）

首頁「最新匯入船舶」小卡片 →「進出站櫃量」→「匯入 Gate Excel」。
入口為 /gate-import/；支援 xlsx、xls、csv，會合併 ITT 與 Non ITT，讀取第 15 列「本日進站卡車數」，核對原檔當天交櫃、領櫃、總櫃合計，預覽後按「確認寫入正式資料庫」。
按日期 upsert，相同日期覆寫而不重複加總。可下載整理 CSV 作為備援。私有櫃量不寫在公開 GitHub 原始碼。

## 尚需完成的 Google Apps Script 正式後端部署

注意：GitHub Pages 發佈與 GAS 正式後端部署是兩件事，只有完成下列步驟，網站匯入才會真正儲存到雲端。

1. 開啟正式 PORT79 Google Apps Script 專案並備份。新增 backend/gate-stats-daily-import.gs 的完整內容。
2. 確認 GAS 執行帳號對上面的私有 Google Sheet 有編輯權限；不要開放公開編輯。
3. 在既有 doGet(e) 完成 action 和 params 解析後，加上 gateStatsReadYear 路由：

    if (action === 'gateStatsReadYear') {
      try { return jsonOutput(p79GateStatsReadYear_(params)); }
      catch(err) { return jsonOutput({ok:false,error:String(err.message||err)}); }
    }

4. 在既有 doPost(e) 完成 action 和 params=e.parameter||{} 解析後，加上 gateStatsImport 路由：

    if (action === 'gateStatsImport') {
      try { return jsonOutput(p79GateStatsImport_(params)); }
      catch(err) { return jsonOutput({ok:false,error:String(err.message||err)}); }
    }

5. 保留現有 doGet/doPost 其他路由、getSpreadsheet_(true)、gcRequireSystemPermission_、jsonOutput 及原本部署網址；不要覆蓋整個程式。
6. 「部署 → 管理部署 → 原有 Web App → 編輯 → 新版本 → 部署」。
7. 登入 PORT79、查詢 2026 年度 gateStatsReadYear，核對六天資料。重新匯入相同 gate.xlsx 時應新增 0、更新 6，總數仍 6535 櫃、5344 車次。
8. POST 若遇 CORS 或重導向無法確認是否成功，不得假稱已儲存；先查看私有 Google Sheet 當日資料，再修正連線。

## 後端尚未部署期間的可用替代方式

可在匯入頁預覽並下載已整理的 CSV，再開啟正式 Google Sheet 的「每日進出站」工作表，按照日期新增或修正資料。相同日期請修改既有那一列，不要再加新列。「每月累計／年度累計」公式會自動重新計算。

## 安全

唯有具有歷史資料檢視權限的管理員可讀；寫入要求 superadmin，或具有歷史及船舶編輯權限的 admin。LockService 避免同時寫入衝突，並檢查數字、日期和重複列。拖車計數代表進站車次，不是不重複車輛數。
