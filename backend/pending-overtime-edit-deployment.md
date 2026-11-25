# 未正式申報加班預排修改／實際時段核對：部署與驗收

- 兩個加班清單的已儲存未核定預排皆顯示「修改」。尚未出勤、缺卡或時段待核時仍能修改預排。修改後原 ID、日期、員工與原請假關聯不變，仍為 planned:true；不改原班表、不列入正式申報。
- 人員或原請假單的重新指派涉及跨人資料移轉及請假安排，本次先鎖定原關聯。不能藉由修改預排覆蓋其他員工的資料；如有需要，後續須另行驗證原 ID 移轉、代班安排和重複申報防護。
- 有完整配對打卡者可由人工核對實際加班時段。平日延時加班的整段所選加班時段被實際打卡完整涵蓋時，正常班差異不再作為此人工核對的阻擋條件。不放寬自動批次核對、打卡異常及正式申報重複防護。若不屬原請假代班時段，符合原同日歸屬條件的預排可經明確確認改為本人加班，保留原稽核資料。

## 正式發布順序

1. 先通過 PR 的驗證工作流程。保留目前正式前端與 GAS 部署版本。從正式 Apps Script 下載完整 Code.gs。
2. 核對是否已套用既有 adjusted-overtime-review 補丁。如果未套用，先按 backend/adjusted-overtime-review-deployment.md 精確套用，不可直接以片段覆蓋完整 GAS。
3. 執行 `node scripts/apply-gas-pending-overtime-edit.cjs LIVE_Code.gs PATCHED_Code.gs`。任何來源錨點不一致應停止，合併差異後再測。腳本本身不發布。
4. 在隔離環境部署 GAS，以合成資料驗證 getOvertimeReportContext 的 plannedOvertimeEditV1 和 manualOvertimeCoverageV1 均為 true，且前一版 adjustedOvertimeReviewV1 存在。
5. 驗證未出勤未來預排、過去缺卡預排、完整出勤但原班不同、跨日 20–24、代班關聯保留、未完整涵蓋拒絕正式申報、已核定不得改回預排、資料被同事更新後拒絕舊內容。讀回原 ID、planned、日期、時段、實際分鐘及換算時數。
6. 測試成功後更新原正式 GAS Web App 部署、合併前端 PR、確認網頁與 Windows 使用新版本。不得僅開啟能力旗標或用真實員工進行測試寫入。

本次 GitHub 測試分支上傳並不代表正式 GAS 或前端已發布。
