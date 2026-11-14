# V115 backup response recovery

Install `all-systems-backup-receipt.gs` beside the existing V114 classified
backup implementation. Preserve the existing deployment ID and access settings.

In `doGet`, route `historyBackupReceipt` through
`jsonOutput(p79HistoryBackupReceipt_(params))`, with the existing JSON error
handling. Route `historyBackupCapabilities` through
`p79HistoryBackupCapabilitiesWithReceipt_(params)`.

In `doPost`, route `historyBackupMonth` through
`p79HistoryBackupRequest_(parsedData)`. That wrapper delegates older monthly
requests unchanged and stores a bounded, exact-request success/failure receipt
for full-system requests. The original authorization and snapshot readback
checks still run. The new read endpoint requires the same superadmin/history
management authorization and checks that the referenced file is not trashed.

The client uses the read endpoint if a POST response is lost or malformed. It
polls the same category and request ID without creating another backup. It
checks all completion fields and the safe file URL before displaying success.
Another request's receipt cannot satisfy the check. An unreachable service
still remains unconfirmed after the bounded recovery period.

Validation: `node tests/all-systems-backup-client.cjs` and
`node tests/all-systems-backup-receipt.cjs`, plus existing monthly backup tests.
