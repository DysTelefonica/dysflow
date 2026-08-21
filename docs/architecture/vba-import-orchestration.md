# VBA Import Orchestration Contract

This document captures the observable import behavior from `origin/main` at `7ba072a2`.

Issue #1463 preserves that behavior while moving policy out of
`scripts/dysflow-vba-manager.ps1`.

The executable matrix is `test/fixtures/vba-import-orchestration-contract.json`.

## Behavior and failure matrix

| Case | Pass sequencing | Persistence | Observable result |
|---|---|---|---|
| Explicit `moduleNames: []` | No pass and no directory expansion | None | Empty successful module array |
| One existing module succeeds | One pass | None beyond the existing Access mutation path | One `status: "ok"` entry |
| A new component succeeds | One pass | Save-only `RunCommand(280)` after all modules succeed | One `status: "ok"` entry |
| An existing form or report is re-imported | One pass | Save-only `RunCommand(280)` after all modules succeed | One `status: "ok"` entry |
| A multi-module pass makes progress | Retry only the failed names, preserving caller order | Save only after the terminal successful pass | Latest result for each requested module |
| A pass makes no progress or a single module fails | Stop; do not save partial terminal failure state | None | `VBA_IMPORT_FAILED` plus typed per-module errors |
| Save-only persistence fails after all modules succeed | Do not retry the import | Warning only | The successful module array remains authoritative |

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

## Migration seam

The TypeScript core owns pass selection, retry policy, rollback policy, save decisions, and
legacy result projection.

PowerShell executes ordered primitive commands against the live COM session and serializes raw
outcomes.

Removing the core orchestrator reverts the slice without changing the COM import atoms.
