# V116 backup lock contention fix

Apply `scripts/apply-gas-backup-lock-wait.cjs` to the freshly read production
source. The patch changes only the all-system backup function and introduces a
private core for owner-controlled verification. The public wrapper still calls
the existing superadmin/history management check before entering the core.

Verified immutable snapshots whose complete source/reference hashes still match
return without acquiring the main-data write lock. New snapshots retain the
existing ScriptLock and per-category in-flight claims: wait up to 10 seconds
for the pre-write claim and up to 30 seconds to publish the final receipt.
Snapshot creation and source selection retain their existing checks.

The client automatically resubmits only the exact, explicit pre-write lock
refusal, using the same category and request ID. It uses eight bounded attempts
with increasing waits. Lost responses use receipt lookup instead of replaying
a potentially active write. Identity changes stop retries. Real readback or
authorization failures remain visible.

Deploy to the existing Apps Script deployment ID with unchanged access settings.
Run the owner-controlled four-category verification for efficiency, vessel,
sailing, and routes before release. That check uses the private snapshot core
from the authenticated project editor and does not add a web endpoint.

Validation: `node tests/backup-lock-wait.cjs`,
`node tests/all-systems-backup-client.cjs`,
`node tests/all-systems-backup-receipt.cjs`, and existing monthly backup tests.
