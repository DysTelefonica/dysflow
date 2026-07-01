# Tasks: forms-ui-factory-slice-5-create-from-template

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 490–580 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 3 stacked-to-main PRs |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

## Suggested Work Units

| Unit | Goal | PR | Base | Notes |
|------|------|----|------|-------|
| 1 | Core `cloneFormFromTemplate` + `applyTokenMap` + types | PR 1 | main | Vitest unit tests only; self-contained |
| 2 | MCP registration + adapter wiring + restore-on-failure + adapter/MCP tests | PR 2 | main (stacked) | Depends on PR 1 core functions |
| 3 | Integration test against bench + README + tool-parity contract | PR 3 | main (stacked) | Final PR; all coverage together |

---

## Phase 1: RED — Core unit tests (PR 1 foundation)

- [x] 1.1 Add `CloneFromTemplateOptions`, `CloneFromTemplateResult`, `TokenMap`, `MissingTokenPolicy` types to `src/core/models/form-ir.ts`
- [x] 1.2 Add `FORM_TOKEN_MAP_INVALID`, `FORM_TARGET_EXISTS` error codes to `src/core/services/form-ir-service.ts` `FormMutationError`
- [x] 1.3 RED: write failing unit tests in `src/core/services/form-ir-service.test.ts` — all-mapped replaces tokens, missing-pass-through warns, strict-missing rejects, invalid-map rejected, byte-equivalence vs manual replace, `PrtDevMode`/`Checksum` preserved, target-exists no-overwrite rejected

## Phase 2: GREEN — Core implementation (PR 1 complete)

- [x] 2.1 Implement `applyTokenMap(ir, tokenMap, missingTokenPolicy)` in `src/core/services/form-ir-service.ts` — walks FormIR scalar strings + non-preserved blob lines; skips `Checksum`/`PrtDevMode`/`Format` keys
- [x] 2.2 Implement `cloneFormFromTemplate(sourceIr, opts)` returning `CloneFromTemplateResult` — calls `applyTokenMap`, then `assertMetadataPreserved`, returns typed summary
- [x] 2.3 GREEN: confirm `pnpm vitest run src/core/services/form-ir-service.test.ts` passes

## Phase 3: RED + GREEN — Adapter and MCP (PR 2)

- [x] 3.1 Add `sourceForm`, `targetForm`, `tokenMap`, `strictMissingTokens`, `overwrite`, `missingTokenPolicy` schema atoms to `src/shared/validation/schema-props.ts`
- [x] 3.2 RED: add failing tests to `src/adapters/vba-sync/vba-forms-adapter-mutation.test.ts` — bench-first resolve, dry-run no writes, apply calls `import_modules`, gate-failure restore, overwrite path, strict-missing, missing-token warning
- [x] 3.3 GREEN: implement `cloneFormFromTemplate` handler in `src/adapters/vba-sync/vba-forms-adapter.ts` — bench-cache-first resolveSource, dryRun vs apply branch, capture originalSource, best-effort restore on gate failure
- [x] 3.4 RED: add failing tests to `test/adapters/mcp/form-mutation-tools.test.ts` — tool registered in list, schema parity, dispatch routes with `mutatesBinary:true, mutatesFilesystem:true`
- [x] 3.5 GREEN: wire `dysflow_create_form_from_template` in `src/adapters/mcp/mcp-tool-registry.ts`; add route in `src/adapters/mcp/dispatch-routes.ts`; add JSON schema in `src/adapters/mcp/schemas/vba-sync-schemas.ts`; add to `src/adapters/mcp/tool-parity-registry.ts` `implementedToolNames`
- [x] 3.6 GREEN: confirm `pnpm vitest run src/adapters/vba-sync/vba-forms-adapter-mutation.test.ts test/adapters/mcp/form-mutation-tools.test.ts` passes

## Phase 4: Integration + restore tests (PR 3 foundation)

- [x] 4.1 RED: add failing integration test to `test/integration/form-ir-mutation-preservation.test.ts` — inject `{{FormName}}` into bench cache source at test time, clone to `Form_FormNuevaAuditoria`, byte-compare result against manual string-replace of same tokens; assert `PRESERVED_METADATA_KEYS` untouched; skip when bench cache absent
- [x] 4.2 GREEN: run integration test; confirm bench round-trip is byte-equivalent
- [x] 4.3 Verify restore-on-failure path: mock a gate failure and assert source is restored and typed error returned

## Phase 5: Docs + parity contract (PR 3 complete)

- [x] 5.1 Update `README.md` MCP tools table: add `dysflow_create_form_from_template` entry with signature, `dry-run` default, and token-map description
- [x] 5.2 Update `src/adapters/mcp/tool-parity-registry.ts` `implementedToolNames` and description to reflect the new tool
- [x] 5.3 Confirm `pnpm test` safety net is green
