# Tasks: fix(mcp): query tools must honor backend database targets

## Review Workload Forecast

| Field | Value |
| --- | --- |
| Estimated changed lines | 430-620 total, each PR <400 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Decision needed before apply | No |
| Delivery strategy | auto-chain / force chained |
| Chain strategy | stacked-to-main |

## PR1 — Adapter Contract Parity

- [x] 1.1 **RED** Add tests in `test/adapters/mcp/tools.test.ts` proving `dysflow_query_execute` forwards `backendPath`, `databasePath`, and `sourcePath` into `queryService.execute`.
- [x] 1.2 **RED** Add tests proving legacy `query_sql` accepts the same target overrides and maps `sourcePath` to `databasePath`.
- [x] 1.3 **RED** Add release-matrix/schema gate assertions that modern and legacy query tools expose backend target override fields.
- [x] 1.4 Run targeted adapter tests and capture RED failures.
- [x] 1.5 **GREEN** Update adapter query schemas with target override fields.
- [x] 1.6 **GREEN** Update the legacy `query_sql` handler to forward read target overrides without inventing a backend target.
- [x] 1.7 Re-run targeted tests and keep PR1 below 400 changed lines.

Allowed PR1 files: `src/adapters/mcp/schemas.ts`, `src/adapters/mcp/tools.ts`, `test/adapters/mcp/tools.test.ts`, `test/adapters/mcp/release-matrix-gate.test.ts`.

## PR2 — Runner Target Resolution

- [x] 2.1 **RED** Add runner tests proving generic SQL read/write resolves target precedence: `databasePath/sourcePath > backendPath > CurrentDb`.
- [x] 2.2 **RED** Add script regression assertions showing explicit-target reads do not execute through the frontend-only `$db.OpenRecordset(...)` path.
- [x] 2.3 Run targeted runner/script tests and capture RED failures.
- [x] 2.4 **GREEN** Update `scripts/dysflow-access-runner.ps1` so generic SQL read/write executes against the selected database and closes only owned handles.
- [x] 2.5 **GREEN** Preserve dry-run, allow-list, deny-list, and write-mode guard behavior before backend execution.
- [x] 2.6 Re-run targeted tests and keep PR2 below 400 changed lines.

Allowed PR2 files: `scripts/dysflow-access-runner.ps1`, `test/core/runner/access-runner.test.ts`, `test/scripts-access-runner.test.ts`.

## PR3 — Verification and Release Prep

- [x] 3.1 Run full verification: `pnpm test`, `pnpm build`, and any repo-required lint/typecheck command.
- [x] 3.2 Add only narrow regression gaps for CurrentDb fallback or legacy/modern parity if PR1/PR2 did not cover them.
- [x] 3.3 Update `CHANGELOG.md` and bump the patch version (for example `0.9.7 -> 0.9.8`) per repo convention.
- [ ] 3.4 After the PR chain is merged, create a release titled `fix(mcp): query tools must honor backend database targets`; if the repo requires versioned release titles, use the version title and include the fix title verbatim in notes.
- [x] 3.5 Confirm each PR diff remains under 400 changed lines.

Allowed PR3 files: `CHANGELOG.md`, `package.json`, optional narrow regression-test deltas only.

## Stacked-to-main Order

1. `fix/mcp-query-backend-target-pr1` -> `main`
2. `fix/mcp-query-backend-target-pr2` -> `main` after PR1 merges
3. `fix/mcp-query-backend-target-pr3` -> `main` after PR2 merges
