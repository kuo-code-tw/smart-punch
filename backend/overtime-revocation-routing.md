# Overtime revocation audit integration

Use the existing Apps Script Web App and its current permissions. Do not publish the full project source.

1. Add `overtime-revocation-audit.gs` helpers.
2. Replace the existing `p79DeleteOvertimeAssignment_` with `overtime-revocation-delete-route.gs`. The unchanged existing deletion planner is retained in `overtime-revocation-delete-plan.gs` for regression tests; do not add a duplicate definition.
3. In `getScheduleDataSecure_`, add `overtimeRevocationVersion:1` to the normal response and `cached.overtimeRevocationVersion=1` to the cached response. Only advertise this capability after all helpers and the route are installed.
4. In `p79PlanDirectReport_`, after validating request.id and before editing metadata, call `p79AssertOvertimeReportNotRevoked_(next,request.id)` so old pending requests cannot resurrect a revoked ID. A new report must have a new ID.
5. Keep the existing POST schedule/workhours permission checks, employee scope checks, ScriptLock, edit lease and revision verification unchanged.
6. Deploy a new version of the existing deployment. Frontend revocation remains disabled without version 1. Only an explicit user-confirmed request with reason `rest_quota_excess` produces the excess-rest audit label; ordinary deletions are not relabeled.

The route retains the original report, note, shift, actor and timestamp under the date's `overtimeRevocations` metadata. It verifies the persisted archive and absence of the old active report before returning `revocationVerified:true`. Failed verification rolls back the original schedule. Do not delete production reports as a test; use fixtures for mutation/rollback paths and production read-only checks for availability and display.
