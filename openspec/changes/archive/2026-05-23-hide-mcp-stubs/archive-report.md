# Archive Report: hide-mcp-stubs

**Change**: hide-mcp-stubs
**Status**: CLOSED — Merged to main
**PR**: #299
**Issue**: #298
**Commit**: 1297a04
**Archive Date**: 2026-05-23

## Summary

The change to hide unimplemented MCP stub tools (`verify_binary` and `reconcile_binary`) from the `tools/list` response is complete and merged. All 401 tests pass; release matrix gate confirms 2 hidden stubs and 48 visible tools.

## Implementation Summary

### Files Changed (5 total, ~10 lines)
1. **src/adapters/mcp/tools.ts**: Populated `HIDDEN_STUB_TOOL_NAMES` with `["verify_binary", "reconcile_binary"]`
2. **src/adapters/mcp/legacy-parity-registry.ts**: Removed the two tool names from `implementedToolNames`
3. **test/adapters/mcp/release-matrix-gate.test.ts**: Updated expected hidden stubs (0→2) and visible tools (50→48)
4. **test/adapters/mcp/tools.test.ts**: Trimmed `IMPLEMENTED_VERIFY_TOOL_NAMES` to `["verify_code"]` only
5. **test/adapters/mcp/legacy-parity.test.ts**: Updated pending tool count assertion (0→2) with arrayContaining check

## Key Design Decisions

- ADR 1: Hide, do not delete — used `HIDDEN_STUB_TOOL_NAMES` mechanism, preserving `tools/call` error contract
- ADR 2: Reclassify in parity registry — removed from `implementedToolNames` so biconditional invariant holds
- ADR 3: Strict TDD — failing assertions first, confirmed RED, then source edits, confirmed GREEN

## Rollback

`git revert 1297a04` restores prior behavior immediately.
