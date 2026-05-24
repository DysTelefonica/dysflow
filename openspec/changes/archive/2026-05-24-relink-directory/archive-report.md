# Archive Report: relink-directory

| Field | Value |
|-------|-------|
| Change Name | `relink-directory` |
| Status | CLOSED |
| Archive Date | 2026-05-24 |
| Delivery | 4 PRs (stacked-to-main) |

## Summary

Implemented `dysflow access relink-directory` — a new CLI command and PowerShell action that bulk-remaps linked-table backends in every Access (`.accdb`/`.mdb`) file under a root directory. Supports dry-run, backup-before-write, alias mapping (`--map`), chain resolution with cycle detection, `--remove-unresolved`, and strict verification via `--strict-local` / `--deny-prefix`. JSON-auditable output with file and link counts.

## PRs

| PR | Title | Status |
|----|-------|--------|
| PR1 | TS layer: contracts + CLI routing + arg parser + unit tests + parity fixes | Merged |
| PR2 | PS scan: file enumeration + link inspection + classification + dry-run JSON | Merged |
| PR3 | PS apply: backup + alias map + chain resolution + remove-unresolved | Merged → PR #316 |
| PR4 | PS verify mode + E2E suite | Merged → PR #318 |

## Key Artifacts

- `src/cli/commands/access/relink-directory.ts` — TS arg parser and handler
- `src/cli/commands/access.ts` — subcommand router
- `src/core/contracts/index.ts` — extended with `relink_directory` action and result types
- `scripts/dysflow-access-runner.ps1` — new `Invoke-RelinkDirectory` action
- `test/cli/access/relink-directory.test.ts` — unit tests with FakeQueryService
- `test/e2e/access-relink-directory.test.ts` — E2E suite guarded by `hasAccessCom()`
- `test/e2e/access-relink-directory-apply.test.ts` — apply-mode E2E suite
