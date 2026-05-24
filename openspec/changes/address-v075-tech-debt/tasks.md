# Tasks: Address v0.7.5 Technical Debt

> Artifact store: hybrid | Change: address-v075-tech-debt | Date: 2026-05-23
> GitHub issue: #295 | Delivery: auto-chain, stacked-to-main | TDD: RED → GREEN → REFACTOR

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~420 (split across 4 PRs) |
| 400-line budget risk | Low (each PR individually within budget) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Est. lines | Notes |
|------|------|-----------|-----------|-------|
| 1 | Quick wins: env injection, dry-run canon, ctx props, sanitizer, test cleanup, non-null, registry purge | PR1 | ~71 | Base: main; all changes in tools.ts + preflight.ts + registry.ts + test files |
| 2 | Config sync/async dedup | PR2 | ~50 | Base: PR1 branch; single file dysflow-config.ts |
| 3 | VBA service split | PR3 | ~200 | Base: PR2 branch; 3 files modified, 2 created |
| 4 | install.ts helpers extraction | PR4 | ~80 | Base: PR3 branch; 2 files modified, 1 created |

---

## PR1 — Quick Wins (~71 lines)

**Scope**: `src/adapters/mcp/tools.ts`, `src/core/operations/access-operation-preflight.ts`, `src/core/operations/access-operation-registry.ts`, plus test files.

### Phase 1.1: InMemory Registry Purge Parity [RED → GREEN]

- [ ] 1.1.1 **[RED]** Create `test/core/operations/in-memory-registry-purge.test.ts` — table-driven tests asserting `create()` and `update()` delete records when status is in `PURGED_PERSISTENT_STATUSES`, and retain records for active statuses; assert parity with `FileRegistry`. _Spec: "InMemory Registry Purge Parity" scenarios._
- [ ] 1.1.2 **[GREEN]** In `src/core/operations/access-operation-registry.ts`: in `create()`, after building `stored`, call `records.delete(operationId)` if `PURGED_PERSISTENT_STATUSES.has(stored.status)`; in `update()`, call `this.records.delete(operationId)` if patched status is in the set.
- [ ] 1.1.3 **[VERIFY]** Run `pnpm test` — all tests green.

### Phase 1.2: Non-null Assertion Removal [RED → GREEN]

- [ ] 1.2.1 **[RED]** Add test in `test/core/operations/in-memory-registry-purge.test.ts` (or a new `access-operation-preflight.test.ts`) asserting `scanAndCleanOrphans` compiles with explicit `ProcessScanner` parameter and that calling it without the argument produces a TypeScript error (use `@ts-expect-error` guard).
- [ ] 1.2.2 **[GREEN]** In `src/core/operations/access-operation-preflight.ts:120`: change `scanAndCleanOrphans` signature to `private async scanAndCleanOrphans(scanner: ProcessScanner, request: ..., result: ..., handledPids: ...): Promise<void>`. Update the single call site in `cleanup()` to pass `this.options.processScanner` (caller already guards `!== undefined`). Remove the non-null assertion `!`.
- [ ] 1.2.3 **[VERIFY]** Run `pnpm test` — all tests green.

### Phase 1.3: Dry-Run Canonicalization [RED → GREEN]

- [ ] 1.3.1 **[RED]** Create `test/adapters/mcp/tools.dry-run.test.ts` — truth-table tests for `resolveIsDryRun`: `{apply:true, dryRun:true}→false`, `{apply:false, dryRun:false}→false`, `{}→true`, `{apply:true}→false`. Also assert write-guard in `createLegacyDispatchTool` is triggered when `apply` is absent (not just when `dryRun===true`). _Spec: "Canonical Dry-Run Resolution" all scenarios._
- [ ] 1.3.2 **[GREEN]** In `src/adapters/mcp/tools.ts`: add module-level `function resolveIsDryRun(input: unknown): boolean` with priority rules (apply→false, dryRun===false→false, else true). Remove `isLegacyWriteDryRun` alias. Replace all 4 inline dry-run evaluation sites with `resolveIsDryRun(input)`. Fix write-guard in `createLegacyDispatchTool` (line 591) to use `resolveIsDryRun` so `apply===true` also unlocks writes.
- [ ] 1.3.3 **[VERIFY]** Run `pnpm test` — all tests green.

### Phase 1.4: Environment Injection [RED → GREEN]

- [ ] 1.4.1 **[RED]** Create `test/adapters/mcp/tools.env.test.ts` — assert `toLegacyMaintenanceRequest` resolves `passwordEnv` value from the injected `env` object, not from `process.env`; assert that when injected env and `process.env` differ, result reflects the injected value. _Spec: "Env value from injected context" and "process.env not accessed" scenarios._
- [ ] 1.4.2 **[GREEN]** In `src/adapters/mcp/tools.ts`: add `env: Record<string, string | undefined>` parameter to `toLegacyMaintenanceRequest`. Add optional `env = process.env` parameter to `createDysflowMcpTools`. Thread `env` through `buildLegacyParityTool` down to `toLegacyMaintenanceRequest`. Remove all internal `process.env` reads from `toLegacyMaintenanceRequest`.
- [ ] 1.4.3 **[VERIFY]** Run `pnpm test` — all tests green.

### Phase 1.5: Unified Context Schema Props [RED → GREEN]

- [ ] 1.5.1 **[RED]** Add assertion in `test/adapters/mcp/tools.dry-run.test.ts` (or a dedicated `tools.context-props.test.ts`) that the module exports `CTX_PROPS` and that no symbol named `CONTEXT_PROPERTIES` or `CTX` is exported. Use `import * as toolsModule` to assert the shape.
- [ ] 1.5.2 **[GREEN]** In `src/adapters/mcp/tools.ts`: delete `CONTEXT_PROPERTIES` (lines 59–62) and `CTX` alias (line 288). Introduce `const CTX_PROPS = { projectId: SCHEMA_PROPS.projectId, contextId: SCHEMA_PROPS.contextId }`. Migrate all VBA/QUERY/DOCTOR schema definitions to reference `CTX_PROPS`.
- [ ] 1.5.3 **[VERIFY]** Run `pnpm test` — all tests green.

### Phase 1.6: Sanitizer Regex Safety [RED → GREEN]

- [ ] 1.6.1 **[RED]** Create `test/adapters/mcp/sanitize-error-message.test.ts` — tests: UNC path `\\server\share\file` is redacted; non-UNC message is unchanged; adversarial long string with nested backslashes completes within 50 ms (perf guard). _Spec: "Safe UNC path sanitization" and "Non-UNC message unchanged" scenarios._
- [ ] 1.6.2 **[GREEN]** In `src/adapters/mcp/tools.ts`: rewrite UNC branch of `sanitizeErrorMessage` (line 776) to use a linear regex `\\\\[^\\\\\\s]+\\\\[^\\\\\\s]+(?:\\\\[^\\\\\\s]+)*\\\\?` applied via sequential `replace` calls. No nested quantifiers.
- [ ] 1.6.3 **[VERIFY]** Run `pnpm test` — all tests green.

### Phase 1.7: Test Cleanup [REFACTOR]

- [ ] 1.7.1 **[REFACTOR]** In `test/adapters/mcp/release-matrix-gate.test.ts`: replace `as any` at line 29 with `as LegacyDysflowMcpToolName`. Remove `console.log` calls at lines 33–37. _Spec: "No as-any casts" and "No ungated console output" scenarios._
- [ ] 1.7.2 **[VERIFY]** Run `pnpm test` — all tests green. Commit PR1.

---

## PR2 — Config Sync/Async Dedup (~50 lines)

**Scope**: `src/core/config/dysflow-config.ts` only. Base branch: PR1 merge commit on main.

### Phase 2.1: Extract Core Config Logic [RED → GREEN]

- [x] 2.1.1 **[RED]** In `test/core/config/dysflow-config.test.ts` (extend existing or create), add assertion: given identical inputs, `loadDysflowConfig` and `loadDysflowConfigAsync` return structurally equal `DysflowConfig`. Also assert single update to a routing condition only requires one code change (document via comment referencing `loadProjectConfigCore`). _Spec: "Sync result matches async result" and "No routing duplication" scenarios._
- [x] 2.1.2 **[GREEN]** In `src/core/config/dysflow-config.ts`: extract `function loadProjectConfigCore(resolvedPath, raw, input, env, configSource, projectId): OperationResult<DysflowConfig>` containing all routing logic. Shrink `loadDysflowConfig` to: resolve path, `readJsonFileSync`, delegate to `loadProjectConfigCore`. Shrink `loadDysflowConfigAsync` to: resolve path, `await readJsonFileAsync`, delegate to `loadProjectConfigCore`.
- [x] 2.1.3 **[VERIFY]** Run `pnpm test` — all tests green. Commit PR2.

---

## PR3 — VBA Service Split (~200 lines)

**Scope**: create `src/core/services/vba-form-service.ts`, create `src/core/services/vba-source-comparison.ts`, modify `src/core/services/vba-sync-legacy-service.ts`. Base branch: PR2 merge commit on main.

### Phase 3.1: VBA Form Service [RED → GREEN]

- [x] 3.1.1 **[RED]** Create `test/core/services/vba-form-service.test.ts` — unit tests calling `VbaFormService.validateFormSpec`, `generateForm`, `catalogAddControl`, `harvestFormCatalog`, `resolveFormSpec` directly (with mocked executor/collaborators). Assert symbols are importable from `vba-form-service.ts`. _Spec: "Form operations importable from vba-form-service" scenario._
- [x] 3.1.2 **[GREEN]** Create `src/core/services/vba-form-service.ts` with `class VbaFormService` — constructor accepts `{ executor, env, resolveExecutionTarget, validateStrictContext }` collaborators. Move `validateFormSpec`, `generateForm`, `catalogAddControl`, `harvestFormCatalog`, `resolveFormSpec` from `VbaSyncLegacyService` into the class as methods. Export the class.
- [x] 3.1.3 **[VERIFY]** Run `pnpm test` — all tests green.

### Phase 3.2: VBA Source Comparison Module [RED → GREEN]

- [x] 3.2.1 **[RED]** Create `test/core/services/vba-source-comparison.test.ts` — unit tests calling `compareSourceAgainstBinary`, `compareVbaSourceTrees`, `collectVbaSourceFiles` with mocked context. Assert symbols are importable from `vba-source-comparison.ts`. _Spec: "Comparison operations importable from vba-source-comparison" scenario._
- [x] 3.2.2 **[GREEN]** Create `src/core/services/vba-source-comparison.ts` — move `compareSourceAgainstBinary`, `compareVbaSourceTrees`, `collectVbaSourceFiles` from `VbaSyncLegacyService` as free exported functions. Export `planReconcileBinary` if it resides there.
- [x] 3.2.3 **[VERIFY]** Run `pnpm test` — all tests green.

### Phase 3.3: VbaSyncLegacyService Coordinator Wiring [RED → GREEN]

- [x] 3.3.1 **[RED]** Add integration test (or assert on existing) that `VbaSyncLegacyService.execute` routing for form/catalog and comparison branches passes calls through to the new sub-modules (spy/mock injection). Assert public API signature unchanged. _Spec: "Public API unchanged" and "Delegation to sub-modules" scenarios._
- [x] 3.3.2 **[GREEN]** In `src/core/services/vba-sync-legacy-service.ts`: instantiate `VbaFormService` and import comparison functions. Wire `execute()` form/spec/catalog/erd branches to `VbaFormService` methods; wire verify/reconcile branches to `compareSourceAgainstBinary`. Add re-exports of moved symbols for one-release back-compat. Delete now-empty inline implementations.
- [x] 3.3.3 **[VERIFY]** Run `pnpm test` — all tests green. Confirm existing VBA integration tests remain green untouched. Commit PR3.

---

## PR4 — Install Utils Extraction (~80 lines)

**Scope**: create `src/cli/commands/install-utils.ts`, modify `src/cli/commands/install.ts`, modify `src/cli/commands/uninstall.ts`. Base branch: PR3 merge commit on main.

### Phase 4.1: Shared Install Utilities Module [RED → GREEN]

- [ ] 4.1.1 **[RED]** Create `test/cli/install-utils.test.ts` — per-helper unit tests against temp dir (`mkdtemp`): `fileExists` returns false for missing path; `readJson`/`writeJson` round-trip; `ensureObject` coerces non-objects; `runCommand`/`runCommandOutput` execute a real process. _Spec: "Helpers importable from install-utils" scenario._
- [ ] 4.1.2 **[GREEN]** Create `src/cli/commands/install-utils.ts` — export `fileExists`, `readJson`, `writeJson`, `ensureObject`, `runCommand`, `runCommandOutput`. Move implementations from `install.ts` (do not duplicate — delete from source).
- [ ] 4.1.3 **[VERIFY]** Run `pnpm test` — all tests green.

### Phase 4.2: install.ts and uninstall.ts Migration [RED → GREEN]

- [ ] 4.2.1 **[RED]** Add static-analysis test in `test/cli/install-utils.test.ts` asserting that importing from `uninstall.ts` does NOT transitively reference `install.ts` (traverse import graph via a regex on the compiled output or `import.meta.resolve` approach). _Spec: "No install.ts import in uninstall" scenario._
- [ ] 4.2.2 **[GREEN]** In `src/cli/commands/install.ts`: import `fileExists`, `readJson`, `writeJson`, `ensureObject`, `runCommand`, `runCommandOutput` from `./install-utils`. Keep temporary `fileExists` re-export for back-compat. In `src/cli/commands/uninstall.ts`: import shared helpers from `./install-utils` — remove any import from `install.ts`.
- [ ] 4.2.3 **[VERIFY]** Run `pnpm test` — all tests green. Commit PR4.

---

## Parallel vs Sequential Map

```
PR1 tasks are sequential (1.1→1.2→1.3→1.4→1.5→1.6→1.7).
PR2 is sequential with PR1 as gate (cannot start until PR1 merges to main).
PR3 is sequential with PR2 as gate.
PR4 is sequential with PR3 as gate.
Within each PR, TDD phases are ordered: RED→GREEN→VERIFY.
Tasks within PR1 phases (1.1–1.6) are independent of each other
and can be reordered, but each must fully complete (RED+GREEN+VERIFY) before commit.
```

---

## Spec Coverage Map

| Task | Spec Requirement |
|------|-----------------|
| 1.1 | InMemory Registry Purge Parity |
| 1.2 | Explicit Scanner Parameter |
| 1.3 | Canonical Dry-Run Resolution |
| 1.4 | Environment Injection in MCP Adapter |
| 1.5 | Unified Context Schema Props |
| 1.6 | Sanitizer Regex Safety |
| 1.7 | Test Quality in release-matrix-gate |
| 2.1 | Single-Implementation Config Loading |
| 3.1 | VBA Form Service Module |
| 3.2 | VBA Source Comparison Module |
| 3.3 | VBA Sync Legacy Service Public API Preserved |
| 4.1 | Shared Install Utilities Module |
| 4.2 | Uninstall Does Not Import From install.ts + install.ts Imports From install-utils.ts |
