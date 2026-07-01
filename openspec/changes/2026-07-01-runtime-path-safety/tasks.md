# Tasks: Runtime Path Safety — Audit-Driven Hardening

## Review Workload Forecast

| PR  | Estimated changed lines | 400-line budget risk | Files touched | Tests added | Notes |
| --- | ----------------------- | -------------------- | ------------- | ----------- | ----- |
| PR1 | 165–200                 | Medium               | 2             | 4           | Guard block (~21L src) + threading + 4 tests |
| PR2 | 200–260                 | Medium               | 4             | 9           | F2 (1L src) + F3 (4L src) + 9 tests |
| PR3 | 95–125                  | Low                  | 2             | 4           | .frm removal (3L src) + 4 tests |

**Overall total**: 460–585 changed lines (source + tests + CHANGELOG)

Chained PRs recommended: Yes (3 PRs, force-chained)
400-line budget risk: Medium (each PR stays under 400L, but PR2 is near the ceiling)
Decision needed before apply: No (all PRs individually under budget; delivery strategy `force-chained` pre-approved)
Chain strategy: stacked-to-main

---

## PR 1 — F1: Runtime-Safe Export Write

**Goal**: Move the `isWithinRuntime` guard pre-write on resolved `destinationRoot` for `export_modules` and `export_all`, covering the case where `exportPath` is absent and the resolved target falls inside the production runtime.

**Status**: ✅ COMPLETE — commit `fbf93c2` on `feature/runtime-path-safety-pr1`; PR [#625](https://github.com/DysTelefonica/dysflow/pull/625).

### Commit Plan

```
fix(vba-sync): guard resolved destinationRoot before runner invocation (#619)

SDD: runtime-path-safety
Issues: #619
Tests: test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts
```

- [x] Step 1.1 — F1 guard block inserted at `vba-modules-adapter.ts` (top-level pre-resolution check).
- [x] Step 1.2 — Call site threaded: `exportAllWithPrune(effectiveParams, resolvedExportTarget)`.
- [x] Step 1.3 — `exportAllWithPrune` signature: added `preResolvedTarget?: OperationResult<VbaModulesExecutionTarget>`.
- [x] Step 1.4 — Inside `exportAllWithPrune`: `const target = preResolvedTarget ?? (await this.orchestrator.resolveExecutionTarget(params));` — reuse the pre-resolved target when supplied.
- [x] Test surface: 4 new RED→GREEN tests in `runtime-guard-filesystem-writes.test.ts` (3 in the exportPath describe + 1 in the exportAllWithPrune describe).
- [x] Existing helper updated: `makeAdapter` in the exportPath describe now mocks `resolveExecutionTarget` with a safe default; the F1 guard needs it.
- [x] Verification: full `pnpm test` = 1885/1886 (the single failure is a pre-existing real-Access E2E with hardcoded `C:\Proyectos\dysflow\E2E_testing\NoConformidades.accdb` paths that don't exist in the worktree — NOT a regression). `pnpm build` clean. `pnpm lint` no new warnings.

### Test Plan (RED → GREEN, strict TDD)

1. **RED**: Append 4 failing `it(...)` blocks to `describe("Issue #574 — runtime guard for VbaModulesAdapter.execute exportPath (#185)")` in `test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts`:
   - `it("refuses export_modules when resolved destinationRoot points inside the production runtime (#619)")`
   - `it("refuses export_all when resolved destinationRoot points inside the production runtime (#619)")`
   - `it("allows export_modules when resolved destinationRoot is outside the production runtime (#619)")`
2. **RED**: Append 1 failing `it(...)` to `describe("Issue #574 — runtime guard for VbaModulesAdapter.exportAllWithPrune")`:
   - `it("export_all prune refuses runtime destinationRoot pre-write — runner never invoked (#619)")`
3. Run `pnpm test` — all 5 new tests FAIL.
4. **GREEN**: Implement the source changes (see below).
5. Run `pnpm test` — all 5 new tests PASS.
6. Run full suite — all existing tests remain green.

### Implementation Steps

**Step 1.1** — `src/adapters/vba-sync/vba-modules-adapter.ts:216` (after `effectiveParams` block, before the prune branch dispatch at current line 219):
Insert the F1 guard block (21 lines). This resolves the target after the `effectiveParams` short-circuit and refuses if `destinationRoot` falls inside the production runtime:

```ts
    // F1 (#619): after the explicit-exportPath guard, resolve the target and refuse
    // if destinationRoot (from project config, context defaults, or a caller override)
    // falls inside the dysflow production runtime. The runner MUST NOT be invoked
    // when the resolved target is unsafe; mirror vba-execution-adapter.ts:160-175.
    let resolvedExportTarget: OperationResult<VbaModulesExecutionTarget> | undefined;
    if (toolName === "export_modules" || toolName === "export_all") {
      const target = await this.orchestrator.resolveExecutionTarget(effectiveParams);
      if (!target.ok) return target;
      resolvedExportTarget = target;
      if (
        isWithinRuntime(
          target.data.destinationRoot,
          this.orchestrator.env ?? (process.env as Record<string, string | undefined>),
        )
      ) {
        return failureResult(
          createDysflowError(
            "INVALID_INPUT",
            `Refusing to export to destinationRoot '${target.data.destinationRoot}' inside the dysflow production runtime. Point destinationRoot at your project, not the installed runtime.`,
          ),
        );
      }
    }
```

**Step 1.2** — `src/adapters/vba-sync/vba-modules-adapter.ts:228` (call site):
Thread the pre-resolved target into `exportAllWithPrune`. Change:
```ts
return this.exportAllWithPrune(effectiveParams);
```
to:
```ts
return this.exportAllWithPrune(effectiveParams, resolvedExportTarget);
```

**Step 1.3** — `src/adapters/vba-sync/vba-modules-adapter.ts:438` (signature):
Add optional `preResolvedTarget` parameter to `exportAllWithPrune`. Change:
```ts
private async exportAllWithPrune(
  params: Record<string, unknown>,
): Promise<OperationResult<unknown>> {
```
to:
```ts
private async exportAllWithPrune(
  params: Record<string, unknown>,
  preResolvedTarget?: OperationResult<VbaModulesExecutionTarget>,
): Promise<OperationResult<unknown>> {
```

**Step 1.4** — `src/adapters/vba-sync/vba-modules-adapter.ts` (early use inside `exportAllWithPrune`):
After the signature change, add logic inside `exportAllWithPrune` to use `preResolvedTarget` when provided, skipping its internal `resolveExecutionTarget` call. The existing post-resolution guard at lines 466-478 stays as defense-in-depth.

### Verification

- `pnpm test -- --run test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts` — 5 new tests pass.
- `pnpm test -- --run` (full unit suite) — all existing tests remain green.
- The existing `refuses export_modules when exportPath points inside the production runtime` tests (F1 with explicit `exportPath`) remain green.

### Rollback

```bash
git revert <sha>
```
Restores the old prune-only guard and removes the threading. No effect on PRs 2/3.

### Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `fbf93c2` | `fix(vba-sync): guard resolved destinationRoot before runner invocation (#619)` | PR1 steps 1.1–1.4 | 4 new tests in `runtime-guard-filesystem-writes.test.ts`; full `pnpm test` = 1885/1886 (1 pre-existing E2E flake unrelated to F1); `pnpm build` clean; `pnpm lint` no new warnings | n/a (no module changes) |

---

## PR 2 — F2 + F3: Override Propagation + Empty-String Normalization

**Goal**: F2 propagates `backendPath` in branch 2 of `resolveExecutionTarget`. F3 normalizes empty-string caller overrides in `buildProjectConfig` before the `??` precedence test. F3 behavior change requires a CHANGELOG bullet.

### Commit Plan

**Commit 1 (F2)**:
```
fix(config): propagate backendPath in resolveExecutionTarget branch 2 (#619)

SDD: runtime-path-safety
Issues: #619
Tests: test/core/config/execution-target.test.ts
```

**Commit 2 (F3 + CHANGELOG)**:
```
fix(config): normalize empty-string caller overrides in buildProjectConfig (#619)

SDD: runtime-path-safety
Issues: #619
Tests: test/core/config/dysflow-config.test.ts
```

> ⚠️ **F3 behavior change**: `destinationRoot: ""` override is now treated as no override. Previously `""` silently won the `??` test and overwrote repo-config defaults. No current MCP dispatch caller relies on `""` as a fallback marker. CHANGELOG bullet is **required**.

### Test Plan (RED → GREEN, strict TDD)

#### F2 Tests (execution-target.test.ts)

1. **RED**: Append 4 failing `it(...)` to `test/core/config/execution-target.test.ts` in a new `describe("ExecutionTarget Override Precedence (#619)")`:
   - `it("branch 2 returns caller-supplied params.backendPath (#619)")`
   - `it("branch 2 normalizes empty-string params.backendPath to undefined (#619)")`
   - `it("branch 2 normalizes whitespace-only params.backendPath to undefined (#619)")`
   - `it("branches 0/1/2 backendPath parity — caller override wins in every branch (#619)")`
2. Run `pnpm test` — all 4 FAIL.
3. **GREEN**: Implement F2 source change (1 line at `execution-target.ts:138`).
4. Run `pnpm test` — all 4 PASS.

#### F3 Tests (dysflow-config.test.ts)

1. **RED**: Append 5 failing `it(...)` to `test/core/config/dysflow-config.test.ts` in a new `describe("Empty-String Override Normalization (#619)")`:
   - `it("empty-string destinationRoot override is treated as no override (#619)")`
   - `it("empty-string backendPath override is treated as no override (#619)")`
   - `it("whitespace-only destinationRoot override is treated as no override (#619)")`
   - `it("empty-string accessDbPath override does not trigger CONFIG_MISSING_ACCESS_PATH (#619)")`
   - `it("non-empty caller override still wins after normalization (#619)")`
2. Run `pnpm test` — all 5 FAIL.
3. **GREEN**: Implement F3 source changes (4 lines at `dysflow-config.ts:259,264,274,280`).
4. Run `pnpm test` — all 5 PASS.

### Implementation Steps

**Step 2.1 (F2)** — `src/core/config/execution-target.ts:138` (inside the branch 2 return literal, after `accessPath: context.accessPath,`):
Add:
```ts
    backendPath: stringValue(params.backendPath),
```

**Step 2.2 (F3)** — `src/core/config/dysflow-config.ts:259`:
Change:
```ts
  const projectRoot = resolveProjectRoot(raw, configDir, input.projectRoot);
```
to:
```ts
  const projectRoot = resolveProjectRoot(raw, configDir, stringValue(input.projectRoot));
```

**Step 2.3 (F3)** — `src/core/config/dysflow-config.ts:264`:
Change:
```ts
  const accessDbPath = resolveProjectPath(input.accessDbPath ?? raw.accessPath, projectRoot);
```
to:
```ts
  const accessDbPath = resolveProjectPath(stringValue(input.accessDbPath) ?? raw.accessPath, projectRoot);
```

**Step 2.4 (F3)** — `src/core/config/dysflow-config.ts:274`:
Change:
```ts
  const backendPath = resolveProjectPath(input.backendPath ?? raw.backendPath, projectRoot);
```
to:
```ts
  const backendPath = resolveProjectPath(stringValue(input.backendPath) ?? raw.backendPath, projectRoot);
```

**Step 2.5 (F3)** — `src/core/config/dysflow-config.ts:280`:
Change:
```ts
    resolveProjectPath(input.destinationRoot ?? raw.destinationRoot ?? "src", projectRoot) ??
```
to:
```ts
    resolveProjectPath(stringValue(input.destinationRoot) ?? raw.destinationRoot ?? "src", projectRoot) ??
```

**Step 2.6 (CHANGELOG — mandatory)** — `CHANGELOG.md`:
Prepend a new `[Unreleased]` section at the top:

```markdown
## [Unreleased]
### runtime-path-safety (#619)

#### F2
- **`resolveExecutionTarget` branch 2 now propagates caller-supplied `backendPath`** instead of silently dropping it (#13228 family, #619).

#### F3
- **Empty-string caller overrides for `accessDbPath`/`backendPath`/`destinationRoot`/`projectRoot` are now treated as no override.** Previously `""` silently won the `??` precedence test, overwriting repo-config defaults. Callers relying on `""` as a fallback marker must now omit the field instead (#619).
```

### Verification

- `pnpm test -- --run test/core/config/execution-target.test.ts` — 4 new F2 tests pass.
- `pnpm test -- --run test/core/config/dysflow-config.test.ts` — 5 new F3 tests pass.
- `pnpm test -- --run` (full unit suite) — all existing tests remain green.
- The F3 `empty-string accessDbPath override does not trigger CONFIG_MISSING_ACCESS_PATH` test confirms the regression is fixed.

### Rollback

**Commit 1 (F2)**:
```bash
git revert <sha_of_F2_commit>
```
Removes `backendPath: stringValue(params.backendPath),` from branch 2 return literal. F3 commit stays valid.

**Commit 2 (F3)**:
```bash
git revert <sha_of_F3_commit>
```
Restores `??` precedence without `stringValue()` wrapping. The `CONFIG_MISSING_ACCESS_PATH` regression for `accessDbPath: ""` returns. F2 commit stays valid.

---

## PR 3 — F4: Prune Allow-List Parity

**Goal**: Drop `.frm` from `MANAGED_CODE_EXTENSIONS` and the inline `auditOrphans` list, so prune only deletes the AGENTS.md documented allow-list (`.bas`/`.cls`/`.form.txt`/`.report.txt`). AGENTS.md already documents the correct list — this PR makes the code match the doc.

### Commit Plan

```
fix(vba-sync): drop .frm from prune allow-list to match AGENTS.md (#619)

SDD: runtime-path-safety
Issues: #619
Tests: test/adapters/vba-sync/vba-modules-adapter.test.ts
```

### Test Plan (RED → GREEN, strict TDD)

1. **RED**: Append 4 failing `it(...)` to `test/adapters/vba-sync/vba-modules-adapter.test.ts` in a new `describe("export_all prune allow-list parity (#619)")`:
   - `it("export_all prune never deletes .frm orphan files (#619)")`
   - `it("export_all prune keeps .bas and .cls orphans deletable (#619)")`
   - `it("export_all prune ignores .txt and other non-allow-listed extensions (#619)")`
   - `it("export_all prune adversarial .frm masquerade attempt — not deleted even when no VBE match (#619)")`
2. Run `pnpm test` — all 4 FAIL.
3. **GREEN**: Implement source changes (see below).
4. Run `pnpm test` — all 4 PASS.
5. Run full suite — all existing tests remain green.

### Implementation Steps

**Step 3.1** — `src/adapters/vba-sync/vba-modules-adapter.ts:117`:
Change:
```ts
const MANAGED_CODE_EXTENSIONS = [".bas", ".cls", ".frm"];
```
to:
```ts
const MANAGED_CODE_EXTENSIONS = [".bas", ".cls"];
```

**Step 3.2** — `src/adapters/vba-sync/vba-modules-adapter.ts:559`:
Change:
```ts
if ([".bas", ".cls", ".frm"].includes(ext)) {
```
to:
```ts
if ([".bas", ".cls"].includes(ext)) {
```

**Step 3.3** — `src/adapters/vba-sync/vba-modules-adapter.ts:122` (docstring):
Change:
```ts
 * `<name>.form.txt` / `<name>.report.txt`; code lives in `.bas` / `.cls` / `.frm`.
```
to:
```ts
 * `<name>.form.txt` / `<name>.report.txt`; code lives in `.bas` / `.cls`.
```

**Step 3.4 (CHANGELOG)** — `CHANGELOG.md` (append to the `[Unreleased]` section already created in PR 2):
```markdown
#### F4
- **`export_all prune` no longer deletes legacy `.frm` orphan files.** The allow-list now exactly matches AGENTS.md: `.bas`/`.cls`/`.form.txt`/`.report.txt` (#619).
```

### Verification

- `pnpm test -- --run test/adapters/vba-sync/vba-modules-adapter.test.ts` — 4 new F4 tests pass.
- `pnpm test -- --run` (full unit suite) — all existing tests remain green.
- The positive control test (`export_all prune keeps .bas and .cls orphans deletable`) ensures the allow-list change does not accidentally break normal pruning.

### Rollback

```bash
git revert <sha>
```
Re-adds `.frm` to both lists and restores the docstring. No effect on PRs 1/2.

---

## Cross-PR Verification Contract

After **each** PR lands on `staging`:
- `pnpm test -- --run` — all tests pass (no regressions).
- `pnpm build` — build succeeds.
- No E2E tests added or modified (per 2026-07-01 cycle rule).
- Each commit body carries `SDD: runtime-path-safety` and `Issues: #619`.

---

## File Change Summary

| File | PR | Change |
|------|----|--------|
| `src/adapters/vba-sync/vba-modules-adapter.ts` | 1 | F1 guard block (21L) + threading |
| `src/adapters/vba-sync/vba-modules-adapter.ts` | 1 | `exportAllWithPrune` signature + internal use of `preResolvedTarget` |
| `test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts` | 1 | +5 new tests |
| `src/core/config/execution-target.ts` | 2 | F2: `backendPath: stringValue(params.backendPath),` (1L) |
| `src/core/config/dysflow-config.ts` | 2 | F3: 4 `stringValue()` wraps (4L) |
| `test/core/config/execution-target.test.ts` | 2 | +4 new tests |
| `test/core/config/dysflow-config.test.ts` | 2 | +5 new tests |
| `CHANGELOG.md` | 2 | `[Unreleased]` section with F2 + F3 bullets |
| `src/adapters/vba-sync/vba-modules-adapter.ts` | 3 | Drop `.frm` from constant + inline list + docstring |
| `test/adapters/vba-sync/vba-modules-adapter.test.ts` | 3 | +4 new tests |
| `CHANGELOG.md` | 3 | Append F4 bullet to `[Unreleased]` |
