# Exploration: Issue #370 — Query Tools Must Honor Backend Database Targets

### Current State

Issue #370 is approved/high severity and reports that SQL query tools fail against backend-only tables in `C:\00repos\codigo\00_NO_CONFORMIDADES_staging`: `dysflow_list_tables` and `dysflow_get_schema` can target an explicit backend, but `dysflow_dysflow_query_execute` and `dysflow_query_sql` run against the frontend/default database and return table-not-found.

The code confirms two likely root causes:

1. MCP adapter target loss:
   - `QUERY_EXECUTE_SCHEMA` only accepts `projectId`, `contextId`, `sql`, and `mode`; it has no `backendPath`, `databasePath`, or `sourcePath` override fields.
   - Legacy `query_sql` schema also only accepts `projectId`, `contextId`, `sql`, and `query`.
   - `query_sql` handler builds `{ sql, mode: "read" }` and drops all target fields even if the caller could pass them.
2. Runner generic SQL target loss:
   - `AccessPowerShellRunner` injects `config.backendPath` into query requests when no explicit `backendPath`/`databasePath` exists.
   - But `scripts/dysflow-access-runner.ps1` handles generic SQL (`action` blank or `query_sql`) through `$access.CurrentDb()` and does not call `Resolve-ReadActionDatabase`/`Resolve-WriteActionDatabase`.
   - Therefore even a fallback or explicit `backendPath` on generic SQL would not affect `OpenRecordset`/`Execute` today.

Target-aware schema actions already exist for `list_tables`, `get_schema`, and `get_relationships`; the script routes those through `Resolve-ReadActionDatabase`, which explains why they work with explicit backend paths.

### Affected Areas

- `src/adapters/mcp/schemas.ts` — modern `dysflow_query_execute` and legacy `query_sql` schemas do not expose backend/database target overrides.
- `src/adapters/mcp/tools.ts` — `dysflow_query_execute` passes validated input directly, but currently cannot receive target fields; `query_sql` constructs a minimal request and drops target intent.
- `scripts/dysflow-access-runner.ps1` — generic SQL read/write uses `$db`/CurrentDb directly instead of resolving selected backend/database target.
- `test/adapters/mcp/tools.test.ts` — needs contract coverage proving target fields survive MCP validation and adapter mapping.
- `test/core/runner/access-runner.test.ts` and/or script tests — needs regression coverage proving generic SQL uses selected read/write database helpers.
- `openspec/specs/mcp-stdio-adapter/spec.md` and `openspec/specs/access-core-services/spec.md` — likely spec domains for formal requirements in later phases.

### Approaches

1. **Minimal target propagation and script routing** — Add target fields to query schemas/mapping and route generic SQL through existing read/write database helpers.
   - Pros: Smallest change, reuses existing helper precedence (`databasePath/sourcePath` > `backendPath` > CurrentDb), matches working list/schema behavior, preserves tool names.
   - Cons: Requires care around generic write SQL and dry-run semantics; modern query schema becomes broader.
   - Effort: Low/Medium.

2. **Add separate backend-specific SQL tools** — Leave existing tools unchanged and introduce new backend SQL tools.
   - Pros: Avoids changing current tool contracts.
   - Cons: Poor UX, duplicates behavior, does not fix the approved bug for existing tools, increases MCP surface.
   - Effort: Medium.

3. **Always execute generic SQL against configured backend when present** — Keep schemas narrow and rely only on project config fallback.
   - Pros: Very small adapter change or no schema change.
   - Cons: Breaks frontend-local SQL use cases, cannot target an alternate backend/database, and hides target selection from callers.
   - Effort: Low but risky.

### Recommendation

Use Approach 1. It directly fixes the reported tools while preserving the current architecture: adapters map MCP input into `AccessQueryRequest`, the runner carries target metadata to PowerShell, and the script selects a DAO database object at execution time. The target precedence should stay consistent with the prior backend DDL targeting work: `databasePath/sourcePath` first, then `backendPath`, then frontend CurrentDb.

Smallest stacked-to-main work units under the 400-line review budget:

1. **PR 1 — Adapter target contract**: Extend `QUERY_EXECUTE_SCHEMA` and `query_sql` schema to accept target overrides; map `query_sql` to `AccessQueryRequest` with `backendPath` and `databasePath/sourcePath`; add Vitest adapter contract tests. Expected review size: small (<150 changed lines).
2. **PR 2 — Runner generic SQL targeting**: Route generic SQL reads through `Resolve-ReadActionDatabase` and generic SQL writes through `Resolve-WriteActionDatabase`/direct-target equivalent; add static/script characterization tests. Expected review size: medium (<250 changed lines).
3. **PR 3 — Regression proof/docs if needed**: Add a skippable real-Access regression for backend-only table queries in a deterministic sandbox and document target precedence. Expected review size: small/medium; keep only if PR 1+2 lack enough executable confidence.

### Risks

- Generic `dysflow_query_execute` has no `action`; PowerShell must distinguish read vs write by `mode` and preserve existing write guard behavior from MCP.
- Direct-target write optimization currently bypasses opening the frontend for non-dry-run write targets; generic write SQL must not regress Access operation cleanup metadata or password handling.
- Existing frontend-local SQL callers may rely on CurrentDb; fallback to backend must be explicit or already injected by config, with clear precedence.
- Real Access E2E coverage can be environment-sensitive; keep it skippable and deterministic if added.

### Ready for Proposal

Yes. The next phase should propose the minimal target-propagation fix for issue #370, with strict TDD and stacked PR slices as above.
