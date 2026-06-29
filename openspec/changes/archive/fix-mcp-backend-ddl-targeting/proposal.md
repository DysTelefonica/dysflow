# Proposal: Fix MCP Backend DDL Targeting

## Intent

Fix legacy MCP write tools so explicit `backendPath` DDL/write requests target the backend database, not the Access frontend. This unblocks No Conformidades cache/config table creation in `NoConformidades_Datos.accdb` while preserving frontend-local tables such as `TbConfiguracionBackends`.

## Scope

### In Scope
- Make `exec_sql`, `run_script`, `create_table`, `drop_table`, `seed_fixture`, and `teardown_fixture` execute against the requested write database when `backendPath` is supplied.
- Preserve safe defaults, dry-run behavior, allow/deny guards, env-based password resolution, and operation cleanup.
- Add regression coverage proving backend DDL does not create tables in the frontend.
- Document No Conformidades usage for backend/global tables vs frontend/local tables.

### Out of Scope
- Redesigning modern `dysflow_query_execute` per-call database override.
- Generic Access process killing or hardcoded password shortcuts.
- Creating production No Conformidades tables as part of implementation.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `mcp-stdio-adapter`: legacy write tools MUST preserve explicit backend targeting in request mapping.
- `access-core-runner`: the PowerShell write runner MUST execute writes/DDL against the selected write database, not always `$access.CurrentDb()`.

## Approach

Keep the fix narrow: carry the existing `backendPath` payload through the runner contract and open/select the intended DAO database for write actions when supplied. Continue opening the frontend for Access automation context, but separate frontend-local operations from explicit backend write targets. Cover with Vitest unit/contract tests and script-level characterization where practical.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp/tools.ts` | Modified | Preserve legacy write `backendPath` mapping and tests. |
| `src/core/runner/access-runner.ts` | Modified | Pass explicit write target to PowerShell runner. |
| `scripts/dysflow-access-runner.ps1` | Modified | Resolve `$db` for write actions from backend target when requested. |
| `docs/` or project usage notes | Modified | No Conformidades table targeting guidance. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Misrouting frontend-local config writes | Med | Document/verify `TbConfiguracionBackends` remains frontend/local. |
| Password regression for protected backends | Med | Use configured env password flow only; no hardcoding. |
| Review size creep | Low | Split tests, runner fix, and docs into chained PR slices. |

## Rollback Plan

Revert the runner/adapter changes and documentation. If accidental test tables are created, remove only explicitly named test artifacts from the affected `.accdb`; do not kill Access globally.

## Dependencies

- Issue #347 and existing `.dysflow/project.json`/env password configuration.
- Windows Access/PowerShell environment for integration verification.

## Success Criteria

- [ ] Legacy MCP DDL with `backendPath` creates/drops test tables only in the backend.
- [ ] Frontend-local `TbConfiguracionBackends` behavior remains unchanged.
- [ ] `pnpm test` and `pnpm build` pass.
- [ ] No Conformidades guidance identifies backend/global vs frontend/local tables.
