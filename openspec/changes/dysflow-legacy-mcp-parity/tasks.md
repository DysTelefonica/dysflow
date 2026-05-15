# Tasks: Dysflow Legacy MCP Parity

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 2500-6000+ across all slices |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 foundation/tool inventory -> PR 2 VBA sync -> PR 3 VBA execution/testing -> PR 4 query/schema -> PR 5 writes/fixtures -> PR 6 links/maintenance/forms |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Parity inventory harness and alias registry foundation | #24/#25 prelude | No Access writes; pure tests and registry structure. |
| 2 | VBA sync source/binary tools | #25 | Export/import/verify/reconcile/delete/fix/init/normalize. |
| 3 | VBA run/test/compile tools | #26 | ByRef, manifests, compile, operation metadata. |
| 4 | Query/schema/discovery tools | #27 | Read-only backend inspection. |
| 5 | Guarded writes/fixtures | #28 | Dry-run defaults and allow/deny safety. |
| 6 | Links/query maintenance/forms | #29 | Link repair, QueryDefs, ERD, compact/repair, form generator/catalog. |

## Phase 1: Foundation / Inventory

- [ ] 1.1 Write failing test that extracts/declares all 46 legacy MCP tool names and asserts Dysflow exposes them.
- [ ] 1.2 Add architecture test forbidding runtime imports or process invocations into `C:\Proyectos\workflow\skills\*`.
- [ ] 1.3 Introduce a typed legacy parity registry in `src/adapters/mcp` with tool names, descriptions, and service binding placeholders.
- [ ] 1.4 Make current tools expose backwards-compatible aliases for `list_access_operations`, `cleanup_access_operation`, `run_vba`, and basic query where safe.
- [ ] 1.5 Run `pnpm build` and `pnpm test`.

## Phase 2: VBA Sync Slice (#25)

- [ ] 2.1 Write failing MCP mapping tests for export/import/list/exists/verify/reconcile/delete/fix/init/normalize tools.
- [ ] 2.2 Implement `vba-sync-service` contracts and PowerShell 5.1 runner calls.
- [ ] 2.3 Add safety tests for backups/destructive delete/reconcile apply.
- [ ] 2.4 Update README parity matrix and issue tracker.

## Phase 3: VBA Execution / Testing Slice (#26)

- [ ] 3.1 Write failing tests for `run_vba`, `test_vba`, and `compile_vba` legacy-compatible parameters.
- [ ] 3.2 Implement ByRef error pattern, test manifest execution, summary truncation, and compile invocation.
- [ ] 3.3 Assert operation metadata survives success, failure, timeout, and cleanup-pending cases.

## Phase 4: Query / Schema Slice (#27)

- [ ] 4.1 Write failing tests for read-only query/schema tools.
- [ ] 4.2 Implement backend/frontend resolution compatible with env vars and explicit paths.
- [ ] 4.3 Add list/count/distinct/schema/relationships/compare/list-files behavior.

## Phase 5: Write / Fixture Slice (#28)

- [ ] 5.1 Write failing tests proving dry-run defaults and write guards.
- [ ] 5.2 Implement exec/run script/create/drop/seed/teardown tools.
- [ ] 5.3 Add deny/allow table tests and no-secret-output tests.

## Phase 6: Links / Maintenance / Forms Slice (#29)

- [ ] 6.1 Write failing tests for linked table and localization tools.
- [ ] 6.2 Write failing tests for QueryDef export/import, ERD, compact/repair.
- [ ] 6.3 Write failing tests for validate/generate/catalog form tools.
- [ ] 6.4 Implement services/runners and docs.

## Phase 7: Verification / Archive

- [ ] 7.1 Run full `pnpm build` and `pnpm test`.
- [ ] 7.2 Run E2E MCP probes against `NoConformidades.accdb` and `NoConformidades_Datos.accdb`.
- [ ] 7.3 Update #24 tracker with all child PRs and close only after all child issues are closed.
- [ ] 7.4 Archive SDD change into baseline specs.
