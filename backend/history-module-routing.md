# All-system archived-month lookup (staged change)

**This branch is not a live Apps Script deployment.**

## Intended behavior

- Current month: existing live page and live database continue unchanged.
- Past month: original system selector shows a read-only historical table, keeping the original screen intact.
- Attendance, schedule, vessel: reuse the existing historyGetMonthData endpoint.
- Leave, overtime, workhours, efficiency, shipping, HR, audit and supporting records: use the historyGetArchivedModuleMonth GET endpoint.
- Missing historical archives cause an explicit MISSING_ARCHIVE state, never a fabricated zero row count.
- Historical Sheets can be opened and exported in Excel format; the history center also exports .xlsx.

## Deployment boundary

1. Export the CURRENT live Apps Script code; do not assume the saved V79 is an exact copy.
2. Back up the current Apps Script project.
3. Run: node scripts/apply-gas-history-month-readonly.cjs LIVE_GAS.gs REVIEWED_HISTORY_GAS.gs
4. Review the resulting diff: one new GET route plus the read-only module. No existing handler replacement.
5. Install the reviewed module in the same Apps Script project and deploy a new version of the existing /exec deployment.
6. Verify history permission and per-system permission, including superadmin-only login audit.
7. Verify October archived read and November normal live read, without modifying any source records.

## Important limitations

- October 2026's formal schedule archive is still missing. The 83-row October 28 snapshot is provisional, NOT a final month-end roster.
- Archive snapshots for HR, workhours, efficiency and shipping have not yet been created and verified.
- The oversized attendance and work-hours HTML files are not rewritten. The shared management-workspace script now attaches the history view to their existing month selectors. Their native table/business-rule integration still requires end-to-end verification.
- This change does not install new month-end triggers, delete main-sheet old months or alter the November roster.
- Do not run force month rollover or trim in order to test a read-only endpoint.
- File discovery refuses multiple matching snapshots rather than selecting an arbitrary version.

## CI status

The PR's complete management test suite currently fails at tests/attendance-formal-confirmation-flow.cjs line 14. This test reads an unchanged attendance overtime module, not the archive code, so it is not evidence that the historical feature passed all tests. The new archive permission/paging simulations were run separately.
