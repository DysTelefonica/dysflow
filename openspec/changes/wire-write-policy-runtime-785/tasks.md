# Tasks — wire risk-based write execution policy to MCP dispatch path

**Branch**: `feat/785-wire-write-policy-runtime`
**Worktree**: `C:\Proyectos\dysflow-785`
**Author**: `andres <ardelperal@gmail.com>` (set explicitly via `git commit --author`)
**Test runner**: `pnpm test` (vitest, `vitest.config.ts`)
**Strict TDD**: ON (Engram obs #7450). Tests RED → GREEN → REFACTOR per capa. No commit until full suite green.

## Capa 1 — `resolveEffectiveDryRunInput` helper + dispatch seam

**Files**:

- `src/adapters/mcp/write-execution-dispatch.ts` (NEW): exports `resolveEffectiveDryRunInput(name, mode, input)`, `requiresExportSourceConfirmation(toolName, mode, input, paths)`.
- `src/adapters/mcp/dispatch.ts` (MODIFY): add `writeExecutionPolicy?` 7th parameter to `registerMcpTools`.
- `src/adapters/mcp/dispatch-factory.ts` (MODIFY): add `writeExecutionPolicy?` 6th parameter to `createDispatchTool`. Inside the handler, after `stripDeprecatedCompileParams` and `validateInput`, run `normalizeInput = resolveEffectiveDryRunInput(name, writeExecutionPolicy, normalizedInput)`.
- `src/adapters/mcp/tools.ts` (MODIFY): forward `writeExecutionPolicy` to `registerMcpTools`.
- `test/adapters/mcp/write-execution-dispatch.test.ts` (NEW): unit tests for the helper.

**Tests** (~15):

- (mode=developer, risk=routine-dev-write, no dryRun/apply) → returns input with `dryRun: false`.
- (mode=safe-by-default, routine-dev-write, no flags) → returns input unchanged.
- (mode=developer, risk=protected-write, no flags) → returns input unchanged.
- (mode=developer, risk=destructive-write, no flags) → returns input unchanged.
- Explicit `dryRun: true` → unchanged.
- Explicit `dryRun: false` → unchanged.
- Explicit `apply: true` → unchanged.
- Form mutation / catalog family → unchanged in any mode.
- Non-object / null / undefined inputs → returns the value verbatim (defensive).
- Forwarding to dispatch: when `createDispatchTool` receives `writeExecutionPolicy: "developer"` for `import_modules`, the `vbaSyncToolService.execute` is called with a payload containing `dryRun: false`.

**Commit message**:

```
feat(mcp): wire writeExecutionPolicy into MCP dispatch seam (#785)

Capa 1 of wire-write-policy-runtime-785. Adds resolveEffectiveDryRunInput
helper and propagates the resolved writeExecutionPolicy from
createDysflowMcpTools through registerMcpTools and createDispatchTool.
The helper injects dryRun=false in developer mode for routine-dev-write
tools when the caller omitted both dryRun and apply; explicit caller
intent always wins; form mutation / catalog family preserves its
existing default-dry-run behavior unchanged.

Refs: #785, #783 partial, builds on v2.1.0 (PR #784).
```

## Capa 2 — drop hardcoded `params.dryRun !== false` in `vba-modules-adapter`

**Files**:

- `src/adapters/vba-sync/vba-modules-adapter.ts` (MODIFY): line 231 changes from `params.apply === true ? false : params.dryRun !== false` to `params.dryRun === true`. `apply: true` semantics remain unchanged (the dispatcher did not modify `apply` — only `dryRun` — so the adapter still sees `apply: true` if the caller set it).
- `test/adapters/vba-sync/vba-modules-adapter-write-policy.test.ts` (NEW): truth table for `import_modules` / `import_all` / `delete_module` with the explicit `dryRun: false` forwarded from the dispatch seam.

**Tests** (~10):

- `import_modules` with `dryRun: false` forwarded → calls the runner instead of `planImport`.
- `import_modules` with `dryRun: true` → returns `planImport` result.
- `import_all` with `dryRun: false` → runner invocation.
- `delete_module` with `dryRun: false` → runner; with `dryRun: true` → `planDelete`.
- `apply: true` (when forwarded) → runner (legacy contract — preserved).
- `apply: true && dryRun: true` → `dryRun: true` wins (existing precedence rule, pinned test).

**Commit message**:

```
refactor(vba-modules): drop hardcoded params.dryRun !== false (#785)

Capa 2 of wire-write-policy-runtime-785. The dispatch seam now injects
the policy-driven effective default, so the adapter only needs to honor
explicit dryRun / apply. Removing the implicit "absence = plan" rule
enables developer mode to actually execute routine imports.

Refs: #785, builds on capa 1.
```

## Capa 3 — same cleanup in `vba-execution-adapter`

**Files**:

- `src/adapters/vba-sync/vba-execution-adapter.ts` (MODIFY): lines 353, 404 — same simplification (treat `params.dryRun === true` as the explicit plan signal; everything else executes).
- `test/adapters/vba-sync/vba-execution-adapter-write-policy.test.ts` (NEW): truth table for `test_vba` / `run_vba` with `dryRun`/no-flag and the allowed-procedures allowlist interaction.

**Tests** (~10):

- `test_vba` with `dryRun: false` forwarded → runner invocation; allowlist still required.
- `test_vba` with no `dryRun` (developer mode) → runner when allowlist permits; rejection when allowlist missing.
- `test_vba` with `dryRun: true` → plans (no runner invocation).
- `run_vba` follow-up runs unaffected (legacy semantics preserved).

**Commit message**:

```
refactor(vba-execution): drop hardcoded params.dryRun !== false (#785)

Capa 3 of wire-write-policy-runtime-785. test_vba / run_vba now
honor the policy-driven dryRun forwarded by the dispatch seam.
The allowed-procedures allowlist remains the real safety boundary:
MCP_ALLOWLIST_NOT_CONFIGURED is still returned when allowlist is
missing in either policy mode.

Refs: #785, builds on capa 2.
```

## Capa 4 — export-source guard runtime enforcement

**Files**:

- `src/adapters/mcp/write-execution-dispatch.ts` (EXTEND): add `requiresExportSourceConfirmation(...)` helper that returns a structured refusal or `null`.
- `src/adapters/mcp/dispatch-factory.ts` (MODIFY): inside the `route.kind === "vba-sync"` switch arm, before the `services.vbaSyncToolService.execute(...)` call, run the guard. If it returns a refusal, translate it into an `mcpResult` and short-circuit.
- `src/adapters/mcp/dispatch-common.ts` (MODIFY): add structured-error helper for `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION`, mirroring the shape of `MCP_PROCEDURE_NOT_ALLOWED`.
- `src/core/runtime/write-execution-policy.ts` (NO CHANGE): already exports `resolveWriteExecutionPolicy` + `pathOverlapsSourceRoot` re-export.
- `test/adapters/mcp/export-source-guard.test.ts` (NEW): full matrix from #783 §Scope item 3.
- `test/adapters/mcp/write-execution-dispatch-confirmation.test.ts` (NEW): truth table for the helper.

**Tests** (~12):

- `developer` + `export_modules` + destination == source root + no `confirmOverwriteSource` → refusal.
- `developer` + `export_modules` + nested managed folder + no confirmation → refusal.
- `developer` + `export_modules` + external path → no refusal.
- `developer` + `export_modules` + `confirmOverwriteSource: true` → no refusal.
- `developer` + `export_all` + dangerous destination + confirmation → no refusal.
- `safe-by-default` + `export_modules` + dangerous destination → no refusal (policy never fires guard in safe-by-default; existing plan path handles).
- Case-insensitive Windows: `C:\Projets\dysflow` vs `c:\projets\dysflow` → both refuse.
- Backslash / forward slash: `C:/Projets/dysflow` matches `C:\Projets\dysflow` → refuse.
- The refused error carries `toolName`, `destination`, `sourceRoot`, and a remediation hint.

**Commit message**:

```
feat(mcp): runtime enforcement of export-source guard (#785, #783 partial)

Capa 4 of wire-write-policy-runtime-785. Resolves the runtime gap
that v2.1.0 docs described but did not enforce. The guard fires only
in developer mode for destructive-write tools whose destination
overlaps the active source root; refusal carries the resolved
destination + source root + remediation. Explicit confirmOverwriteSource
bypasses the guard; external destinations are unaffected.

Refs: #785, #783 partial, builds on cap 1-3.
```

## Capa 5 — regression lock + capabilities consistency

**Files**:

- `test/adapters/mcp/dispatch-write-policy-overrides.test.ts` (NEW): pins `allowWrites: false`, allowed-procedures gate, `dryRun: true`, explicit caller intent — all of these STILL win over policy.
- `test/adapters/mcp/capabilities-effective-default-consistency.test.ts` (NEW): asserts `get_capabilities.effectiveDryRunDefault[t]` equals the actual dispatch behavior for a sample of 5 contract tools.
- `README.md` (MODIFY): §3a / §3b — add a one-paragraph "Runtime enforcement live in v2.1.1" note.

**Tests** (~12):

- `allowWrites: false` + `developer` + `import_modules` without flags → `MCP_WRITES_DISABLED`.
- `allowedProcedures` undefined + `developer` + `test_vba` without flags → `MCP_ALLOWLIST_NOT_CONFIGURED` (allowlist wins).
- `dryRun: true` + `developer` + `import_modules` → planImport (caller intent wins).
- `apply: true` + `safe-by-default` + `import_modules` → runner (caller intent wins).
- `developer` + `import_modules` + `dryRun: false` → runner (caller intent wins).
- `safe-by-default` + `import_modules` + no flags → planImport (safe mode preserved).
- `developer` + `import_modules` + no flags → runner (the headline behavior change).
- `developer` + `test_vba` + no flags + allowed → runner (the loop becomes zero-friction).
- `developer` + `test_vba` + no flags + allowlist missing → refusal (allowlist wins).
- `developer` + `export_modules` + external path → runner; `safe-by-default` returns plan.
- `developer` + `catalog_add_control` + no flags → plan (form family is exempt — kept).
- Capabilities snapshot equals actual dispatch behavior for `import_modules` / `test_vba` / `verify_code` / `export_modules` / `run_vba`.

**Commit message**:

```
test(mcp): regression-lock overrides + capabilities consistency (#785)

Capa 5 of wire-write-policy-runtime-785. Pin the contracts:
allowWrites=false / allowedProcedures / dryRun:true / apply:true / explicit
caller intent all win over the policy default. Asserts the capabilities
snapshot agrees with the actual dispatch behavior, so get_capabilities
stops lying about which calls will execute vs plan.

Refs: #785, completes the wire-up.
```

## Docs / release prep

**Files**:

- `README.md` (MODIFY): note that runtime enforcement is live in v2.1.1.
- `CHANGELOG.md` (MODIFY): v2.1.1 entry under `### Fixed` (closes #785) and `### Changed`.
- `package.json` (MODIFY): `version` bump `2.1.0` → `2.1.1`.

**Commit message**:

```
chore(release): v2.1.1

Bumps v2.1.0 → v2.1.1 (patch; backwards compatible — new behavior only
fires in opt-in developer mode). Closes #785 and the export-source
guard subset of #783.
```

## PR + merge + release

- Push branch `feat/785-wire-write-policy-runtime`.
- Open PR against `main` referencing #785 (and #783 for the export-source guard subset).
- Wait for CI green (Quality gates + Windows PowerShell/Access smoke).
- Merge to `main` via fast-forward (or merge commit) as a single PR with the capa commits intact.
- Push tag `v2.1.1`.
- Trigger release workflow; verify `name == tag` (GitHub release title guard).
- Verify SHA256SUMS + Ed25519 signature.
- Close issues #785 (and #783 if the export-source guard subset is enough; otherwise leave #783 for the rest).

## Estimated size

- ~5 capa commits + 1 release chore.
- ~60-80 unit/integration tests added (matches #779 scale for the foundation).
- ~1500-2500 lines changed across `src/`, `test/`, `README.md`, `CHANGELOG.md`, `package.json`.

## Risk markers (for apply-progress risk field)

- Capa 1 changes dispatch boundary — kept narrow via the helper; risk LOW.
- Capa 2/3 simplify adapter logic — risk LOW because dispatcher injects dryRun.
- Capa 4 introduces a new runtime refusal — risk MEDIUM (false-positive refuses are user-visible). Mitigation: `safe-by-default` mode never refuses; only `developer` mode opt-in users can hit it; the developer will see the rejection with a clear remediation.
- Capa 5 is regression-only — risk LOW.

## Out of scope (record in apply-progress and #783)

- Alias per-call gating refinement for `cleanup_access_operation(force)` / `access_force_cleanup_orphaned(confirmPid)` — already correctly enforced; #783 lists it as documentation-only.
- `developer-mode-extra-strict` mode — new feature; track in #783.
