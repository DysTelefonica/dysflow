# Tasks: Split Dispatch God File

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900-1200 total across chain; target each PR under 400 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 approval tests → PR 2 routes/common → PR 3 aliases/factory → PR 4 cleanup/verification |
| Delivery strategy | force-chained |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Lock MCP contract with port tests | PR 1 | base `staging`; RED first; no production split |
| 2 | Extract routes/common helpers | PR 2 | base PR 1 branch; `dispatch.ts` re-exports |
| 3 | Extract alias/factory handlers | PR 3 | base PR 2 branch; preserve handlers and guards |
| 4 | Cleanup imports and full verification | PR 4 | base PR 3 branch; run `pnpm test` |

## Phase 1: RED Port Contract Coverage

- [ ] 1.1 In `test/adapters/mcp/tools.test.ts`, add/extend approval coverage for complete tool names, descriptions, schemas, hidden flags, and duplicate protection via `createDysflowMcpTools`/exports.
- [ ] 1.2 In `test/adapters/mcp/tools.test.ts`, add handler contract cases for alias `run_vba` args parsing, cleanup unavailable, and captured fake core-service requests.
- [ ] 1.3 In `test/adapters/mcp/tools.dry-run.test.ts`, verify read-mode write rejection plus allowed SELECT/CTE pass-through for alias and modern query paths; run focused `pnpm test` and keep RED evidence where coverage is new.

## Phase 2: Routes and Shared Helpers

- [ ] 2.1 Create `src/adapters/mcp/dispatch-routes.ts` with `McpToolRoute`, `MCP_TOOL_ROUTES`, `MCP_TOOL_QUERY_ACTIONS`, and `queryActionFor`.
- [ ] 2.2 Create `src/adapters/mcp/dispatch-common.ts` with `writesDisabled`, `invalidInput`, `isWriteAllowed`, `mcpSchemaFor`, `parseMcpArgsJson`, and `handleValidatedMcpWrite`.
- [ ] 2.3 Update `src/adapters/mcp/dispatch.ts` to import/re-export routes/common without changing `registerMcpToolList` or `registerMcpTools`; run focused MCP tests.

## Phase 3: Alias and Dispatch Factory Extraction

- [ ] 3.1 Create `src/adapters/mcp/alias-tools.ts` with `ALIAS_TOOL_NAMES` and `buildAliasTools`, preserving write gating, query aliases, and `run_vba` behavior.
- [ ] 3.2 Create `src/adapters/mcp/dispatch-factory.ts` with `rejectWriteSqlInReadMode` and `createDispatchTool`, preserving route mapping, hidden flags, and result translation.
- [ ] 3.3 Reduce `src/adapters/mcp/dispatch.ts` to registration facade plus compatibility re-exports; run focused MCP tests.

## Phase 4: Cleanup and Verification

- [ ] 4.1 Adjust `src/adapters/mcp/tools.ts` imports/re-exports only if needed; keep public exports `ALIAS_TOOL_NAMES`, `MCP_TOOL_QUERY_ACTIONS`, `MCP_TOOL_ROUTES`, `registerMcpToolList`, and `rejectWriteSqlInReadMode`.
- [ ] 4.2 Verify clean architecture with no `src/core/**` imports from `src/adapters/**`; do not move MCP orchestration into core.
- [ ] 4.3 Run `pnpm test`; record implementation commits in this file during apply per SDD traceability.
