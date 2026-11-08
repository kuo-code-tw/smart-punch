# Overtime configuration authority — V109

Deployed to the existing production Apps Script Web App on 2026-11-08, retaining its URL, permissions and V108 dual-date behavior.

New filings and corrections select only cloud-saved enabled types and periods. Deleted types, archived periods and manager-hidden periods are rejected by the backend as well as filtered in all shared report dialogs. Empty conversion values stay empty; no fixed conversion is inserted. Special-day and leave-cover suggestions cannot create or persist periods automatically.

The server adapter now obtains its candidate rows with `p79ConfiguredOvertimeRowsV109_(config)` before the existing unique-rule match and authorization/revision/lock/write/readback checks. The pure helper and native zero-write verification are in `overtime-config-authority-v109.gs`. `p79DirectResolvedRule_` now preserves the saved conversion value (see updated V108 core).

The options manager includes a rules explanation and a table derived from the editable rows, with normal hours, overtime hours, declared and converted hours. Normal roster and physical attendance dates remain separate from overtime accounting dates. Existing formal reports retain their original audit data; removing an option does not delete hours.

Validation: native `p79V109VerifyConfiguredRules` passed with productionWrites=0; `overtime-config-authority.cjs`, special-day settings, leave-support settings, dual-date GAS, save preflight concurrency, same-ID correction, schedule accounting-date and extension-label tests passed. Prior test failures were compared against the previous production commit.
