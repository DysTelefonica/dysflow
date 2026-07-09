# Tasks: feat-forms-output-modes

## Review Workload Forecast
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: RED — Write failing unit tests
- [ ] 1.1 Add schema validation unit tests in [test/adapters/mcp/schemas/vba-sync-schemas.test.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/test/adapters/mcp/schemas/vba-sync-schemas.test.ts) to verify `outputMode` is validated (accepted values: `"summary"`, `"file"`, `"full"`; rejected otherwise) on all 6 schemas. Assert `includeSerialized` is accepted only on `form_serialize`.
- [ ] 1.2 Add tests to [test/adapters/vba-sync/vba-forms-serialize-output-contract.test.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/test/adapters/vba-sync/vba-forms-serialize-output-contract.test.ts) for `form_serialize` to assert shape for `"summary"` (no `serialized`), `"file"` (only code, no metrics/report), `"full"` (all fields), and fallback logic.
- [ ] 1.3 Add tests to [test/adapters/vba-sync/vba-forms-serialize-output-contract.test.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/test/adapters/vba-sync/vba-forms-serialize-output-contract.test.ts) for `form_deserialize` dry-run to assert `"summary"` (omits `preview`) and `"file"` (only `sourcePath` and `preview`).
- [ ] 1.4 Add tests to [test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts) for mutations dry-run to assert `"summary"` (omits `source`) and `"file"` (only `sourcePath` and `source`).
- [ ] 1.5 Add tests to [test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts) for clone dry-run and apply to assert `"summary"` (omits `targetSource`) and `"file"` (only `sourcePath`, `targetPath`, and `targetSource`).

## Phase 2: GREEN — Implement Schema Changes
- [ ] 2.1 Declare `outputMode` and `includeSerialized` in `SCHEMA_PROPS` in [src/shared/validation/schema-props.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/shared/validation/schema-props.ts).
- [ ] 2.2 Add `outputMode` property to target tool schemas, and `includeSerialized` to `form_serialize` in [src/adapters/mcp/schemas/vba-sync-schemas.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/adapters/mcp/schemas/vba-sync-schemas.ts).

## Phase 3: GREEN — Implement Handler Filters
- [ ] 3.1 Implement filtering and fallback resolution in `serializeForm` in [src/adapters/vba-sync/vba-forms-serialization-tools.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/adapters/vba-sync/vba-forms-serialization-tools.ts).
- [ ] 3.2 Implement dry-run filtering in `deserializeForm` in [src/adapters/vba-sync/vba-forms-serialization-tools.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/adapters/vba-sync/vba-forms-serialization-tools.ts).
- [ ] 3.3 Implement dry-run filtering in `mutateForm` in [src/adapters/vba-sync/vba-forms-mutation-tools.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/adapters/vba-sync/vba-forms-mutation-tools.ts).
- [ ] 3.4 Implement dry-run and apply filtering in `cloneFormFromTemplate` in [src/adapters/vba-sync/vba-forms-clone-tools.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/adapters/vba-sync/vba-forms-clone-tools.ts).

## Phase 4: Verification and Documentation
- [ ] 4.1 Run `pnpm test` and verify all tests pass.
- [ ] 4.2 Re-index CodeGraph with `codegraph index C:\Users\adm1\.gemini\antigravity-cli\worktrees\issue-793`.
