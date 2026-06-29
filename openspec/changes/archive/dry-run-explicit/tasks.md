# Tasks: Dry-Run Explicit Warning

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 120-220 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR: RED tests, adapter implementation, verification |
| Delivery strategy | auto-forecast |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Add failing coverage for omitted dry-run flags and no-warning explicit flags | PR 1 | Test-first slice in `test/adapters/mcp/tools.dry-run.test.ts`; use `test/adapters/mcp/tools.test.ts` only if content-shape integration needs existing fake services |
| 2 | Add adapter-local dry-run metadata and warning append | PR 1 | Keep `resolveIsDryRun(input): boolean` canonical and preserve `content[0]` |
| 3 | Verify focused behavior and build | PR 1 | Run `pnpm test` and `pnpm build` during apply/verify, not in tasks phase |

## Phase 1: RED Tests

- [ ] 1.1 In `test/adapters/mcp/tools.dry-run.test.ts`, add failing tests for omitted `apply`/`dryRun` on `exec_sql` returning dry-run plus appended `DRY_RUN_DEFAULT:`.
- [ ] 1.2 In `test/adapters/mcp/tools.dry-run.test.ts`, add failing dispatched-path coverage for `relink_directory` with omitted flags and stable `content[0]`.
- [ ] 1.3 In `test/adapters/mcp/tools.dry-run.test.ts`, assert no `DRY_RUN_DEFAULT:` for `dryRun:true`, `dryRun:false`, `apply:true`, and `apply:true` with `dryRun:true`.
- [ ] 1.4 If existing fake services are needed for response-shape proof, add the minimal failing assertion in `test/adapters/mcp/tools.test.ts`.

## Phase 2: GREEN Implementation

- [ ] 2.1 In `src/adapters/mcp/tools.ts`, keep exported `resolveIsDryRun(input): boolean` as the only canonical boolean resolver.
- [ ] 2.2 Add adapter-local `resolveDryRunState(input)` that delegates to `resolveIsDryRun` and reports `wasDefault` only when both flags are omitted own properties.
- [ ] 2.3 Add a small helper that appends a text content item containing `DRY_RUN_DEFAULT:` without replacing or reordering existing MCP content.
- [ ] 2.4 Wire the helper only through `handleValidatedLegacyWrite` and write-capable branches of `createLegacyDispatchTool`.

## Phase 3: Verification And Refactor

- [ ] 3.1 Run focused Vitest coverage for `test/adapters/mcp/tools.dry-run.test.ts` and `test/adapters/mcp/tools.test.ts` if touched.
- [ ] 3.2 Run full verification with `pnpm test` and `pnpm build`.
- [ ] 3.3 Refactor only to remove duplication introduced by the GREEN step; do not change core write semantics or Access service contracts.
