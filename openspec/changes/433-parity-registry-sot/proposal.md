# Proposal: Parity Registry Single Source of Truth (#433)

## Problem

Currently, `HIDDEN_STUB_TOOL_NAMES` is maintained as a hard-authored `Set` in `src/adapters/mcp/dispatch.ts` containing `["verify_binary", "reconcile_binary"]`.
At the same time, the parity registry in `src/adapters/mcp/tool-parity-registry.ts` lists these tools with status `"pending"`.
This constitutes a double source of truth. If a new tool is added to the parity registry as `"pending"`, it must also be added manually to `HIDDEN_STUB_TOOL_NAMES` in `dispatch.ts` to be hidden correctly from `tools/list` while remaining callable. If the two lists diverge, tests fail or the MCP runtime leaks unusable stubs.

## Options

1. **Keep duplicate sets with test guards** - Keep `HIDDEN_STUB_TOOL_NAMES` and assert they match in tests (current state).
2. **Derive hidden status from parity registry** - Remove `HIDDEN_STUB_TOOL_NAMES` completely and query the parity registry (`isHiddenStubTool` or `pendingToolNames()`) to determine whether a tool is a pending stub.

## Decision

**Option 2** — Derive hidden status from the parity registry.
We will:
- Remove `HIDDEN_STUB_TOOL_NAMES` from `dispatch.ts` and its re-export from `tools.ts`.
- Use `isHiddenStubTool(name)` in `dispatch.ts` to set the `hidden: true` flag.
- Update tests that assert on `HIDDEN_STUB_TOOL_NAMES` to use the helper functions `pendingToolNames()` or `isHiddenStubTool()` from `tool-parity-registry.ts`.
- This ensures the parity registry is the single source of truth for tool implementation status.
