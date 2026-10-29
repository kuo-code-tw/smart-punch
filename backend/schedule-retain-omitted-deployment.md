# Monthly save retention — 2026-10-29

The existing production Apps Script Web App was updated from version 72 to 73.
API version: `2026.10.29.V64-SCHEDULE-RETAIN-OMITTED`.

The prior frontend preservation could only retain rows visible in its read response.
The authoritative server month may contain additional historical or scoped-out staff.
Those missing IDs caused the overtime history omission guard to reject unrelated edits.

Changes in the existing `syncSchedules_` implementation:

1. Validate the original submitted count and normalize submitted rows as before.
2. Read `before = readScheduleMonthOnly_(ss,month)||[]` inside the existing POST ScriptLock.
3. Call `normalized=p79ScheduleRetainOmittedRows_(before,normalized)` using the adjacent helper file.
4. Run the existing leave integrity guard and overtime history planner on the retained rows.
5. Pass `{schedules:plan.rows,expectedEmployeeCount:plan.rows.length}` to `p79WriteSchedulesWithoutHistory_`.

The empty-request, duplicate-ID, permissions, edit-lock, leave and overtime-history guards remain enabled.
No production leave, cover or attendance records were deleted. Ordinary monthly sync is not an employee/history deletion operation.

Targeted local tests reproduce the missing-employee rejection and validate preserved report/history JSON, fresh server-only rows, unchanged inputs, case-normalized IDs and duplicate rejection. They also cover the earlier linked-date and hidden-roster frontend fixes. These tests do not constitute production schedule write/readback verification.
