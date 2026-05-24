# Tasks: Underscore Modern MCP Tool Names

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 180-260 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR with tests and docs |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Rename modern MCP tool names and update references | PR 1 | Include tests, smoke scripts, docs. |

## Phase 1: RED

- [x] 1.1 Add `test/adapters/mcp/tools.test.ts` regression asserting modern `dysflow_` names and no dots.
- [x] 1.2 Run the targeted MCP tests and confirm the regression fails before implementation.

## Phase 2: GREEN

- [x] 2.1 Rename modern tool names in `src/adapters/mcp/tools.ts`. (Already using underscores since v0.7.6; added `MODERN_TOOL_NAMES` export as authoritative constant.)
- [x] 2.2 Update MCP unit, architecture, release matrix, and smoke references to the underscore names. (All already using underscore names; no changes needed.)
- [x] 2.3 Update README, architecture docs, E2E docs, and changelog references. (All already using underscore names; no changes needed.)

## Phase 3: VERIFY

- [x] 3.1 Run `pnpm test`. (459 tests pass, 41 files.)
- [x] 3.2 Run `rg "dysflow\.(vba|query|doctor|access)"` over source, tests, E2E scripts, and docs. (0 matches in src/, E2E_testing/; 1 intentional comment in test file.)
- [x] 3.3 Review diff size stays under 400 changed lines. (Minimal diff: ~30 lines added.)
