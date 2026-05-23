# Design: Underscore Modern MCP Tool Names

## Technical Approach

Rename the five modern MCP tool names at the adapter registry boundary. The `DysflowMcpTool.name` field is the source of truth used by `tools/list` and `tools/call`, so the change stays localized and callers/tests/docs follow it.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|----------|--------|-------------------------|-----------|
| Canonical names | Use `dysflow_*` names only | Keep dotted aliases | Aliases create two public contracts and can hide client failures. |
| Scope | Modern tools only | Rename all tools | Legacy tools already satisfy underscore style and are a larger compatibility surface. |
| Compatibility framing | Client compatibility fix | MCP spec violation | MCP permits dots; the problem is target client/tooling compatibility. |

## Data Flow

```text
createDysflowMcpTools()
  -> JsonLineMcpStdioRuntime.registerTool(tool.name)
  -> tools/list advertises tool.name
  -> tools/call resolves exact tool.name
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/adapters/mcp/tools.ts` | Modify | Rename five modern tool names. |
| `test/adapters/mcp/tools.test.ts` | Modify | Update expectations and add no-dot regression. |
| `test/adapters/mcp/release-matrix-gate.test.ts` | Modify | Update split-mode lookup. |
| `test/architecture/core-boundary.test.ts` | Modify | Use underscore names. |
| `E2E_testing/mcp-e2e*.mjs` | Modify | Use underscore names in smoke calls. |
| `README.md`, `docs/**`, `CHANGELOG.md` | Modify | Document canonical names. |

## Interfaces / Contracts

Modern public MCP tool names become:

```text
dysflow_vba_execute
dysflow_query_execute
dysflow_doctor
dysflow_access_operations_list
dysflow_access_cleanup
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | Registry names and handlers | Vitest against `createDysflowMcpTools`. |
| Architecture | Adapter/core wiring | Existing boundary test with renamed tools. |
| Smoke | Real MCP calls | Existing E2E scripts updated to canonical names. |

## Migration / Rollout

No migration required. This is a breaking MCP tool-name compatibility correction before release.

## Open Questions

None.
