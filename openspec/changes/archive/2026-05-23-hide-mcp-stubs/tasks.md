# Tasks: Hide MCP Stubs (`hide-mcp-stubs`)

GitHub issue: #298

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~10 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All 4 file changes in one batch | PR 1 | ~10 lines; RED→GREEN→VERIFY within single PR |

---

## Phase 1: RED — Write Failing Tests

- [ ] 1.1 In `test/adapters/mcp/release-matrix-gate.test.ts` line 35: change expected hidden stubs `0` → `2`. _(Spec: Release Gate Counts scenario)_
- [ ] 1.2 In `test/adapters/mcp/release-matrix-gate.test.ts` line 37: change expected visible `50` → `48`. _(Spec: Visible tool count is 48)_
- [ ] 1.3 In `test/adapters/mcp/release-matrix-gate.test.ts` line 40: update assertion `expect(stubCount).toBe(0)` → `expect(stubCount).toBe(2)`. _(Spec: Release Gate Counts scenario)_
- [ ] 1.4 In `test/adapters/mcp/release-matrix-gate.test.ts` line 42: update assertion `expect(visibleCount).toBe(50)` → `expect(visibleCount).toBe(48)`. _(Spec: Visible tool count is 48)_
- [ ] 1.5 In `test/adapters/mcp/tools.test.ts` line 313: trim `IMPLEMENTED_VERIFY_TOOL_NAMES` from `["verify_code", "verify_binary", "reconcile_binary"]` to `["verify_code"]`. _(Spec: Hidden Stub Registry Consistency)_
- [ ] 1.6 Run `pnpm vitest test/adapters/mcp/release-matrix-gate.test.ts test/adapters/mcp/tools.test.ts` — confirm RED (assertions must fail before touching source).

## Phase 2: GREEN — Apply Source Changes

- [ ] 2.1 In `src/adapters/mcp/tools.ts` line 572: replace `new Set<LegacyDysflowMcpToolName>([])` with `new Set<LegacyDysflowMcpToolName>(["verify_binary", "reconcile_binary"])`. _(Spec: Hidden Stub Registry Consistency; ADR 1)_
- [ ] 2.2 In `src/adapters/mcp/legacy-parity-registry.ts` lines 55-56: remove `"verify_binary",` and `"reconcile_binary",` from `implementedToolNames`. _(Spec: Stub names have pending status in parity registry; ADR 2)_
- [ ] 2.3 Run `pnpm vitest test/adapters/mcp/release-matrix-gate.test.ts test/adapters/mcp/tools.test.ts` — confirm GREEN (all targeted tests pass).

## Phase 3: VERIFY — Full Suite

- [ ] 3.1 Run `pnpm test` — confirm full suite is green with no regressions.
- [ ] 3.2 Verify `tools/call` on `verify_binary` and `reconcile_binary` still returns `LEGACY_TOOL_NOT_IMPLEMENTED` (covered by the parity biconditional test block — confirm it passes without edits). _(Spec: Hidden stub tools are callable and return the not-implemented contract)_
