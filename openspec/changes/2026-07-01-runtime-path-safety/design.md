# Design: Runtime Path Safety — Audit-Driven Hardening

## Technical Approach

Three chained PRs, each a one-line correctness fix with a port-level test. Mirrors
the `isWithinRuntime` pattern from
`src/adapters/vba-sync/vba-execution-adapter.ts:160-175` (F1) and
`src/core/config/dysflow-config.ts:222` `stringValue()` symmetry (F3). All three
fixes close audit findings for issue #619; none changes the public MCP surface,
schema, or CLI.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Guard at `VbaModulesAdapter.execute` vs deep in `exportAllWithPrune` | Top-level guard catches the non-prune export path AND the prune path with one check; deep guard duplicates the call | **Chosen: top-level**, refactor `exportAllWithPrune` to take a pre-resolved target |
| Add `allowWrites` / `allowedProcedures` to branch 2 | Requires extending `ExecutionTarget` type — separate change | **Rejected (per orchestrator):** F2 scoped to `backendPath` only |
| Re-resolve target inside `exportAllWithPrune` vs pass it down | Double resolution is idempotent but wastes a `loadDysflowConfigAsync` call per export | **Chosen: pass it down** via new optional parameter to keep the call site clean |
| Wrap `input.X` in `stringValue()` in `buildProjectConfig` | Symmetric with `buildExplicitConfig:222`; one-line change per field | **Chosen** for `accessDbPath`, `backendPath`, `destinationRoot`; `projectRoot` already protected by `resolveProjectRoot`'s internal `stringValue()` call but the orchestrator's spec asks for symmetry, so we add `stringValue(input.projectRoot)` at the call site anyway |
| Move `.frm` from prune allow-list to documentation | Per AGENTS.md (line 92) the allow-list is `.bas`/`.cls`/`.form.txt`/`.report.txt`; code is out of sync | **Chosen: drop `.frm` from code** to match docs (AGENTS.md already correct) |

## Per-PR Design

### PR 1 — F1: Runtime-Safe Export Write

**Insertion point**: `src/adapters/vba-sync/vba-modules-adapter.ts`, after the
existing `exportPath` guard (currently lines 198-213), before the prune/import
branch dispatch (currently line 219). Inject one new block; the existing
`exportPath` short-circuit at line 198-213 stays as the fast-path for
caller-supplied paths.

**Surrounding code (current lines 213-219)**:

```ts
    }
    const effectiveParams =
      (toolName === "export_modules" || toolName === "export_all") && exportPath !== undefined
        ? { ...params, destinationRoot: exportPath }
        : params;

    if (toolName === "export_all" && truthy(params.prune)) {
```

**Diff**:

```diff
@@ -216,6 +216,27 @@
     const effectiveParams =
       (toolName === "export_modules" || toolName === "export_all") && exportPath !== undefined
         ? { ...params, destinationRoot: exportPath }
         : params;

+    // F1 (#619): after the explicit-exportPath guard, resolve the target and refuse
+    // if destinationRoot (from project config, context defaults, or a caller override)
+    // falls inside the dysflow production runtime. The runner MUST NOT be invoked
+    // when the resolved target is unsafe; mirror vba-execution-adapter.ts:160-175.
+    let resolvedExportTarget: OperationResult<VbaModulesExecutionTarget> | undefined;
+    if (toolName === "export_modules" || toolName === "export_all") {
+      const target = await this.orchestrator.resolveExecutionTarget(effectiveParams);
+      if (!target.ok) return target;
+      resolvedExportTarget = target;
+      if (
+        isWithinRuntime(
+          target.data.destinationRoot,
+          this.orchestrator.env ?? (process.env as Record<string, string | undefined>),
+        )
+      ) {
+        return failureResult(
+          createDysflowError(
+            "INVALID_INPUT",
+            `Refusing to export to destinationRoot '${target.data.destinationRoot}' inside the dysflow production runtime. Point destinationRoot at your project, not the installed runtime.`,
+          ),
+        );
+      }
+    }
+
     if (toolName === "export_all" && truthy(params.prune)) {
```

Also pass the pre-resolved target into `exportAllWithPrune` (currently
`return this.exportAllWithPrune(effectiveParams);` at line 228) by changing the
call to `return this.exportAllWithPrune(effectiveParams, resolvedExportTarget);`
and updating the `exportAllWithPrune(params, preResolvedTarget?)` signature so
the function uses `preResolvedTarget` when present and skips its internal
`resolveExecutionTarget` call. The existing post-resolution guard inside
`exportAllWithPrune` (lines 466-478) **stays** as defense-in-depth — even if a
future refactor re-introduces a path that bypasses the top-level guard, the
prune `rm` loop is still protected.

**Test file changes** (port: `VbaModulesAdapter.execute`, mocks:
`executeMappedTool`, `resolveExecutionTarget`):

- `test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts` — append to
  the existing `describe("Issue #574 — runtime guard for VbaModulesAdapter.execute exportPath (#185)")`:
  - `it("refuses export_modules when resolved destinationRoot points inside the production runtime (#619)")` — `resolveExecutionTarget` returns `{ data: { destinationRoot: "C:/runtime/dysflow/app/scripts" } }`; assert `error.code === "INVALID_INPUT"` and `executeMappedTool` NOT called.
  - `it("refuses export_all when resolved destinationRoot points inside the production runtime (#619)")` — same shape, toolName `"export_all"`, no `prune`.
  - `it("allows export_modules when resolved destinationRoot is outside the production runtime (#619)")` — green-path companion.
- Append to `describe("Issue #574 — runtime guard for VbaModulesAdapter.exportAllWithPrune")`:
  - `it("export_all prune refuses runtime destinationRoot pre-write — runner never invoked (#619)")` — set `resolveExecutionTarget` to runtime path; assert `executeMappedTool` was never called (asserts the top-level guard fires before prune branch).

**Failure mode**: `error.code: "INVALID_INPUT"`, message
`"Refusing to export to destinationRoot '...' inside the dysflow production runtime. Point destinationRoot at your project, not the installed runtime."`
Matches existing convention in `vba-execution-adapter.ts:171` and
`vba-forms-adapter.ts:431`.

**Backwards compatibility**: No existing caller relied on a `destinationRoot`
resolving inside the runtime. The four pre-existing test cases in the same
describe block (using `DYSFLOW_HOME: "C:/runtime/dysflow"` with `exportPath`
pointing outside) remain green. Call sites: `VbaSyncAdapter` sub-adapter wiring
at `vba-sync-adapter.ts:196-200`; only `execute` is touched, not the
constructor.

### PR 2 — F2 (backendPath propagation) + F3 (empty-string normalization)

#### F2 — `execution-target.ts:93-106`

**Surrounding code (current lines 98-106)**:

```ts
  return successResult({
    configSource: "runtime-default" as const,
    accessDbPath: context.accessPath ?? "",
    accessPath: context.accessPath,
    destinationRoot,
    projectRoot: stringValue(params.projectRoot) ?? context.destinationRoot ?? context.cwd,
    projectId: undefined,
    timeoutMs: explicitTimeoutMs ?? context.timeoutMs ?? 30000,
  });
```

**Diff**:

```diff
@@ -99,6 +99,7 @@
     configSource: "runtime-default" as const,
     accessDbPath: context.accessPath ?? "",
     accessPath: context.accessPath,
+    backendPath: stringValue(params.backendPath),
     destinationRoot,
     projectRoot: stringValue(params.projectRoot) ?? context.destinationRoot ?? context.cwd,
     projectId: undefined,
```

**Test file changes** (port: `resolveExecutionTarget`, fake
`ConfigFileSystemPort` that throws on read):

- `test/core/config/execution-target.test.ts` — append a new `describe("ExecutionTarget Override Precedence (#619)")`:
  - `it("branch 2 returns caller-supplied params.backendPath (#619)")` — context with `accessPath` defined, params `{ backendPath: "C:/worktrees/feature/backend.accdb" }`; assert `result.data.backendPath === "C:/worktrees/feature/backend.accdb"`.
  - `it("branch 2 normalizes empty-string params.backendPath to undefined (#619)")` — same context, params `{ backendPath: "" }`; assert `result.data.backendPath === undefined`.
  - `it("branch 2 normalizes whitespace-only params.backendPath to undefined (#619)")` — params `{ backendPath: "   " }`; same.
  - `it("branches 0/1/2 backendPath parity — caller override wins in every branch (#619)")` — parametrized over three branches; each calls `resolveExecutionTarget` with `params.backendPath` non-empty; assert all three return the override.

**Failure mode**: pure success — no error code emitted. The fix only adds a
field; `ExecutionTarget` type already declares `backendPath?: string` (line 21
of the same file), so this is a missing literal, not a contract change.

**Backwards compatibility**: branches 0 and 1 already return `backendPath`
(via `loadDysflowConfigAsyncWith` which has the field at `execution-target.ts:49`).
Branch 2 was the only branch that dropped it. No caller relied on the
incorrect `undefined` — that's the entire bug class. Call sites:
`vba-modules-adapter.ts:99`, `vba-forms-adapter.ts:126`, `vba-execution-adapter.ts:66`,
`vba-sync-adapter.ts:181`.

#### F3 — `dysflow-config.ts:280-282` (and symmetry at 264, 274, 259)

**Insertion points**: three of the four `buildProjectConfig` path fields need
`stringValue()` wrapping on the caller-override side of the `??` test. The
`projectRoot` is already protected by `resolveProjectRoot` (line 440:
`stringValue(explicitProjectRoot)`), but the orchestrator's spec requires
symmetric wrapping at the call site.

**Surrounding code (current lines 259-282)**:

```ts
  const projectRoot = resolveProjectRoot(raw, configDir, input.projectRoot);
  const timeoutMs = resolveTimeout(input.timeoutMs ?? raw.timeoutMs);
  const accessDbPath = resolveProjectPath(input.accessDbPath ?? raw.accessPath, projectRoot);
  if (accessDbPath === undefined) {
    return failureResult(createDysflowError("CONFIG_MISSING_ACCESS_PATH", ...));
  }
  const backendPath = resolveProjectPath(input.backendPath ?? raw.backendPath, projectRoot);
  // #13228 — comment
  const destinationRoot =
    resolveProjectPath(input.destinationRoot ?? raw.destinationRoot ?? "src", projectRoot) ??
    projectRoot;
```

**Diff**:

```diff
@@ -257,7 +257,7 @@
-  const projectRoot = resolveProjectRoot(raw, configDir, input.projectRoot);
+  const projectRoot = resolveProjectRoot(raw, configDir, stringValue(input.projectRoot));
   const timeoutMs = resolveTimeout(input.timeoutMs ?? raw.timeoutMs);
-  const accessDbPath = resolveProjectPath(input.accessDbPath ?? raw.accessPath, projectRoot);
+  const accessDbPath = resolveProjectPath(stringValue(input.accessDbPath) ?? raw.accessPath, projectRoot);
   if (accessDbPath === undefined) {
     return failureResult(createDysflowError("CONFIG_MISSING_ACCESS_PATH",
       `Project config ${resolvedPath} is missing accessPath.`));
   }
-  const backendPath = resolveProjectPath(input.backendPath ?? raw.backendPath, projectRoot);
+  const backendPath = resolveProjectPath(stringValue(input.backendPath) ?? raw.backendPath, projectRoot);
   // #13228 — comment
   const destinationRoot =
-    resolveProjectPath(input.destinationRoot ?? raw.destinationRoot ?? "src", projectRoot) ??
+    resolveProjectPath(stringValue(input.destinationRoot) ?? raw.destinationRoot ?? "src", projectRoot) ??
     projectRoot;
```

**Test file changes** (port: `loadDysflowConfigAsync` end-to-end against a
temp workspace with a real `.dysflow/project.json`):

- `test/core/config/dysflow-config.test.ts` — append a new
  `describe("Empty-String Override Normalization (#619)")`:
  - `it("empty-string destinationRoot override is treated as no override (#619)")` —
    `writeRepoProjectConfig(root, { accessPath: "front.accdb", destinationRoot: "src" })`,
    call `loadDysflowConfigAsync({ cwd: root, destinationRoot: "" })`, assert
    `result.data.destinationRoot === resolve(root, "src")` (not empty, not
    `undefined`).
  - `it("empty-string backendPath override is treated as no override (#619)")` —
    repo defines `backendPath: "backend.accdb"`; call with
    `backendPath: ""`; assert `result.data.backendPath === resolve(root, "backend.accdb")`.
  - `it("whitespace-only destinationRoot override is treated as no override (#619)")` —
    `destinationRoot: "   "`; assert repo value wins.
  - `it("empty-string accessDbPath override does not trigger CONFIG_MISSING_ACCESS_PATH (#619)")` —
    repo defines `accessPath: "front.accdb"`; call with `accessDbPath: ""`;
    assert `result.ok` and `result.data.accessDbPath === resolve(root, "front.accdb")`.
  - `it("non-empty caller override still wins after normalization (#619)")` —
    `destinationRoot: "C:/worktrees/feature/src"`; assert override wins.

**Failure mode**: pure normalization — no error code emitted when the
empty-string case is fixed (previously returned
`CONFIG_MISSING_ACCESS_PATH` for `accessDbPath: ""`).

**Backwards compatibility**: this IS a behavior change for callers that
deliberately passed `""` as a "use the default" signal. The proposal's risk
row confirms none of the MCP dispatch callers do so today. Migration impact:
documented in the `CHANGELOG.md` entry for the PR.

### PR 3 — F4: Prune Allow-List Parity

**Insertion point**: `src/adapters/vba-sync/vba-modules-adapter.ts:117` (the
constant) and line 559 (the inline list in `auditOrphans`).

**Surrounding code (current line 117)**:

```ts
const MANAGED_CODE_EXTENSIONS = [".bas", ".cls", ".frm"];
```

**Surrounding code (current line 559)**:

```ts
if ([".bas", ".cls", ".frm"].includes(ext)) {
```

**Diff**:

```diff
@@ -114,7 +114,7 @@
-const MANAGED_CODE_EXTENSIONS = [".bas", ".cls", ".frm"];
+const MANAGED_CODE_EXTENSIONS = [".bas", ".cls"];
```

```diff
@@ -556,7 +556,7 @@
-            if ([".bas", ".cls", ".frm"].includes(ext)) {
+            if ([".bas", ".cls"].includes(ext)) {
```

Also update the docstring on lines 120-124 to remove the `.frm` reference:

```diff
- * `<name>.form.txt` / `<name>.report.txt`; code lives in `.bas` / `.cls` / `.frm`.
+ * `<name>.form.txt` / `<name>.report.txt`; code lives in `.bas` / `.cls`.
```

**Test file changes** (port: `VbaModulesAdapter.execute("export_all", { prune: true })`,
real temp workspace with `VbaSyncAdapter` end-to-end):

- `test/adapters/vba-sync/vba-modules-adapter.test.ts` — append a new
  `describe("export_all prune allow-list parity (#619)")`:
  - `it("export_all prune never deletes .frm orphan files (#619)")` —
    `await writeFile(join(sourceRoot, "modules", "LegacyForm.frm"), "binary", "utf8")`,
    run `service.execute("export_all", { prune: true })` with mocked
    executor returning `exported: ["Live"]`; assert
    `await readFile(join(sourceRoot, "modules", "LegacyForm.frm"), "utf8"))`
    resolves to `"binary"` (still there) and `prune.deleted` does NOT include
    it.
  - `it("export_all prune keeps .bas and .cls orphans deletable (#619)")` —
    write `Orphan.bas` and `Orphan.cls` orphans; assert they ARE deleted
    (positive control so the test doesn't pass trivially).
  - `it("export_all prune ignores .txt and other non-allow-listed extensions (#619)")` —
    write `notes.txt` orphan; assert it is NOT deleted.
  - `it("export_all prune adversarial .frm masquerade attempt — not deleted even when no VBE match (#619)")` —
    write `ImportantModule.frm`; assert preserved even with no matching VBE
    module.

**Failure mode**: pure drop of an extension from the allow-list. The fix
produces fewer deletions (a `.frm` orphan is now kept instead of removed). No
new error code.

**Backwards compatibility**: any caller with live `.frm` source files will see
those files preserved (not deleted) by prune. Per the proposal's risk row,
`.frm` is a legacy binary format not generated by the modern dysflow export
path (which writes `.form.txt` + `.cls`). The audit confirmed no current
project uses `.frm` as a managed source. Migration impact: documented in
`CHANGELOG.md`.

## File Changes

| File | Action | PR | Description |
|------|--------|----|----|
| `src/adapters/vba-sync/vba-modules-adapter.ts` | Modify | 1 | Add F1 top-level guard; thread pre-resolved target into `exportAllWithPrune` |
| `test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts` | Modify | 1 | Append 4 RED→GREEN tests for resolved-`destinationRoot` guard |
| `src/core/config/execution-target.ts` | Modify | 2 | F2: add `backendPath` to branch 2 return literal |
| `src/core/config/dysflow-config.ts` | Modify | 2 | F3: wrap 4 caller-override path fields in `stringValue()` before `??` |
| `test/core/config/execution-target.test.ts` | Modify | 2 | Append 4 RED→GREEN tests for branch-2 `backendPath` propagation |
| `test/core/config/dysflow-config.test.ts` | Modify | 2 | Append 5 RED→GREEN tests for empty-string normalization |
| `src/adapters/vba-sync/vba-modules-adapter.ts` | Modify | 3 | F4: drop `.frm` from `MANAGED_CODE_EXTENSIONS` and the `auditOrphans` inline list; fix docstring |
| `test/adapters/vba-sync/vba-modules-adapter.test.ts` | Modify | 3 | Append 4 RED→GREEN tests for prune allow-list parity |
| `AGENTS.md` | No change | — | Line 92 already documents `.bas`/`.cls`/`.form.txt`/`.report.txt`; the F4 change makes code match the doc, not the other way around |
| `CHANGELOG.md` | Modify | Each | New `[Unreleased]` section with one bullet per PR (F3, F4 need migration notes) |

## Testing Strategy

| Layer | What to Test | Approach | PR |
|-------|--------------|----------|----|
| Unit | F1 resolved-`destinationRoot` guard | `vi.fn()`-mocked `resolveExecutionTarget`, assert `INVALID_INPUT` + `executeMappedTool` not called | 1 |
| Unit | F2 branch-2 `backendPath` parity | Fake `ConfigFileSystemPort` that throws on read; parametrized over 3 branches | 2 |
| Unit | F3 empty-string normalization | Temp workspace + real `loadDysflowConfigAsync` end-to-end (port the MCP stdio adapter uses) | 2 |
| Unit | F4 prune allow-list | Real temp `sourceRoot`, real `VbaSyncAdapter` with mocked PowerShell executor, assert file presence after prune | 3 |
| Integration | Full `pnpm test` | Existing 1809+ tests must remain green | 1, 2, 3 |
| E2E | None this cycle | Per the 2026-07-01 cycle rule and the proposal | — |

## Migration / Rollout

- **F3**: callers that previously relied on `""` as a "use the default" signal
  for `accessDbPath`/`backendPath`/`destinationRoot`/`projectRoot` will now
  get the repo-config value instead of an error. Document in `CHANGELOG.md`
  and in the commit body. No config-file changes needed.
- **F4**: callers with live `.frm` files in their `sourceRoot` will see those
  files preserved by prune. Document in `CHANGELOG.md`.
- **F1, F2**: zero migration; the changes only add new failure modes (F1) or
  populate an already-typed field (F2).
- Rollout: PR 1 → PR 2 → PR 3 on `staging` (main gated until user UAT sign-off
  per project convention).

## PR Commit Plan

- **PR 1 (F1)**: **single commit** — one logical change (move guard to
  pre-resolution). Splitting into "add guard" + "thread pre-resolved target"
  would make revert harder without value; the diff is reviewable in one pass.
- **PR 2 (F2 + F3)**: **two commits, in this order**:
  1. `fix(config): propagate backendPath in resolveExecutionTarget branch 2 (#619)`
     — F2, smallest scope, can be reviewed independently.
  2. `fix(config): normalize empty-string caller overrides in buildProjectConfig (#619)`
     — F3, same file but different function, distinct test surface.
  This split is justified: F2 is `execution-target.ts:93-106` (branch 2
  return literal); F3 is `dysflow-config.ts:280-282` (`buildProjectConfig`).
  Two files, two distinct failure modes (#13228 family vs empty-string
  precedence bug), two different test files. A single squashed commit would
  conflate them and make selective revert harder.
- **PR 3 (F4)**: **single commit** — one-line constant change + one-line
  inline-list change + docstring fix + four tests. Logically atomic.

All PR commit bodies carry `SDD: runtime-path-safety` and `Issues: #619` per
`gentle-ai:sdd-commit-traceability`. No AI co-author lines.

## Rollback Plan per PR

- **PR 1**: `git revert <sha>` restores the old prune-only guard. The
  pre-resolved-target plumbing is reverted cleanly because it is a new
  optional parameter to `exportAllWithPrune`. No effect on PRs 2/3.
- **PR 2 commit 1 (F2)**: `git revert <sha>` removes `backendPath` from the
  branch 2 return literal. Branch 2 once again drops the override (the
  pre-fix bug). F3 commit 2 stays valid.
- **PR 2 commit 2 (F3)**: `git revert <sha>` restores the `??` precedence
  without `stringValue()` wrapping. The `CONFIG_MISSING_ACCESS_PATH` regression
  for `accessDbPath: ""` returns. F2 commit 1 stays valid. Revert order: F2's
  commit 1 is safe to keep; F3's commit 2 is safe to revert independently.
- **PR 3**: `git revert <sha>` re-adds `.frm` to both lists and restores the
  docstring. No effect on PRs 1/2.

Each commit is independently revertable. The `git revert` command works for
all four; no manual steps required.

## Documentation Updates

- **`CHANGELOG.md`**: append a `[Unreleased]` section at the top with one
  bullet per PR:
  - F1: "**`export_modules`/`export_all` now refuse any invocation whose
    resolved `destinationRoot` falls inside the dysflow production runtime.**
    Closes #619."
  - F2: "**`resolveExecutionTarget` branch 2 now propagates caller-supplied
    `backendPath`** instead of silently dropping it (#13228 family, #619)."
  - F3: "**Empty-string caller overrides for `accessDbPath`/`backendPath`/
    `destinationRoot`/`projectRoot` are now treated as no override.** Previously
    `""` silently won the `??` precedence test, overwriting repo-config
    defaults. Note: callers relying on `""` as a fallback marker must now
    omit the field instead (#619)."
  - F4: "**`export_all prune` no longer deletes legacy `.frm` orphan files.**
    The allow-list now exactly matches AGENTS.md: `.bas`/`.cls`/`.form.txt`/
    `.report.txt` (#619)."
- **`AGENTS.md`**: no change. The line 92 allow-list is already correct
  (`.bas`/`.cls`/`.form.txt`/`.report.txt`); PR 3 makes the code match the
  doc.
- **`README.md`**: no change. The line 565-568 prune allow-list bullet is
  already correct.
- **`docs/mcp-examples.md`**: no change. No MCP surface change.
- **Inline code comments**: the F1 fix carries a comment block referencing
  `#619` and `vba-execution-adapter.ts:160-175` (the mirrored pattern). The
  F3 fix needs no inline comment; the `stringValue()` call is self-explanatory
  and matches `buildExplicitConfig:222`.

## Open Questions

None. The four findings have unambiguous port-level fixes; the chain split,
test surface, and rollback boundaries are all settled by the proposal + the
specs.
