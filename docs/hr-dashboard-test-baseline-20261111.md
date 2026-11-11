# 2026-11-11 人資新版整合測試基準比對

## 2026-11-11 晚間登入驗證更新

- 已以超級管理員實際登入正式系統及候選版預覽，雲端人資主檔 87 人，在職 86 人、離職 1 人；離職人員未計入在職數。
- 修正實測發現的共用導覽衝突：人資橫向選單曾被 shared shell 隱藏，且顯示左側工作區。現在保留橫向選單與全寬人資畫面；共用登入逾時及快取程式仍保留。
- 實際開啟：員工資料、離職清單、新增員工表單、組織設定、權限總覽，以及考勤、排班、請假、工時、船舶效率、歷史資料各入口。未提交新增員工、離職、復職或權限變更。
- 實際讀取：考勤當日 46 列班次、71 筆原始打卡；排班 86 人，考勤燈號已同步；請假本月 31 筆。這些為驗證當時的即時值，不是固定展示數字。
- 雲端核對成功後：今日出勤率 74.2%（62 人應到／46 人已打上班卡）、本月核准請假 31 人次、正式加班申報 80.0 小時。未讀齊時維持「—」。
- 修正統計表格繼承員工大表最小寬度造成的欄位裁切；原有重新同步也會更新跨系統統計。
- 修正請假唯讀統計的 endpoint 參數，使用既有完整請假台帳後依月份計算；慢速資料加入最多一次唯讀重試，帳號／日期改變或授權失敗時不重試。
- 人資專項 12/12 通過（新增共用導覽衝突回歸案例）；另含暫時讀取失敗重試與無權限帳號切換驗證。
- 系統入口靜態檢查通過：17 個入口、379 個本機資源；人資組織與儲存回讀測試 14/14 通過；管理同步 21/21、SSO 7/7 通過。
- 目前主分支基準為 `2117c22902614a638cbb38fe6b254e4f1580a82a`，423 個測試、98 個失敗；候選版保留近期司機工作台及離職人員統計修正。
- 全套既有失敗仍存在，不能宣稱全部測試通過，也不能將入口／表單可開啟視為所有正式寫入、一般管理員／員工帳號及跨系統統計均完成驗收。

## 先前結果
- 來源：GitHub Actions 基準比對 [Verify attendance integration regressions against main baseline](https://github.com/kuo-code-tw/smart-punch/actions/runs/43022921042)
- 主分支失敗：99 項；本次新版候選分支失敗：99 項；相對主分支新增失敗：**0 項**。
- 人資專項測試 `tests/hr-reference-dashboard-integrations.cjs` 檢查現有員工、考勤、請假、排班、效率連結及資料核對；尚需以最新 CI 結果和登入後操作確認。
- 此報告只歸類既有失敗，**不是已修復或通過的聲明**。

## 失敗案例依領域歸類

### attendance（2 項）
- `tests/attendance-shift-assessment.cjs`
- `tests/attendance-time-integrity.cjs`

### leave（0 項）

### schedule（23 項）
- `tests/schedule-attendance-first-auto.cjs`
- `tests/schedule-cache-first.cjs`
- `tests/schedule-expand-navigation.cjs`
- `tests/schedule-first-render-speed.cjs`
- `tests/schedule-header-special-labels.cjs`
- `tests/schedule-hidden-roster-preservation.cjs`
- `tests/schedule-manual-start-guard.cjs`
- `tests/schedule-no-punch-rest.cjs`
- `tests/schedule-null-meta-manual-refresh.cjs`
- `tests/schedule-punch-restore.cjs`
- `tests/schedule-reporting-date-panel.cjs`
- `tests/schedule-rest-full-staff-audit.cjs`
- `tests/schedule-rest-remainder-formal-report.cjs`
- `tests/schedule-rest-summary.cjs`
- `tests/schedule-rest-visible-full-audit.cjs`
- `tests/schedule-roster-full-render.cjs`
- `tests/schedule-save-receipt-recovery.cjs`
- `tests/schedule-screen-export-parity.cjs`
- `tests/schedule-transfer-roles.cjs`
- `tests/schedule-typhoon-all-staff-event.cjs`
- `tests/schedule-typhoon-national-dedup.cjs`
- `tests/schedule-typhoon-overtime-count.cjs`
- `tests/schedule-typhoon-separate-count.cjs`

### workhours（5 項）
- `tests/work-hours-official-report-guard.cjs`
- `tests/workhours-change-driven-update.cjs`
- `tests/workhours-missing-conversion-navigation.cjs`
- `tests/workhours-overtime-department-summary.cjs`
- `tests/workhours-rest-all-roles.cjs`

### home（11 項）
- `tests/home-attendance-pages-runtime.cjs`
- `tests/home-early-shift-punch-alert.cjs`
- `tests/home-gate-six-kpi-fully-visible.cjs`
- `tests/home-gate-six-tiles-no-scroll.cjs`
- `tests/home-gate-stats-pagination.cjs`
- `tests/home-gate-view-only-vessel-admin.cjs`
- `tests/home-manual-refresh.cjs`
- `tests/home-pending-overnight-shift.cjs`
- `tests/home-pending-review.cjs`
- `tests/home-people-efficiency-group.cjs`
- `tests/home-public-ship-dialog-contrast.cjs`

### vessel（8 項）
- `tests/dispatch-efficiency-optimize.cjs`
- `tests/dispatch-load-controls.cjs`
- `tests/personnel-group-week.cjs`
- `tests/personnel-statistics.cjs`
- `tests/terminal-bundle-reason-mobile.cjs`
- `tests/terminal-ops-stats.cjs`
- `tests/vessel-persistent-chinese-names.cjs`
- `tests/vessel-read-busy-chinese.cjs`

### other（50 項）
- `tests/collapsible-sections.cjs`
- `tests/dashboard-monthly-quantity-reconciliation.cjs`
- `tests/device-folder-cache.cjs`
- `tests/import-export-chinese-labels.cjs`
- `tests/management-compact-no-duplicate-header.cjs`
- `tests/management-production-wiring.cjs`
- `tests/management-workflow.cjs`
- `tests/management-workspace-isolation.cjs`
- `tests/monthly-personnel-ranking.cjs`
- `tests/monthly-report-batch.cjs`
- `tests/monthly-report-checkbox-state.cjs`
- `tests/monthly-rest-auto-plan-selection.cjs`
- `tests/monthly-rest-confirmed-category.cjs`
- `tests/monthly-rest-cover-all-staff.cjs`
- `tests/monthly-rest-footer-plan-action.cjs`
- `tests/monthly-rest-fresh-unresolved-issues.cjs`
- `tests/monthly-rest-job-filter-local.cjs`
- `tests/monthly-rest-manual-checkbox.cjs`
- `tests/monthly-rest-national-no-punch-reconcile.cjs`
- `tests/monthly-rest-planning-entry.cjs`
- `tests/monthly-rest-report-source-reconcile.cjs`
- `tests/monthly-rest-snapshot-consistency.cjs`
- `tests/monthly-rest-staged-audit.cjs`
- `tests/org-label-settings-close.cjs`
- `tests/overtime-date-status-naming.cjs`
- `tests/overtime-delete-after-amendment.cjs`
- `tests/overtime-edit-action.cjs`
- `tests/overtime-existing-record-controls.cjs`
- `tests/overtime-export-remark-default.cjs`
- `tests/overtime-job-prefill-menu-hover.cjs`
- `tests/overtime-linked-type-form.cjs`
- `tests/overtime-pending-attendance.cjs`
- `tests/overtime-planned-always-visible-close.cjs`
- `tests/overtime-planned-compact-single-row-no-note.cjs`
- `tests/overtime-planned-edit-within-dialog.cjs`
- `tests/overtime-planned-matched-period-save.cjs`
- `tests/overtime-planned-review-action.cjs`
- `tests/overtime-planned-review-original-date.cjs`
- `tests/overtime-planned-separate-section.cjs`
- `tests/overtime-planned-toolbar-toggle.cjs`
- `tests/overtime-roster-reconciliation-all-staff.cjs`
- `tests/overtime-visible-ledger-total.cjs`
- `tests/permissions-chinese-messages.cjs`
- `tests/reference-monthly-dashboard.cjs`
- `tests/rest-review-refresh.cjs`
- `tests/route-management-reference-layout.cjs`
- `tests/route-month-cards.cjs`
- `tests/scope-conversion-roundtrip.cjs`
- `tests/seven-cache-queue.cjs`
- `tests/special-day-overtime.cjs`

## 上線前必要確認
1. 對照正式資料執行權限/身份切換/連結點擊檢查。
2. 考勤與班表時間跨日比對、請假核准、加班申報去重及月結來源核實。
3. 本次以現有系統為範圍：不新增薪資、教育訓練等新模組；考勤、請假、排班、加班僅讀取原有正式資料。
4. 原有 99 項失敗應依風險逐一修復；不要透過跳過測試來假裝綠燈。
