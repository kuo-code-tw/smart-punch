# V100 deleted punch guard repair

Production GAS deployed 2026-11-05 21:22 Asia/Taipei on the existing deployment. Ping returned `2026.11.05.V100-PUNCH-DELETED-GUARD`, ok true.

A tombstoned IN could leave its derived duplicate guard active. Repair now scans surviving same-employee/channel records, including protected originals and earlier records, and rebuilds the guard. Only when the guarded ID is explicitly deleted and no surviving evidence remains does it clear the derived property/cache. Valid punches, ambiguous/future evidence and storage failures stay protected. No attendance rows are created or deleted by this repair.

Validation: `node tests/punch-deleted-guard.cjs` passes with the portable baseline and the private full V99 source. Tests reproduce the old rejection and cover earlier surviving IN, protected originals, OUT, employee/channel isolation, ambiguity, future/newer state and storage failure. No employee punches were submitted for testing.
