# Design: MCP Timeout Override

## Approach

Expose the already-supported core `timeoutMs` override at the MCP schema boundary for legacy VBA runner tools. `VbaSyncLegacyService` already resolves `params.timeoutMs` before project defaults, so this slice keeps implementation small and focused on adapter contract coverage.

## Files

| File | Change |
|------|--------|
| `src/adapters/mcp/tools.ts` | Add `timeoutMs` schema property and include it on legacy VBA runner tools. |
| `test/adapters/mcp/tools.test.ts` | Assert timeout schemas and dispatch acceptance. |
| `test/core/services/vba-sync-legacy-service.test.ts` | Existing coverage proves explicit timeout overrides project config. |

## Verification

- Focused Vitest for MCP schema and VBA service timeout behavior.
- `pnpm build`.
