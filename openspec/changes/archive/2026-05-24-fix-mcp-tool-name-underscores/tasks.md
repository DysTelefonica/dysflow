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

- [ ] 1.1 Add `test/adapters/mcp/tools.test.ts` regression asserting modern `dysflow_` names and no dots.
- [ ] 1.2 Run the targeted MCP tests and confirm the regression fails before implementation.

## Phase 2: GREEN

- [ ] 2.1 Rename modern tool names in `src/adapters/mcp/tools.ts`.
- [ ] 2.2 Update MCP unit, architecture, release matrix, and smoke references to the underscore names.
- [ ] 2.3 Update README, architecture docs, E2E docs, and changelog references.

## Phase 3: VERIFY

- [ ] 3.1 Run `pnpm test`.
- [ ] 3.2 Run `rg "dysflow\.(vba|query|doctor|access)"` over source, tests, E2E scripts, and docs.
- [ ] 3.3 Review diff size stays under 400 changed lines.
