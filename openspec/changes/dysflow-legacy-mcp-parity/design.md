# Design: Dysflow Legacy MCP Parity

## Technical Approach

Treat legacy MCP files as a contract inventory and migrate behavior into product-owned TypeScript services plus PowerShell 5.1 runners where Access COM/DAO is required. The MCP adapter should expose legacy-compatible tool names while mapping requests into typed core services. Existing process ownership and cleanup validation remain the non-negotiable safety boundary.

## Architecture Decisions

### Decision: Port behavior, do not depend on old skills

**Choice**: Reimplement/migrate into `src/core/services` and `scripts/` instead of requiring old skill folders.
**Alternatives considered**: Proxying to `C:\Proyectos\workflow\skills\*`.
**Rationale**: The user wants Dysflow to be production tooling, not a wrapper around deprecated skills.

### Decision: Chained PR slices by legacy domain

**Choice**: Split into five child issues: VBA sync, VBA execution/testing, query/schema, writes/fixtures, links/query maintenance/forms.
**Alternatives considered**: One giant parity PR.
**Rationale**: 46 tools crosses the review budget and needs independent verification.

### Decision: Backwards-compatible tool names

**Choice**: Expose legacy names such as `query_sql` and `test_vba`, while keeping newer names as aliases where useful.
**Alternatives considered**: Only expose namespaced `dysflow.*` tools.
**Rationale**: Compatibility matters because existing agent prompts/scripts may call legacy tool names.

## Data Flow

```text
MCP client
  -> src/adapters/mcp/tools.ts legacy-compatible tool registry
  -> src/core/services/<domain-service>.ts
  -> scripts/*.ps1 or pure filesystem/TypeScript implementation
  -> Access operation registry when Access is opened
  -> MCP response with result + operation metadata
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/adapters/mcp/tools.ts` | Modify | Register all parity tools and aliases. |
| `src/core/services/vba-sync-service.ts` | Create | Export/import/verify/reconcile/source-oriented VBA behavior. |
| `src/core/services/vba-test-service.ts` | Create | `run_vba`, `test_vba`, `compile_vba` behavior. |
| `src/core/services/access-query-tools-service.ts` | Create | Query/schema/discovery behavior. |
| `src/core/services/access-write-tools-service.ts` | Create | Guarded write and fixture behavior. |
| `src/core/services/access-maintenance-service.ts` | Create | Links, QueryDefs, relationships, ERD, compact/repair, form catalog/generation. |
| `scripts/*.ps1` | Create/Modify | PowerShell 5.1 runners for Access COM/DAO operations. |
| `test/**` | Create/Modify | Strict TDD coverage for each tool slice. |

## Interfaces / Contracts

```ts
export type LegacyMcpToolResult<T> = T & {
  operationId?: string;
  accessPath?: string;
  accessPid?: number;
  processStartTime?: string;
  status?: string;
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Tool registration parity | Assert all 46 legacy names appear in `tools/list`. |
| Unit | Request mapping | Mock services and verify each tool maps parameters correctly. |
| Unit | Safety defaults | Dry-run/write/fixture/cleanup guard tests. |
| Integration | PowerShell runner contracts | Mock process output and validate JSON parsing/operation metadata. |
| E2E | Real Access frontend/backend | Run curated probes from `docs/testing/mcp-access-e2e.md`. |

## Migration / Rollout

Keep legacy MCP available until #24 and child issues #25-#29 are closed. After every PR, update #24 tracker. Only after parity verification should clients be migrated fully to profile-installed Dysflow.

## Open Questions

None for planning. Tool-specific behavior questions should be captured in child PRs when implementation reaches that slice.
