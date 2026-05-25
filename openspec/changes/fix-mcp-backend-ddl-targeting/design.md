# Design: Fix MCP Backend DDL Targeting

## Technical Approach

Keep the existing MCP/core contract and fix only the write-target selection path. Legacy write tools will carry explicit database targeting into `AccessQueryRequest`; the PowerShell runner will still open the configured frontend for Access automation/operation ownership, but DDL/write actions will execute on a selected DAO database object instead of unconditionally using `$access.CurrentDb()`.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Target precedence | For write actions, select `databasePath`/`sourcePath` first when present, then `backendPath`, then frontend current DB. | Always use `backendPath`; add a new CLI parameter. | Matches existing schema aliases, preserves frontend-local default behavior, and avoids expanding the runner CLI contract. |
| Adapter mapping | Extend `toLegacyWriteFixtureRequest` in `src/adapters/mcp/tools.ts` to include `databasePath: databasePath ?? sourcePath`; keep existing `backendPath` mapping. | Move alias resolution into PowerShell only. | TypeScript tests can prove MCP payload preservation before the script boundary. |
| DAO lifecycle | Add a small PowerShell helper in `scripts/dysflow-access-runner.ps1` to resolve/open the write database and return whether it is owned by the helper; close/final-release only helper-owned DBs. | Replace all `$db` use with separate per-action logic. | Centralizes COM ownership and prevents closing `$access.CurrentDb()` while keeping the diff small. |
| Password handling | Use `Open-DatabaseWithBackendPassword` for explicit backend/database write targets; keep `AccessPassword` only for opening the frontend. | Reuse `AccessPassword` for all DBs or accept raw passwords in payload. | Preserves env-based secret flow (`DYSFLOW_BACKEND_PASSWORD`) and avoids hardcoded/password-in-payload shortcuts. |
| Dry run | Resolve the intended target path for dry-run metadata, but do not open the target DB solely for dry-run unless needed by existing validation. | Always open target on dry-run. | Dry-run should validate guards and report intent without taking backend locks. |

## Data Flow

```text
MCP legacy write tool
  -> toLegacyWriteFixtureRequest(sql/table/backendPath/databasePath/dryRun)
  -> AccessPowerShellRunner PayloadJson + DYSFLOW_* passwords
  -> dysflow-access-runner opens frontend for Access context
  -> Resolve-WriteActionDatabase
       databasePath/sourcePath -> backendPath -> CurrentDb
  -> Invoke-WriteAction(selectedDb)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/adapters/mcp/tools.ts` | Modify | Preserve `databasePath`/`sourcePath` for `exec_sql`, `run_script`, `create_table`, `drop_table`, `seed_fixture`, `teardown_fixture`. |
| `test/adapters/mcp/legacy-parity.test.ts` or `test/adapters/mcp/tools.test.ts` | Modify | Add contract cases for write tools carrying `backendPath` and `databasePath/sourcePath`. |
| `scripts/dysflow-access-runner.ps1` | Modify | Add target resolution helper and route write actions through selected DAO DB with safe close/final-release. |
| `test/scripts-access-runner.test.ts` | Modify | Characterize helper presence, precedence order, backend password open, and owned-DB cleanup. |
| `test/e2e/access-fixture.e2e.test.ts` | Modify | Add/adjust skippable real-Access regression proving backend DDL does not create the table in frontend. |
| `README.md` or `docs/testing/mcp-access-e2e.md` | Modify | Document No Conformidades backend/global vs frontend/local table targeting. |

## Interfaces / Contracts

No public tool names change. Legacy write payloads may now include:

```ts
type AccessQueryRequest = {
  backendPath?: string;
  databasePath?: string; // also accepts sourcePath at MCP boundary
  dryRun?: boolean;
};
```

Write target rules: `databasePath/sourcePath` > `backendPath` > `AccessDbPath`/frontend. Relative target paths, if supported in current runner context, resolve consistently with existing path handling; otherwise callers pass absolute/repo-resolved paths.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit/contract | MCP write-tool request mapping and env password propagation. | Vitest table-driven cases; assert `PayloadJson` and `DYSFLOW_BACKEND_PASSWORD` without secrets in args. |
| Script characterization | PowerShell helper precedence, dry-run no-open intent, backend open/cleanup patterns. | Existing static `test/scripts-access-runner.test.ts` string checks; keep small. |
| E2E/integration | `create_table`/`drop_table` with `backendPath` affects backend only and frontend config remains local. | Skippable real Access Vitest/Pester-style probe using deterministic `ZZZ_DYSFLOW_BACKEND_TARGET_*` table and teardown. |

## Migration / Rollout

No migration required. Roll out as chained slices: adapter contract tests, PowerShell runner fix, real-Access regression/docs. Rollback is reverting those slices and dropping only deterministic `ZZZ_DYSFLOW_BACKEND_TARGET_*` test artifacts if created.

## Open Questions

- [ ] None blocking.
