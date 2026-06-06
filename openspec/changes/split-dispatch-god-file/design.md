# Design: Split Dispatch God File

## Technical Approach

Decompose `src/adapters/mcp/dispatch.ts` into adapter-only modules while preserving the public surface exported through `src/adapters/mcp/tools.ts`. This is a refactor: MCP tool names, schemas, hidden flags, write gating, alias behavior, handler results, and core request mapping remain unchanged. Strict TDD uses approval/port tests first, then small move-only slices.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Compatibility boundary | Keep `dispatch.ts` as a thin compatibility barrel/facade | Delete it and update all imports | Safer for existing imports and lowers review risk; `tools.ts` can keep importing stable names. |
| Adapter split | Create focused sibling modules under `src/adapters/mcp/` | Move logic into `src/core` | This is MCP adapter orchestration, not domain logic. Core remains adapter-free. |
| SQL read guard | Move with dispatch factory module and re-export from facade | Extract into core utility | Scope says no behavior/domain change; guard currently protects MCP read-mode adapter behavior. |
| Tests | Add/extend port-level approval tests via `createDysflowMcpTools` and exported contracts | Test new module internals | Behavior must survive future file reshuffles; tests assert observable registration and handler effects. |

## Data Flow

```text
tools.ts createDysflowMcpTools
  ├─ modern tools declared in tools.ts
  └─ registerMcpTools (dispatch.ts facade)
       ├─ buildAliasTools ──→ core services / operation registry
       └─ createDispatchTool
            ├─ MCP_TOOL_ROUTES + MCP_TOOL_QUERY_ACTIONS
            ├─ schemas / parity registry / validator
            └─ core mappers ──→ query/vba-sync services
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/adapters/mcp/dispatch-routes.ts` | Create | Own `McpToolRoute`, `MCP_TOOL_ROUTES`, `MCP_TOOL_QUERY_ACTIONS`, and `queryActionFor`. Imports only registry names and core query action type. |
| `src/adapters/mcp/dispatch-common.ts` | Create | Shared adapter helpers: `writesDisabled`, `invalidInput`, `isWriteAllowed`, `mcpSchemaFor`, `parseMcpArgsJson`, `handleValidatedMcpWrite`. |
| `src/adapters/mcp/alias-tools.ts` | Create | Own `ALIAS_TOOL_NAMES` and `buildAliasTools`. Imports common helpers, schemas, result translation, registry service, and query mappers. |
| `src/adapters/mcp/dispatch-factory.ts` | Create | Own `rejectWriteSqlInReadMode` and `createDispatchTool`. Imports routes/common helpers plus validators, schemas, parity registry, result translation, and core mappers. |
| `src/adapters/mcp/dispatch.ts` | Modify | Keep `registerMcpToolList` and `registerMcpTools`; re-export compatibility names from new modules. |
| `src/adapters/mcp/tools.ts` | Modify | Prefer no behavioral change; only adjust imports if needed, preserving current re-exports. |
| `test/adapters/mcp/tools.test.ts` | Modify if needed | Add approval coverage for complete registration shape and key handler outcomes before moving code. |
| `test/adapters/mcp/tools.dry-run.test.ts` | Modify if needed | Preserve write-gate truth table for alias and generic dispatch tools. |

## Interfaces / Contracts

No public API changes. These exports MUST remain available through `src/adapters/mcp/tools.ts`: `ALIAS_TOOL_NAMES`, `MCP_TOOL_QUERY_ACTIONS`, `MCP_TOOL_ROUTES`, `registerMcpToolList`, `rejectWriteSqlInReadMode`, and all existing result/schema exports.

New module import boundary: new files may import from `src/core/**` and sibling MCP adapter modules; `src/core/**` must not import any `src/adapters/**` file.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Port/adapter unit | Tool registration names, schema identity/shape, hidden flags, duplicate protection, alias ownership | Approval tests through `createDysflowMcpTools` and existing exported contracts; no assertions on new file layout. |
| Port/adapter unit | Handler behavior for read guard, write gating, dry-run bypass, alias `run_vba` args parsing, cleanup unavailable error | Existing fake core services; assert concrete MCP results and captured service requests. |
| Full suite | Regression after each slice | `pnpm test`; implementation slices run focused Vitest files first, then full suite in verify. |

## Migration / Rollout

No data/config/runtime migration required. Recommended force-chained implementation slices under the 400-line review budget:

1. Approval-test slice: add missing behavior-preservation tests only.
2. Route/common extraction slice: move constants/helpers; `dispatch.ts` re-exports.
3. Alias/factory extraction slice: move handlers/factory; keep `registerMcpTools` as facade glue.
4. Import cleanup slice: adjust `tools.ts` only if necessary and run `pnpm test`.

## Open Questions

None.
