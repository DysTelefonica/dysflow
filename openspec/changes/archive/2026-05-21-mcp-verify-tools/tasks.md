# Tasks: MCP Verify Tools

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | >400 plus E2E artifacts |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: repo-local projectId resolution + verify/reconcile/exists + parity registry + tests + README + full E2E_testing artifacts by maintainer request; PR 2+: remaining unsupported tools |
| Delivery strategy | force-chained with maintainer-approved size exception for PR 1 |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Repo-local `projectId`, safe `verify_*` + `reconcile_binary` behavior, compatibility surface, README, and E2E artifacts | PR 1 | Implement + tests + registry visibility + local MCP smoke baseline checks; include E2E artifacts despite review budget by maintainer request. |

## Phase 1: Foundation / Schema Contracts

- [ ] 1.1 Inspect current legacy registry in `src/adapters/mcp/legacy-parity-registry.ts` and ensure `verify_code`, `verify_binary`, and `reconcile_binary` are explicitly marked as implemented while `init_project` and `normalize_documents` remain hidden compatibility stubs.
- [ ] 1.2 Add/update tests in `test/adapters/mcp/legacy-parity-registry.test.ts` to verify the implemented-vs-hidden split is asserted explicitly and deterministically.
- [ ] 1.3 Update `test/adapters/mcp/tools.test.ts` with one RED test for `tools/list` now surfacing `verify_code`, `verify_binary`, `reconcile_binary` and excluding hidden stubs.

## Phase 2: Core Service Behavior (RED/GREEN)

- [ ] 2.1 Write failing tests in `test/core/services/vba-sync-legacy-service.test.ts` for `verify_code` and `verify_binary` that use temp directories, simulate one matching module + one different module + one binary-only module, pass `diff: true`, and assert `dryRun: true` / `willModifyAccess: false`.
- [ ] 2.2 Implement `verify_code`/`verify_binary` in `src/core/services/vba-sync-legacy-service.ts` to export Access VBA into a temporary root (not `destinationRoot`), perform source-vs-export comparison, and omit `diffs` unless requested.
- [ ] 2.3 Add/keep test and implementation path for `exists` aliasing (`name` and `moduleName`) using the same downstream `moduleNames` contract.
- [ ] 2.4 Add or refine module filtering tests in `test/core/services/vba-sync-legacy-service.test.ts` so `moduleNames` limits compared modules and unrelated modules are not returned.
- [ ] 2.5 Add repo-local config tests proving matching `projectId` loads `.dysflow/project.json`, preserves `allowWrites`, and mismatched ids fail with `CONFIG_PROJECT_ID_MISMATCH`.

## Phase 3: Adapter Execution Wiring

- [ ] 3.1 Add/adjust MCP schema entries in `src/adapters/mcp/tools.ts` for `verify_code`, `verify_binary`, `reconcile_binary`, and `exists` alias input fields, then add a regression test proving validation accepts both `name` and `moduleName`.
- [ ] 3.2 Add/adjust dispatch test in `test/adapters/mcp/tools.test.ts` proving `verify_binary` is executed via `legacyToolService.execute("verify_binary", input)`.
- [ ] 3.3 Add a failing-to-green test and implementation for unsupported hidden legacy calls (`init_project` / `normalize_documents`) returning explicit unsupported JSON (`ok:false`, `supported:false`) while staying callable; visible VBA sync tools without `legacyToolService` must return `MCP_SERVICE_UNAVAILABLE`, not `LEGACY_TOOL_NOT_IMPLEMENTED`.
- [ ] 3.4 Implement `reconcile_binary` service behavior in `src/core/services/vba-sync-legacy-service.ts` to reuse compare output and include `recommendation`, `ok`, `dryRun: true`, and `willModifyAccess: false` without applying updates.

## Phase 4: Verification and E2E Smoke

- [ ] 4.1 Run focused Vitest subset for the touched files first (`pnpm test test/core/services/vba-sync-legacy-service.test.ts test/adapters/mcp/tools.test.ts test/adapters/mcp/legacy-parity-registry.test.ts`), then full `pnpm test`.
- [ ] 4.2 Run `pnpm build` to lock in adapter/core contracts before PR handoff.
- [ ] 4.3 Run the local MCP fast smoke from the correct `E2E_testing` context and validate tool list contains the three new verify tools while hidden stub expectations use explicit unsupported JSON, not `LEGACY_TOOL_NOT_IMPLEMENTED`.
- [ ] 4.4 Run `node .\E2E_testing\mcp-e2e-smoke.mjs` (against `E2E_testing\Expedientes.accdb`) and verify compare/reconcile/diff paths are non-mutating with `ok` + `willModifyAccess: false` in reports.

## Phase 5: Cleanup / PR Readiness

- [ ] 5.1 Reconcile any temporary test fixture noise, remove brittle assertions, and keep snapshots/reports deterministic.
- [ ] 5.2 Update `openspec/changes/mcp-verify-tools/` task progress checkboxes in preparation for `sdd-apply` and include results of test + E2E in `verify-report.md` references.
- [ ] 5.3 Before PR 1 handoff, run a final diff review and include README plus `E2E_testing/**` artifacts as part of the E2E evidence scope by explicit maintainer decision; still exclude secrets and ignored Access binaries/locks.
