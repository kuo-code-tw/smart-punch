# 完全相同考勤編號安全修復 V1

- 網頁只在完整正式月份讀回的每個欄位一致、兩個員工識別欄位一致、原時間及上下班一致且同月時，送出新專用 action。舊 GAS 不認得 action 時不退回一般修改，保留草稿。
- GAS 必須由管理者匯出**目前實際部署的完整原始碼**，使用 `node scripts/apply-gas-attendance-identical-edit-v1.cjs current.gs patched.gs`。先驗證測試環境的授權、ScriptLock / UserLock 實作、工作表路由、備份及回讀，再更新既有 Web App deployment。此 GitHub 專案不直接部署 GAS。
- 僅最高管理員且具考勤管理權可執行；所有實際列同一工作表且完整原始/顯示欄位一致、無公式，備份後只移除重複實體列，不呼叫整筆 ID 刪除或全表清理。使用原有 editRecord_ 與回讀確認。遇到不一致、跨月或權限不足，保留待傳。
- 正式部署完成後重新開啟考勤，舊重複暫停項目重新讀回；只有獲得專用確認或正常正式讀回一致才完成。尚未確認前勿清除本機待傳或手動刪除共用 ID。

## 2026-11-26 待同步復原

先取得目前正式 GAS Web App 原始碼（不是舊備份），依序執行：

    node scripts/apply-gas-attendance-identical-edit-v1.cjs current.gs step1.gs
    node scripts/apply-gas-attendance-lock-wait.cjs step1.gs patched.gs
    node --check < patched.gs

如已有任一補丁，檢查版本及精確錨點，勿重覆安裝。將 patched.gs 套入相同 GAS 專案並建立新版本、更新原 Web App deployment。正式 pingPost 應回傳 attendanceIdenticalEditVersion: 1。未部署前前端不再反覆重送不支援的修復 action；連續雲端忙碌的舊佇列每 15 分鐘最多重新嘗試一次、保留原始 CAS、修改草稿與累計次數。真正不同的重複打卡仍不得自動合併。後端仍保留 ScriptLock；須查 Apps Script 執行紀錄才能確認長時間占鎖的作業。部署後用正式月份讀回驗證每筆原始紀錄及修改結果，不可用清空佇列代替修復。
