# Apply Progress: forms-ui-factory-slice-4-mutation-primitives

## Status

All assigned issue #617 tasks are implemented for the single-PR size exception path.

## Completed Tasks

- [x] 1.1 Add RED Vitest coverage for `addControl`, `moveControl`, and `renameControl`.
- [x] 1.2 Add fixture preservation coverage for opaque form metadata (`PrtDevMode`, `Checksum`, `Format`/format bytes).
- [x] 1.3 Add MCP registry/dispatch RED coverage for `dysflow_form_add_control`, `dysflow_form_move_control`, and `dysflow_form_rename_control`.
- [x] 2.1 Implement pure FormIR mutation primitives with ordered-entry preservation and typed validation errors.
- [x] 2.2 Add shared mutation request/result types in `src/core/models/form-ir.ts`.
- [x] 2.3 Preserve opaque metadata during mutate/serialize and reject metadata loss.
- [x] 3.1 Register public MCP tools with exact `dysflow_` names and write-gate semantics.
- [x] 3.2 Route adapter handlers through the core mutation service.
- [x] 3.3 Reuse `import_modules` as the LoadFromText-style apply gate with best-effort source restore on failure.
- [x] 4.1 Add integration/adapter coverage for preservation, gate success routing, and safe failure restore.
- [x] 4.2 Document the three public mutation tools in `README.md`.
- [x] 4.3 Remove temporary scaffolding and keep shared helpers in production/test utilities.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 / 2.1 / 2.2 / 2.3 | `test/core/services/form-ir-mutation.test.ts` | Unit | ✅ existing form IR tests covered by full `pnpm test` | ✅ Failed first: missing `addControl`/`moveControl`/`renameControl` exports | ✅ Passed focused mutation suite | ✅ Add/move/rename happy paths + duplicate/missing-control edge cases | ✅ Extracted clone/search/metadata helpers |
| 1.2 / 4.1 | `test/integration/form-ir-mutation-preservation.test.ts` | Integration | ✅ existing serializer/load tests retained | ✅ Failed first: mutation exports missing | ✅ Passed with `vitest.integration.config.ts` | ✅ Add → move → rename chain validates preservation across multiple mutations | ✅ Fixture selection isolated in helpers |
| 1.3 / 3.1 | `test/adapters/mcp/form-mutation-tools.test.ts` | Unit/Adapter | ✅ MCP parity/write-gate tests covered by full `pnpm test` | ✅ Failed first: tools absent from registry/schema/routes | ✅ Passed focused MCP mutation suite | ✅ Registration, schema, dry-run routing, and write-gate apply cases | ✅ Reused dispatch route/write-gate patterns |
| 3.2 / 3.3 | `test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts` | Adapter | ✅ existing `VbaFormsAdapter` tests retained | ✅ Failed first: adapter did not handle mutation tools | ✅ Passed focused adapter mutation suite | ✅ Dry-run no-write, apply import gate, and failed-gate restore cases | ✅ Shared mutation handler for all three tools |
| 4.2 / 4.3 | README + contract tests | Docs/Contract | ✅ README/tool-count contract tests covered by full `pnpm test` | ✅ Full suite exposed outdated tool-count contracts | ✅ Full suite passed after docs/contracts updated | ✅ Tool count, output contract, parity, schema-prop contracts | ✅ Updated counts and descriptions without temporary scaffolding |

## Test Summary

- **Total tests written**: 15 new tests across 4 new test files.
- **Total tests passing**: 1841/1841 in `pnpm test`; focused text-preservation test 1/1.
- **Layers used**: Unit, adapter/MCP contract, integration fixture preservation.
- **Approval tests**: None — this was additive behavior, not a refactor-only task.
- **Pure functions created**: 3 public mutation primitives (`addControl`, `moveControl`, `renameControl`) plus internal pure helpers.

## Verification Commands

| Command | Exit | Notes |
|---------|------|-------|
| `pnpm vitest run test/core/services/form-ir-mutation.test.ts test/integration/form-ir-mutation-preservation.test.ts test/adapters/mcp/form-mutation-tools.test.ts test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts` | 0 | Focused unit/adapter RED→GREEN confirmation after implementation. Default config excludes the integration file, so 3 files / 14 tests ran here. |
| `pnpm vitest run -c vitest.integration.config.ts test/integration/form-ir-mutation-preservation.test.ts` | 0 | Focused text-preservation coverage; this does not exercise a live Access LoadFromText import. |
| `pnpm test` | 0 | Full Vitest suite: 154 files, 1841 tests. |
| `pnpm build` | 0 | TypeScript build passed. |`n| `pnpm lint` | 0 | TypeScript/test typecheck and Biome checks passed. |
| `pnpm test:integration` | 124 timeout | Full integration suite exceeded the 244s command timeout in this environment; focused integration coverage above passed. No success was claimed for the timed-out full integration suite. |

## Deviations / Caveats

- The canonical `ardelperal/VBA_TOOLKIT_BENCH/Gestion_Riesgos.accdb` fixture was not present under this workspace. The preservation test checks the canonical candidate path first and falls back to the available real `E2E_testing/src/forms/Form_frmSplash.form.txt` text fixture instead. This proves source serialization preservation, not live Access LoadFromText acceptance for the canonical bench database.
- `pnpm test:integration` timed out after 244s; focused text-preservation passed, and the adapter apply gate is covered with mocked `import_modules` success/failure. Full live Access integration remains unproven in this environment.
- `.atl/skill-registry.md` had pre-existing unrelated modifications and was intentionally not touched.

## Workload / PR Boundary

- Mode: single PR with maintainer-approved size exception (`PR unico`).
- Boundary: issue #617 only — mutation primitives, MCP tools, adapter gate, docs, and tests. Issue #618/create_from_template was not implemented.

## Post-Review Remediation

Fresh-context review found P1 issues around path safety, rename/event semantics, and overstated LoadFromText evidence. Remediation completed before release:

- Mutation apply now validates canonical managed source paths: `.form.txt`/`.report.txt` only, inside the resolved `destinationRoot`/`projectRoot`, and outside the Dysflow production runtime.
- Mutation tools are marked `mutatesBinary:true` and `mutatesFilesystem:true`; dry-run remains allowed without writes, while `apply:true` is write-gated.
- `renameControl` rejects controls with `[Event Procedure]` bindings instead of claiming safe event-procedure renaming.
- Coordinate schemas now allow `0` for `left`/`top`.
- Documentation and apply evidence now distinguish mocked `import_modules` gate coverage from live Access LoadFromText coverage.
- `git diff --check`, `pnpm test`, `pnpm build`, and `pnpm lint` pass locally after remediation.
