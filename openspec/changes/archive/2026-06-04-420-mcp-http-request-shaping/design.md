# Design: MCP and HTTP Request Shaping, SQL Consolidation, and Port Hardening

## Technical Approach

We will consolidate read-only SQL validation, implement type-safe parameter helpers in HTTP and MCP adapters, restrict the public API of the `VbaSyncAdapter`, and refactor tests to target the public port boundary.

1. **SQL Consolidation**: Define a canonical `looksLikeReadOnlySql` in `src/core/utils/index.ts` that supports Common Table Expressions (CTEs) starting with `WITH` in addition to standard `SELECT` statements, while blocking DDL/DML write keywords (`insert`, `update`, `delete`, `create`, `drop`, `alter`, `truncate`, `into`).
2. **HTTP Parameter Validation**: In `src/adapters/http/server.ts`, define a local type-safe extraction helper `getStringParam` to retrieve required strings, replacing all unsafe `as string` casts.
3. **MCP Parameter Mapping**: In `src/adapters/mcp/tools.ts`, define `getStr` to declaratively resolve parameters with fallback keys, and refactor `rejectWriteSqlInReadMode` to delegate to `looksLikeReadOnlySql`.
4. **VBA Sync Visibility**: In `src/adapters/vba-sync/vba-sync-adapter.ts`, change target resolution, strict context checks, preflight, and mapped execution methods to `private`. Pass bound anonymous wrappers in the constructor to sub-adapters.
5. **Port-Boundary Tests**: Refactor `test/adapters/vba-sync/vba-sync-adapter.test.ts` to assert context validation and target resolution behavior through the public `execute()` method.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| `looksLikeReadOnlySql` in `src/core/utils/index.ts` | Allows code reuse across MCP and HTTP adapters but couples core utilities to SQL syntax parsing. | **Chosen**: Consolidates the heuristic in core utilities for a single source of truth. |
| Pass anonymous wrappers to sub-adapters | Keeps orchestration methods private to `VbaSyncAdapter` but requires construction-time boilerplate. | **Chosen**: Uses arrow functions in the constructor to delegate to private methods without exposing public surfaces. |
| Refactor tests to assert via public `execute()` | Increases integration coverage and decouples tests from internals, but makes debugging internal target resolution slightly less direct. | **Chosen**: Decouples the test suite from private implementation structures to adhere to the core testing philosophy. |

## Data Flow

Data moves through type-safe boundaries before execution:

```
[HTTP Request / MCP Client] ───► [Param Helpers / Schema Validator]
                                          │
                                          ▼
                               [looksLikeReadOnlySql Check]
                                          │
                                          ▼
[VbaSyncAdapter.execute()] ◄── [VbaSyncAdapter Private Methods]
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/utils/index.ts` | Modify | Add `looksLikeReadOnlySql` supporting CTEs and denying write keywords. |
| `src/adapters/http/server.ts` | Modify | Replace local SQL check with core import; introduce `getStringParam` helper to remove `as string` casts. |
| `src/adapters/mcp/tools.ts` | Modify | Use core SQL check; introduce `getStr` helper to simplify fallbacks. |
| `src/adapters/vba-sync/vba-sync-adapter.ts` | Modify | Reduce method visibility to `private`. Pass anonymous delegate wrappers to sub-adapters. |
| `test/adapters/http/server.test.ts` | Modify | Add test cases for CTE read/write queries. |
| `test/adapters/mcp/tools.test.ts` | Modify | Add CTE validation test cases. |
| `test/adapters/vba-sync/vba-sync-adapter.test.ts` | Modify | Refactor tests to assert strict context mismatch and target configuration behavior via `execute()`. |

## Interfaces / Contracts

The sub-adapter orchestrator requirements are updated to receive clean function boundaries:

```typescript
export interface VbaModulesOrchestrator {
  scriptPath: string;
  accessPassword?: string;
  cwd: string;
  resolveExecutionTarget(params: Record<string, unknown>): Promise<OperationResult<unknown>>;
  validateStrictContext(params: Record<string, unknown>, target: unknown): OperationResult<undefined>;
  runPreflightCleanup(target: unknown): Promise<unknown>;
  executor: unknown;
  executeMappedTool(toolName: string, params: Record<string, unknown>, mapping: unknown): Promise<OperationResult<unknown>>;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | CTE support in `looksLikeReadOnlySql` | Test `WITH ... SELECT` patterns, write CTEs, case-insensitivity, and comments. |
| Unit | HTTP/MCP parameter extraction | Assert correct formatting of error payloads when parameters are missing. |
| Integration | VBA Sync public port behavior | Call `execute` with strict parameters to assert strict context mismatches and target resolution configurations. |

## Migration / Rollout

No migration required.
