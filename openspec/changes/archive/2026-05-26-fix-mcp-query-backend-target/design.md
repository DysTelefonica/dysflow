# Design: fix(mcp): query tools must honor backend database targets

## Technical Approach

Apply the minimal target-propagation fix from exploration: let generic MCP SQL tools accept the same database target fields already used by schema/list tools, map those fields into `AccessQueryRequest`, and make the PowerShell generic SQL branch execute against the resolved DAO database instead of always using `CurrentDb`. This preserves the core/adapters boundary: MCP schemas and handlers only shape requests; `AccessPowerShellRunner` carries the request; `scripts/dysflow-access-runner.ps1` performs Access target selection.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Extend existing `dysflow_query_execute` and `query_sql` | Slightly broader schemas, no new tools | Choose this; issue #370 is about existing tools dropping target intent. |
| Add backend-specific SQL tools | Avoids schema changes but duplicates UX and leaves bug | Reject. |
| Always use configured backend | Small change but breaks frontend-local SQL callers | Reject; fallback must remain compatible. |
| Reuse `Resolve-ReadActionDatabase` / `Resolve-WriteActionDatabase` | Must handle generic read/write cleanup carefully | Choose this to match list/schema behavior and existing precedence. |

## Data Flow

```text
MCP caller
  -> schemas.ts validates target fields
  -> tools.ts maps input to AccessQueryRequest
  -> QueryService / AccessPowerShellRunner serializes PayloadJson
  -> dysflow-access-runner.ps1 resolves selected DAO Database
  -> OpenRecordset/Execute runs on selected database
```

Target precedence contract for generic SQL:

1. `databasePath` or alias `sourcePath`
2. `backendPath`
3. existing `CurrentDb` frontend/default behavior

Modern `dysflow_query_execute` MUST accept `backendPath`, `databasePath`, and `sourcePath` while keeping required `sql` and `mode`. Legacy `query_sql` MUST accept the same read target fields and forward `sql ?? query`, `mode: "read"`, `backendPath`, and `databasePath: databasePath ?? sourcePath`. `accessPath` remains a frontend/project override input where legacy read-target schemas already use it, but the generic SQL execution database is selected by the precedence above.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/adapters/mcp/schemas.ts` | Modify | Add read target override fields to `QUERY_EXECUTE_SCHEMA` and legacy `query_sql`. |
| `src/adapters/mcp/tools.ts` | Modify | Preserve target fields for `query_sql`; modern handler can keep casting validated input once schema allows fields. |
| `scripts/dysflow-access-runner.ps1` | Modify | In generic SQL branch, use read/write target resolver and close owned databases. |
| `test/adapters/mcp/tools.test.ts` | Modify | RED tests proving modern and legacy query tools forward explicit targets. |
| `test/adapters/mcp/release-matrix-gate.test.ts` | Modify | Extend split-mode/schema gate to assert target field availability. |
| `test/core/runner/access-runner.test.ts` or `test/scripts-access-runner.test.ts` | Modify | Static characterization for generic SQL using resolver helpers, not `$db` directly. |

## Interfaces / Contracts

No new public tool names. Existing contracts expand only by optional fields:

```ts
{ sql: string; mode: "read" | "write"; backendPath?: string; databasePath?: string; sourcePath?: string }
{ sql?: string; query?: string; backendPath?: string; databasePath?: string; sourcePath?: string }
```

Safety stays unchanged: MCP write gating still happens before `queryService.execute`; write SQL uses the existing write resolver, including dry-run/current-db behavior. Password resolution remains `DYSFLOW_BACKEND_PASSWORD` via runner environment.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Adapter unit | `dysflow_query_execute` accepts/forwards `backendPath`, `databasePath`, `sourcePath` | Vitest RED in `tools.test.ts`; no Access required. |
| Adapter unit | `query_sql` maps target aliases into `AccessQueryRequest` | Vitest RED with fake query service. |
| Script characterization | Generic read/write branch calls `Resolve-ReadActionDatabase` / `Resolve-WriteActionDatabase` and closes owned DBs | Static Vitest assertions in runner/script tests. |
| Regression | Existing list/schema targeting and CurrentDb fallback | Keep current tests green; add fallback assertion if touched. |

Strict TDD: run `pnpm test` before production edits to see RED for the new tests, then after each slice; final verification also runs `pnpm build`.

## Migration / Rollout

No migration required. Release title/notes must use `fix(mcp): query tools must honor backend database targets` unless repo release convention requires a version title with that wording in notes.

## Stacked-to-main Slices

1. Adapter target contract and tests, under 150 changed lines.
2. Runner generic SQL target resolution and tests, under 250 changed lines.
3. Optional regression/docs/release-note slice only if confidence gaps remain, under 200 changed lines.

## Open Questions

None blocking.
