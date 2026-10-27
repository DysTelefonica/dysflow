# VBA Import Orchestration Contract

This document captures the observable import behavior from `origin/main` at `7ba072a2`.

Issue #1463 preserves that behavior while moving policy out of
`scripts/dysflow-vba-manager.ps1`.

The executable matrix is `test/fixtures/vba-import-orchestration-contract.json`.

## Behavior and failure matrix

| Case | Pass sequencing | Persistence | Observable result |
|---|---|---|---|
| Explicit `moduleNames: []` | No pass and no directory expansion | None | Empty successful module array |
| Another process holds the `.accdb` open (#1912) | No pass; refused before Access is opened | None | `ACCESS_DATABASE_LOCKED` with a lock remediation; no module is reported `ok` |
| One existing module succeeds | One pass | Named save of the modified component (#1912) | One `status: "ok"` entry |
| A new component succeeds | One pass | Named save of the new component, also when it was cloned with `CopyObject` (#1912) | One `status: "ok"` entry |
| An existing form or report is re-imported | One pass | Save-only `RunCommand(280)` after all modules succeed | One `status: "ok"` entry |
| A multi-module pass makes progress | Retry only the failed names, preserving caller order | Save only after the terminal successful pass | Latest result for each requested module |
| A pass makes no progress or a single module fails | Stop retrying | The modules that succeeded are saved by name before the failure completes (#1912) | `VBA_IMPORT_FAILED`; a saved module is `ok`, a failed one carries its typed error, and a module whose save only warned is `VBA_IMPORT_SAVE_FAILED` |
| A module or the save reports the exclusive-access lock (#1912) | Stop | Nothing is saved; the rollback journal restores the modules already imported | `VBA_IMPORT_FAILED`; every module is `ACCESS_DATABASE_LOCKED` with `rollbackAttempted` and `rollbackApplied`, none `ok` |
| A form or report save fails for another reason after all modules succeed | Do not retry the import | Warning only | The successful module array remains authoritative |

Before #1912 a re-imported existing standard module had no explicit save.

Its persistence depended on the Access close. Without exclusive access that close silently drops
the change, and the module was already reported `ok`.

The same close also persisted the successful modules of a partially failed batch.

Those modules were reported `ok` without a save; the core now saves them before the failure.

The close is `CloseCurrentDatabase` then `Quit(2)` in `scripts/lib/dysflow-access-com.ps1`.

## Stable boundaries

- `DYSFLOW_RESULT` remains the runner sentinel and carries the same success array or failure
  object.
- Per-module error codes, phase, duration, rollback, fallback, lock-owner, and verbose fields
  remain stable.
- Import never compiles VBA. Persistence is save-only; the human still compiles in Access before
  trusting or testing the binary.
- Rollback restores the pre-mutation code-module snapshot. A failed snapshot prevents mutation.
- If the core bridge fails after a pass mutates Access, the transport runs its opaque rollback
  journal in reverse and emits one terminal `VBA_IMPORT_FAILED` result.
- A lock failure makes the core return a `rollback` decision naming the imported modules. The
  transport runs their journal entries newest first and reports each outcome through the
  `rollback-completed` event (#1912).
- The PowerShell bridge uses argv for Base64 payloads up to 8192 characters and stdin above that
  threshold. Transport selection does not change orchestration or rollback state.
- The internal CLI rejects an oversized legacy argv payload with `PAYLOAD_TOO_LARGE_FOR_ARGV`
  before evaluating the decision.

## Migration seam

The TypeScript core owns pass selection, retry policy, rollback policy, save decisions, and
legacy result projection.

PowerShell executes ordered primitive commands against the live COM session and serializes raw
outcomes.

Removing the core orchestrator reverts the slice without changing the COM import atoms.
