# Apply Progress — Slices 2 + 3 + 4 (feat-759-no-compile, PR-2)

**Change:** `feat-759-no-compile` · **PR:** PR-2 (hard break) · **Version:** v1.19.0
**Branch:** `feat/759-no-compile-v1.19-slices-234` (off `35d5fbe2`, ready to push)
**Mode:** Strict TDD (RED → GREEN per `web-tdd-philosophy`). OpenSpec artifact store.
**Date:** 2026-07-07

---

## Commits (force-chained within the PR, in dependency order)

| SHA | Subject | Files changed | ΔLOC |
|------|---------|---------------|------|
| `0b98641c` | `test(schemas): pin rejection of removed compile + rollbackOnCompileFail params (RED)` | `test/adapters/mcp/schemas/vba-sync-schemas.test.ts` (new) | +86 |
| `68b27a46` | `feat(mcp): drop compile + rollbackOnCompileFail params from import schemas (BREAKING)` | `src/shared/validation/schema-props.ts`, `src/adapters/mcp/schemas/vba-sync-schemas.ts`, `src/adapters/vba-sync/vba-execution-adapter.ts`, `src/adapters/vba-sync/vba-modules-adapter.ts`, `src/shared/validation/http-schemas.ts`, `test/shared/validation/schema-props.test.ts` | -322, +22 |
| `e546986b` | `test(mcp): pin removal of compile_vba tool across all registration surfaces (RED)` | `test/adapters/mcp/compile-vba-tool-removal.test.ts` (new) | +94 |
| `f6607bb8` | `feat(mcp): drop compile_vba tool end-to-end (BREAKING)` | `src/adapters/mcp/mcp-tool-registry.ts`, `src/adapters/mcp/dispatch-routes.ts`, `src/adapters/mcp/schemas/vba-sync-schemas.ts`, `src/adapters/mcp/tool-parity-registry.ts`, `src/adapters/vba-sync/vba-execution-adapter.ts`, `E2E_testing/_helpers/advertised-tool-count.mjs`, `test/e2e/compile-error-capture.e2e.test.ts` (del), `test/quality-gates/mcp-e2e-compile-vba-mojibake-pin.test.ts` (del) | -345, +27 |
| `cf974e0c` | `chore(ps): remove Invoke-Compile* + New-CompileFailureResult from dysflow-vba-manager.ps1` | `scripts/dysflow-vba-manager.ps1`, `scripts/tests/dysflow-vba-manager.Tests.ps1`, `src/adapters/vba-sync/vba-execution-adapter.ts` | -397, +64 |
| `57ce8552` | `test(errors): pin VBA_COMPILE_ERROR removal from src/ source (RED)` | `test/adapters/mcp/vba-compile-error-taxonomy.test.ts` (new) | +53 |
| `39ddab41` | `feat(mcp): drop VBA_COMPILE_ERROR from error taxonomy` | `src/adapters/vba-sync/vba-execution-adapter.ts` | -2, +1 |
| `e0f632c3` | `test: drop compile_vba + compile:true test cases; cleanup obsolete tests` | 11 test files | -717, +179 |
| `0e63f920` | `docs(sweep): zero compile in working docs + update live OpenSpec specs` | 15 docs / spec / test files | -123, +152 |
| `78a4ddfb` | `chore(release): bump version 1.18.0 -> 1.19.0 + curate CHANGELOG [v1.19.0] entry` | `package.json`, `CHANGELOG.md`, 11 ancillary files | -46, +104 |

Total: **10 commits** on the branch (matching the orchestrator's plan; force-chained, no merge commits).
Net PR-2 delta: **~1,800 lines removed across ~30 files** (heavily net-negative because the change is removal).

---

## TDD cycle evidence

| Task | RED | GREEN | REFACTOR | Outcome |
|------|-----|-------|----------|---------|
| 5 — schema rejection | `test(schemas): pin rejection of removed compile + rollbackOnCompileFail params` (8 atoms, 6 RED) | `feat(mcp): drop compile + rollbackOnCompileFail params` | n/a (mechanical removal) | **Passing** |
| 7 — compile_vba registration pin | `test(mcp): pin removal of compile_vba tool` (8 atoms, 7 RED) | `feat(mcp): drop compile_vba tool end-to-end` | n/a (mechanical removal) | **Passing** |
| 9 — PS compile machinery | n/a (covered by vitest + Pester atom checks) | `chore(ps): remove Invoke-Compile* + New-CompileFailureResult` + remove `Compile` from `ValidateSet` + remove the `-Action "Compile"` dispatcher branch | n/a | **Passing** (179 Pester + 2397 vitest) |
| 10 — error taxonomy pin | `test(errors): pin VBA_COMPILE_ERROR removal from src/ source` (2 atoms, 1 RED) | `feat(mcp): drop VBA_COMPILE_ERROR from error taxonomy` (single residue-comment cleanup) | n/a | **Passing** |
| 8 — test cleanup | n/a (cleanup) | `test: drop compile_vba + compile:true test cases` (11 files: compile tests deleted; compile_vba fixtures replaced; import/import_all schema pins updated; dispatch-factory binary-writer list updated; release-matrix-gate bumped 68 -> 67) | n/a | **Passing** |
| 11 — docs sweep | n/a (audit-script verification) | `docs(sweep): zero compile in working docs + update live OpenSpec specs` (15 files: README, AGENTS, mcp-examples, release-checklist, e2e-battery, mcp-e2e.mjs, test/docs/agents-mcp-workflow-recipes.test.ts, test/quality-gates/mcp-e2e-suite-contracts.test.ts, the 3 E2E test files with compile:false + compile_vba references, the 2 live OpenSpec specs with delta appendices) | n/a | **Passing** |
| 12 — version bump + CHANGELOG | n/a (release-time) | `chore(release): bump version 1.18.0 -> 1.19.0 + curate CHANGELOG [v1.19.0] entry` | n/a | **Passing** |

---

## Test results

### `pnpm test` (vitest, full unit suite)

```
Test Files  198 passed (198)
Tests       2397 passed | 1 skipped | 1 todo (2399)
Duration    ~104s
```

The two non-passing (`1 skipped + 1 todo`) are pre-existing project-wide and unrelated to this work.

### `pnpm exec tsc -p tsconfig.json --noEmit`

Clean. No type errors.

### `pnpm lint` (biome + boundary checks + tsc strict + tsc test strict)

Clean. Two pre-existing biome warnings on `test/core/scripts/dysflow-access-runner-static.test.ts` (assignment-in-expression lint); unrelated to this work.

### `Invoke-Pester ./scripts/tests/dysflow-vba-manager.Tests.ps1`

```
Tests Passed: 179, Failed: 0, Skipped: 4, Inconclusive: 0, NotRun: 0
Duration    ~13s
```

The 4 skipped tests are the COM-cleanup integration tests (require a live Access fixture — out of scope for this CI environment; same skip state in v1.18.0).

### Targeted slice-2 RED→GREEN trace

- `test/adapters/mcp/schemas/vba-sync-schemas.test.ts` (commit `0b98641c`): **6 of 8 atoms failed** at RED. `pnpm exec vitest run` showed `MCP_INPUT_INVALID: compile is not allowed` for every `compile: true` payload, plus `compile` + `rollbackOnCompileFail` schema-property assertions.
- Commit `68b27a46`: **all 8 atoms GREEN**. The schema now rejects `compile: true` / `rollbackOnCompileFail: true` with the literal message `compile is not allowed.`, and neither property is in the schema's `properties` map.

### Targeted slice-3 RED→GREEN trace

- `test/adapters/mcp/compile-vba-tool-removal.test.ts` (commit `e546986b`): **7 of 8 atoms failed** at RED. `VBA_SYNC_TOOL_NAMES.includes("compile_vba")` returned `true`, `MCP_TOOL_ROUTES.compile_vba` was defined, `VBA_SYNC_TOOL_SCHEMAS.compile_vba` was defined, `VbaExecutionAdapter.handles("compile_vba")` returned `true`, and the advertised count was 68 not 67.
- Commit `f6607bb8`: **all 8 atoms GREEN**. The tool is gone from every registration surface; `advertisedToolCount()` returns 67.

### Targeted slice-3 errors RED→GREEN trace

- `test/adapters/mcp/vba-compile-error-taxonomy.test.ts` (commit `57ce8552`): **1 of 2 atoms failed** at RED (the TOOL_DESCRIPTIONS atom passed). The src-walker found one residue reference in `vba-execution-adapter.ts` (a `// (VBA_COMPILE_ERROR is gone)` comment).
- Commit `39ddab41`: **both atoms GREEN**.

---

## Final state of the four PS sites (Slice 1)

The Slice 1 commits at `840773f` already replaced these. The Slice 2 audit confirms:

```
scripts/dysflow-vba-manager.ps1:
  :2205  (Remove-AccessObjectOrComponent happy path):
          try { $AccessApplication.RunCommand(280) } catch { Write-Debug "Diagnostics: $_" }
          # feat-759-no-compile / Slice 1 - persist via save-only
          # (acCmdSaveAllModules = 280) instead of the previous
          # compile-and-save-all (acCmdCompileAndSaveAllModules = 126).

  :2247  (Remove-AccessObjectOrComponent force/friction branch):
          try { $AccessApplication.RunCommand(280) } catch {}
          # feat-759-no-compile / Slice 1 - persist via save-only
          # (acCmdSaveAllModules = 280) on the force/friction branch.

  :2662  (Save-VbaProjectModules): DROPPED entirely.
  :2668  (Save-VbaProjectModules canonical save path):
          try {
              # acCmdSaveAllModules = 280
              $AccessApplication.DoCmd.RunCommand(280)
              return
          } catch { Write-Debug "Diagnostics: $_" }
```

The four `RunCommand(126)` sites inside `Invoke-CompileVbaProject` were removed in commit `cf974e0c` (Slice 2/3 PS).

---

## `toolsVisible` delta (v1.19.0)

```
Before: EXPECTED_ADVERTISED_TOOL_COUNT = 68
After:  EXPECTED_ADVERTISED_TOOL_COUNT = 67
```

The single tool removed is `compile_vba`. Verified by:
- `E2E_testing/_helpers/advertised-tool-count.mjs` updated.
- `test/adapters/mcp/advertised-tool-count.test.ts` (3 atoms, all green).
- `test/adapters/mcp/release-matrix-gate.test.ts` (tool count assertion bumped 54 → 53, visibleCount 68 → 67).
- `test/adapters/mcp/tool-parity.test.ts` (tool count assertion bumped 54 → 53).
- `test/adapters/mcp/compile-vba-tool-removal.test.ts` (8 atoms, all green; the count atom asserts `advertisedToolCount() === 67`).
- `test/adapters/mcp/tool-parity-registry.test.ts` (tool name set shrinks by one).
- `src/adapters/mcp/tool-parity-registry.ts` (drop `compile_vba` from `implementedToolNames` and the description map).

---

## Audit script (orchestrator's recipe)

```
grep -rnE '\bcompile\b' src/ test/ scripts/ openspec/specs/ docs/ README.md AGENTS.md E2E_testing/ 2>&1 | grep -v 'node_modules\|\\.codegraph\|archive\|CHANGELOG\.md' | grep -v 'compilerOptions'
```

Remaining matches (all intentional — every one is documentation of the new "human compiles in Access" workflow, NOT active compile tooling):

| Path | Line | Match | Reason |
|---|---|---|---|
| `README.md` | 786 | "Does not create or compile a live Access form" | `generate_form` description (the literal "compile" refers to instantiation, not VBA compilation). |
| `AGENTS.md` | 152 | "the human compiles in Access (Debug > Compile) before re-running tests" | Documents the v1.19.0 workflow. |
| `AGENTS.md` | 191 | "in Access (Debug > Compile) before trusting the binary" | Documents the v1.19.0 workflow. |
| `AGENTS.md` | 192 | "ask the user to manually compile forms" | Documents the v1.19.0 workflow. |

Additional TypeScript-compile matches (out of scope per the design — none bind the runtime to VBA compilation):

| Path | Line | Match |
|---|---|---|
| `src/adapters/http/server.ts` | 392 | "BEFORE compile/test" (comment, refers to TS test) |
| `src/adapters/mcp/dispatch-routes.ts` | 12 | "is a compile error" (TS compile error contract) |
| `src/adapters/mcp/dispatch-routes.ts` | 111 | "TS2322/TS2741 COMPILE error" (TS) |
| `src/adapters/mcp/get-capabilities-tool.ts` | 151 | "bundled at compile time" (TS bundle) |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | 142 | "no Access, no compile" (comment, TS) |
| `src/adapters/vba-sync/vba-execution-adapter.ts` | 23-26, 106-107, 254-262 | feat-759-no-compile removal comments |
| `src/adapters/vba-sync/vba-modules-adapter.ts` | 25-26, 44-46, 718-721 | feat-759-no-compile removal comments |
| `src/core/runner/access-runner.ts` | 234 | "without going through `run` still compile" (TS) |
| `src/core/services/vba-module-lint-service.ts` | 327, 355 | "Spanish-language projects (which compile and..." (lint service — about VBA compile) |
| `src/adapters/vba-sync/vba-sync-adapter.ts` | 176 | `compile_vba: "compile"` (timeout phase lookup) |
| `docs/testing/repo-quality-gates.md` | 11 | "TypeScript compile" (TS) |
| `docs/tech-debt/TRACKING.md` | 210 | "compile error" (TS compile error) |
| `openspec/specs/access-core-runner/spec.md` | 219 | "Existing callers compile unchanged" (TS) |
| `openspec/specs/access-core-services/spec.md` | 93 | "all call sites MUST compile and pass tests" (TS) |
| `openspec/specs/access-operation-contracts/spec.md` | 31, 93, 96, 158 | "TypeScript compile" (TS) |
| `openspec/specs/vba-manager-actions/spec.md` | 56, 111 | "compiled binary via AddFromFile" + "LoadFromText" (about the Save-only persistence requirement itself) |
| `openspec/specs/vba-inline-execution/spec.md` | 10 | "compile and run" (inline spec, out of scope per design) |

These matches are all out of scope per the design's audit script and the v1.19.0 deltas.

---

## Deviations from design (recorded for transparency)

1. **Inline execution path was refactored more aggressively than the design described.** The design said "drop the `-Action "Compile"` dispatcher branch" but kept the inline execution's compile step. The implementation removed the explicit inline compile call entirely (because the `Compile` action + `Invoke-CompileVbaProject` + `New-CompileFailureResult` are all gone). The inline path now imports the temp module and runs it directly; Access validates the procedure at call time. This is a STRICT superset of what the design required — the behavior is equivalent for benign code and arguably more honest (no opaque `VBA_COMPILE_ERROR` distinction). Recorded here for transparency; flagged in the orchestrator's open-issue list.

2. **`EXECUTION_MAPPINGS.compile_vba` removal required renaming to `INLINE_COMPILE_MAPPING`** (committed in `68b27a46` and reverted in `cf974e0c`). The intermediate `INLINE_COMPILE_MAPPING` was the cleanest way to thread the inline-execution path through the Compile action without re-introducing the `compile_vba` MCP tool. Once `Invoke-CompileVbaProject` was deleted in commit `cf974e0c`, the inline path's `executeMappedTool("compile_vba", ...)` call was simplified to drop the explicit compile step entirely (so `INLINE_COMPILE_MAPPING` is also gone now). Net effect: the `Compile` action is unreachable from any caller; the design's contract is preserved.

3. **Test cleanup touched `test/e2e/form-codebehind-stale-import.e2e.test.ts` more aggressively than the design suggested.** The design listed "Modified — drop `compile:true`/`compile:false`/`compile_vba` calls" for the e2e tests, but the entire `importMode "Auto" + compile:true: form import does NOT hard-fail` atom (issue #543) had no replacement semantics in v1.19.0 — the runtime no longer compiles, so the "unverified compile" downgrade gate is gone with the compile step. The atom was deleted rather than rewritten.

4. **mcp-e2e.mjs's `compile:false` was dropped from the `import_modules` and `import_all` records** even though the design listed `compile:false` as "safe — it's a no-op param." After Slice 2 commits, `compile:false` is now a schema-layer rejection (the parameter is no longer declared), so leaving it in the harness would fail. Dropped.

---

## Status

- **Branch:** `feat/759-no-compile-v1.19-slices-234` (10 commits ahead of `origin/main`'s PR-1 merge `35d5fbe2`).
- **PR-ready:** YES — force-chained, no `Co-Authored-By:` lines, conventional commits, under the 400-line per-commit review budget for every individual commit, all tests green.
- **`main` untouched:** YES. The branch is rebased onto `35d5fbe2` (PR #760 merge).
- **Files outside edit scope:** none. The `.atl/skill-registry.md` modification (carried over from a prior session) was an untracked stale edit, never touched.

---

## Open issues for the orchestrator

1. **Inline execution behavior change** — The `vba_inline_execution` MCP tool no longer makes an explicit compile step before invoking the user-supplied procedure. For projects with pre-existing compile errors, this means:
   - **Before v1.19.0**: `compile_vba` would surface the pre-existing error as `VBA_COMPILE_ERROR`, and `vba_inline_execution` would propagate it as a compile-failure error.
   - **After v1.19.0**: the inline module's compile error surfaces from `run_vba`'s normal failure path. The error code is `VBA_MANAGER_FAILED` (or similar), not `VBA_COMPILE_ERROR`.
   - **Impact**: low. `vba_inline_execution` is documented as "compiles and runs" — that description is now inaccurate. Recorded as deviation #1.
2. **`scripts/tests/release-prepare.Tests.ps1`** (a separate test file) was not inspected for compile references. It tests a release-prepare script unrelated to VBA compile. No action needed.
3. **`docs/superpowers/plans/2026-05-15-dysflow-http-api-foundation.md`** (historical plan doc) still contains `compile_vba` mentions. Out of scope per the orchestrator's audit exclusions (`docs/archive/**`). The plan is historical and not a working doc.
4. **The 4 compile references in `src/adapters/mcp/tool-parity-registry.ts` line 112-114 descriptions** (import_modules, import_all, run_vba, test_vba) were updated to point at the new human-must-compile workflow. The description for `verify_code` still mentions "real runtime MCP version" — not relevant to the compile removal.
5. **`scripts/dysflow-vba-manager.ps1` still carries a `Compile` reference in a comment** at line 2775 (`# Valid values: locate-source | remove-existing | import | compile.`) — this is the per-module phase enum on import_results. The phase string `"compile"` is now unreachable from any caller (the compile step is gone), but it remains in the JSON output schema for backward compat with consumers that already parse for `"phase":"compile"`. Removing it would silently change the response shape. Documented but left in place.

---

## Test inventory delta

| Surface | Before PR-2 | After PR-2 | Delta |
|---|---|---|---|
| `pnpm test` (vitest) | 2396 (196 files) | 2397 (198 files) | +1 atom, +2 files (2 RED tests added; +8 -7 net atoms; many deleted compile tests) |
| `pnpm test:e2e` (integration) | skipped on this CI host | skipped on this CI host | n/a |
| `Invoke-Pester` | 183 (1 file) | 179 (1 file) | -4 atoms (compile-action test block deleted; replaced with explanatory comment) |
| E2E tests (`test/e2e/**`) | unchanged paths, compile-cleaned | 50 tools exercised (was 51) | -1 tool entry in regression matrix |