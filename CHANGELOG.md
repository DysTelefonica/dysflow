# Changelog

## [v1.12.0] - 2026-06-30

- feat(forms): add MCP form mutation primitives (`dysflow_form_add_control`, `dysflow_form_move_control`, `dysflow_form_rename_control`) with strict write gates and canonical LoadFromText verification on `Gestion_Riesgos.accdb`.
- fix(forms): insert new controls into the section control container so Access `LoadFromText` accepts the mutated form source.
- chore: ignore generated form mutation artifact.
- docs: add MCP real-world examples reference.


## [v1.11.3] - 2026-06-30

- fix(vba-sync): place orphan CodeBehind marker after root End via Begin/End nesting


## [v1.11.2] - 2026-06-29

- fix(e2e): detect unowned MSACCESS.EXE leaks via global count delta - chore(release): prepare v1.11.1 - chore(openspec): archive 23 stale SDD changes - docs(sdd): retroactive SDD for release-process-automation - chore: ignore .codegraph/ (codegraph MCP cache, not source) - test(quality-gates): pin every mcp-e2e suite contract the heavy battery would otherwise catch 30 minutes in - test(e2e): pin compile_vba expectation to the documented mojibake state - docs(sdd): close the loop on tdd-coverage-holes verify-report - feat(scripts): release-prepare.ps1 with CI-gating


## [v1.11.1] - 2026-06-29

- chore(openspec): archive 23 stale SDD changes - docs(sdd): retroactive SDD for release-process-automation - chore: ignore .codegraph/ (codegraph MCP cache, not source) - test(quality-gates): pin every mcp-e2e suite contract the heavy battery would otherwise catch 30 minutes in - test(e2e): pin compile_vba expectation to the documented mojibake state - docs(sdd): close the loop on tdd-coverage-holes verify-report - feat(scripts): release-prepare.ps1 with CI-gating


## [v1.11.0] - 2026-06-29

`dysflow_compare_form` source-vs-source drift tool, formal closure of the Form UI Factory epic (#595), and the `tdd-coverage-holes` MCP E2E + VBA module forwarding guardrail battery (H1–H10).

### Added

- **`dysflow_compare_form` MCP tool (#597, slice 2 of epic #595).** Read-only source-vs-source drift detection for form/report `.form.txt` files: takes two paths, parses both to FormIR, classifies the diff (matched, whitespaceOnly, attributeOnly, caseOnly, formSerializationOnly, encodingOnly, sourceNewer, binaryNewer, bothChanged), and returns an actionable `recommendedAction` (`no_action`, `import_to_binary`, `export_to_src`, `manual_merge`). Pure offline static analysis, no Access required. Closes the compare half of consumer issue #563. Implementation `37a5177`; SDD `openspec/changes/archive/forms-ui-factory-slice-2/`.
- **Form UI Factory epic formal closure.** `dysflow_lint_form_code` (shipped in v1.10.0) and `dysflow_compare_form` together close epic #595. The slice-1 SDD (`openspec/changes/archive/forms-ui-factory-slice-1/`) was already shipped in v1.9.5 + v1.10.0; this release formalizes the closure with three contract specs, a doc-anchor test, and the `archive` move. Commits `6b26b1c`, `6fedf15`, `cca3002`, `e7c53bc`, `f639a81`.

### Fixed

- **`exists` / `delete_module` single-name forwarding (`ea9c0af`, RED `7c2a344`).** `VbaSyncAdapter.execute("exists", { moduleName:"Foo" })` and `("delete_module", { moduleName:"Foo", force:true })` now correctly forward `["Foo"]` to the runner. Root cause: `moduleNamesProvided` was derived from `Object.hasOwn(params, "moduleNames")`, which only saw the literal plural key. Now `(import_all && Object.hasOwn(params, "moduleNames")) || moduleNames.length > 0`, preserving R4 for `import_all` explicit-empty while making the single-name path visible.
- **WU-F descendant walker missing implementation (`640c173`).** The `fix(e2e): watch suite-owned descendant tree (W5-F)` commit (`90f4867`) imported `isPidOrDescendantAlive` from `_helpers/mcp-e2e-record.mjs` but never implemented the helper. Without this fix, the entire mcp-e2e suite would fail to import. Restores `walkDescendantsPids` (WMIC parent→children BFS) and `isPidOrDescendantAlive` (fast-path `process.kill(pid,0)` plus walker fallback), with fail-open semantics so a missing `wmic` degrades to parent-only detection rather than crashing the suite.
- **ESM `require("node:fs")` lazy fallback (`58412f1`).** `resolveMcpE2eCommand`'s default `existsSync` was a lazy `require("node:fs")` inside an ESM module. On Windows that binding silently answers false for every path, so every consumer invoking the helper from real ESM (the only shape `mcp-e2e.mjs` has) hit `MCP_E2E_OVERRIDE_NOT_FOUND` / `MCP_E2E_NO_RUNTIME_AVAILABLE` even when the runtime was present on disk. Hoists the import to a top-level static import; preserves the test injection surface (`options.fs.existsSync`).
- **WU-D regression in `mcp-e2e.mjs` (`ae80b2e`).** The `refactor(e2e): wire mcp-e2e.mjs through extracted record()` commit (`da254b4`) accidentally deleted `const list = await record("protocol", "tools/list")`. Without that line, the try/catch around `advertised = list.response...` silently swallowed the `ReferenceError`, and the advertised-tool-count preflight always reported 0 tools. Restores the line and bumps the expected count from 51 to 54 to match `test/adapters/mcp/advertised-tool-count.test.ts`.

### Tests

- **`tdd-coverage-holes` MCP E2E + VBA module forwarding battery (H1–H10).** Strict-TDD work unit battery that exercises every contract the previous in-memory simulation hid. SDD `openspec/changes/archive/tdd-coverage-holes/`.
  - H1 `exists` single-name forwarding — `vba-sync-adapter-exists-forwarding.test.ts` (real adapter, fake executor).
  - H2 `delete_module` single-name forwarding — `vba-sync-adapter-delete-forwarding.test.ts`.
  - H3 stop-on-fail after tool — `mcp-e2e-stop-on-fail.test.ts` (4 cases: expected error + isError false/true, expected success + isError true).
  - H4 preflight REFUSE-START on leaked PID — `mcp-e2e-subprocess-preflight.test.ts` (2 real subprocess tests).
  - H5 descendant walk — `mcp-e2e-grandchild-zombie.test.ts` (4 real subprocess tests: outer spawns detached grandchild, outer exits, walker detects via wmic).
  - H6 final lingering-access-check — `mcp-e2e-final-lingering-check.test.ts` (3 real subprocess tests including the 1s prudent delay before first poll, issue #574).
  - H7 zombie-check row + suite-owned PID eviction — `mcp-e2e-stop-on-fail.test.ts` (3 cases: clean exit, lingering child, leaked PID at preflight).
  - H8 `resolveMcpE2eCommand` default lazy-fs branch — `resolve-mcp-e2e-command.test.ts` (in-process) + `resolve-mcp-e2e-command-esm.test.ts` (real ESM subprocess repro).
  - H9 orphan count after battery — G.6 manual `Get-Process -Name MSACCESS` (0 lingering after the run).
  - H10 advertised tool count — `advertised-tool-count.test.ts` (54 non-hidden) + e2e preflight now PASS.

### Verification

All gates green except G.5 (E2E) which is partial: every H1–H10 contract exercised by the e2e suite passes (advertised count, REFUSE-START, per-tool zombie, stop-on-fail, final lingering check, descendant walk). The single sandbox `compile_vba` failure is a pre-existing `export_all` enumeration bug (`Form_FormNCAuditoriaGeneral` not in the `exported` list) that causes `export_all --prune:true` to delete its `.cls` from the sandbox `destinationRoot`. Filed as follow-up; not a regression from this SDD change. `pnpm test` 1809/1809, `pnpm test:ps1` 386/386, `pnpm build` clean, `pnpm lint` clean, 0 MSACCESS orphans. Full evidence in `openspec/changes/archive/tdd-coverage-holes/verify-report.md`.

## [v1.10.3] - 2026-06-29

Hotfix for PowerShell 7+ (`pwsh`) script-load order in `dysflow-vba-manager.ps1`.

### Fixed

- **`Set-ScriptOutputEncodingUtf8` used before defined under `pwsh` 7+ (`678a67d`).** The script invoked `Set-ScriptOutputEncodingUtf8` at line 116 but defined it at line 135. Windows PowerShell 5.1 tolerated the order; `pwsh` 7+ raises `CommandNotFoundException` and the `trap` block returned `VBA_MANAGER_UNEXPECTED_EXIT` with `trap_kind: CommandNotFoundException`, blocking every downstream action (test_vba, compile_vba, etc.). The helper is now defined in an explicit early-helpers block placed before the first call site. `Set-VbComponentNameSafe` and `Write-DysflowOperationMarker` are moved alongside for the same reason.

### Tests

- **AST regression test pins the new contract.** A new Pester context walks every top-level `CommandAst` and asserts each invocation comes after the line where the function is defined, catching the regression in both `powershell.exe` 5.1 and `pwsh` 7+.

## [v1.10.2] - 2026-06-29

Hotfix for `dysflow_test_vba` manifest path resolution with safe defaults and clearer diagnostics.

### Fixed

- **`dysflow_test_vba` manifest path resolution (`f7e47ac`).** When neither `proceduresJson` nor `procedureName`+`argsJson` was provided, `VbaExecutionAdapter.resolveTestProceduresJson` used `resolve(undefined, "tests.vba.json")` and produced degenerate paths surfaced externally as `ENOENT: open '[PATH]<\projectRoot>\tests.vba.json'`. The adapter now resolves a sensible base directory (`params.projectRoot` → `orchestrator.cwd`) with a guardrail, builds an ordered candidate list for the manifest across `projectRoot`, `destinationRoot`, and `cwd` (with `tests/tests.vba.json` and `tests.vba.json`), iterates them safely, and on failure returns `VBA_INVALID_TEST_PLAN` with `details.candidates` plus an actionable hint to pass `proceduresJson`, `procedureName`+`argsJson`, or an absolute `testsPath`.

### Changed

- **Hotfix rationale persisted as Engram lesson.** Memory observation `lessons/test-vba-manifest-default-path` documents why this contract slipped past TDD/E2E (no tests covered the default-discovery branch, internal e2e harnesses always provided a real `cwd`, and the external sanitizer redacted the diagnostic to `[PATH]`).

Hotfix release for MCP Access path resolution and signed update hardening.

### Fixed

- **MCP `accessPath` override precedence (`0b3d985`).** Explicit `accessPath` / `databasePath` values passed to MCP tools now win over `.dysflow/project.json` when a `projectId` is also provided, fixing false `CONFIG_TARGET_NOT_FOUND` failures for existing Access databases in consumer projects such as `gestion_riesgos`.
- **Relative project config path diagnostics (`0b3d985`).** Missing-target errors now carry structured diagnostic details (`accessDbPath`, `configPath`, `projectRoot`) for internal/debug consumers while preserving external sanitization.

### Security

- **Signed release checksum verification (`f90d09f`).** The updater now requires an Ed25519 signature over `SHA256SUMS` before trusting release checksums.

## [v1.10.0] - 2026-06-28

Per-module VBA import reporting, Unicode preservation on PowerShell 7, pre-import form code audit, and CI baseline repair.

### Added

- **`dysflow_lint_form_code` MCP tool (#563 partial).** Read-only pre-import form code audit with 6 rules: form-control-binding, access-listbox-no-list-assignment, bare-function-call-with-parens, named-and-positional-args-mixing, unicode-sensitive-executable-tokens, control-property-support. Pure Node static analysis, no Access required.
- **Per-module `import_modules` reporting (`e4b358b`).** Long-list imports return structured per-module results (module, phase, error, durationMs, rollbackApplied). No fallback to `import_all`. Detects `ACCESS_DATABASE_LOCKED` explicitly via `Test-IsAccessDatabaseLockedError` / `Get-AccessDatabaseLockedOwner`. Treats explicit empty `moduleNames` as a no-op plan (R4), not a silent `import_all` expansion.
- **Filesystem mutation gates + dry-run/apply parity (`495cf5b`).** `dysflow_query_execute` now exposes `dryRun` and `apply` (`src/adapters/mcp/schemas/dysflow-schemas.ts:103-104`), resolving the contract divergence that was blocking real writes (closes #567).
- **MCP write-gate for orphan process cleanup (`495cf5b`).** `dysflow_access_force_cleanup_orphaned` now refuses to kill a PID when MCP writes are disabled, returning `MCP_WRITES_DISABLED`. The list-only branch remains read-only (closes #564).

### Fixed

- **Unicode preservation in import round-trip on PowerShell 7 (`3fbd60a`).** `Normalize-VbaImportText` and `Split-CodeBehindSection` use default `-split` (no `-1` limit) which had a regression on PS7, silently dropping non-ASCII codepoints (S, í, ó, ñ) and the Windows-1252 byte sequence on multi-line imports.
- **`Fix-EncodingInSrc` bulk mode coverage for `.report.txt` and `.form.txt`.** Restored BOM stripping for managed source extensions after a Pester test isolation regression (`13b2228`).
- **`Resolve-FormCodeBehindFile` candidate extraction (`9913b5b`).** Test setup now extracts `Get-FormCodeBehindCandidateNames` alongside the helper, resolving 5 `CommandNotFoundException` failures in the pure-helpers describe.
- **`Close-AccessDatabase` null-PID notice extraction (`a009c29`).** Test setup now extracts `Get-NullPidCloseNotice`, resolving the `CommandNotFoundException` in the null-PID branch of `Close-CanonicalAccess`.
- **`Remove-AccessObjectOrComponent` Force fallback (`fdbfb1c`).** Test mock for `Resolve-ExistingComponentName` is now stateful — flips to `$null` once `DoCmd.DeleteObject` has fired — so the production post-deletion verification path is reachable.
- **`Invoke-CompileAction` return-shape alignment with `-Json` contract (`5becab1`).** Removed the unconditional `return $compileResult`. The `-Json` branch now relies on the file-level `Write-DysflowResult` stub to emit a JSON string the caller can `ConvertFrom-Json`; the non-`-Json` branch writes status messages only. Test mocks for compile failure results now match the production `New-CompileFailureResult` structured shape `{ code, message }`.
- **Optional presence-guard on `Object.hasOwn(params, "moduleNames")` (`20b7cca`).** Added the `optional-presence-guard: allow` marker for the legitimate `moduleNamesProvided` presence check that distinguishes "explicit empty" from "field omitted" (R4). Downstream, also resolved 6 pre-existing `Object is possibly 'undefined'` TS errors that were masked by the earlier lint failure.

### Issues closed

- #567 `fix(query): align dysflow_query_execute write mode with dryRun/apply contract` (commit `495cf5b`)
- #564 `fix(mcp): gate orphan process cleanup behind MCP write access` (commit `495cf5b`)

## [v1.9.5] - 2026-06-27

Offline form and control tree inspection, validation, serialization, and round-trip integration testing capabilities (issues #543).

### Added

- **Form UI offline serialization & parsing.** Added `serializeFormTxt` and `parseFormTxt` to compile/decompile `.form.txt` layouts without running Access.
- **Form IR verification & round-tripping.** Implemented validation and round-tripping tests to ensure generated form layout files conform strictly to the properties that Access expects.
- **Resilient inline compile checks.** Inline VBA execution now ignores unrelated pre-existing compile errors in the database, verifying only errors in the imported temporary inline module.

## [v1.9.4] - 2026-06-27

VBA manager hardening: active-lock verification on deletion, arity-0 run_vba fixes, stable inline modules, zombie Access process cleanup, compiler component identification, trailing character JSON tolerance, and unowned zombie process reaping (issues #601, #602, #603, #604, #605, #606, #607).

### Fixed

- **Active-lock verification on delete_module (#601).** Verified post-deletion check prevents false success reporting when VBA components are locked by active databases.
- **Arity-0 run_vba execution without ref requirement (#606).** Parameterless procedure calls bypass PowerShell dynamic ByRef wrapping, allowing direct invocation.
- **Stable module name for inline executions (#602).** Inline compilation uses a single stable module name (`__dysflow_inline__`) and purges previous runs instead of leaving unique random module structures.
- **Zombie MSACCESS.EXE reaping on timeouts (#603).** Reaps the exact associated Access COM instance when test/execution runs trigger timeouts.
- **Compiler component error location parsing (#604).** Toggles VBE visibility temporarily on compile errors so headless Access sessions can locate the compiler failure component.
- **Tolerant JSON parsing of proceduresJson (#607).** Trims trailing whitespace and control characters from the test procedures plan JSON array.
- **Unowned process reaping in preflight (#605).** Cleans up unregistered headless Access processes locking the current project path during preflight.

## [v1.9.3] - 2026-06-26

VBA inline execution sanitization, standardized dryRun defaults, size-limit stream destruction, and listOrphans OperationResult integration.

### Fixed

- **VBA inline execution regex sanitization.** `vba_inline_execution` now validates the input code parameter using a case-insensitive word-boundary check (`\bDeclare\b`, `\bShell\b`, `\bCreateObject\b`, `\bGetObject\b`, `\bLib\b`), rejecting unsafe command injection attempts with `INVALID_INPUT`.
- **Standardized dryRun defaults.** Writing tools (`import_modules`, `import_all`, and `generateForm`) now consistently default to plan mode (`dryRun: true`) unless `apply === true` or `dryRun === false` is explicitly supplied.
- **Immediate stream termination on limit violations.** The stdio size guard (`SizeLimitTransform`) now explicitly closes and destroys the stream via `this.destroy()` immediately after sending the `id: null` error frame, preventing client hangs.
- **listOrphans error mapping integration.** `AccessOrphanCleanupService.listOrphans` was updated to return `OperationResult` instead of throwing raw error exceptions or returning empty arrays on failures, ensuring clean and safe error propagation through MCP tool output translation.

## [v1.9.2] - 2026-06-26

Filesystem write-gates for forms/catalog tooling, PowerShell security hardening against path traversal, and core dependency refactoring (issues #565, #566, #568, #569, #570, #577, #579).

### Fixed

- **VBA form generation dry-run honors write-gates (#565, #566).** `generate_form` and `catalog_add_control` are now classified under a new `mutatesFilesystem: true` route property in the MCP tool route registry. When writes are disabled, `generate_form` no longer touches the disk, honoring the `dryRun` flag. `VbaFormService` was updated to support `dryRun: true` natively on form generation.
- **PowerShell import/fix_encoding script path-traversal prevention (#569).** Added `Assert-SafeVbaModuleName` to block module names containing path traversal sequences (`..`, `/`, `\`) or drive qualifiers, protecting local file imports and encoding fixes.
- **PowerShell relink_directory uses canonical path containment (#570).** Replaced simple `.StartsWith` comparison with a robust `Test-CanonicalPathContained` helper that evaluates absolute canonical path containment, preventing directory traversal or bypasses during backend table relinking.
- **Access runner write target ordering (#568).** `Resolve-QueryActionTargetPath` now extracts and evaluates write query database targets in the same order as read actions, ensuring consistent permission checks and paths.

### Refactored

- **Centralized MCP write policy metadata (#579).** Expanded the dispatch route registry table (`MCP_TOOL_ROUTES`) to split `mutatesBinary` and `mutatesFilesystem` properties, ensuring unified compilation-enforced check gates for all filesystem mutations.
- **Decoupled Node filesystem from VbaFormService core (#577).** Moved Node.js standard filesystem package imports out of `VbaFormService` to favor dependency injection via `FormFileSystemPort`, keeping the core service domain pure.

### Tests / internal

- Added comprehensive test suites in `test/adapters/mcp/dispatch-write-gate.test.ts` to assert that write-gate overrides block filesystem-mutating tools when disabled.
- Stabilized the `cross-process-lock.test.ts` parallel concurrency test against Windows scheduler resolution.

## [v1.9.1] - 2026-06-26

### Fixed

- **Reworded null-PID close warning to prevent false-alarm unsafe reports.** The previous console message "OwnedPid is null; cannot kill by path/CommandLine. Running ROT/lock fallback only" was misread by downstream agents as an unsafe multi-instance process kill. The notice has been extracted into `Get-NullPidCloseNotice` and clearly states that dysflow kills nothing on this path and other Access instances are unaffected.

## [v1.9.0] - 2026-06-26

Forms/reports semantic-diff and sync correctness pass, plus consuming-agent ergonomics on `verify_code` and `list_access_operations` (issues #549–#554, #559, #561).

### Fixed

- **`verify_code` now strips report code-behind from `.report.txt` comparisons (#549).** The semantic classifier hard-coded the `CodeBehindForm` marker, so for a `.report.txt` (which Access serializes with `CodeBehindReport`) the code-behind section was never stripped and was compared, double-counting report VBA code that the sibling `.cls` already owns and producing false `actionableDifferent` results. The marker match now covers both forms and reports (`stripCodeBehindSection`), mirroring the PowerShell `Split-CodeBehindSection`.
- **`fix_encoding` now repairs `.report.txt` files in bulk mode (#550).** `Fix-EncodingInSrc`'s bulk glob included `*.bas`/`*.cls`/`*.frm`/`*.form.txt` but not `*.report.txt`, so a BOM-corrupted report source was silently skipped and later failed to import with an opaque `LoadFromText` error.
- **`.cls`-only forms are detected as document modules on `import_modules` (#551).** `importIncludesDocumentModule` only matched `.form.txt`/`.report.txt`, so a form whose source tree held only its code-behind `.cls` (layout not re-exported) was not recognized, the headless `IsCompiled=False` compile-bypass guard (#543) was skipped, and an expected unverified-compile downgrade became a hard failure. A `.cls` in `forms/` or `reports/` is now treated as a document-module marker (scoped to those folders, so a class in `classes/` cannot be misclassified).
- **`Resolve-FormCodeBehindFile` no longer builds impossible cross-prefix candidates (#553).** It derived the other-prefix candidate from the full module name, producing names like `Report_Form_MyForm.cls` that can never exist (one wasted `Test-Path` per import). Candidates are now derived from the prefix-stripped base via `Get-FormCodeBehindCandidateNames`.

### Added

- **`verify_code` always surfaces a VBE-cache caveat (#559).** `verify_code` compares on-disk source against the on-disk binary only; it cannot see the user's live Access/VBE in-memory cache. The result now carries a stable `vbeCacheNote` so a consuming agent that gets a match still knows to advise closing/reopening Access if the user keeps seeing "method or member not found" errors.
- **`list_access_operations` marks stale entries (#561).** Each entry now carries a read-time `isStale` flag (computed, never persisted, never auto-deleted): failed/timed-out/unattributed operations with no owned PID, idle past the staleness window, or interrupted-before-PID records. This lets an agent distinguish stale bookkeeping from genuinely active operations without a separate cleanup call.

### Tests / internal

- Report-context coverage for the semantic classifier (code-behind strip, serialization noise, toggle equivalence) and `.form.txt`+`.cls` pair dedup on import dry-run (#554).
- The form/report toggle collapse is pinned as **value-token scoped by design** (#552, closed): any property whose value is `0`/`-1`/`NotDefault` present-vs-absent folds as serialization churn regardless of property name; a boolean-name allowlist was rejected because a missed name would re-introduce that churn as a false positive.

## [v1.8.0] - 2026-06-25

Consuming-agent ergonomics pass over the MCP surface (issues #543, #533, #544, #545, #546, #548).

### Fixed

- **Headless compile failures are now detected instead of reported as success (#543).** `RunCommand(126)` (`acCmdCompileAndSaveAllModules`) returns normally even when modules fail to compile, so the previous catch-only detection reported `compileResult.ok: true` on broken code (false green). The runner now reads `Application.IsCompiled` after compiling and surfaces a structured `VBA_COMPILE_ERROR` (with a non-zero exit) when the project does not compile, so `import … compile:true` and `compile_vba` fail loudly. The signal is reliable for standard/class modules; for form/report **document** modules — which Access cannot bring to a compiled state headless — the result reports `compileResult.verified: false` rather than a spurious failure (the headless document-module limitation is tracked in #547). Verified with a real-Access E2E repro.

### Added

- **Real per-tool MCP descriptions (#544).** All 45 dispatch/alias tools advertised an autogenerated parity-registry boilerplate that told consuming agents nothing. Each tool now has a real description (purpose, key args, and read-only/write-gated/destructive/dry-run/headless footguns), sourced from a single `TOOL_DESCRIPTIONS` map; a contract test rejects boilerplate.
- **`vba_inline_execution` guardrails (#533).** Reject code over 1024 chars (`INVALID_INPUT`), reject snippets containing `End Sub`/`Function`/`Property` (they break the `ExecuteInline` wrapper), and clamp the effective timeout to a 30s ceiling.

### Changed / Security

- **The write-family `dryRun`/`apply` contract is now advertised on the schema (#545).** The shared `dryRun`/`apply` props document the contract — writes default to dry-run; a tool commits only on `apply:true` or `dryRun:false`; `apply` takes precedence — and MCP and HTTP share the same prop so it cannot diverge.
- **`relink_directory` steers secrets to `passwordEnv` (#546).** The raw `password`/`backendPassword` arguments are marked DISCOURAGED in favor of `passwordEnv`, so a consuming agent is not invited to inline a secret into the tool call (the value was already redacted and forwarded via the environment, never argv).
- **Inline execution refuses to write into the dysflow production runtime (#548).** `vba_inline_execution` rejects a `destinationRoot` that resolves inside the installed runtime (AGENTS.md hard rule). The runtime-dir resolver moved to `src/shared` (re-exported from the CLI path) so adapters can use it without importing from `cli/`.

## [v1.7.9] - 2026-06-25

### Fixed

- **`compact_repair` can now compact a password-protected database.** The runner passed the password only as DAO `CompactDatabase`'s 3rd argument (`DstConnect`, which sets the *output* password), never the 5th (`SrcConnect`) that *opens* a protected source — so compacting a password-protected `.accdb` always failed with `No es una contraseña válida`, even with the correct password. (Verified empirically against `DAO.DBEngine.120`: 3rd-arg-only fails to open a protected source; 3rd + 5th succeeds.) The password is now supplied in both args, so the protected source opens and the compacted output stays protected. The password-selection fix in v1.7.3 was correct — only the DAO call site was wrong, and the MCP E2E only exercised the dry-run path, so it was not caught earlier. Added a real-DAO integration test that compacts a password-protected database end to end.

## [v1.7.8] - 2026-06-25

Test-only release — the shipped runtime (`dist` + `scripts`) is identical to v1.7.6/v1.7.7.

### Tests

- De-flaked the `handleUpdateCommand` install tests. Two update tests pointed `preparePackage` at `process.cwd()`, so `installRuntime` copied the built `dist` and ran a real `pnpm install --prod` of the project dependencies — which could exceed the 15s test timeout on slow/loaded machines. They now use a lightweight deps-free release package root (~3.2s → ~0.5s for the trio), and the up-to-date test asserts `preparePackage` is never called.

## [v1.7.7] - 2026-06-25

Test-only release — the shipped runtime (`dist` + `scripts`) is identical to v1.7.6.

### Tests

- Consolidated the `resolveDefaultVbaManagerScriptPath` no-`DYSFLOW_HOME` assertions into the dedicated `vba-manager-script-path.test.ts` (including the whitespace-`DYSFLOW_HOME` edge case) and removed the duplicates from `vba-sync-adapter.test.ts`. No coverage change.

## [v1.7.6] - 2026-06-24

### Fixed

- **VBA-sync operations resolve the manager script independent of the working directory.** Without `DYSFLOW_HOME`, the default `dysflow-vba-manager.ps1` path was the bare relative `scripts/dysflow-vba-manager.ps1`, which failed (`-File ... no existe`) when an operation spawned PowerShell with a project-directory `cwd` — surfaced by the real-Access E2E as `list_objects` failing. It now resolves to an absolute path from the package root (new `findPackageRootNear` helper) and is cwd-independent. Production (where `DYSFLOW_HOME` is set) is unaffected.

### Tests

- Added unit guards that catch two issues at unit speed instead of only via the heavy real-Access E2E: the vba-manager script-path resolution, and the advertised (non-hidden) MCP tool count (51). Corrected the stale `advertised-tool-count` expectation (52 → 51) in `E2E_testing/mcp-e2e.mjs`.

## [v1.7.5] - 2026-06-24

### Fixed

- **`compact_repair` no longer wedges on a leftover target file.** DAO `CompactDatabase` throws if the target already exists; a run killed between compaction and the final `Move-Item` left a stale `<base>.compacted` file that made every subsequent `compact_repair` on that database fail. A new Pester-tested `Clear-CompactTarget` removes a leftover target before compacting.
- **`compact_repair` now honors `backupFirst`.** The MCP schema accepted `backupFirst` but it was silently ignored — the field was never forwarded from the request mapper to the PowerShell payload, so the runner could not see it. `backupFirst` is now wired through `AccessQueryRequest` + `buildMaintenanceRequest`; when set, the runner backs the source up via `Backup-AccessFile` before compacting and returns the `backupPath` in the result (`null` when no backup was taken).

## [v1.7.4] - 2026-06-24

### Fixed

- **Lock acquisition no longer fails intermittently with "Access is denied" on Windows.** Directory deletion is not synchronous on Windows: a concurrent lock *release* leaves the lock directory in `DELETE_PENDING` state while a handle (or the indexer/antivirus) still touches it, so a competing `mkdir` returns `EACCES` (`ERROR_ACCESS_DENIED`) or `EPERM` instead of `EEXIST`. Both lock acquirers — the cross-process execution lock (`cross-process-lock.ts`) and the operation-registry mutation lock (`access-operation-registry.ts`) — only retried on `EEXIST` and **threw** on `EACCES`/`EPERM`, causing intermittent failures under contention. A shared `isTransientLockContentionError` helper now treats `EEXIST`/`EACCES`/`EPERM` as transient and backs off + retries; stale-lock eviction still runs only for `EEXIST`, and `EACCES`/`EPERM` retries are logged so a genuinely permanent permission error (bounded by the acquire deadline) stays observable.

## [v1.7.3] - 2026-06-24

### Fixed

- **`compact_repair` now compacts a password-protected frontend with the correct password.** The runner's only env-sourced compaction password was `$BackendPassword`, but the configured frontend (`accessPath`) is protected with the **access** password — so compacting a password-protected project database failed with the DAO error `No es una contraseña válida` even though `query_execute` / `test_vba` (which use the access password) opened the same binary fine. Raw payload passwords are stripped before reaching PowerShell for security (#498), so the env-sourced `DYSFLOW_ACCESS_PASSWORD` / `DYSFLOW_BACKEND_PASSWORD` are the real source. A new pure, Pester-tested `Resolve-CompactPassword` selects the password by the database being compacted: the configured frontend uses the access password, a separate/backend file uses the backend password, with cross-fallback. Explicit `passwordEnv` payload overrides still win.

## [v1.7.2] - 2026-06-24

### Fixed

- **`compact_repair` can now compact a project's own configured database.** The runner rejected any source whose resolved path equaled `-AccessDbPath` with `compact_repair cannot rewrite the currently open database safely. Use a separate databasePath`, which made compacting the project's own `.accdb` from the MCP impossible — the primary use case. The guard protected against nothing real: `compact_repair` is early-dispatched **before** MSACCESS opens, runs pure DAO `CompactDatabase` into a **distinct** temp target, then atomically `Move-Item`s it over the source while holding the cross-process execution lock (the same operation a direct `Access.Application.CompactRepair` performs safely). The source/target planning was extracted into a pure, Pester-tested `Get-CompactRepairPlan` and the guard removed. DAO still surfaces a real error if the source is genuinely open.

### Changed

- **`compact_repair` MCP schema now accepts `apply`.** `apply: true` previously failed `additionalProperties` validation with `MCP_INPUT_INVALID`; the dispatch write-gate already honored it via `resolveIsDryRun`, so the schema now exposes it alongside `dryRun` for parity with `relink_directory`.

## [v1.7.1] - 2026-06-24

Internal hardening and a follow-up architecture migration. No change to the MCP/CLI surface
or runtime behavior.

### Changed

- **Lock filesystem port moved out of `src/core` into an adapter.** `cross-process-lock.ts` no longer imports `node:fs/promises`; the node-backed `LockFileSystemPort` now lives in `src/adapters/runner/node-lock-file-system.ts` and is injected into `AccessPowerShellRunner` by the composition roots. The file was removed from the `KNOWN_DIRECT_IO_DEBT` ratchet in `core-boundary.test.ts`. Mirrors the v1.6.1 config migration; behavior unchanged.
- **Dynamic operation registry `update` no longer reads twice.** The MCP dynamic-services registry probed each cached registry with `get()` and then `update()`; since `update()` is a no-op returning `undefined` when it does not own the id, it now calls `update()` directly, removing a redundant file read for the file-backed registry. Adds behavior coverage for the routing.

### CI

- **Release signing pipeline (publisher side).** Added a keygen helper (`.github/scripts/generate-release-signing-key.sh`) and a conditional `Sign checksums (Ed25519)` step in `release.yml` that signs `SHA256SUMS` → `SHA256SUMS.sig` when the `RELEASE_SIGNING_KEY` secret is present (skipped, checksum-only, otherwise). Completes the verification gate added in v1.7.0; signing stays inert until the maintainer provisions the key.

## [v1.7.0] - 2026-06-24

Security hardening of the runner lock and the self-update path. No change to the MCP/CLI
surface; default runtime behavior is unchanged (the signature gate ships inert).

### Fixed

- **Runner lock no longer deadlocks after a cross-process lock timeout.** When acquiring the cross-process file lock threw (e.g. `RunnerLockTimeoutError` under contention), the throw happened before the `try/finally` that releases the in-process serialized lock, so `releaseCurrent()` never ran. The chained promise stayed pending forever and every later same-key operation deadlocked on `await previous`. The cross-process acquisition now lives inside a `try/finally` that always releases the in-process lock and cleans the `lockState` map (`src/core/runner/cross-process-lock.ts`).
- **Lock heartbeat failures are no longer swallowed silently.** A persistent non-ENOENT `utimes` failure (e.g. `EPERM`) stopped refreshing the lock mtime, letting a concurrent acquirer declare a live lock stale and steal it — breaking mutual exclusion invisibly. Non-ENOENT heartbeat errors are now routed to an observable sink; ENOENT stays benign (the lock was already released).

### Security

- **Tar-slip defense on update extraction.** The release archive listing (`tar -tzf`) is now validated before extraction; any absolute path (POSIX, Windows drive-letter, UNC) or `..` parent segment is rejected (`assertSafeArchiveEntries`), instead of trusting the system `tar` to refuse traversal.
- **Authenticity gate for SHA256SUMS.** Added fail-closed Ed25519 signature verification over `SHA256SUMS` (`SHA256SUMS.sig`), verified before the hash is matched (`verifyChecksumsSignature`). The trust anchor (`RELEASE_SIGNING_PUBLIC_KEY_PEM`) ships empty, so verification is skipped until the maintainer generates a key, signs releases, and embeds the public key — see [`docs/security/update-trust-model.md`](./docs/security/update-trust-model.md) for the enablement steps.

## [v1.6.1] - 2026-06-24

Internal hardening only — no change to the MCP/CLI surface or runtime behavior.

### Changed

- **Config loading moved behind an injected `ConfigFileSystemPort`.** `src/core/config/dysflow-config.ts` no longer touches the filesystem directly; the node-backed default now lives in `src/adapters/config/dysflow-config-node.ts`, so config resolution is unit-testable with an in-memory fake. A new `core-boundary` architecture test ratchets against any new direct `node:fs`/network import in `src/core` (existing direct-I/O files are an explicit, shrink-only allow-list).

### Fixed

- **Deterministic test runs on Windows.** Real-Access integration tests were included in the parallel unit pool and intermittently threw `spawn UNKNOWN (errno -4094)` when spawning MSACCESS/PowerShell concurrently. They now run single-fork via `vitest.integration.config.ts` (new `test:integration` script); the default `pnpm test` run is Access-free by construction and no longer races on process spawning.

## [v1.6.0] - 2026-06-24

### Changed

- **BREAKING — the source/binary compare tools collapsed into a single `verify_code`**: `verify_binary`, `reconcile_binary`, and `compare_module` were four MCP tool names over one engine (`compareSourceAgainstBinary`) and have been **removed**. `verify_code` now covers every scope and replaces all of them:
  - **Whole project** — omit `moduleNames` (old `verify_binary`).
  - **Subset / single module** — pass `moduleNames` (old `compare_module`). A `moduleNames` filter that matches nothing now returns `MODULE_NOT_FOUND` instead of a misleading empty "all match".
  - **Reconcile plan** — the result carries a new aggregated, classification-aware `recommendation` (human string) plus `recommendedAction` (`no_action` | `import_to_binary` | `export_to_src` | `manual_merge`), so a consumer reads the sync direction in one shot (old `reconcile_binary`). It still never mutates Access; apply with the explicit `import_*` / `export_*` tools.

  Everything else is unchanged: semantic classification, `summary`, `actionableDifferent` / `nonActionableDifferent`, `hasFunctionalDifferences` / `actionableOk`, per-diff `classification` / `reason` / `recommendedAction`, optional `diffs`, `dysflowVersion`, and `classifierRules`. The visible MCP tool inventory drops from 48 to 45 dispatch names.

  **Migration:** `verify_binary` → `verify_code` (identical args); `compare_module {moduleName}` → `verify_code {moduleNames:[name]}`; `reconcile_binary` → `verify_code`, then read `recommendation` / `recommendedAction`.

## [v1.5.2] - 2026-06-23

### Added

- **`compile: true` support in `import_modules` and `import_all`**: the `compile` parameter was already present in the JSON schema but was silently ignored. It now triggers `acCmdCompileAndSaveAllModules` (via `Action: "Compile"`) after a successful import, saving all modules in the Access VBA project. Compile errors are propagated with full context (`error`, `component`, `line`) and surface as a failed result; a successful compile merges `compileResult` into the import response. Compile is skipped on dry-run and on import failure.

## [v1.5.1] - 2026-06-23

### Fixed

- **`import_modules` mangled non-ASCII VBComponent names (e.g. `Módulo1` → `Mód×lo1`)**: `DoCmd.CopyObject` is not Unicode-safe — when creating a new VBA component from a seed, it silently corrupts non-ASCII characters in the new-object name via the system's ANSI codepage. The fix forces the correct name via the `VBComponent.Name` COM property setter immediately after `CopyObject`; this setter follows the same Unicode-safe path as the VBE F4 → Name rename and is a no-op when `CopyObject` happened to produce the right name. This affected the create path only (re-importing an existing module used `DeleteLines + AddFromFile` and was unaffected).
- **Non-ASCII module names corrupted in `list_objects` and tool output**: `powershell.exe` 5.1 defaults its stdout to the active console code page (e.g. CP1252). Node.js reads the child process stdout as UTF-8, so non-ASCII bytes (e.g. `ó` = 0xF3 in CP1252) were invalid UTF-8 start bytes and were replaced with U+FFFD in any JSON response — including `list_objects`, `import_modules`, and `export_all` output. The fix adds `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` at PowerShell script startup so all stdout is valid UTF-8 end-to-end.

## [v1.5.0] - 2026-06-21

### Changed

- **`importMode=Form` is deprecated and now behaves exactly like `Auto`**: a form/report is always imported with its UI/layout from the `.form.txt` AND its canonical code from the sibling `.cls`. There is no separate "layout-only" import, because `LoadFromText` always carries the form's embedded code-behind — the old `Form` mode therefore did not mean "UI without code"; it meant "UI plus the possibly-stale embedded copy, and skip the `.cls` sync", which could leave the binary running outdated code-behind. `Form` (and `form`) is still accepted as a deprecated alias so existing callers keep working; it normalizes to `Auto` in both the TypeScript adapter and the PowerShell runner. `Code` mode is unchanged (imports only `.cls`/`.bas` code-behind without touching layout via `LoadFromText`). The dead `Form`-specific branches in `Resolve-ImportFileForModule` and `Import-VbaModule` were removed so the `.cls` always wins for a document's code.

## [v1.4.1] - 2026-06-20

### Fixed

- **`import_modules` with `importMode="Auto"` silently dropped a form/report's code-behind**: for a form/report exported as both a `.form.txt` (layout + an embedded copy of the code-behind) and a `.cls` (the canonical code), `Resolve-ImportFileForModule` in `Auto` mode resolved to the `.form.txt` first and imported it via `LoadFromText`, never reading the `.cls`. Because `verify_binary` compares a form's code through the `.cls` (the `formtxt-codebehind-split` rule), editing the canonical `.cls` and importing with `Auto` returned `ok:true` while the binary kept the stale embedded code-behind, so `verify_binary` reported the form as `sourceNewer` forever. `Auto`/`Code` now sync the `.cls` into the freshly loaded document module after `LoadFromText` (reusing the `importMode=Code` `DeleteLines` + `AddFromFile` path); `importMode=Form` stays layout-only. If the code-behind cannot be synced the import now fails loudly instead of reporting a false `ok:true`. Verified against real Access with a negative/positive control (a marker added only to the `.cls` round-trips through the binary after `Auto` only with the fix).

## [v1.4.0] - 2026-06-20

### Fixed

- **`run_vba` / `vba_inline_execution` with no arguments failed with `VBA_MANAGER_FAILED`**: `Invoke-RunProcedureAction` declared `$ProcedureArgsJson` as a `Mandatory [string]`, which PowerShell rejects when empty (`cannot bind argument … because it is an empty string`) before the body ran. Running a procedure with no args passed `""` and hit the binding error. `[AllowEmptyString()]` now lets the empty case reach `Convert-ProcedureArgsJson`, which already maps it to no args.
- **A VBA-manager timeout leaked an orphaned Access process**: on timeout the PowerShell process is killed, but the Access COM process it spawned is a separate process that survived as an orphan until the next operation's preflight cleanup. Both timeout paths (the `verify_binary` / `reconcile_binary` export and `executeMappedTool`) now re-run the path/lock cleanup immediately so a timeout never leaks an Access process. The cleanup is guarded — if it throws, it degrades to a warning diagnostic instead of masking the original timeout.

### Added

- **`dysflow setup` scaffolds a per-project `timeoutMs`**: the generated `.dysflow/project.json` now includes an explicit, editable `timeoutMs`, and the command recommends tuning it. The configured project timeout is honored end-to-end when no per-call timeout is given; surfacing the knob at init keeps heavy whole-project operations on large databases from silently falling back to the generic default and false-timing out.

## [v1.3.3] - 2026-06-19

### Fixed

- **`test_vba` `spawn ENAMETOOLONG` on large test plans**: the full test plan was serialized into an inline `-ProceduresJson` command-line argument, so a plan with enough tests/args overflowed the Windows ~32K command-line limit and Node's `spawn` failed with `ENAMETOOLONG` before Access ever started (`import_modules` was unaffected — it only passes a short module-name list). Plans over 8K chars are now written to a temp file passed via `-ProceduresJsonFile` (already supported by the PowerShell runner), keeping the command line bounded; the temp file is cleaned up even on timeout/error. Small plans stay inline.

## [v1.3.2] - 2026-06-18

### Added

- **Dynamic Config/Service Isolation**: MCP stdio server now wraps and instantiates service components dynamically (`createDynamicServices`), resolving per-call configuration/database overrides on the fly and caching them. This avoids stale-cache issues and allows switching targets mid-session without restarting the server.
- **Aligned Schema Overrides**: Extended validation schemas for `run_vba` (`dysflow_vba_execute`), `cleanup_access_operation`, `relink_directory`, and `dysflow_doctor` to fully support context and workspace overrides (`ACCESS_OVERRIDE` / `STRICT_CTX` / `timeoutMs`).

## [v1.3.1] - 2026-06-18

### Added

- **`delete_module` batch support**: accept a `moduleNames` array to delete a batch of modules in a single Access session, avoiding COM collisions. Backward compatibility for single `moduleName` is preserved.

## [v1.3.0] - 2026-06-18

### Added

- **`export_all` `prune`** (opt-in): after a fully clean export, `prune: true` mirrors the binary by deleting on-disk source files (`.bas`/`.cls`/`.form.txt`/`.report.txt`) whose object no longer exists, reporting them under `prune.deleted`. `export_all` remains additive by default. Safety guards: it never prunes if the export reported any warning (`prune.applied: false`); `prune` + `filter` is rejected with `INVALID_INPUT` (a filtered export would make every other file look orphaned); saved queries are never pruned; the keep-set is the export's own `exported` list.

## [v1.2.61] - 2026-06-18

### Fixed

- **Config resolution (#535)**: an explicitly-passed `destinationRoot`/`backendPath` was overridden by the discovered `.dysflow/project.json`. Without an explicit `accessPath`, resolution walked up from the MCP startup cwd, found the startup project, and its `src/` collapsed onto the caller's target — so `export_all` from a worktree could overwrite the wrong `src/` (a real incident broke 186 staging files). `accessPath` appeared to work only because it routes through the explicit-config branch. The caller's explicit override now wins; the discovered repo config is a default, not an authority.

### Security

- Cleared high-severity advisories: bumped `vite` to `8.0.16` (clears GHSA-fx2h-pf6j-xcff) and added a pnpm override for `hono >=4.12.25` (clears GHSA-88fw-hqm2-52qc).

### Changed

- Modernized the dev toolchain: `vite` 6 → 8, `vitest` → 4.1.9, `@biomejs/biome` → 2.5.0. Aligned `@types/node` with the supported Node 20 runtime (`engines: >=20`).

## [v1.2.60] - 2026-06-15

### Added

- **`vba_orphan_audit`** (read-only): lists VBA modules with no on-disk source counterpart and modules whose names match the Access placeholder pattern (`Módulo1`, `Module1`, `Class1`, `Form1`, …). Each entry reports `isOrphan`, `isSuspicious`, and `sourcePath`. The disk↔VBE cross-reference is case-insensitive, since VBA identifiers are case-insensitive and the VBE re-cases names on import.
- **`vba_inline_execution`** (write-gated): runs a throwaway VBA snippet in one call — writes a temporary module, imports it, executes its public entry point, captures the result, and guarantees cleanup of both the temp module (force-deleted) and the temp file.
- **`delete_module` `force`**: when deletion fails with the corruption HRESULT `0x800ADEB9`, pass `force: true` to attempt a fallback (compact + `DoCmd.DeleteObject`). Without `force`, the error returns bilingual remediation steps.
- HRESULT troubleshooting guide at `docs/diagnostics/hresult-guide.md`; bilingual remediation advice for `0x800ADEB9` / `0x800A09D5` is appended to MCP error messages.

### Fixed

- HRESULT `0x800ADEB9` remediation was silently dropped when .NET rendered the COMException as a signed decimal — the lookup used the wrong decimal (`-2146824519`); corrected to `-2146771271`.

### Security

- Write-gating is now consistent across all VBA tools that mutate the binary (`delete_module`, `import_modules`, `import_all`, `compile_vba`, `vba_inline_execution`), and the error names the blocked tool. `import_modules` / `import_all` are gated unconditionally: the PowerShell manager has no import dry-run, so they always write — gating them via the caller-supplied `dryRun` flag let a caller bypass the gate by omitting `dryRun` (which defaults to dry-run). They are now always gated.
- Bumped the transitive `esbuild` dependency to `>=0.28.1` (pnpm override) to clear the high-severity advisory GHSA-gv7w-rqvm-qjhr.

## [v1.2.59] - 2026-06-15

### Fixed

- An Access operation interrupted while still in `starting` (before its Access process spawned and a PID was recorded) no longer stays stuck forever as `status: "starting"` with `accessPid: null`. Root cause: the record is persisted as `starting` before the process is spawned, and the finalizing state transition only runs after the runner returns — a hard interruption (client abort / kill) in that window skips it.
- The pre-flight cleanup that runs before every Access operation now transitions a **stale** `starting`/no-PID record (idle past an in-flight grace window) to `failed`, stamping `metadata.interruptedReason`. This is registry-only bookkeeping — it inspects and kills no process, because no PID was ever owned.
- `cleanup_access_operation` can now retire a stale `starting`/no-PID record **without `force`**, since there is no owned Access process to kill.

### Security

- The new non-`force` retire path **never kills any `MSACCESS.EXE`**. A record without an owned PID cannot drive a process kill; killing still requires a fully ownership-verified PID (matching name, start time, and command line). The safety scan is scoped to the record's own `accessPath`, so Access processes belonging to other projects (a different `.accdb`) are never matched or terminated. If a live `MSACCESS.EXE` for that `accessPath` is found, cleanup refuses and reports instead of killing. A `starting` record still inside the grace window is treated as possibly in-flight and left untouched.

## [v1.2.58] - 2026-06-15

### Added

- `test_vba` `proceduresJson` now accepts a **shorthand**: a bare procedure-name string is treated as a test with no arguments. `["Test_A","Test_B"]` is equivalent to `[{"procedure":"Test_A","args":[]},{"procedure":"Test_B","args":[]}]`, and shorthand strings may be mixed with full objects. The same shapes apply to a `testsPath` manifest file. Previously an array of strings failed with `VBA_INVALID_TEST_PLAN: Test #1 must be an object.`

### Changed

- `test_vba` invalid-plan errors now teach the valid shape instead of only rejecting (e.g. `Test #1 must be a procedure name string or an object like {"procedure":"Test_Name","args":[]}.`).
- Documented the full `proceduresJson` contract in the MCP tool's input schema description and the README so consumers no longer have to discover it by trial and error.

## [v1.2.57] - 2026-06-14

### Fixed

- `test_vba` no longer collapses a failing run into the opaque `N VBA test(s) failed.` summary. The PowerShell runner already returns a per-procedure report (`ok`, `procedure`, `error`, `logs`, `payload`, `durationMs`); the adapter now preserves it. On failure the result stays `ok: false` with code `VBA_TESTS_FAILED` (no compatibility break), the message names the failing procedures, and `error.details` carries the structured report `{ failedCount, failures[], results[] }` — each `failures[]` entry keeping `procedure`, `error`, `logs`, `durationMs`, and `payload`. Consuming agents can now see exactly which procedure failed and why.
- Documented the `RunAll` limitation: Dysflow can only surface inner failures of an aggregate entry point when that procedure itself returns them in its JSON payload; Dysflow does not parse VBA assertion output on its own.

## [v1.2.56] - 2026-06-14

### Fixed

- `verify_binary`/`reconcile_binary` no longer compare a form's code-behind inside its `.form.txt`. A form's code-behind lives canonically in `forms/*.cls` (dysflow's export writes it from `CodeModule.Lines`, and import syncs it back into the document module), and the same code is also serialized — through a different path, `SaveAsText` — into the `.form.txt` `CodeBehindForm` section. Comparing it there only double-counted the code and re-introduced serialization noise (encoding, attribute headers, casing) the `.cls` comparison already owns. The classifier now strips everything from the `CodeBehindForm` marker onward and verifies a form's **code via its `.cls`** and its **UI/layout via its `.form.txt`**. A real UI change (control/property/layout) stays actionable; code-behind churn in the `.form.txt` is non-actionable.
- Bumped `classifierRules` to `2026-06-14.r5-formtxt-codebehind-split`.

## [v1.2.55] - 2026-06-13

### Fixed

- Reduced `verify_binary`/`reconcile_binary` false positives in the VBA semantic classifier against the real `00_NO_CONFORMIDADES_staging` acceptance corpus: `actionableDifferent` now drops from 14 to 6 when comparing the current source tree to a fresh Access binary export, while the remaining actionable entries are real code/module-identity differences.
- Classified additional Access export churn as non-actionable: `.form.txt` `NameMap`/toggle/property-event ordering noise, lossy codepage replacements in log/comment-like strings, leading VBA indentation drift, and explicit `enumSiNo.Sí` optional-default arguments exported as omitted defaults.
- Bumped `classifierRules` to `2026-06-13.r4-real-repo-acceptance` so MCP consumers can distinguish this rule set from v1.2.54 diagnostics-only output.

## [v1.2.54] - 2026-06-13

### Added

- `verify_code`, `verify_binary`, and `reconcile_binary` now expose `runtimeDiagnostics` in their result, providing the real runtime MCP version, adapter version, runtime type/code path, runtime path, Node executable path, build timestamp, and build identifier when available — enabling consumers to confirm which runtime actually produced a given diff rather than relying on a potentially stale cached binary.

### Fixed

- Top-level `dysflowVersion` in `verify_code`/`verify_binary`/`reconcile_binary` results now correctly reflects the actual runtime/package version instead of falling back to `0.0.0`.

## [v1.2.53] - 2026-06-13

### Added

- `verify_code`, `verify_binary`, and `reconcile_binary` now return `dysflowVersion` (the runtime package version that produced the result) and `classifierRules` (a fingerprint of the active semantic-classification rule set, e.g. `2026-06-13.r3-module-header`). This lets a consumer confirm *which* version classified a diff via MCP — distinguishing "the running MCP server is still on an old cached build" from "the fix is loaded but does not cover this case". Bump `classifierRules` whenever the classification rules change.

## [v1.2.52] - 2026-06-13

### Fixed

- Normalized module/class header boilerplate in the VBA semantic classifier so it stops counting as a functional difference. An Access binary export may emit the `VERSION x.x CLASS` + `BEGIN…END` instancing block and the `Attribute VB_*` lines on one side only (notably form code-behind, where the export omits the whole header). These are now stripped for code modules **and** for the `CodeBehindForm` section embedded in `.form.txt`/`.report.txt`, resolving false-positive `sourceNewer`/`bothChanged` results (e.g. `ModuloCacheIndicadores.bas`) and unblocking `caseOnly` detection for form code-behind whose only real difference was property casing (e.g. `Form_Form0BDOpcionesAuditorias.cls`).
- `VB_Name` is now treated as functional only when **both** sides name the module and the names differ (a real rename like `MigracionIssue18` vs `ModuloMigracionIssue18` stays actionable); a one-sided header presence is non-functional. `.frm` control trees (`VERSION 5.00` + `Begin…End`) are never stripped.

## [v1.2.51] - 2026-06-13

### Fixed

- Further reduced false positives in the VBA semantic classifier's `actionableDifferent` bucket:
  - **Leading BOM / mojibake-BOM** (`?Attribute VB_Name…`, U+FEFF, U+FFFD) on one side is now stripped before comparison and classified `encodingOnly`. This also unblocked downstream `caseOnly` detection for files whose only real difference was identifier casing but that carried a BOM on the source side. A `VB_Name` **value** change (e.g. `MigracionIssue18` vs `ModuloMigracionIssue18`) still stays actionable — only the leading marker is stripped.
  - **`.form.txt` toggle-property serialization equivalence**: `Visible =0` ≡ `Visible = NotDefault` ≡ `Visible =-1` now classify as `formSerializationOnly`. Access only serializes a non-default value, so the written value is always the same and only its `NotDefault`/`0`/`-1` representation varies; a genuine change surfaces as a line present-vs-absent and stays functional. Non-toggle values (`Width =9070`, `SomeEnum =2`) remain exact.

## [v1.2.50] - 2026-06-13

### Fixed

- Fixed the VBA semantic classifier inflating `actionableDifferent` with non-functional differences (a real project reported 155 actionable but only ~6 were genuine). Added a `caseOnly` category: VBA identifier/keyword casing is folded **outside string literals and comments** (the VBE re-cases identifiers on import), so `Me.Name` vs `Me.name` is no longer actionable while runtime-visible string content stays functional. Extended `.form.txt` serialization noise keys with `LayoutCachedLeft/Top/Width/Height`, `PublishOption`, and `NoSaveCTIWhenDisabled`. Added lossy out-of-codepage detection so glyphs replaced by `?` on export (e.g. `►` → `?`) classify as `encodingOnly` outside string literals. Case-fold and lossy-neutralization are also applied in the functional diff so counts are not inflated when noise accompanies a real change.

### Added

- Added per-module `isActionable` and `recommendedAction` fields to `diff: true` comparison entries.

## [v1.2.49] - 2026-06-13

### Added

- Added `compare_module` tool to VBA Modules Sync. This exposes a single-module semantic comparison API using the core classifier, returning classification (whitespaceOnly, attributeOnly, formSerializationOnly, sourceNewer, binaryNewer, bothChanged), recommendations, and functional diff indicators.
- Added parity schemas, registry entries, and MCP verification tests for the new `compare_module` route.

### Fixed

- Fixed integration test discovery of Access database objects by mapping `list_objects` output category categories dynamically.
- Fixed form noise injection matching in integration tests to be case-insensitive and support both CRLF and LF line endings.

## [v1.2.48] - 2026-06-13

### Added

- Added support for full MS Access reports export and layout tracking. `export_all` now automatically scans for Reports and exports both their visual layout definitions (`src/reports/*.report.txt`) and their code-behind class modules (`src/reports/*.cls`) when they have `HasModule = True`.
- Added support for saved queries export. `export_all` now automatically exports all saved queries (excluding system and temporary queries) using the active DAO connection to `src/queries/<SanitizedName>.sql` and maintains a JSON-based query registry at `src/queries/queries.json`.
- Added classification and resolver logic in `ComponentResolver` (`src/core/mapping/component-resolver.ts`) to correctly distinguish Reports from Forms using COM reflection (type 100 VBA components) and map them to their corresponding directories.
- capturing `SaveAsText` COM exceptions individually in `Invoke-ExportAction` as structured warnings in the JSON output, preventing a single object failure from halting the entire bulk export process.
- Added support in `Invoke-ImportAction` (`import_all`) to scan and import `*.report.txt` files correctly alongside forms, classes, and modules.

## [v1.2.47] - 2026-06-13

### Fixed

- Resolved an issue where some VBA/object export-family MCP calls (such as `export_modules`, `export_all`, and `export_queries`) would incorrectly return `CONFIG_MISSING_ACCESS_PATH` even when `accessPath` was passed explicitly. Fixed by making `vbaSyncToolService` try to resolve the configuration dynamically from the input before falling back to the static unavailable service representation, and updating `resolveConfigForInput` to fall back to `databasePath` or `accessDbPath` when `accessPath` is not explicitly defined in the adapted query request. (#530)

## [v1.2.46] - 2026-06-12

### Fixed

- Fixed `verify_binary` and `reconcile_binary` failing with `VBA_MANAGER_FAILED` ("...`NormalizedModules` ... matriz vacía") on any populated database when called without `moduleNames`. The PowerShell `Invoke-ExportAction` declared `NormalizedModules` as a mandatory `[string[]]` without `[AllowEmptyCollection()]`, so an empty array (the "verify the whole project" signal) was rejected at parameter-binding time before the export-all branch could run. Added `[AllowEmptyCollection()]` to match the Import/Delete/Fix-Encoding actions. Covered by a new Pester test for the export-all branch and an MCP-stdio E2E regression asserting both tools succeed with no `moduleNames`.

## [v1.2.45] - 2026-06-12

### Refactor

- Decoupled `VbaSourceComparison` service from Node.js OS filesystem APIs by introducing the `ComparisonFileSystemPort` port. Added a corresponding mock test verifying comparison logic purely in memory. (#527)
- Decoupled `cross-process-lock` module from Node.js OS filesystem APIs by introducing the `LockFileSystemPort` port. Added a corresponding mock test verifying locking and eviction behavior purely in memory. (#528)

## [v1.2.44] - 2026-06-12

### Fixed

- Resolved a critical race condition in cross-process locking (`evictStaleLock`) under concurrent execution on Windows: swapped `rename` (which is not exclusive on Windows) for `mkdir` (which atomically returns `EEXIST`).
- Fixed a chunk-boundary buffer fragment bug in the PowerShell executor (`onStderr`): added a line buffer to accumulate partial data chunks before parsing the `DYSFLOW_ACCESS_PROCESS` PID marker and `DYSFLOW_PROGRESS` telemetries.

## [v1.2.43] - 2026-06-12

### Refactor

- Collapsed `queryMode` for query-maintenance MCP tools to a single source of truth (the `MCP_TOOL_ROUTES` route table), removing the duplicate `maintenanceQueryModes` table, the `ParityToolDefinition.queryMode` field, the `QueryMode` type, and the `?? "write"` fallback footgun in the dispatch factory. Replaced an implementation-coupled registry assertion with a behavior test covering all 9 maintenance tools. No behavior change. (#523)

### Documentation

- Documented the MCP vs HTTP VBA write-gate asymmetry as a deliberate design decision rather than a defect: HTTP is a network surface (bearer-token auth) so it blanket-gates VBA, while MCP is stdio spawned by a trusted parent and controls VBA via the `allowedProcedures` allowlist. Added `docs/security/adapter-write-gates.md`. (#522)

### Validation

- Verified against the real MCP E2E suite (`E2E_testing/mcp-e2e.mjs`) — all 45 tools pass against a live Access frontend/backend with clean process accounting.

## [v1.2.42] - 2026-06-12

### Architecture / Contracts

- Extracted shared HTTP/MCP validation contracts into `src/shared/validation`, preserving MCP compatibility through re-export shims and rewiring the HTTP adapter to consume shared validation directly. (#512)
- Aligned HTTP `/access/cleanup` with the MCP cleanup write-gate: only `force: true` cleanup requires writes; non-force cleanup remains available for terminal/failed Dysflow-owned operations. (#511)
- Introduced a formal `PowerShellExecutor` core contract and moved the default PowerShell process executor into the adapter layer. (#513)
- Moved concrete Windows process inspector/killer/scanner implementations into `src/adapters/process`, leaving core with pure parsing helpers and injected ports. (#514)
- Added exact-pinned Zod schemas for the TS/PowerShell result-writer contract without changing runtime behavior. (#515)

### Maintenance

- Stabilized brittle full-suite timing/fixture tests uncovered during the cleanup train.
- Closed the remaining deferred issues for the PowerShell mega-script split and future breaking MCP rename as out of scope for this release train. (#487, #494, #497)

## [v1.2.41] - 2026-06-11

### MCP

- Exposed `verify_binary` and `reconcile_binary` as fully implemented, visible MCP tools (previously hidden compatibility stubs). The MCP surface is now **51 visible tools with zero hidden tools**, enforced as a policy by an invariant test that fails if any tool is ever hidden again. (#510)
- Gated destructive `force: true` cleanup behind the MCP write-gate: `cleanup_access_operation` and `dysflow_access_cleanup` now return `MCP_WRITES_DISABLED` for `force: true` when writes are disabled, without reaching the cleanup service. Non-`force` cleanup (terminal/failed Dysflow-owned operations) is unchanged. (#509)
- Updated the README MCP inventory and protocol documentation to reflect 51 visible tools and the cleanup write-gate.

## [v1.2.40] - 2026-06-11

### MCP

- Aligned the legacy `cleanup_access_operation` MCP alias with the modern cleanup tool by requiring `accessPath` at schema validation time, preventing empty-path cleanup requests from reaching the cleanup service.
- Corrected README MCP inventory and protocol documentation to match the current SDK-backed runtime: 49 visible tools, 51 registered tools including 2 hidden compatibility stubs, and SDK-derived protocol negotiation.

## [v1.2.39] - 2026-06-11

### MCP Safety

- Enforced the dry-run contract for HTTP write queries by routing `/query/write` through the `exec_sql` write action instead of the read-oriented `query_sql` action.
- Added dry-run behavior to `import_queries` and `unlink_table`, so their default safe mode validates and reports the plan without mutating Access objects.
- Redacted request secrets from access operation registry metadata, preventing `backendPassword` and related secret fields from being persisted in runtime operation records.
- Allowed the runtime-drift guard to target an isolated `test-runtime` via `DYSFLOW_RUNTIME_DRIFT_HOME`, keeping release validation aligned with the no-production-runtime rule.

## [v1.2.38] - 2026-06-10

### Runner / Culture (#507)

- Pinned the executing thread's `CurrentCulture` to `en-US` in both PowerShell scripts (`dysflow-access-runner.ps1` and `dysflow-vba-manager.ps1`) before invoking any Access/DAO COM objects. This guarantees deterministic behavior for SQL date literals, decimal formats, and list separators regardless of the host's Windows regional settings.
- Left `CurrentUICulture` untouched so that COM/Access error messages continue to be generated in the host's OS UI language (such as Spanish), preserving backward compatibility for tests and callers that assert on native-language error strings.

### Refactor / Timeouts (#493)

- Collapsed the redundant `processTimeoutMs` configuration property into the single authoritative `timeoutMs` across all core and adapter layers.
- Updated documentation and tests to remove any vestigial references to the retired timeout property.

## [v1.2.37] - 2026-06-10

### Docs (#505)

- Aligned `docs/release-checklist.md` with the SDK-based MCP runtime. The
  "MCP protocol compatibility" section still described a hand-written JSON-RPC
  adapter and a manually-pinned `MCP_PROTOCOL_VERSION`; both were corrected in
  v1.2.36 (#501) for the other protocol docs, and this completes the set. The
  checklist now reflects that the server runs on `@modelcontextprotocol/sdk` and
  that the version marker is derived from the SDK. Docs-only, no runtime change.

## [v1.2.36] - 2026-06-10

Hardening and maintenance pass from a code-quality review of the MCP runtime.

### Security (#498)

- The backend database password could be exposed on the spawned PowerShell
  process command line: `buildPowerShellArguments` serialized the entire query
  request (including `backendPassword`) into the `-PayloadJson` argument, and on
  Windows a process command line is readable by any local process via
  `Win32_Process.CommandLine`. Secret-bearing fields (`backendPassword`,
  `accessPassword`, `password`) are now stripped from the payload before
  serialization. The password still reaches the child process out-of-band via
  `DYSFLOW_BACKEND_PASSWORD`, so behavior is preserved.

### Architecture (#499)

- `AccessPowerShellRunner.run()` reached the filesystem directly
  (`await import("node:fs")` + `existsSync`) from the domain, contradicting the
  hexagonal rule that `core` stays I/O-free and is tested at the ports. The
  existence check now goes through an injectable `FileExistsChecker` port
  (defaulting to a `node:fs` adapter).

### Maintenance (#501)

- `MCP_PROTOCOL_VERSION` was a stale hand-pinned `2024-11-05` marker, but the
  server runs on the official `@modelcontextprotocol/sdk`, which already
  negotiates `2025-03-26` by default and supports up to `2025-11-25`. The marker
  is now derived from the SDK's `DEFAULT_NEGOTIATED_PROTOCOL_VERSION` (with
  `MCP_PROTOCOL_VERSION_LATEST_SUPPORTED` exposed) so it reflects reality and
  cannot drift. The protocol docs, which still described a hand-rolled
  no-SDK runtime, were corrected. No runtime behavior change — the SDK owns
  negotiation.

### Evaluated and declined (#500)

- A proposal to migrate MCP input validation to Zod was investigated and
  **closed without changes**: an audit proved the existing validator already
  enforces every constraint the current schemas use (string enums, types,
  numeric bounds, `additionalProperties`). The only unsupported constructs
  (numeric enums, integer distinction, `oneOf`/`anyOf`) are unused, so a
  migration would have added a dependency and ~700 lines for zero behavior
  change. Revisit if a future schema needs those constructs.

## [v1.2.35] - 2026-06-09

Fix for the user-reported issue #496 cascade: the user (via the IA mantenedora)
reported that `dysflow.import_modules` with `importMode=Code` +
`willModifyAccess=true` returned `VBA_MANAGER_SERIALIZATION_FAILED` instead
of the real VBE error. Investigation surfaced three coordinated defects:

1. The `Write-DysflowResult` writer in `dysflow-vba-manager.ps1` had a
   generic `try/catch` that ate the underlying exception and emitted
   a fallback `VBA_MANAGER_SERIALIZATION_FAILED` envelope, hiding the
   real cause from the operator.
2. The `Invoke-ImportAction` happy path passed a `List[object>` directly
   to `Write-DysflowResult`. Under PowerShell 7.x, `ConvertTo-Json` on
   a raw `List[object>` can hit `ArgumentException: Argument types do not
   match`, which the fallback also swallows. The sad path was already
   fixed in v1.2.30 to convert to `object[]` first; the happy path was
   left untouched.
3. The early read path in `dysflow-access-runner.ps1` (line ~1495)
   opened the DAO database inside a try-block with NO catch. If the
   target database did not exist, the exception escaped, no
   `DYSFLOW_RESULT` was emitted, the script exited with `exitCode 0`,
   and the TS adapter collapsed the response to the generic
   `RUNNER_INVALID_JSON: No DYSFLOW_RESULT line in runner output`
   message. The user saw the same generic error class as defect 1,
   but for a different reason (read-path, not write-path).

This release fixes all three and ships the contract + E2E coverage
that locks the regression class in.

### Fixed

- **`Write-DysflowResult` writer in `dysflow-vba-manager.ps1` and `dysflow-access-runner.ps1` now preserves the underlying exception** (dbaf585, 57b3e18). The `try/catch` captures `$script:LastSerializationError`, emits a `Write-Warning` on stderr with the exception text, and includes the captured exception in a `diagnostics[]` field of the fallback envelope (truncated to 4 KB to keep the sentinel line bounded). The fallback code is now a subclass (`VBA_MANAGER_SERIALIZATION_FAILED` / `RUNNER_SERIALIZATION_FAILED`) so callers can branch on which adapter dropped the payload.
- **`Invoke-ImportAction` happy path converts `List[object>` to `object[]` before passing to `Write-DysflowResult`** (dbaf585), matching the sad-path pattern that was already in v1.2.30. The 100+-module import case is now serializable cleanly.
- **VBE exception messages are coerced defensively to strings** (dbaf585). When the VBE raises a COM error (e.g. `0x800A09D5`), `.Exception.Message` may be a COM property reference rather than a string. The `try/catch` at `Invoke-ImportAction` line 3114 now coerces with `if -is [string] else [string]`, falling back to `"<empty VBE error>"` when the message is null.
- **Early read path in `dysflow-access-runner.ps1` emits `DYSFLOW_RESULT` on DAO open failure** (5469126). A single `try/catch` wraps the DAO open and the 9 `Invoke-*Action` calls. If anything throws, the catch emits a structured envelope with `ok:false`, classifies the error as `ACCESS_OPEN_FAILED` (DAO open) or `ACCESS_QUERY_FAILED` (action), and includes the original exception text. `exitCode` is set to 1 so the TS adapter routes through `RUNNER_FAILED` (with stderr) instead of `RUNNER_INVALID_JSON`.

### Added

- **`src/core/contracts/result-writer.ts` port (bc62784)**. Pure TypeScript port that defines the observable contract any `Write-DysflowResult` implementation must satisfy: the payload-type whitelist, the `ok:false` fallback envelope shape with `diagnostics[]` and the `LastSerializationError:` prefix, the 4 KB truncation budget, and the `SERIALIZATION_FAILED` code prefix. The contract is the single source of truth for both the PS1 adapter and the spec suite; future refactors that change the contract break the spec first.
- **`test/core/contracts/result-writer-contract.test.ts`** (bc62784). 15 vitest specs that pin the contract: payload type whitelist (string/number/boolean/null/array/plain object only), fallback envelope shape, truncation behavior, sentinel marker. If this suite fails, the contract itself has changed.
- **Pester tests for `Invoke-ImportAction` behavior** (f83ae38). 11 tests in a new `Describe "Invoke-ImportAction — serialization contract (issue #496, regression for VBA_MANAGER_SERIALIZATION_FAILED)"` block. Uses an `Invoke-AndCaptureDysflowResult` helper that redirects `[Console]::Out` to a StringWriter around the call and parses the JSON envelope. Pins the happy path, sad path (VBE rejection, COM exception 0x800A09D5 simulation), edge cases (Unicode module name, empty VBE error, 100+ modules), and contract conformity.
- **AST guard for `Write-DysflowResult` callsite types** (63028ff). New `Describe "Write-DysflowResult callsite type contract (issue #496)"` in `dysflow-access-runner-result-coverage.Tests.ps1`. Walks the AST of both PS1 scripts and asserts, for every `Write-DysflowResult` callsite, that the payload argument matches a JSON-serializable whitelist (`@(...)`, `[ordered]@{}`, plain `$_variable`, etc.) and never an excluded type (`List[object>`, `Dictionary[string,object]`, COM objects, bare `$null`). Catches the original `List[object>` regression at the AST level so it cannot be reintroduced.
- **Comprehensive E2E coverage of all 49 MCP tools** (586f769). New `test/e2e/import-modules-regression.e2e.test.ts` exercises the full tool surface via the real JSON-RPC stdio protocol. Each tool gets at least a happy test; tools with a natural sad path get a sad test too. All assertions share a universal contract: the response must be JSON-parseable, must not contain the serialization fallback markers (`VBA_MANAGER_SERIALIZATION_FAILED`, `RUNNER_INVALID_JSON`), and must not be empty. Cost: ~5 minutes in CI. The suite is the criterion of acceptance for issue #496 — a future refactor that reintroduces the silent exception swallow, or a writer fallback that leaks to the MCP caller, fails here.

### Verified

- `pnpm test`: 86/86 files, 1145 passed / 3 skipped (was 86/86, 1129 passed before this release)
- `pnpm lint`: clean (Biome, 170+ files)
- `pnpm build`: tsc exit 0
- Pester: 250+ passed / 0 failed / 4 skipped (was 256 passed before this release)
- E2E: 49 tools covered, 69 test cases, all green against the real MCP server
- Manual probe against `00-no-conformidades-staging-clean`: `import_modules` against the 2 modules that previously returned `VBA_MANAGER_SERIALIZATION_FAILED` now returns a structured envelope with the real VBE error; the same probe with a non-existent `databasePath` now returns the real Access "No se pudo encontrar el archivo" message instead of `RUNNER_INVALID_JSON`

## [v1.2.34] - 2026-06-09

Clean-release tidy-up. No runtime behavior changes — repo hygiene, a regression
guard, and ledger accuracy. Closes the trivial items from the post-v1.2.33 fresh
audit; the PowerShell mega-script restructure (#494) and the `processTimeoutMs`
consolidation (#493) remain deferred and tracked.

### Added

- **Toolchain exact-pinning CI guard (#492)**: new `test/quality-gates/toolchain-pinning.test.ts` asserts every `dependencies`/`devDependencies` entry in `package.json` is exact-pinned (no caret/range), with `@types/node` as the single documented tilde exception. Fails loudly if a caret is reintroduced, enforcing the policy in `docs/dev/toolchain-pinning.md`.

### Changed

- **Repo hygiene (#490)**: removed the stray untracked `test-output-msg/` scratch directory and added a `.gitignore` rule so it cannot reappear in `git status`.
- **Tech-debt ledger resync (#491)**: `docs/tech-debt/TRACKING.md` reconciled with remote reality — the 2026-06-07 board now marks #481/#482/#483 done (all closed COMPLETED on 2026-06-07), the duplicated/self-contradictory "HTTP → core-mapper" Dropped entry was removed, and the resumable 2026-06-09 campaign section was opened.

### Verified

- `pnpm test`: **1128 passed / 3 skipped / 1 dev-box-only failure** — the single failure is `runtime-drift.test.ts` comparing the dev `.ps1` hash against the locally installed runtime (out of sync on the dev box); it is `skipIf` the installed runtime is absent, so CI (ubuntu) skips it. No release impact.
- `tsc -p tsconfig.json --noEmit` and `tsc -p tsconfig.test.json --noEmit`: exit 0.
- `MCP_PROTOCOL_VERSION` unchanged (`2024-11-05`, reviewed 2026-06-07) — no adapter changes this release.

## [v1.2.33] - 2026-06-09

### Fixed

- **Issue 18 root cause: PowerShell runner's `earlyTargetPath` resolved `-AccessDbPath` (frontend) ahead of `Payload.backendPath`, silently opening the frontend for `list_tables`/`get_schema`/`query_sql`**: When the MCP caller passed a `projectId` (or a payload with `backendPath` set), the TypeScript adapter v1.2.32 already defaulted `request.backendPath = config.backendPath` on the runner payload. But the runner's `earlyTargetPath` resolution at line 1438 of `scripts/dysflow-access-runner.ps1` had this order: `Payload.databasePath` -> `Payload.sourcePath` -> `-AccessDbPath` (frontend from the config) -> `Payload.backendPath`. The `-AccessDbPath` fallback was checked BEFORE `Payload.backendPath`, so any read action that did not pass `databasePath` or `sourcePath` explicitly opened the frontend's CurrentDb and returned only the frontend's 2 local tables (`TbConfiguracionBackends` + `TbTipologiaAux`) instead of the backend's 39. `get_schema` and `query_sql` then threw "table not found" without emitting the `DYSFLOW_RESULT` sentinel, surfacing as `RUNNER_INVALID_JSON: No DYSFLOW_RESULT line in runner output`. The fix swaps the order: `Payload.databasePath` -> `Payload.sourcePath` -> `Payload.backendPath` -> `-AccessDbPath` (frontend fallback). This is the bug the user reported against `00_NO_CONFORMIDADES_staging` (issue 18): the AI on the user's other PC saw the frontend's 2 tables and the opaque `RUNNER_INVALID_JSON` because the runner silently opened the frontend despite the TS adapter having passed the correct `backendPath` in the payload.
- **Issue 18 companion fix: `findRepoProjectConfigPath` now walks up the directory tree from `cwd` looking for `.dysflow/project.json`**: The TypeScript adapter used to look at `cwd` only, not climb parent directories. The MCP server is spawned by opencode with an arbitrary cwd (the cwd of the host, not the cwd of the project), so a single-level lookup missed the project and the adapter fell through to `CONFIG_MISSING_TARGET_PATH` or used an empty config. v1.2.33 mirrors `git`-style discovery: walk up from `cwd` to the filesystem root, returning the closest `.dysflow/project.json` (or the legacy `dysflow.project.json`) that exists.

### Added

- **Per-tool E2E regression tests for issue 18 (catches the 2-tables bug)**: Three new vitest tests in `test/e2e/access-fixture.e2e.test.ts` exercise the E2E_testing workspace through `AccessQueryService` (no explicit `backendPath` in the payload) and assert that `list_tables` returns at least 10 tables (was 2 from the frontend, should be 40+ from the backend), `get_schema` against a backend table returns structured schema, and `query_sql` against a backend table returns structured rows. If the runner ever falls back to the frontend again, these tests fail red with a clear message.
- **Per-tool AST coverage tests (catches the silent-frontend-fallback regression)**: New vitest tests in `test/core/config/dysflow-config-discovery.test.ts` walk the AST of `findRepoProjectConfigPath` and assert it finds the project config in nested cwds (e.g. `cwd/src` -> `cwd/.dysflow/project.json`), in deep cwds (5+ levels), prefers the closest over a parent's, returns `none` when no config exists, and flags ambiguous when both standard and legacy paths coexist. New Pester tests in `scripts/tests/dysflow-access-runner-result-coverage.Tests.ps1` walk the runner AST and assert that `earlyTargetPath` checks `Payload.backendPath` BEFORE the `-AccessDbPath` frontend fallback. Both test suites fail red if the order regresses.
- **CI guard tests against the runtime-drift class of bugs (catches the v1.2.28-silently-shipped regression)**: New vitest file `test/quality-gates/runtime-drift.test.ts` asserts that (a) the installed dysflow runtime is at v1.2.32 or newer (catches the v1.2.28-silently-shipped regression where the published runtime had a stale `package.json` and stale PowerShell scripts), (b) the SHA-256 of `scripts/dysflow-access-runner.ps1` in the dev tree matches the SHA-256 of the same script in the installed runtime (catches the bug where `dysflow install` ships a different script than the dev tree had), and (c) `~/.config/opencode/opencode.json` does not wire the dysflow MCP server at the in-tree `test-runtime/bin/dysflow.cmd` (catches the bug where opencode was silently using a stale test-runtime v1.2.28 instead of the installed runtime v1.2.32).

### Verified

- `pnpm test`: **1126 passed / 3 skipped (84 files)** — +6 from the new config-discovery suite
- `pnpm lint`: clean (Biome, 166 files)
- `pnpm build`: tsc exit 0
- Pester: **239 passed / 0 failed / 4 skipped** — +1 from the new `earlyTargetPath` ordering test
- MCP E2E fresh against safe `test-runtime`: 106 passed / 0 failed (noconformidades-e2e happy path)
- End-to-end probe against `00_NO_CONFORMIDADES_staging` with v1.2.33 runtime: `list_tables` returns 39 backend tables (was 2 frontend), `get_schema` returns the 6-column schema of `TbCacheIndicadoresConfig`, `query_sql` returns structured rows (was `RUNNER_INVALID_JSON`).

## [v1.2.32] - 2026-06-09

### Fixed

- **Query actions now fail fast with structured `CONFIG_TARGET_NOT_FOUND` / `CONFIG_MISSING_TARGET_PATH` errors instead of `RUNNER_INVALID_JSON`**: When a query action (`list_tables`, `get_schema`, `query_sql`, `count_rows`, `distinct_values`, `list_linked_tables`, `get_relationships`, `compare_backends`, `list_access_files`, etc.) was invoked from a project whose `.dysflow/project.json` had a missing/relative `accessPath` (e.g. `E2E_testing/Expedientes.accdb` when `E2E_testing` had no `Expedientes.accdb`) or whose `backendPath` did not exist on disk, the PowerShell runner used to throw "Access database not found" mid-execution, the MCP layer would lose the `DYSFLOW_RESULT` sentinel, and the caller only ever saw the opaque `RUNNER_INVALID_JSON: No DYSFLOW_RESULT line in runner output`. v1.2.32 fails fast in `src/core/runner/access-runner.ts` with two structured errors before the PowerShell runner is even invoked: `CONFIG_MISSING_TARGET_PATH` when neither the request nor the project config can resolve a target (no `databasePath`, no `backendPath`, and no fallback to `config.accessDbPath`), and `CONFIG_TARGET_NOT_FOUND` when the resolved `config.accessDbPath` points at a `.accdb` that does not exist on disk. The runner now refuses to spawn the PowerShell process in both cases, so the failure is observable at the adapter boundary instead of buried in the runner. The fix also surfaces the real cause: a typo in `.dysflow/project.json`, a missing backend file, or a project opened from the wrong cwd. This is what the AI in the user's report was hitting on `00_NO_CONFORMIDADES_staging` (and what the AI reproduced against a stale `.dysflow/project.json` here on this PC); the user now sees `CONFIG_TARGET_NOT_FOUND: Configured accessPath does not exist on disk: [PATH]. Update .dysflow/project.json (accessPath/backendPath) or pass databasePath in the request.` instead of the misleading `RUNNER_INVALID_JSON`.

### Verified

- `pnpm test`: 1116 passed / 3 skipped (82 files)
- `pnpm lint`: clean (Biome, 164 files)
- `pnpm build`: tsc exit 0
- Pester: 237 passed / 0 failed / 4 skipped
- MCP E2E fresh against safe `test-runtime`: 106 passed / 0 failed (noconformidades-e2e happy path)
- Manual MCP probe from a cwd with a broken `.dysflow/project.json`: now returns the structured `CONFIG_TARGET_NOT_FOUND` error instead of `RUNNER_INVALID_JSON`

## [v1.2.31] - 2026-06-09

### Added

- **Per-tool DYSFLOW_RESULT coverage test (regression guard)**: New Pester suite `scripts/tests/dysflow-access-runner-result-coverage.Tests.ps1` walks the AST of `dysflow-access-runner.ps1` and asserts, for every advertised SQL / schema / fixture / links / compact action (`query_sql`, `get_schema`, `list_tables`, `count_rows`, `distinct_values`, `list_linked_tables`, `list_links`, `get_relationships`, `compare_backends`, `list_access_files`, `exec_sql`, `run_script`, `create_table`, `drop_table`, `seed_fixture`, `teardown_fixture`, `link_tables`, `relink_tables`, `unlink_table`, `relink_directory`, `localize_backend_links`, `compact_repair`, `export_queries`, `import_queries`), that (a) the action is referenced in the runner, (b) a `Write-DysflowResult -Result` call exists on its success path, and (c) the writer uses `[Console]::Out.WriteLine` and never `Write-Output`. The suite also asserts that no `Write-DysflowResult -Result` call passes a `$null`, empty array, or empty `[ordered]@{}` payload, and that no `Write-Output "DYSFLOW_RESULT ..."` pattern has snuck back in. This is the missing guard that should have caught the v1.2.29 SQL path regression before it shipped: the user-reported broken action set (`get_schema`, `query_sql`, `exec_sql`, `count_rows`, `distinct_values`, `list_tables`, `list_linked_tables`, `get_relationships`, `run_script`, `seed_fixture`, `teardown_fixture`, `create_table`, `drop_table`, `link_tables`, `relink_tables`, `unlink_tables`, `compact_repair`, `compare_backends`) is locked down action-by-action. If a future refactor breaks the sentinel emission on any of these tools, this suite will fail red before the change can ship.

### Fixed

- **dysflow-mock-com.ps1: `Add-Member` collisions on `ArrayList` builtin members**: The mock COM module tried to add `Item`, `Append`, and `Delete` ScriptMethods to a `[System.Collections.ArrayList]`, which already has those members built-in. PowerShell refused the second addition with `Cannot add a member with the name "Item" because a member with that name already exists`, breaking any code path that tried to load the mock under pwsh 7.x. Added `-Force` to the three `Add-Member` calls so the overrides stick. No behavior change for callers; this unblocks the mock for both CI and local runs.

### Verified

- `pnpm test`: 1113 passed / 3 skipped (82 files)
- `pnpm lint`: clean (Biome, 164 files)
- `pnpm build`: tsc exit 0
- Pester: **237 passed / 0 failed / 4 skipped** (was 208, +29 from the new coverage suite)
- MCP E2E fresh against safe `test-runtime`: 106 passed / 0 failed
- Fresh MCP acceptance for every action in the user's reported broken list: structured OK responses

## [v1.2.30] - 2026-06-09

### Fixed

- **`Invoke-ImportAction` all-failure payload serialization**: The vba-manager's `Invoke-ImportAction` builds a `[ordered]@{}` DYSFLOW_RESULT payload that contained `modules = @($moduleResults)` where `$moduleResults` is a `List[object]`. Under PowerShell 7.x (the version the Windows CI smoke job runs on), wrapping a `List[object]` with `@()` and binding it inside an `OrderedDictionary` triggers `System.ArgumentException: Argument types do not match` before the function can emit its sentinel, so all-failure imports surfaced as opaque Pester failures. The action now converts the list to a plain `object[]` first and the `Write-DysflowResult` writer wraps its payload in `@($Result)` plus a `try/catch` that emits a structured `VBA_MANAGER_SERIALIZATION_FAILED` fallback if serialization ever fails again, so a malformed payload can never again take down the sentinel path.
- **All-failure Pester test contract**: The "throws consolidated all-failure detail" Pester test in `scripts/tests/dysflow-vba-manager.Tests.ps1` described a contract the action never had — it assumed `Invoke-ImportAction` would `throw` a Spanish-language `Exception.Message` and that the sentinel would be captured via a `Write-Host` mock. The real action reports failure via the `DYSFLOW_RESULT` sentinel and returns with `HasErrors = $true`; the test now mocks `Write-DysflowResult` (the only reliable seam under pwsh) and asserts the actual contract: no exception is thrown, the returned object has `HasErrors = $true` and the expected `ErrorMessage`, and the captured payload has `ok = $false`, `error.code = "VBA_IMPORT_FAILED"`, the expected `error.message`, and per-module `status`/`error` fields.
- **PowerShell script encoding hardening**: The vba-manager / access-runner / access-com / and their Pester test scripts were saved without a UTF-8 BOM, so PowerShell 7.x (the CI smoke runner) read non-ASCII template strings through the active Windows code page instead of UTF-8. Added the UTF-8 BOM to each of them so the same script behaves the same way under pwsh 5.1, 7.x, and any future PowerShell host.
- **All-failure template string**: Replaced the non-ASCII `ó` in `"no pudo completar algunos módulos tras"` with the ASCII `modulos`. The Pester test only matches the `"no pudo completar algunos"` prefix, so the user-visible message is functionally equivalent and the contract is now portable across encodings.

### Verified

- `pnpm test`: 1113 passed / 3 skipped (82 files)
- `pnpm lint`: clean (Biome, 164 files)
- `pnpm build`: tsc exit 0
- Pester (PowerShell smoke job): 208 passed / 0 failed / 4 skipped (matches the CI job that was previously failing with "Argument types do not match" on the all-failure Pester test)

## [v1.2.29] - 2026-06-09

### Fixed

- **Access runner result sentinel emission**: Changed the Access/query PowerShell runner `DYSFLOW_RESULT` writer to bypass the PowerShell pipeline, preventing `query_sql`, `get_schema`, and other Access runner actions from losing the sentinel when action results are assigned before emission.
- **Global PowerShell result-writer guard**: Added a test that covers every PowerShell script with `Write-DysflowResult`, requiring direct process stdout writes and forbidding `Write-Output` for protocol sentinel output.

### Verified

- Real MCP E2E against safe `test-runtime`: `106 passed / 0 failed`.
- Fresh MCP acceptance for `query_sql` and `get_schema` against `00_NO_CONFORMIDADES_staging`: structured OK responses.

> **Note**: v1.2.29 was published but the Windows PowerShell/Access smoke CI job failed on a pre-existing Pester contract bug (`Invoke-ImportAction` was expected to throw but the code never did, and the sentinel writer could not serialize a `List[object>` payload on PowerShell 7.x). v1.2.30 supersedes it with the fix.

## [v1.2.28] - 2026-06-08

### Fixed

- **VBA import success sentinel emission**: Changed the PowerShell `DYSFLOW_RESULT` writer to bypass the success-output pipeline so `Import` actions still emit the sentinel when `Invoke-ImportAction` is assigned to `$importResult`. This fixes the real `import_modules` acceptance case where Access imported modules successfully but MCP saw no sentinel.
- **Lowercase import mode aliases**: Accepted and normalized lowercase `auto`, `form`, and `code` import modes at the MCP/schema and adapter layers, matching the E2E suite and preserving the existing `replace` alias.

### Verified

- Real MCP E2E against safe `test-runtime`: `106 passed / 0 failed`.
- Exact `00_NO_CONFORMIDADES_staging` acceptance import passed with structured OK response for `Test_IndicadoresCaracterizacion` and `ModuloCacheIndicadoresIssue18`, `importMode: Auto`, `compile: false`.

## [v1.2.27] - 2026-06-08

### Fixed

- **VBA import runner output contract**: Hardened `import_modules` and `import_all` so malformed, missing, duplicate, or interrupted `DYSFLOW_RESULT` output is reported as structured runner failure diagnostics instead of `VBA_MANAGER_INVALID_OUTPUT`. This preserves sanitized `exitCode`, `stdout`, `stderr`, and parse details for real Access/VBA failures.
- **Import mode compatibility**: Normalized the `replace` import-mode alias to the runner's `Auto` mode and moved PowerShell import-mode validation inside the script body so invalid modes can emit structured `DYSFLOW_RESULT` errors.

### Added

- **MCP output-contract coverage**: Added table-driven tests for all import runner-output failure shapes and a registry-level MCP tool contract inventory so every registered tool belongs to exactly one output protocol group.

## [v1.2.26] - 2026-06-08

### Fixed

- **MCP E2E timeout handling (#485)**: Fixed the timeout path so long-running MCP tool calls fail predictably instead of leaving ambiguous runner state. The full MCP E2E release gate passed after the fix with all advertised tools available and no lingering Access processes.

### Added

- **Safe orphan headless MSACCESS cleanup (#486)**: Added a cleanup tool for orphaned headless `MSACCESS.EXE` processes with a list/confirm flow. The tool resolves `accessPath` from explicit input, project config, or defaults, refuses registry-owned PIDs, joins `Get-Process` and CIM data to identify `MainWindowHandle`, normalizes `IntPtr` values in JSON output, and refuses cleanup unless command-line evidence proves the target Access database.

## [v1.2.25] - 2026-06-08

### Fixed

- **Surface underlying parse error in `RUNNER_INVALID_JSON` (#474)**: The catch block at `src/core/runner/access-runner.ts:290` no longer swallows the original `parseError`; the `RUNNER_INVALID_JSON` failure message now includes the underlying cause verbatim (e.g. `RunnerResultChannelError("No DYSFLOW_RESULT line in runner output")` or the `SyntaxError` from malformed JSON). A truncated, secret-scrubbed stdout preview (first 200 chars, sanitized via the existing `sanitizeSecrets`) is appended to the diagnostics array so operators can diagnose the root cause without adding temporary debug logs.

### Chore

- **Reset `DYSFLOW_HOME` in MCP E2E entry point (#475)**: `E2E_testing/mcp-e2e.mjs` now `delete process.env.DYSFLOW_HOME` at startup, matching the integration config (`vitest.integration.config.ts`). Prevents the runner from being silently routed to the stale production install at `%LOCALAPPDATA%\dysflow` when the host shell has `DYSFLOW_HOME` set.

## [v1.2.24] - 2026-06-07

### Security

- **Update trust boundary hardened (#476)**: Removed the undocumented `gh release view` fallback from `resolveLatestRelease`. The GitHub REST API is now the sole mechanism for the latest-release lookup; HTTP errors are surfaced verbatim with a hint about `GH_TOKEN` / `GITHUB_TOKEN`. The `--skip-checksum` flag now requires `DYSFLOW_ALLOW_INSECURE_UPDATE=1` to be set in the environment, and prints a `WARN` on the actual skip path. The trust model doc gained an explicit "No gh CLI fallback" row.

### Refactored

- **Access runner cross-process lock extracted (#477)**: New `src/core/runner/cross-process-lock.ts` owns the cross-process and in-process lock primitives. The in-process serialized queue map is now injectable as a 4th argument to `runWithAccessExecutionLock` for test isolation. The module-level singleton `accessExecutionLocks` map in `access-runner.ts` is gone. Behavior-preserving — existing lock tests stayed green without modification.
- **Swallowed I/O errors surfaced (#478)**: New `logSwallowedIoError(site, err)` helper in `src/core/utils/log-swallowed-io-error.ts`. All 7 known sites that previously swallowed real I/O or parse failures into empty defaults now log on the failure path while preserving the empty-default return on the happy `ENOENT` path (access-operation-registry, vba-sync-adapter operation marker, vba-form-service, vba-source-comparison, mcp-configurator, windows-processes JSON parse).
- **Cryptic `executeMappedTool` timeout formula extracted (#479)**: `derivePsTimeoutMs(effectiveTimeoutMs, preflightElapsedMs)` is now a named module-scope function with a JSDoc contract comment. The `5_000` literal is named `MIN_PS_TIMEOUT_MS`.

### Documentation

- **Security doc line refs replaced with symbol anchors (#480)**: The Callers table in `update-trust-model.md` now uses `buildPowerShellArguments` and `spawnVbaManager` symbol anchors instead of stale `file:line` refs. A new regression test (`test/docs/security-doc-anchors.test.ts`) asserts no exact `file:line` refs to internal TypeScript source positions remain in `docs/security/`.
- **TRACKING.md Dropped entry cleaned up (#481)**: The stale "HTTP → core-mapper" Dropped entry (claiming HTTP's query surface was SQL-only) was misleading; campaign #420 already converged HTTP onto the core mapper. Replaced with a note pointing at #420 and the live code.

### Chore

- **Fresh-major toolchain pinned to exact versions (#482)**: `typescript: ^6.0.0` → `6.0.3`, `vite: ^6.0.0` → `6.4.2`, `vitest: ^4.0.0` → `4.1.7`, `@vitest/coverage-v8: ^4.0.0` → `4.1.7`, `@types/node: ^22.0.0` → `~22.19.0`. Aligns with the existing exact pin on `@modelcontextprotocol/sdk` and `@biomejs/biome`. `pnpm-lock.yaml` regenerated. Documented in `docs/dev/toolchain-pinning.md`.
- **`NVIDIA Corporation/` vendor directory added to `.gitignore` (#483)**: The other working-tree cruft (coverage/, dist/, testResults.xml, test-appicon-fix.log) was already ignored; only the NVIDIA directory was missing.

## [v1.2.20] - 2026-06-06

### Changed

- **SQL read-only guard moved into core (#444)**: The read-only SQL check is now owned by `AccessQueryService.execute` in core; MCP and HTTP adapters delegate to it instead of re-implementing the keyword heuristic.
- **Unified path normalization (#437)**: Added a platform-agnostic `isAbsolutePath()` in `src/core/utils/path-utils.ts` (POSIX, Windows drive-letter, UNC) and migrated all `node:path.isAbsolute` call sites; already-absolute paths are no longer passed through `node:path.resolve`, fixing cross-platform path resolution.

### Fixed

- **Guard destructive runtime delete (#434)**: The runtime delete path now verifies a path-safety check before removing files.
- **Stop silent config data loss on corrupt JSON (#435)**: `readJson` rejects non-object JSON payloads instead of silently coercing them.
- **Kill spawned child process on timeout (#438)**: `runCommandWithTimeout` now kills the spawned child on timeout to release file locks.

### Security

- **Update trust model documented (#436)**: The only update mechanism is the GitHub Release tar.gz verified via SHA-256 against the release `SHA256SUMS`; there is no git-clone/source-build fallback. Documented in `docs/security/update-trust-model.md`. `spawnPowerShellProcess` is documented as using `shell:false` with args as an array and a sandboxed environment.

## [v1.2.19] - 2026-06-06

### Fixed

- **PowerShell sentinel output contract hardening**: Added `Write-DysflowResult` calls to the end of `Export`, `Fix-Encoding`, and `Generate-ERD` actions in `dysflow-vba-manager.ps1`. This ensures these tools always write the structured `DYSFLOW_RESULT` JSON line on stdout, preventing E2E failures when parsed by the MCP adapter.

## [v1.2.18] - 2026-06-05

### Fixed

- **Robust MCP JSON response parsing**: Added JSON substring extraction in `parseRunnerData` and `parseOutput` to gracefully isolate tool responses from ambient warning output or text written to stdout by PowerShell. Ensures full E2E test parity.

## [v1.2.17] - 2026-06-05

### Added

- **PowerShell Runner optional ByRef support (#428)**: Added dynamic padding and marshaling using `[System.Reflection.Missing]::Value` for omitted trailing `Optional ByRef` parameters in `dysflow-vba-manager.ps1`.
- **PowerShell argument retry index expansion (#428)**: Expanded retry logic to match and wrap missing ByRef arguments up to position 10, correcting PSReference errors when executing without complete metadata.
- **MCP input validator numeric bounds checking (#432)**: Configured the validator to enforce minimum/maximum boundaries in JSON Schemas, ensuring parameters like `timeoutMs`, `limit`, and `top` must be positive integers >= 1.
- **Stub hidden state single source of truth (#433)**: Consolidated tool stub availability checks by removing `HIDDEN_STUB_TOOL_NAMES` and querying `isHiddenStubTool()` derived directly from the `TOOL_PARITY_REGISTRY`. Added invariant tests.

### Fixed

- **MCP error path secret leakage (#429)**: Folded connection string password redaction into MCP error reporting, matching HTTP adapter security parity.

### Changed

- **MCP request-shaping core refactoring (#430)**: Extracted parameter mapping from the adapter layer to a pure module `src/core/mapping/access-query-request-mapper.ts` with explicit action maps.
- **Decomposed MCP tools god-file (#431)**: Split the 811-line `tools.ts` into specialized files: `dispatch.ts` and `result-translation.ts`, relocating `sanitizeMcpErrorMessage` to `src/core/utils/sanitize-error.ts`.

## [v1.2.16] - 2026-06-04

### Added

- **Consolidated read-only SQL validation (#420).** Implemented a core utility `looksLikeReadOnlySql` in `src/core/utils/index.ts` supporting CTE queries (`WITH ... SELECT`) and validation. Exposed it across HTTP `/query/read` route and MCP read tools to reject DML/DDL write queries.
- **Type-safe parameter extraction in HTTP and MCP (#420).** Added `getStringParam` parameter validator in `src/adapters/http/server.ts` to type-safely parse request bodies and remove unsafe `as string` casts. Implemented `getStr` fallback mapping helper in `src/adapters/mcp/tools.ts` to simplify MCP tool payload mappers.

### Changed

- **VBA Sync port hardening (#420).** Reduced visibility of `VbaSyncAdapter` internal orchestration methods to `private`. Refactored sub-adapter constructor delegation to bind anonymous delegate wrappers. Refactored the corresponding unit tests to target exclusively the public `execute()` port, ensuring implementation changes do not break tests.

## [v1.2.15] - 2026-06-03

### Changed

- **Explicit registry ownership (#407).** Removed the global `AccessOperationRegistry` singleton from `access-runner.ts` and refactored MCP and HTTP adapters to explicitly construct and inject registries.

### Added

- **HTTP adapter input validation (#408).** Integrated JSON schema validation (with secret sanitization) for request bodies on POST `/access/cleanup`, `/query/read`, `/query/write`, and `/vba/execute`.

### Fixed

- **E2E test harness zombie check.** Solved E2E test suite race conditions and false positives by awaiting child process close events and tracking descendant PIDs using `wmic`.

## [v1.2.14] - 2026-06-03

### Added

- **Cross-Platform COM and WMI mocking for Linux/macOS CI.** Added a mock COM module (`scripts/lib/dysflow-mock-com.ps1`) that implements `Access.Application`, `DAO.DBEngine`, and `Database` (with iterable `TableDefs` and `QueryDefs` collections) to run test suites without Windows or real Microsoft Access dependencies.
- **Node.js execution support for Linux environments.** Updated `powershell-executor.ts` to automatically execute `pwsh` on non-Windows platforms and inject `DYSFLOW_MOCK_COM=1` environment variable.

### Fixed

- **WMI test characterization bypass.** Bypassed the mock COM interceptor in `Get-MsAccessProcessesBounded` if a custom `WmiScriptBlock` is supplied, allowing behavioral Pester tests to run correctly.
- **Mock PID kill blocks.** Gated `Stop-AccessPidAndWait` to return `$true` immediately when `DYSFLOW_MOCK_COM=1` to prevent fake PIDs from causing long timeouts.
- **E2E test exclusion.** Automatically skip real-database E2E integration tests in `test/e2e/` when `DYSFLOW_MOCK_COM=1` is active since mocking does not perform physical file system writes.

## [v1.2.13] - 2026-06-03

### Changed

- **Unification of Access COM automation and process control into a shared module.** Refactored both `dysflow-access-runner.ps1` and `dysflow-vba-manager.ps1` to load and delegate COM lifecycle management, process attribution, and WMI queries to a single source of truth: `scripts/lib/dysflow-access-com.ps1`. This eliminates duplicate WMI and COM setup code, preventing script drift.
- **Hardened cleanup safety and zombie-prevention.** Null-PID close paths now run a ROT close fallback instead of just warning, and unattributed processes are reported as warnings rather than killed.
- **Behavioral testing at the port.** Added a Pester suite `dysflow-access-com.Tests.ps1` to cover `Open-CanonicalAccess`, `Close-CanonicalAccess`, and the WMI timeout bounds.

## [v1.2.12] - 2026-06-02

### Fixed

- **Documentation alignment.** Documentation alignment after v1.2.11 tag was prepared.

## [v1.2.11] - 2026-06-02

### Fixed

- **Access cleanup fix.** Restrict MSACCESS cleanup to owned processes.

## [v1.2.10] - 2026-06-01

### Changed

- **Test base hardened to a behavioral safety net for the Access WMI-hang/zombie layer (internal; no product/runtime change vs v1.2.9).** An audit found that the v1.2.9 fix lived in PowerShell but was only ever asserted as *script text* — the actual `Start-Job`/`Wait-Job` timeout + `Get-Process` fallback and the `ConvertTo-IsoStartTime` millisecond format were never executed, so a typo in the PS string could have re-introduced MSACCESS zombies while every TS + Pester test stayed green. Closed that gap: added a minimal injectable seam (`[scriptblock]$WmiScriptBlock`, default = the exact original CIM query, bit-for-bit) to `Get-MsAccessProcessesBounded` in both `dysflow-access-runner.ps1` and `dysflow-vba-manager.ps1`, and new Pester tests that inject a hanging scriptblock to prove the `Wait-Job` timeout actually fires (returns empty, elapses >0.9s and <10s) plus a success-path test; behavioral Pester for `ConvertTo-IsoStartTime` (3-digit-ms, the format whose absence caused the original `CLEANUP_PROCESS_START_TIME_MISMATCH`); and TS tests for the `running_untracked` cleanup hard-refusal and the inspector `execFile` timeout propagation. The v1.2.9 runtime was independently validated by the real MCP E2E against a live Access project: **104 pass / 0 fail, zero lingering MSACCESS.EXE**, including the intentional `run_vba` failure path. CI now also runs the `dysflow-vba-manager.ps1` script guards in the Windows smoke job (they were defined but never executed in CI). `README.md` no longer hardcodes a version/test-count that drifts every release — it points to `dysflow --version` and the CHANGELOG. Closes #380; resolves the CI-coverage gap from #376.

## [v1.2.9] - 2026-06-01

### Fixed

- **MSACCESS.EXE zombies, `RUNNER_TIMEOUT`/RPC failures, and uncleanable stale operations under WMI hang.** When Access COM operations left a hung MSACCESS.EXE (observed in CONDOR staging), the recovery paths themselves could hang because WMI/CIM enumeration — the very thing that stalls under a zombie/network-I/O condition — sat on the cleanup path. Symptoms: `RUNNER_TIMEOUT` after `test_vba`/`doctor`, `RUNNER_FAILED` with RPC unavailable `0x800706BA`, cleanup refused with `CLEANUP_PROCESS_START_TIME_MISMATCH`, and `timed_out` records with `accessPid:null`/`processStartTime:null` that could never be retired because `Get-CimInstance Win32_Process` timed out. Hardened across the runtime: (A) `windows-processes.ts` now runs every CIM query inside a bounded PowerShell `Start-Job`/`Wait-Job -Timeout` and falls back to `Get-Process -Name MSACCESS`, returning partial process info instead of hanging — the scanner only reports, it never kills by name. (B) both `dysflow-access-runner.ps1` and `dysflow-vba-manager.ps1` route every Access-PID lookup/fallback through a reusable bounded-WMI helper (no bare `Get-CimInstance Win32_Process` left on a cleanup path); `hWndAccessApp` → `GetWindowThreadProcessId` stays the primary PID capture and the `DYSFLOW_ACCESS_PROCESS` marker is now emitted from that primary path (no WMI on the success path) so the registry records the exact PID as early as possible. (C) `powershell-executor.ts` no longer fire-and-forgets `taskkill` on timeout/abort — it awaits the kill (bounded so a stuck `taskkill` cannot hang the executor). (D) `cleanup(force:true)` now retires a `timed_out` null-PID record even when the process scanner fails, emitting a "registry retired only; process ownership unknown" diagnostic, while still never killing a process it does not own and still refusing to kill on a genuine owned-PID start-time mismatch. (E) the start-time guard that produced false `CLEANUP_PROCESS_START_TIME_MISMATCH` (the PowerShell side wrote 7 fractional digits via `.ToString('o')` while the inspector emitted 3, and the two capture sources — WMI `CreationDate` vs `Get-Process.StartTime` — can differ at sub-second precision for the same process) is replaced by a tolerant whole-second comparison (`sameProcessStartTime`), with the PowerShell scripts normalized to millisecond ISO and the `Get-Process` fallback corrected to emit UTC. No new dependencies; registry JSON shape and PowerShell 5.1 compatibility preserved. Closes #376.

## [v1.2.8] - 2026-06-01

### Changed

- **Testing base hardened to a port-level criterion (internal; no product/runtime change vs v1.2.7).** Established the repository testing criterion — refactor-safety as the north star, test at the ports (real domain logic, mock only I/O adapters), coverage as a regression floor rather than a target — and anchored it in `docs/testing/testing-philosophy.md`, a new root `AGENTS.md` (canonical agent guide, imported by `CLAUDE.md` so it applies to every agent), and a cross-reference from `docs/testing/repo-quality-gates.md`. Removed the implementation-coupled assertions surfaced by an audit (tui install seam injection instead of module `vi.mock`; assert on outputs instead of `vi.spyOn`/`toHaveBeenCalledWith` on internal collaborators in the vba-sync adapters and powershell executor). Encapsulated the leaked `VbaSyncAdapter.formService` getter and `VbaFormsAdapter.formService` field (no production caller depended on them). Branch coverage raised 78.28% → 82.08% locally (81.15% on Linux CI, +86 branches) with port-level tests only; the enforced branch threshold floor was raised 77 → 80 (CI on Linux is the authoritative gate). Widened the vitest `testTimeout` to 15s to remove load-induced timeout flakes in the access-runner concurrency/lock tests. Closes #372, #373, #374, #375.

## [v1.2.7] - 2026-05-31

### Fixed

- **CI E2E gate restored to green (test drift).** `test/scripts-access-runner.test.ts` asserted on a literal PowerShell source string (`$rs = $readDb.Database.OpenRecordset(...)`) that no longer existed after the read path was refactored into the `Invoke-QuerySqlReadAction` / `Resolve-ReadActionDatabase` helpers. The assertion was re-pointed to the current code (verified present in the script). No product/runtime change vs v1.2.6. Verified green: integration vitest (`scripts-access-runner` + `access-relink-directory*` = 16 tests), Pester (98 passed / 0 failed / 4 COM-skips), and the MCP E2E (104/104, 0 zombies). Note: `test/e2e/access-fixture.e2e.test.ts` skips in CI (its `*.accdb` fixtures are gitignored); it only runs where real fixtures are present and currently expects sanitized fixtures (hardcoded backend password) rather than the password-protected production copies.

## [v1.2.6] - 2026-05-31

### Fixed

- **MSACCESS.EXE zombies leaked by every Access.Application operation (migration regression).** Operations that open the Access COM Application — link_tables, relink_tables, localize_backend_links, relink_directory, create_table, export_modules/export_all, compile_vba, test_vba, verify_code, delete_module, fix_encoding, harvest_form_catalog, run_vba — left a lingering MSACCESS.EXE process. Under a heavy run (e.g. a VBA test battery) these accumulated, locked the database, and caused subsequent `compile_vba`/`import` to hang. Root cause: the migrated PowerShell scripts had lost the deterministic process-ID capture the pre-migration skill used. `dysflow-access-runner.ps1` had no `hWndAccessApp` capture at all; `dysflow-vba-manager.ps1` captured it but then overwrote it unconditionally with an ambiguous process-diff that failed when multiple instances existed (emitting "se detectaron varias instancias … no se pudo identificar"). Restored the deterministic capture in both scripts: immediately after creating `Access.Application`, the exact owning PID is read via `$access.hWndAccessApp` → Win32 `GetWindowThreadProcessId`; the process-diff/command-line heuristic is now only a last-resort fallback. Validated by the real MCP E2E against the live runtime: **104/104 pass, 0 zombie-check failures** (was 88/104 with 16 zombie failures).

## [v1.2.5] - 2026-05-31

### Added

- **`dysflow doctor` now flags project-local OpenCode MCP config drift.** Beyond detecting a dysflow MCP `command` that points at a non-existent entrypoint (v1.2.3), doctor now warns when a project-local `opencode.json` redefines the dysflow MCP `command` and it is out of alignment with the global OpenCode config — the authoritative source of how the MCP should be invoked. The warning names both config files and shows the global (expected) vs local (found) command, so a stale per-repo override that would silently break the MCP in that repo becomes visible. Per-repo config should carry at most project-specific `env`, never redefine the command. Read-only; doctor never modifies config.

## [v1.2.4] - 2026-05-31

### Fixed

- **Stale "running" operations with a dead PID could never be cleaned and blocked new operations.** `dysflow_access_cleanup` returned `CLEANUP_PROCESS_NOT_FOUND` (even with `force: true`) when the recorded Access PID no longer existed, and pre-flight cleanup skipped `running` records entirely (`running` was not in its eligible set). A registry entry left `running` after a manually-killed or crashed Access process — common after a heavy VBA test battery — therefore stuck forever and blocked subsequent `compile_vba` / `test_vba`. Now, when the recorded PID is verifiably gone, gated cleanup retires the entry as `cleaned` (there is nothing to kill), and pre-flight reconciles dead-PID `running` entries — while never terminating a genuinely-live matching Access process (alive + `MSACCESS.EXE` + matching start time is left untouched).

## [v1.2.3] - 2026-05-31

### Fixed

- **Version string stuck at 1.1.0**: `package.json` was never bumped past 1.1.0 despite the v1.2.0–v1.2.2 releases, so `dysflow update` version comparison and the MCP `serverInfo.version` reported a stale 1.1.0 even when the v1.2.2 code (including the MSACCESS zombie-cleanup fix) was installed. Bumped to 1.2.3 so update detection and diagnostics report the real version.
- **CRLF formatting errors**: `src/cli/commands/install/extractor.ts` and `test/core/runner/access-runner.test.ts` had CRLF line endings that failed `biome check`. Reformatted to restore a green lint gate.

### Added

- **`dysflow doctor` OpenCode MCP wiring check**: doctor now detects when the resolved OpenCode `dysflow` MCP `command` points to an entrypoint that does not exist (for example a stale project-local `opencode.json` override left by a previous architecture) and warns with the offending path and which config file it came from — turning a silent "MCP won't connect" failure into an actionable diagnostic. Checks both the global and project-local OpenCode config; project-local wins, mirroring OpenCode's merge order.

## [v1.2.2] - 2026-05-30

### Fixed

- **`dysflow update` / `dysflow install` crashed on npm 11.7.0**: Replaced `npm install` with `pnpm install --prod --ignore-scripts` for runtime dependency installation. npm 11.7.0 crashes with `--omit=dev` and `--legacy-peer-deps` due to a null-pointer in the peer-dependency resolver.

- **`dysflow update` hung with no timeout**: All network operations (`fetch` to GitHub API, SHA256SUMS download) and subprocess calls (`gh`, `git clone`, `pnpm install`, `pnpm build`, `tar`, `npm install`) now have explicit timeouts. Operations that exceed 30-120s now fail with a clear error instead of hanging indefinitely.

- **`dysflow update` crashed on npm 11.7.0**: `npm install --omit=dev` triggered a null-pointer crash in npm's peer-dependency resolver (`Cannot read properties of null (reading 'matches')`). Replaced with `--ignore-scripts --legacy-peer-deps` which avoids the problematic code path.

- **Lingering `MSACCESS.EXE` processes after dysflow operations**: Operations that use COM automation (`Access.Application`) were leaving orphaned Access processes running after script completion, causing database lockups and resource leaks. Root causes addressed:

  - **COM cleanup ordering**: Secondary DAO objects (`$db`, `$directDb`) are now released with `FinalReleaseComObject` before the primary `$access` application object.
  - **Deterministic process termination**: The `finally` block in `dysflow-access-runner.ps1` now waits up to 20 seconds (polling every 100ms) for the Access process to actually exit, instead of relying on fixed sleep durations.
  - **Targeted fallback kill**: If `Stop-Process` does not terminate the process within the wait window, `taskkill /F /PID` is invoked as a last resort — targeting only the PID that dysflow itself launched, never affecting other Access instances.
  - **PID capture reliability**: Added a targeted fallback that resolves the process PID by matching the database path in the process command line (covers cases where WMI/CIM timing race causes the initial capture to miss the PID, or where `New-Object Access.Application` reuses an existing COM singleton).
  - **VBA manager parity**: `dysflow-vba-manager.ps1` now has the same deterministic wait-and-fallback kill logic in `Close-AccessDatabase` (`Stop-AccessPidAndWait` with 20s timeout, `taskkill` fallback on failure).

- **`$accessPid` was `$null` after COM reuse**: When `New-Object Access.Application` returns an existing Access process (COM singleton reuse), the pre/post WMI process diff shows 0 new processes, leaving `$script:accessPid` as `$null` and causing the `finally` block to skip termination entirely. Fixed by re-resolving the PID by database path in command line at cleanup time.

- **E2E zombie verification was insufficient**: The E2E suite (`mcp-e2e.mjs`) only checked for zombies after the full test run, making it impossible to identify which specific operation leaked. Added per-call zombie checks with a 30-second wait that poll for process exit after each MCP tool invocation. Pre-existing Access processes are excluded via baseline PID snapshot at suite start.

### Added

- **`test/core/runner/access-runner.test.ts`**: 24 unit/integration tests covering PID capture, `finally` block execution guarantees, lock acquisition, and real Access process lifecycle cleanup.
- **`E2E_testing/mcp-e2e.mjs`**: Per-call zombie check after every MCP tool invocation (`<tool>:zombie-check` entries in the test report), with `waitForNoZombies()` polling and baseline PID filtering.

### Changed

- **`scripts/dysflow-access-runner.ps1`**: Refactored kill logic in `finally` block to use a `$pidToKill` variable with command-line fallback resolution, deterministic polling wait (up to 20s), and `taskkill` escalation. Removed early `exit` calls in favor of `$script:exitCode; return` so the `finally` block always runs.
- **`scripts/dysflow-vba-manager.ps1`**: Added `Find-AccessPidByDatabase` and `Stop-AccessPidAndWait` helper functions. `Close-AccessDatabase` now re-resolves PID by database path if not captured at open time, waits up to 20s for termination, and escalates to `taskkill` if the process survives.

## [1.1.0] - 2026-05-30

### Fixed

- **MCP `compare_backends` tool failure**: Resolved a critical RCW COM exception (`InvalidComObjectException`) that occurred because the helper script closed the shared `DAO.DBEngine` instance singleton, separating the active database RCW wrapper from its COM peer. Also added a fallback in `dysflow-access-runner.ps1` to resolve the target database to `$AccessDbPath` when inputs do not specify it, allowing the early dispatch path to correctly locate the frontend and backend without duplicating connections.

### Changed

- **Complete MCP SDK migration**: Removed the legacy, hand-rolled `JsonLineMcpStdioRuntime` implementation, `McpStdioRuntime` interface, and associated type signatures from `stdio.ts` (shrinking it to 317 lines).
- **Test cleanup**: Deleted deprecated `progress.test.ts` and pruned `stdio.test.ts` to keep only the isolated auxiliary and service configuration validation suites.
- **Lint auto-fix tooling**: Added `lint:fix` script in `package.json` and auto-corrected 24 formatting, import block organization, and template literal occurrences via Biome.

## [1.0.2] - 2026-05-29

### Fixed

- **Runtime install: `npm install --prefer-offline` caused `ETARGET` error**: The `--prefer-offline` flag made npm try to resolve the full lockfile including dev dependencies, failing on `@vitest/utils@4.1.7` which is not published separately. Removed the flag — npm now resolves production dependencies fresh from the registry.

## [1.0.1] - 2026-05-29

### Fixed

- **Runtime install: missing production dependencies**: `dysflow install` and `dysflow update` only copied `dist/` and `package.json` to the runtime directory but never ran `npm install`. With v1.0.0 introducing `@modelcontextprotocol/sdk` as the first true runtime dependency, the MCP server crashed with `ERR_MODULE_NOT_FOUND` on startup. The installer now runs `npm install --omit=dev --ignore-scripts` in the runtime app directory after copying `package.json`, ensuring all production dependencies are available. `--ignore-scripts` prevents the `prepare`/`prepack` build hooks from running in the production environment.

## [1.0.0] - 2026-05-29

### Changed

- **MCP SDK migration**: Replaced the hand-rolled JSON-RPC 2.0 stdio adapter (`stdio.ts`, ~320 lines)
  with `@modelcontextprotocol/sdk` v1.29.0. All protocol mechanics (framing, routing, spec
  compliance) are now handled by the SDK. Custom behaviors (exception absorption into
  `isError: true`, path sanitization in error text, hidden tools, 1 MiB size guard, progress
  notifications) are preserved via focused wrapper modules.
- **New modules**: `stdio-wrappers.ts` (errorAbsorber, sanitizer, hiddenToolRegistry),
  `stdio-size-guard.ts` (SizeLimitTransform).
- **Test harness**: migrated from `PassThrough` stream injection to `InMemoryTransport` client/server
  pairs for SDK-layer tests.
- **`SizeLimitTransform` newline fix**: the size guard was stripping the trailing `\n` before pushing lines downstream. The SDK transport uses newline delimiters to frame messages, so stripping caused it to buffer silently and never process requests. Lines are now forwarded with `\n` restored.
- No breaking changes to tool interfaces, `project.json` schema, or CLI.

## [0.10.0] - 2026-05-29

### Security

- **Closed `allowedProcedures` enforcement bypass**: The MCP `run_vba` alias and the HTTP `POST /vba/execute` route were bypassing the `allowedProcedures` allowlist entirely. Both entry points now apply the same guard as `dysflow_vba_execute`: a procedure not in the configured allowlist is rejected before any COM automation is started. HTTP returns `403 HTTP_PROCEDURE_NOT_ALLOWED`. Four new MCP tests and three new HTTP tests cover blocked, allowed, empty, and unconfigured scenarios.

- **Fixed checksum fallback scope**: `dysflow update` was falling back to git clone on any error during artifact download (including HTTP 500, 403, and checksum mismatches). The fallback now only triggers on HTTP 404. All other errors throw immediately, preventing silent installs of potentially corrupted artifacts.

### Fixed

- **`VbaOperationsAdapter.execute()` was a stub**: `list_access_operations` and `cleanup_access_operation` returned `TOOL_NOT_IMPLEMENTED` when routed through the adapter directly. Tools only worked because legacy alias handlers intercepted them first. Real logic now delegates to `operationRegistry` and `cleanupService` respectively.

### Changed

- **`failureResult` returns `OperationResult<never>`**: Changed from the generic `OperationResult<T>` to `OperationResult<never>`, eliminating three `as unknown as` double-casts in `vba-source-comparison.ts`. The `ok: false` branch never uses `T`, so `never` is the structurally correct type.

- **Extracted shared VBA sync types**: `DirectMapping` (type), `mapping()` (factory), and `stringArray()` (helper) were copy-pasted verbatim across four adapter files. Moved to `src/adapters/vba-sync/vba-sync-types.ts` and removed all duplicates.

- **Early dispatch in `dysflow-access-runner.ps1`**: `list_linked_tables`, `compare_backends`, and `list_access_files` now use direct DAO dispatch and no longer force `MSACCESS.Application` to open for read-only metadata operations.

### Documentation

- **`docs/api/http-api.md`**: Added Authentication section documenting Bearer token (`httpToken`), `401 HTTP_UNAUTHORIZED` response, and the new `403 HTTP_PROCEDURE_NOT_ALLOWED` on `/vba/execute`. Updated PowerShell and Node.js script examples to include the `Authorization` header.
- **README**: Updated version, test count (682), Safety model section for `allowedProcedures`, HTTP section for Bearer auth and `allowedProcedures`, and `project.json` example with both new fields.

## [0.9.20] - 2026-05-29

### Changed

- **Refactored `install.ts` into focused sub-modules**: Split the 936-line install command into six focused modules under `src/cli/commands/install/`: `downloader.ts` (GitHub fetch + SHA-256), `extractor.ts` (file copy + install report), `mcp-configurator.ts` (agent config writers), `path-configurator.ts` (cmd/ps1 launchers), `package-root.ts` (package root resolution), and `updater.ts` (update flow + arg parsers). `install.ts` is now a 144-line entry point with full re-exports for backward compatibility.

## [0.9.19] - 2026-05-28

### Added

- **Configurable Bearer token authorization in the HTTP adapter**: Added optional `httpToken` (and `httpTokenEnv` for custom env resolution) to project config. When configured, HTTP requests are validated using the `Authorization: Bearer <token>` header, returning a structured 401 `HTTP_UNAUTHORIZED` error envelope on invalid/missing tokens. `/health` route remains public. Exposes the `--token <token>` option in `dysflow serve`.
- **SHA-256 verification on update**: The `dysflow update` command now downloads and validates the release artifact against `SHA256SUMS` to prevent MITM/poisoned package injection.
- **MCP protocol version documentation**: Extracted the hardcoded MCP version to `PROTOCOL_VERSION` constant and documented the future MCP SDK migration path.

### Changed

- **Refactored `vba-sync-adapter.ts`**: Split the large God Object (888 lines) into smaller, domain-scoped sub-adapters: operations, modules, execution, and forms sub-adapters. Decoupled sub-adapters from config loading by passing configuration properties at instantiation.
- **Refactored `schemas.ts`**: Split the large schema repository (862 lines) into domain schema files (`vba-sync-schemas.ts`, `query-schemas.ts`, `dysflow-schemas.ts`, and a barrel index) to reduce recompilation times.
- **Biome lint rule escalation**: Escalated rules `noExplicitAny` and `noNonNullAssertion` from warning to error level. Refactored all codebase violations to use explicit types/runtime guards.
- **Vitest branch coverage**: Raised minimum branch coverage threshold from 72% to 82% and expanded unit/integration tests to cover PowerShell timeout, timeout aborts, and download failure recovery paths.

## [0.9.18] - 2026-05-28

### Changed

- **All 48 MCP tools are now first-class API.** The internal "legacy compatibility tier" distinction is gone. Tools like `query_sql`, `list_tables`, `export_modules`, `link_tables`, and the other named Access/VBA tools are official API alongside `dysflow_*` — not a compatibility surface.
- Renamed internal adapter files and symbols to reflect this: `legacy-tool-inventory.ts` → `mcp-tool-registry.ts`, `legacy-parity-registry.ts` → `tool-parity-registry.ts`, `vba-sync-legacy-adapter.ts` → `vba-sync-adapter.ts`. No behaviour change.
- Deleted `vba-sync-legacy-service.ts` — a re-export shim that had been dead (zero imports) since the service layer was restructured.

### Repository

- Moved one-off dev scripts to `scripts/dev/` and removed them from the root. Root now contains only project-level files.
- Moved audit document to `docs/`. Gitignored local AI tool state directories (`.engram/`, `.dysflow/runtime/`, `.antigravitycli/`).
- Updated all documentation (README, architecture doc, E2E guide, OpenSpec specs) to remove outdated compatibility-layer language.

## [0.9.11] - 2026-05-27

### Changed

- Synced the Access E2E fixture source snapshot, test runner, OpenSpec relink-directory artifacts, redacted Engram project export, and E2E fixture databases for machine handoff.
- Removed the hardcoded E2E backend password from exported VBA source; the fixture now reads the backend password from environment variables.

## [0.9.10] - 2026-05-26

### Fixed

- Fixed `Close-TargetAccessDbIfOpen` hanging indefinitely when zombie MSACCESS processes are stuck on unreachable network I/O (e.g. UNC paths): replaced bare `Get-CimInstance Win32_Process` with a `Start-Job` + `Wait-Job -Timeout 4` guard; if WMI does not respond within 4 seconds, falls back to `Get-Process` (no WMI) and kills all MSACCESS instances to release the lock.

## [0.9.9] - 2026-05-26

### Fixed

- Fixed four Access automation hang bugs in `dysflow-vba-manager.ps1` that caused MSACCESS.exe to never close and MCP tool calls to timeout:
  - `hWndAccessApp()` was called as a property instead of a method, silently failing PID capture via HWND.
  - `Stop-Process` was called after DAO restore operations; moved it before so the file lock is guaranteed released before DAO reopens the DB.
  - `RotManager.CloseDatabaseIfOpen` called `CloseCurrentDatabase()` but not `Quit()`, leaving zombie MSACCESS processes that accumulated across calls.
  - `Disable-StartupFeatures` now saves and removes the `AppIcon` DB property before `OpenCurrentDatabase`; UNC paths to unreachable servers caused 30-40s network timeouts inside `OpenCurrentDatabase` that raced the MCP 30s hard timeout. `Restore-StartupFeatures` restores it after Access closes.

## [0.9.8] - 2026-05-26

### Fixed

- Fixed MCP generic SQL tools so `dysflow_query_execute` and legacy `query_sql` expose and forward explicit backend/database targets, and the Access runner executes generic reads/writes against the selected database instead of the frontend. Closes #370.

## [0.9.7] - 2026-05-26

### Fixed

- Fixed OpenCode MCP startup on Windows by generating a direct Node runtime entrypoint instead of direct `.cmd` spawning. Closes #361.
- Fixed MCP `tools/call` hangs from Access project contexts by settling runner timeout/abort paths, preserving `timed_out` metadata, and returning terminal client-safe tool responses. Closes #362, #364, #365.
- Added SDD verification evidence for the MCP tool-call hang fix, including short `E2E_testing` probes for `dysflow_doctor` and `list_tables`. Closes #366.

## [0.9.6] - 2026-05-26

### Fixed

- Added safe recovery for stale `pid_unknown` Access operations after timeouts: forced cleanup and preflight can now retire unknown-PID records only when no matching `MSACCESS.EXE` process is found for the registered database path, while refusing to kill unowned Access processes. Closes #360.

## [0.9.5] - 2026-05-25

### Fixed

- **`run_script` DDL compatibility**: strip `--` line comments from SQL scripts before executing DDL statements, allowing scripts authored with standard SQL comment syntax to run without parse errors. Closes #348.

## [0.9.4] - 2026-05-25

### Fixed

- **MCP backend DDL targeting**: write/DDL tools now honor explicit `databasePath`/`backendPath` targets and can run directly against the requested backend instead of opening the configured frontend first. Closes #347.
- **Project-scoped MCP write gate**: calls that include explicit paths still resolve `allowWrites` from the matching repo `.dysflow/project.json`, preventing false `MCP_WRITES_DISABLED` failures for allowed projects.

## [0.9.3] - 2026-05-25

### Fixed

- **MCP E2E stability**: fixed `dysflow access` dry-run execution path in `Update-LinkTables` to avoid PowerShell non-operational failures during smoke tests and CI (`#346`).
- **Legacy schema compatibility**: restored acceptance of legacy form-catalog payload aliases (`spec`/`specPath`) for `catalog_add_control`.
- **Smoke harness correctness**: updated the MCP smoke harness expectations to the current tool count (`48`) and aligned form-catalog test input to include a valid empty spec payload.

## [0.9.1] - 2026-05-25

### Fixed

- Fixed `Close-TargetAccessDbIfOpen` failing during VBA import/export preflight because PowerShell `Write-Debug` catch bodies were accidentally embedded inside the C# `RotManager` `Add-Type` block (#342).

## [0.9.0] - 2026-05-25

### Features

- **MCP tool partitioning**: Split `tools.ts` to extract schemas, validator, and dispatch into separate files (`schemas.ts` and `validator.ts`) for better maintainability (#326)
- **Dependency injection & contracts**: Refactored HTTP server to use dependency injection, introduced `LegacyVbaSyncPort` to decouple core from adapters, and moved pure import plan helpers to core services (#338, #340, #341)

### PowerShell Diagnostics

- **Silent catches replaced**: Replaced all silent `catch {}` blocks in `dysflow-access-runner.ps1` and `dysflow-vba-manager.ps1` with diagnostic `Write-Debug` statements to aid troubleshooting (#327)

### Quality Gates & Test Coverage

- **Coverage improvements**: Raised `install.ts` coverage to ≥85% by testing edge cases and interactive selection, covered HTTP cleanup route, and increased `stdio.ts` coverage to ≥85% (#329, #334)
- **Tooling upgrades**: Migrated to TypeScript 6.0 and Vitest 4.0, and integrated Biome check for linting and formatting (#335, #336)

## [0.8.0] - 2026-05-24

### Features

- **`relink_directory` apply mode**: PS implementation complete — backup (.bak-*), chain resolution (depth-first, max 5 hops), apply loop with RefreshLink, `--remove-unresolved` support (#316, #318)
- **`relink_directory` verify mode**: `Test-LinkExternal` for strict-local and deny-prefix validation, non-zero exit on violations (#318)
- **Password propagation**: `Open-DatabaseWithPassword` helper in PS runner; `Invoke-RelinkDirectory` and `Resolve-LinkChain` now use `$AccessPassword`/`$BackendPassword` (#317)

### Fixed

- Fixed MCP modern tool naming: exported `MODERN_TOOL_NAMES` constant as single source of truth; regression test asserts no dots (#321)

### CI / Quality

- E2E relink-directory tests added to Windows CI job (#319)
- Pester tests now run automatically in CI (#319)
- `pnpm audit --audit-level=high` added to quality gate (#319)
- `test/integration/` added to vitest quality suite (#319)

### Dependencies

- Migrated vitest v1 → v3 (no breaking changes) (#322)
- Fixed `@vitest/coverage-v8` version pin — added `^` caret (#320)

### Tests

- 519 tests (+60 since v0.7.7)
- New dedicated tests for `serve`, `setup`, and `version` (#323)
- New integration tests for relink_directory apply mode (#316)

### Housekeeping

- Removed stale `fileExists` re-export from `install.ts` (#320)
- `coverage/` directory now gitignored (#320)
- Stale remote branches deleted (#320)
- 3 SDD changes archived: `relink-directory`, `release-fixes`, `fix-mcp-tool-name-underscores`

## [0.7.7] - 2026-05-24

### Fixed

- **Config Sync/Async Dedup**: Unified config parsing, routing, and error formatting under `loadDysflowConfigShared` and `loadProjectConfigCore` to prevent routing duplication.
- **VBA Service Split**: Extracted `VbaFormService` (form & catalog operations) and `vba-source-comparison.ts` (pure binary/source tree comparison helpers) from `VbaSyncLegacyService` while keeping stable backwards-compatible exports.
- **Install CLI Utils**: Decoupled `uninstall.ts` from `install.ts` by extracting filesystem and execution helpers to `install-utils.ts` and resolved Pester/PMR dependencies.
- **Preflight & Operations**: Removed non-null assertions in preflight cleanup and aligned `InMemoryAccessOperationRegistry` status purging with `FileRegistry` behavior.
- Updated installation instructions in `README.md` to reference the correct v0.7.7 release tag.

## [0.7.6] - 2026-05-23

### Fixed

- Renamed modern MCP tools to underscore-separated names (`dysflow_vba_execute`, `dysflow_query_execute`, `dysflow_doctor`, `dysflow_access_operations_list`, `dysflow_access_cleanup`) so PI/Codex clients that enforce `^[a-zA-Z0-9_-]+$` can load Dysflow tools. Closes #296.
- Updated installation instructions in `README.md` to reference the correct v0.7.6 release tag.

## [0.7.5] - 2026-05-22

### Fixed

- Resolved Node `DEP0190` security/deprecation warning on Windows during installation runner tasks.
- Enhanced password propagation in `relink-directory` to correctly authenticate frontend databases with the frontend password while fallback-authenticating links, and fall back to the backend password during root directory scanning.
- Recreated table links dynamically during apply mode when `SourceTableName` changes to resolve DAO collection constraints.
- Aligned MCP legacy `relink_directory` tool schema and mapper with modern CLI options (such as apply, maps, password, and timeout).
- Preserved existing `PWD` connection password in table links when no new backend password is provided.
- Propagated `recursive: false` correctly in the MCP legacy mapper instead of dropping the parameter.
- Fixed non-recursive directory scanning in the PowerShell runner script by using wildcard paths to avoid matching zero files.
- Updated installation instructions in `README.md` to reference the correct v0.7.5 release tag.

## [0.7.4] - 2026-05-22

### Fixed

- Fixed `relink-directory` PowerShell execution so protected databases are opened with `DYSFLOW_BACKEND_PASSWORD`, relinked `Connect` strings preserve `;PWD=...`, and existing linked TableDefs are refreshed without mutating immutable `SourceTableName`.

## [0.7.3] - 2026-05-22

### Fixed

- Resolved quality audit blockers: aligned `LinkClassification` contract and fixed E2E and unit test types to ensure `pnpm lint` passes cleanly.
- Added dynamic backend database password propagation to `relink-directory` command via `--password-env`.
- Secured process cleanup fallback inside VBA manager by matching full database paths instead of base filenames to prevent terminating unintended Access processes.
- Aligned documentation to reflect that the HTTP adapter is active and corrected MCP cleanup tool usage examples in `README.md`.

## [0.7.2] - 2026-05-22

### Fixed

- Fixed `spawn EINVAL` error on Windows during `dysflow update` when executing pnpm/npm update scripts. Closes #289.

## [0.7.1] - 2026-05-22

### Fixed

- Fixed PowerShell parsing error (`InvalidVariableReferenceWithDrive`) in the Access runner script (`dysflow-access-runner.ps1`) when deleting unresolved links. Closes #287.

## [0.7.0] - 2026-05-22

### Added

- `dysflow access relink-directory` command to bulk-remap linked-table backends in every Access file under a root directory. Supports dry-run (default), `--apply` mode with per-file `.bak-*` backups, `--map old=new` alias overrides, DFS chain resolution (max depth 5) with cycle detection, `--remove-unresolved` to delete unresolvable TableDef links, `--strict-local` and `--deny-prefix` exit-code guards, and `--no-backup` flag. Closes #282.

## [0.6.9] - 2026-05-22

### Added

- `dysflow uninstall` command to recursively delete runtime directories, clean machine-level markers, and surgically remove MCP configurations from Codex, OpenCode, Claude Desktop, Claude Settings, and Pi. Closes #278.

### Fixed

- Resolved path resolution bugs where global dysflow installed via pnpm symlinks exited silently without console output.
- Resolved spawn ENOENT errors when running update/install scripts on Windows (added pnpm.cmd/npm.cmd support).

## [0.6.8] - 2026-05-21

### Fixed

- `test_vba` now returns `VBA_TESTS_FAILED` when any individual VBA test result has `ok: false`, instead of propagating a success result with failing tests in the payload. Closes #273.
- `export_modules` pre-validates that every requested module name exists in VBProject before starting the export loop; returns `VBA_MODULE_NOT_FOUND` if any is missing. Closes #274.
- `catalog_add_control` now requires `controlName` and `controlType` params; returns `FORM_SPEC_INVALID` instead of silently defaulting to `UnnamedControl`/`Unknown`. Closes #275.

## [0.6.7] - 2026-05-21

### Added

- MCP progress notifications: `dysflow_vba_execute` and `dysflow_query_execute` now emit real-time `notifications/progress` frames to progress-aware clients when `_meta.progressToken` is present. Three milestones (10%/40%/90%) are emitted by the PowerShell runner via stderr side-channel. Closes #272.

## [0.6.6] - 2026-05-21

### Added

- Added support for backend database password propagation (`DYSFLOW_BACKEND_PASSWORD` / `;PWD=...`) across PowerShell runner operations (backend comparison and table link maintenance). Closes #263.
- Defined explicit backend resolution contract and schema for `localize_backend_links` tool, allowing `backendPath` fallback to config. Closes #265.
- Added a deterministic release matrix coverage gate test verification for all MCP tools. Closes #266.

### Removed

- Removed legacy MCP stub tools `init_project` and `normalize_documents` from the compatibility surface. Closes #259, #260, #255.

## [0.6.5] - 2026-05-20

### Fixed

- `dysflow install` and `dysflow update` now copy the PowerShell runtime scripts required by MCP/Access/VBA tools into `app/scripts`, preventing missing `dysflow-vba-manager.ps1` and `dysflow-access-runner.ps1` failures. Closes #251.
- Generated Windows launchers now escape the `ProgramFiles\nodejs` PATH segment correctly instead of writing a newline into the launcher.
- Legacy VBA sync now fails fast with `CONFIG_MISSING_ACCESS_PATH` when no explicit Access path or repo config can be resolved. Closes #230.
- MCP error path redaction now uses a single-pass sanitizer covered through public MCP error translation behavior. Closes #229.

### Changed

- Removed the dead legacy higher-level tool message map and use one consistent `LEGACY_TOOL_NOT_IMPLEMENTED` response. Closes #226.
- Refocused architecture boundary tests on behavior and meaningful core dependency invariants instead of brittle file/path checks. Closes #234.

## [0.6.3] - 2026-05-20

### Fixed

- `dysflow update` now reuses the runtime directory persisted by `dysflow install --runtime-dir`, so updates keep targeting the installed MCP runtime instead of silently falling back to the current Windows user's `%LOCALAPPDATA%\\dysflow`. Closes #250.

### Documentation

- Documented runtime directory precedence for install/update and clarified how OpenCode should point to custom runtime installs.

## [0.6.2] - 2026-05-19

### Changed

- Deprecated the global `%APPDATA%/dysflow/projects.json` registry path. Dysflow now relies on per-repository `.dysflow/project.json` configuration and no longer reads or writes the global registry. Closes #249.

## [0.6.1] - 2026-05-19

### Fixed

- `loadDysflowConfig` and `loadDysflowConfigAsync` now return `CONFIG_AMBIGUOUS_PROJECT_FILE` when both `.dysflow/project.json` and `dysflow.project.json` coexist in the same directory, instead of silently preferring one. Closes #61.

## [0.6.0] - 2026-05-19

### Added

- MCP write-capable tools can now be enabled per project via `.dysflow/project.json` using `"allowWrites": true`, while keeping writes disabled by default globally. Closes #244.

### Fixed

- Added pre-flight Access cleanup before modern and legacy Access operations. Dysflow now cleans stale registry-tracked operations and safely terminates orphaned `MSACCESS.EXE` processes only when their command line matches the current `.accdb` exactly. Closes #245.

## [0.5.4] - 2026-05-19

### Fixed

- Rollback release: restored the runtime behavior from `v0.5.3` after unreleased security-hardening changes on `main` caused MCP project resolution and write-gating regressions in Access/VBA worktrees.
- This release intentionally preserves the stable `v0.5.3` functionality while giving `dysflow update` a newer version to reinstall cleanly.

## [0.5.3] - 2026-05-19

### Fixed

- `test_vba` now honors explicit `proceduresJson` payloads instead of always resolving from a manifest.
- Relative `testsPath` values now resolve from the project root, so `tests/tests.vba.json` works when `destinationRoot` is `src`.
- Pipe-separated `filter` values such as `Test_A|Test_B` now select tests by OR across name, procedure, and tags.
- Empty `proceduresJson` or filters that select no tests now fail early with `VBA_NO_TESTS_SELECTED` and do not call PowerShell with an empty `-Procedures` array. Closes #211.

## [0.5.2] - 2026-05-19

### Fixed

- Hardened config and VBA sync error handling: malformed project JSON is returned as `CONFIG_PROJECT_FILE_INVALID`, `parseArgsJson` no longer leaks uncaught exceptions, and catalog write failures propagate as `VBA_CATALOG_WRITE_FAILED`. Closes #192, #193, #194.
- Removed cross-adapter HTTP→MCP coupling, made MCP write gating explicit at tool construction, and removed the dead legacy schema fallback behind a parity-tested schema map. Closes #196, #197, #200.
- Improved registry and redaction safety: single-pass record eviction, direct ISO timestamp comparisons, removal of `readRecordsUnlocked`, short Windows path redaction, and warnings for absolute registry paths outside the registry directory. Closes #198, #199, #202, #204, #205.
- Moved CI linting before test/build, removed the redundant `postinstall` build, and added TypeScript checking for test files. Closes #201, #206.

### Changed

- Deduplicated sync/async project config construction through shared pure helpers while preserving the public API. Closes #195.
- Exported the shared `truthy()` utility and named package-root traversal / subprocess buffer constants. Closes #203.

### Documentation

- Updated the Git install example to the current release tag, documented public operation-result contracts, and added an explicit Access E2E skip message. Closes #207, #208, #209.

## [0.5.1] - 2026-05-18

### Fixed

- Extracted shared PowerShell execution for Access runner and legacy VBA manager paths, reducing duplicated timeout/stdout/stderr process handling. Closes #180.
- Added async project configuration loading for production CLI, HTTP, MCP, and legacy VBA paths while keeping the existing sync API for compatibility. Closes #181.
- Added Windows CI smoke coverage for PowerShell/Access-facing integration paths. Closes #182.
- `dysflow update` now reports the installed release commit SHA when installing from a GitHub release clone. Closes #183.

## [0.5.0] - 2026-05-18

### Fixed

- `WindowsMsAccessProcessInspector` now converts WMI DMTF datetime to ISO 8601 before returning, preventing false `CLEANUP_PROCESS_START_TIME_MISMATCH` rejections during cleanup. Closes #172.
- `isReadOnlySql` rewritten with a token-aware parser that strips string literals before checking for top-level statement separators, so valid queries with semicolons in literals are accepted. Closes #173.
- E2E fixture test now asserts `rows` as an array; fixed `Convert-RecordsetRows` in the PowerShell runner to always serialize single-element results as a JSON array (not object). Closes #174.
- `dryRun: true` in `relink_tables` and other write tools is no longer blocked by the `MCP_WRITES_DISABLED` guard — dry-run operations are treated as reads and always permitted. Closes #184.
- `export_modules` and `export_all` now respect the `exportPath` parameter when provided, instead of always writing to the project `destinationRoot`/`src/`. Closes #185.
- HTTP adapter now uses `FileAccessOperationRegistry` (same as the MCP adapter), so `GET /access/operations` reflects operations from both adapters. Closes #176.

### Added

- Path sandboxing in `dysflow-access-runner.ps1` extracted into a reusable `Resolve-SandboxedPath` helper, extended to cover `importPath`, `targetPath` (compact-repair), and `scriptPath` (run_script). Significantly reduces path traversal surface.
- Oversized-line handling in the MCP stdio runtime now uses per-chunk byte counting, correctly reporting the error and continuing to process subsequent frames.
- Per-tool input schemas for all 46 legacy MCP tools: each tool now exposes only its own parameters. Closes #177.
- Coverage thresholds raised from 0% to measured baseline (statements 86%, branches 75%, functions 88%, lines 86%). CI now blocks regressions. Closes #178.

### Changed

- Unimplemented stub tools (`verify_code`, `verify_binary`, `reconcile_binary`, `init_project`, `normalize_documents`) are now hidden from `tools/list`. Agents no longer see tools that always return an error. Closes #175.
- `FileAccessOperationRegistry.get()` and `listRecent()` now bypass the write lock, eliminating unnecessary contention when agents poll for operation status. Closes #179.

## [0.4.5] - 2026-05-18

### Fixed

- Legacy VBA sync tools (`test_vba`, `compile_vba`, `import_modules`, etc.) now honour `timeoutMs` from `.dysflow/project.json` instead of always using the service-level 30 000 ms default. Explicit per-call `timeoutMs` in tool params still takes precedence.

### Added

- Documented the timeout resolution order (per-call > project config > service default) in `docs/architecture/dysflow-core-and-adapters.md`.

## [0.4.4] - 2026-05-18

### Fixed

- Closed the v0.4.3 security audit by hardening secret redaction, password transport, Windows command/path validation, MCP write gates, HTTP response headers, release tag validation, and Access query export boundaries. Closes #167, #168, #169, #170, #171.

### Added

- Added a real Access fixture E2E test that exercises HTTP diagnostics and read SQL through the production PowerShell/Access runner when local Access fixtures and Access COM are available.

## [0.4.3] - 2026-05-18

### Fixed

- HTTP server no longer returns raw config error (with internal filesystem paths) to callers when starting in degraded mode — now returns a generic `SERVICE_UNAVAILABLE` and logs the original error to stderr. Closes #159.
- CLI setup command no longer includes the registry file path in the malformed-JSON error message. Closes #160.

## [0.4.2] - 2026-05-18

### Fixed

- Hardened audit findings around malformed JSON handling, Windows CLI entrypoint URLs, TUI close/default selection safety, and degraded HTTP startup.
- Removed fragile package-version `createRequire` lookups and moved shared version comparison out of install command internals.

### Changed

- Cached legacy MCP schemas during tool registration and removed unused planned command dead code.

## [0.4.1] - 2026-05-17

### Fixed

- Allowed `dysflow update` to resolve GitHub releases in authenticated/private-repo contexts via `GH_TOKEN`/`GITHUB_TOKEN` headers or authenticated `gh` CLI fallback.

## [0.4.0] - 2026-05-17

### Added

- Made `dysflow update` fetch the latest GitHub release, build it in a temporary workspace, and install it into the local runtime.
- Added release-update coverage for newer releases, current releases, forced reinstalls, and GitHub/provider failures.

## [0.3.1] - 2026-05-17

### Fixed

- Made TUI dashboard Enter actions execute the selected option: integration selection opens/applies selected agents and Doctor runs diagnostics.

## [0.3.0] - 2026-05-17

### Added

- Added `dysflow --version` and `dysflow -v` for direct CLI/runtime version verification.

- Next milestones and features will be tracked in future releases.

## [0.2.5] - 2026-05-17

### Fixed

- Serialized file-backed Access operation registry updates to avoid losing records under concurrent requests.
- Recorded resolved project and destination roots in Access operation metadata instead of the process working directory.
- Reported runtime fallback config source truthfully when no repo project config is loaded.

## [0.2.4] - 2026-05-17

### Fixed

- Allowed registered-project import dry-runs to resolve by `projectId`/`contextId` even when the MCP server starts outside a Dysflow repo.

## [0.2.3] - 2026-05-17

### Fixed

- Fixed the generated PowerShell launcher so custom `--runtime-dir` installs set `DYSFLOW_HOME` to the selected runtime directory.

## [0.2.2] - 2026-05-17

### Fixed

- Clarified `projectId` as the canonical Engram-aligned project identity and `contextId` as optional run context.
- Added `dysflow setup --set-project-id <id>` to update `.dysflow/project.json` trace identity.
- Fixed multi-worktree project resolution so explicit registered `projectId`/`contextId` does not silently fall back to cwd.
- Added dry-run plan mode and strict context diagnostics for Access import operations.

## [0.2.1] - 2026-05-17

### Fixed

- Kept the default TUI dashboard open in interactive terminals so arrow-key navigation works until the user exits.

## [0.2.0] - 2026-05-17

### Added

- Added the first Dysflow TUI dashboard path: running `dysflow` with no command opens a branded dashboard with local/latest version status and integration menu affordances.
- Added pure TUI render helpers for the framed Dysflow header, update guidance, and integration checkbox lists.
- Added safe Dysflow MCP config detection/removal helpers for future TUI install selection flows.

## [0.1.4] - 2026-05-17

### Fixed

- Fixed self-reinstall from the profile runtime launcher by skipping runtime copy operations whose source and destination are the same path.

## [0.1.3] - 2026-05-17

### Fixed

- Fixed `dysflow install` package-root detection so a globally/profile-installed Dysflow can reinstall from any current working directory instead of looking for `./dist`.

## [0.1.2] - 2026-05-17

### Fixed

- Hardened MCP tool schemas so every array declares `items`, including legacy `rows` and VBA `arguments`, preventing OpenCode schema-load failures.
- Returned thrown tool-call failures as MCP `isError` tool results instead of JSON-RPC internal errors, keeping the AI session informed and connected.
- Allowed `dysflow mcp` to start in degraded mode when `.dysflow/project.json` is missing so clients can list tools and receive configuration errors per call.

## [0.1.1] - 2026-05-17

### Fixed

- Corrected the OpenCode MCP installer output to use the current local-server schema with `enabled`, `type`, and argv-array `command`.

## [0.1.0] - 2026-05-16

### Dysflow v0.1.0 — Initial Release: MCP Safety Baseline

Initial production release focused on making Access automation safe, observable and MCP-compatible.

#### Added

- New MCP stdio runtime entrypoint (`dysflow mcp`) with protocol-aware initialize responses.
- Core command surface:
  - `dysflow_vba_execute`
  - `dysflow_query_execute`
  - `dysflow_doctor`
  - `dysflow_access_operations_list`
  - `dysflow_access_cleanup`
- Legacy compatibility MCP tools for query/VBA/form/schema slices.
- MCP protocol maintenance instrumentation:
  - named protocol constant `MCP_PROTOCOL_VERSION`
  - documented maintenance workflow for protocol changes
  - test coverage for JSON-RPC `id: null` behavior
- Strict write safety in legacy paths (`apply`, `dryRun`, guarded write request mapping).
- Deterministic timeout ownership in legacy VBA sync path via `AbortSignal` cancellation.

#### Changed

- Centralized legacy MCP metadata (`status`, `slice`, `queryMode`) in `legacy-parity-registry`.
- MCP/HTTP/CLI command behavior aligned to a core-first, adapter-translation model.

#### Fixed / Hardened

- Unsafe cleanup behavior prevented unless operation ownership checks pass.
- Redaction and handling consistency for errors that include credentials/passwords.
- MCP protocol drift risks reduced by explicit version declaration and docs/tests.

#### Documentation

- Reworked README into production-oriented documentation.
- Added protocol maintenance guide: `docs/testing/mcp-protocol-maintenance.md`.
- Added HTTP API reference: `docs/api/http-api.md`.
- Added E2E MCP reference: `docs/testing/mcp-access-e2e.md`.
