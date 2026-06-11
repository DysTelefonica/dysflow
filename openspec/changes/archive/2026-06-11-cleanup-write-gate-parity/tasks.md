# Tasks: Cleanup Write-Gate Parity

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 120-180 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-chain |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | HTTP cleanup gate + adapter tests | PR 1 | Base = main; red/green slice in `test/adapters/http/server.test.ts` and `src/adapters/http/server.ts`. |
| 2 | Docs/verification sweep | PR 1 | Same PR; update `README.md` and `docs/api/http-api.md`, then verify `pnpm test` + `pnpm build`. |

## Phase 1: RED — HTTP parity tests

- [x] 1.1 Add a failing test in `test/adapters/http/server.test.ts` proving `/access/cleanup` rejects `force: true` when writes are disabled.
- [x] 1.2 Add a failing test in `test/adapters/http/server.test.ts` proving non-force cleanup still reaches core cleanup checks when writes are disabled.
- [x] 1.3 Keep the MCP cleanup baseline covered in `test/adapters/mcp/tools.test.ts` so force-only gating remains the parity reference.
- [x] 1.4 Add a focused HTTP test proving `force: true` cleanup reaches `cleanupService` when writes are enabled.

## Phase 2: GREEN — HTTP route change

- [x] 2.1 Add the inline `force && !writesEnabled` guard in `src/adapters/http/server.ts` before `cleanupService.cleanup()`.
- [x] 2.2 Reuse the existing `sendWritesDisabled()` HTTP response path so the blocked-force case matches other write routes.
- [x] 2.3 Preserve the non-force path so terminal/failed Dysflow-owned cleanup still flows to core eligibility checks unchanged.

## Phase 3: Verification

- [x] 3.1 Run the focused Vitest coverage for `test/adapters/http/server.test.ts` and `test/adapters/mcp/tools.test.ts`.
- [x] 3.2 Run `pnpm test` and `pnpm build` to confirm the adapter change and type surface stay clean.
- [x] 3.3 Verify the HTTP 403 response for blocked `force: true` cleanup and the allowed non-force path against the spec scenarios.
- [x] 3.4 Verify the HTTP force-enabled cleanup path reaches `cleanupService` and would fail if the route blocked all force cleanup.

## Phase 4: Cleanup / Documentation

- [x] 4.1 Update `README.md` and `docs/api/http-api.md` to say only `force: true` cleanup is write-gated; non-force cleanup remains allowed.
- [x] 4.2 Cross-check `openspec/changes/cleanup-write-gate-parity/specs/http-api-adapter/spec.md` against the final implementation and adjust wording only if behavior changed.
