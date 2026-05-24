# Proposal: Hide Unimplemented Legacy MCP Tools from tools/list

## Intent

`verify_binary` and `reconcile_binary` are advertised in MCP `tools/list` but every call returns `LEGACY_TOOL_NOT_IMPLEMENTED`. This misleads MCP clients into wiring up unusable operations and creates noisy fallback paths downstream. The `HIDDEN_STUB_TOOL_NAMES` mechanism in `src/adapters/mcp/tools.ts:572` already exists for exactly this case — it is just unpopulated, and the same tools are simultaneously declared "implemented" in `legacy-parity-registry.ts:55-56`, which is the conflict producing the leak.

## Scope

### In Scope
- Populate `HIDDEN_STUB_TOOL_NAMES` with `verify_binary` and `reconcile_binary`.
- Remove the same two names from `implementedToolNames` in `legacy-parity-registry.ts`.
- Update release-matrix-gate and tools tests to reflect new stub/visible counts.
- Keep both tools directly callable via `tools/call` so clients depending on the explicit `LEGACY_TOOL_NOT_IMPLEMENTED` error contract continue to work.

### Out of Scope
- Implementing `verify_binary` / `reconcile_binary`.
- Re-auditing the broader legacy parity registry beyond these two entries.
- Changing the public MCP tool schema or error code shape.
- Touching docs/changelog beyond what tests demand (handled in release prep, not this change).

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `mcp-legacy-parity`: stub tools must be excluded from `tools/list` projection while remaining invocable via `tools/call` with `LEGACY_TOOL_NOT_IMPLEMENTED`.

## Approach

1. Add `verify_binary` and `reconcile_binary` to `HIDDEN_STUB_TOOL_NAMES` so `createLegacyDispatchTool` flags them `hidden: true`.
2. Remove the same two names from `implementedToolNames` so the parity registry stops declaring them ready, eliminating the contradiction.
3. Update `release-matrix-gate.test.ts` assertions: `stubCount` 0 to 2, `visibleCount` 50 to 48.
4. Update `tools.test.ts:313` so `IMPLEMENTED_VERIFY_TOOL_NAMES` only contains `verify_code`.
5. Strict TDD: write the failing assertion in `release-matrix-gate.test.ts` (or a new focused test) BEFORE the source edits, confirm red, then apply the source changes to go green.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp/tools.ts` | Modified | Populate `HIDDEN_STUB_TOOL_NAMES` (+3 lines) |
| `src/adapters/mcp/legacy-parity-registry.ts` | Modified | Drop `verify_binary`, `reconcile_binary` from `implementedToolNames` (-2 lines) |
| `test/adapters/mcp/release-matrix-gate.test.ts` | Modified | Update `stubCount` and `visibleCount` (~4 lines) |
| `test/adapters/mcp/tools.test.ts` | Modified | Trim `IMPLEMENTED_VERIFY_TOOL_NAMES` (~1 line) |

Total diff estimate: ~10 lines. Well within the 400-line PR budget — single PR.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| External MCP clients silently relied on `verify_binary`/`reconcile_binary` being advertised | Low | Tools remain callable; they were already returning `LEGACY_TOOL_NOT_IMPLEMENTED`, so any working integration was already broken. |
| Hidden-stub mechanism interacts unexpectedly with parity registry consistency checks | Low | Tests `release-matrix-gate` and `tools.test.ts` already enforce the invariants; failing test first proves the change before merge. |
| Other not-implemented tools also need hiding and get missed | Low | Scope is intentionally limited to the two reported in #298; broader audit is a follow-up. |

## Rollback Plan

Single PR, single commit. Revert is `git revert <sha>` on `main`. No data migrations, no config changes, no schema changes. After revert the previous behavior (visible-but-failing stubs) is restored immediately.

## Dependencies

- GitHub issue #298 (linked).
- No external library or service changes.

## Success Criteria

- [ ] `tools/list` no longer includes `verify_binary` or `reconcile_binary`.
- [ ] `tools/call verify_binary` and `tools/call reconcile_binary` still return `LEGACY_TOOL_NOT_IMPLEMENTED` (not a routing failure).
- [ ] `release-matrix-gate.test.ts` asserts `stubCount === 2` and `visibleCount === 48` and passes.
- [ ] `tools.test.ts` stub-visibility describe block passes with the trimmed `IMPLEMENTED_VERIFY_TOOL_NAMES`.
- [ ] `pnpm test` is green on the full suite.
- [ ] PR diff stays under 400 lines (forecast: ~10).
