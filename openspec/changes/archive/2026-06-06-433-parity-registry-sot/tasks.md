# Tasks: Parity Registry Single Source of Truth (#433)

## Task list

- [x] Remove `HIDDEN_STUB_TOOL_NAMES` definition from `src/adapters/mcp/dispatch.ts`.
- [x] Use `isHiddenStubTool` in `src/adapters/mcp/dispatch.ts` to set the `hidden` property.
- [x] Remove `HIDDEN_STUB_TOOL_NAMES` re-export from `src/adapters/mcp/tools.ts`.
- [x] Update `test/adapters/mcp/release-matrix-gate.test.ts` to use `pendingToolNames()`.
- [x] Update `test/adapters/mcp/tool-parity-registry.test.ts` to use `isHiddenStubTool()` and `pendingToolNames()`.
- [x] Run `pnpm test` and `pnpm build` to verify changes.
- [x] Run Biome checks and fix formatting on changed files.
- [x] Commit change directly to `main` with closing comment.

## Files changed

- `src/adapters/mcp/dispatch.ts`
- `src/adapters/mcp/tools.ts`
- `test/adapters/mcp/release-matrix-gate.test.ts`
- `test/adapters/mcp/tool-parity-registry.test.ts`
- `openspec/changes/433-parity-registry-sot/proposal.md`
- `openspec/changes/433-parity-registry-sot/tasks.md`
