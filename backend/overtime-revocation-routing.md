# Overtime revocation audit integration

Use the existing Apps Script Web App and its current permissions. Do not publish the full project source.

1. Add `overtime-revocation-audit.gs` helpers.
2. Replace the existing `p79DeleteOvertimeAssignment_` with `overtime-revocation-delete-route.gs`. The unchanged existing deletion planner is retained in `overtime-revocation-delete-plan.gs` for regression tests; do not add a duplicate definition.
3. In `getScheduleDataSecure_`, add `overtimeRevocationVersion:1` to the normal response and `cached.overtimeRevocationVersion=1` to the cached response. Only advertise this capability after all helpers and the route are installed.
4. In `p79PlanDirectReport_`, after validating request.id and before editing metadata, call `p79AssertOvertimeReportNotRevoked_(next,request.id)` so old pending requests cannot resurrect a revoked ID. A new report must have a new ID.
5. Keep the existing POST schedule/workhours permission checks, employee scope checks, ScriptLock, edit lease and revision verification unchanged.
6. Deploy a new version of the existing deployment. Frontend revocation remains disabled without version 1. Only an explicit user-confirmed request with reason `rest_quota_excess` produces the excess-rest audit label; ordinary deletions are not relabeled.

The route retains the original report, note, shift, actor and timestamp under the date's `overtimeRevocations` metadata. It verifies the persisted archive and absence of the old active report before returning `revocationVerified:true`. Failed verification rolls back the original schedule. Do not delete production reports as a test; use fixtures for mutation/rollback paths and production read-only checks for availability and display.

## Archived preplan original-shift repair (capability 1)

Update the existing three revocation files (audit, deletion planner, delete route), preserving their existing authenticated POST routing, script lock and edit lease. The planner now restores `reportOriginalShift` even when the legacy `overtimeOriginalShift` field is absent. The new explicit `restore_revoked_preplan` reason permits recovery only from the latest matching confirmed monthly-rest preplan revocation archive, with exact expected current/original shift and revision, no active report or leave/cover link, and scope verification. Do not re-delete the already revoked report.

After installing and testing all three files, add `overtimeRevokedRestoreVersion:1` to **both** normal and cached `getScheduleDataSecure_` responses. Do not advertise this capability before deploying the new backend. Retain `overtimeRevocationVersion:1`. Publish a new version of the existing Apps Script web app, then verify read-only capability using an authenticated account. The browser will otherwise list recoverable archived shifts as requiring backend deployment; it will not send the new mutation to an older backend.

A successful restore must preserve the original revocation archive and read back the exact original shift. Never use production mutations as automated tests.
