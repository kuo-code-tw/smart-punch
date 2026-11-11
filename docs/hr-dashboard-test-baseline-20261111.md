# 2026-11-11 人資新版整合測試基準比對

## 結果
- 來源：GitHub Actions 基準比對 [Verify attendance integration regressions against main baseline](https://github.com/kuo-code-tw/smart-punch/actions/runs/43022921042)
- 主分支失敗：99 項；本次新版候選分支失敗：99 項；相對主分支新增失敗：**0 項**。
- 新的人資專項測試 `tests/hr-reference-dashboard-integrations.cjs` 通過 11/11（模擬資料）；尚無登入後完整的瀏覽器端對接驗收。
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
3. 薪資與訓練需要正式後端資料表、寫入授權與審計流程，不可把暫存試算誤認為正式記錄。
4. 原有 99 項失敗應依風險逐一修復；不要透過跳過測試來假裝綠燈。
