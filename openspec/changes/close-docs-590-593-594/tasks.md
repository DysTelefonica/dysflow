# close-docs-590-593-594 Tasks

## Review Workload Forecast

- 400-line budget risk: Low
- Chained PRs recommended: No
- Decision needed before apply: No
- Delivery path: single direct-to-main work-unit commits, per user instruction.

## Tasks

### Issue #590 — README MCP tool surface validation

- [x] 1.1 Read `gh issue view 590` and identify README/runtime tool-surface drift.
- [x] 1.2 Add a RED docs gate that validates README count and tool names against the MCP adapter tool list.
- [x] 1.3 Update README MCP count and inventory minimally.
- [x] 1.4 Run the focused docs gate and commit/push the issue work unit.

### Issue #593 — modern MCP tool descriptions

- [x] 2.1 Read `gh issue view 593` and identify weak modern tool descriptions.
- [x] 2.2 Add a RED MCP description gate for write-gate, dry-run/apply, cleanup, and key-argument wording.
- [x] 2.3 Update modern tool descriptions minimally.
- [x] 2.4 Run the focused MCP description gate and commit/push the issue work unit.

### Issue #594 — MCP agent workflow recipes

- [ ] 3.1 Read `gh issue view 594` and identify missing workflow recipes.
- [ ] 3.2 Add a RED docs gate for setup, sync, recovery, write enablement, target selection, and form/report recipes.
- [ ] 3.3 Update agent-facing docs minimally.
- [ ] 3.4 Run the focused docs gate and commit/push the issue work unit.

### Verify, archive, and close

- [ ] 4.1 Run `pnpm test`, `pnpm build`, `pnpm lint`, and `pwsh -Command "Invoke-Pester scripts/tests/"`.
- [ ] 4.2 Confirm GitHub Actions success.
- [ ] 4.3 Archive this change and add `archive-report.md`.
- [ ] 4.4 Commit/push archive.
- [ ] 4.5 Close #590, #593, and #594 with commit SHA + test evidence comments.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.x | `test/docs/mcp-readme-tool-surface.test.ts` | Docs gate | New gate; existing README failed before docs edit | RED: focused test failed with count `48` vs runtime `53` and missing five tool names | GREEN: `pnpm vitest run test/docs/mcp-readme-tool-surface.test.ts` passed | Count + inventory scenarios cover future count and name drift | None needed |
| 2.x | `test/adapters/mcp/mcp-tool-contracts.test.ts` | MCP contract gate | Existing contract tests passed before new gate | RED: focused test failed because `dysflow_vba_execute` lacked `procedureName` and other key safety wording | GREEN: `pnpm vitest run test/adapters/mcp/mcp-tool-contracts.test.ts` passed | Six modern tools covered for required args, write-gate, and cleanup/listing footguns | None needed |
| 3.x | Pending | Docs gate | Pending | Pending | Pending | Pending | Pending |

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| Pending | Issue #590 README MCP tool surface validation | 1.1-1.4 | RED/GREEN: `pnpm vitest run test/docs/mcp-readme-tool-surface.test.ts` | N/A |
| Pending | Issue #593 modern MCP tool descriptions | 2.1-2.4 | RED/GREEN: `pnpm vitest run test/adapters/mcp/mcp-tool-contracts.test.ts` | N/A |
| Pending | Issue #594 MCP workflow recipes | 3.1-3.4 | Pending | N/A |
| Pending archive commit | Archive and closeout | 4.1-4.5 | Pending | N/A |
