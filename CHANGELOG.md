# Changelog

## [v2.20.1] - 2026-07-21

### Fixed

- fix(form-bind): `import_modules` and `form_set_property` preserve ComboBox/ListBox control properties, verify newly-added properties after the guarded import, and annotate source/binary control-property mismatches in `verify_code` (#1053).

## [v2.21.0] - 2026-07-21

### Fixed

- fix(dysflow-vba-manager): Auto-mode `import_modules` with full-form source (`.cls` + `.form.txt` together) no longer silently renames the legacy `Form_<base>` form to `Form_TempSccObjN`; fail-closed with the new typed error code `FORM_VBNAME_PREFIX_MISMATCH` whenever the binary already has a legacy prefixed form and the sibling `.cls` declares `Attribute VB_Name` without the `Form_`/`Report_` prefix (#1040). Regression of #1020 round-3 — the round-3 fix only covered the `.cls`-only / `.form.txt`-only paths; the Auto path with both files together was unfixed because `LoadFromText` runs before `AddFromFile` and the pre-existing form was renamed without a subsequent re-bind. Consumer can resolve by renaming the source files to use the prefixed form name (`Form_<base>`) or deleting the legacy prefixed form from the binary before retrying.
- fix(dysflow-vba-manager): per-module postcondition on the import path — the typed-error envelope `error.code` now carries `FORM_VBNAME_PREFIX_MISMATCH` (mapped in `Invoke-ImportAction`'s catch block, mirroring the `VB_NAME_MISMATCH` / `FORM_NAME_RESOLUTION_FAILED` / `FORM_SOURCE_MALFORMED` pattern from #752 / #951 / #958). No more silent `status:"ok"` returns when the binary was left in an invalid state.
- fix(dysflow-vba-manager): rollback path for the Auto mode of `Import-VbaModule` — when `LoadFromText` throws after the prefix-mismatch scenario is rejected, the typed exception propagates to the dispatcher's catch block; no partial mutation is committed to the binary. Pairs with the existing try/catch envelope in `Invoke-ImportAction`.
- test: cover the Auto path of #1020 with the full-form (`.cls` + `.form.txt`) shape — `Import-DocumentCodeBehind` continues to pass the resolved `Form_<base>` component name to `Ensure-VbNameAttributeAtTop` (no regression of #1020 round-3 contract). 5 new Pester tests in `scripts/tests/dysflow-vba-manager.Tests.ps1`'s `Import-VbaModule — FORM_VBNAME_PREFIX_MISMATCH guard (issue #1040)` Describe block.
- fix(mcp): propagate `capabilities.writeExecutionPolicy` from the resolved startup project config into `get_capabilities`, keeping its advertised `effectiveDryRunDefault` map aligned with dispatch behavior (#1037)
- fix(run-vba): normalize Windows paths before alias comparison; equivalent aliases no longer false-fail; true conflicts return structured envelope (#1044). The frontend Access alias set (`accessPath` / `accessDbPath` / `databasePath` / `sourcePath`) was extended with `backendPath`, which silently grouped the data backend into the same equivalence class as the frontend file. A legitimate `run_vba` call that names both `accessPath` and `backendPath` (e.g. to verify context against both) was rejected as `Conflicting Access target aliases were supplied.` even when both resolved to their respective configured files. `backendPath` is no longer in the frontend alias set; it is validated separately against the configured `backendPath` (mismatch still fails closed with `OUTSIDE_PROJECT_ROOT` so the `allowExternalAccessPath` opt-in cannot be bypassed via a request-time override). The alias-conflict envelope now carries the typed code `CONFLICTING_TARGET_ALIASES` instead of the legacy `PROJECT_CONFIG_NOT_WRITE_READY` fallback; the legacy substring remains in `error.message` for backward compat (#962 contract). Distinct gap from #962 (5 write-readiness causes), #970 (structured remediation), and #1037 (writeExecutionPolicy propagation).
- fix(run-vba): verify procedure existence before launching runner; surface typed `PROCEDURE_NOT_FOUND` for verified absence; preserve UTF-8 (no mojibake) end-to-end — adds a service-level preflight in `AccessVbaService.execute` that resolves the project's VBA source modules via the new `VbaSourceResolver` port (Node adapter: `src/adapters/services/node-vba-source-resolver.ts`) and returns `PROCEDURE_NOT_FOUND` with `details.procedure` / `details.moduleName` / `details.scannedModules` whenever the requested procedure is absent from every `.bas`/`.cls` in `modules/`, `classes/`, `forms/`, or `reports/`. The PowerShell runner is no longer spawned for verified absence, so genuine `RUNNER_FAILED` failures retain their taxonomy and diagnostics. Dry-run (`dryRun: true`) skips the preflight so plan-mode continues to honour the PR1a escape hatch. PowerShell-side mojibake (`Excepci�n al llamar a "Run"...`) is fixed by `Set-ScriptOutputEncodingUtf8` (mirrors the existing helper in `dysflow-vba-manager.ps1` from #585) — `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` is now set at the top of `scripts/dysflow-access-runner.ps1` so non-ASCII bytes round-trip through Node.js child-process stdout intact. No regression of #1040 (`FORM_VBNAME_PREFIX_MISMATCH`), #703 (`validate_manifest`), #496 (result serialization), #749 (`dryRun` open failure), #1014/#1031 (`apply:true` flag parity), #1037 (`writeExecutionPolicy`). (#1045)
- fix(test-vba): `test_vba` registry ↔ schema ↔ docs ↔ gate coherence drift across four axes (#1046). (a) `COMMIT_FLAG_REGISTRY.test_vba` now advertises `commitFlag: "dryRun"` + `defaultBehavior: "plan"` instead of the legacy `apply` + `noop` (which contradicted the schema — `apply` is not declared and the runtime rejects `apply:true` with `MCP_INPUT_INVALID`, and the commit path is `dryRun:false`). (b) `VbaExecutionAdapter.executeTestVba` short-circuits on `dryRun:true` BEFORE the allowlist gate so plan-only callers get a plan-shaped success (the docs at `dysflow-usage/assets/examples/test-vba.md` promise this and the runtime now honors it); the gate still fires on the commit path. Two pre-existing tests (`vba-execution-adapter.test.ts:1520` PR1b refusal test, `wire-write-execution-policy-783.test.ts:769` AC9 escape-hatch test) inverted from "gate fires on dryRun:true" to "gate fires only on the commit path". (c) Runtime `test_vba` gate code is the canonical `PROCEDURE_NOT_ALLOWED` (no `MCP_` prefix) — `references/error-codes.md` and `verify-examples-vs-runtime.ps1` filter re-synced to match; the canonical-handler gate for `run_vba` keeps emitting `MCP_PROCEDURE_NOT_ALLOWED` (separate path, kept on the canonical list). (d) `validate_manifest` accepts a new opt-in flag `validateManifestIncludesAllowlistCheck: true` that surfaces allowlist drift on a parallel `invalid[]` channel with `reason: "allowlist_miss"`; the legacy JSON-shape-only report is byte-identical when the flag is absent. Five new RED tests in `test/adapters/vba-sync/vba-test-vba-coherence-1046.test.ts` pin the four axes plus the cross-coherence net; cross-regression for #1037 / #1040 / #1014 / #1031 / #659 / #613 / #703 stays green.

## [v2.20.0] - 2026-07-20

### Added

- feat(mcp-schemas): `apply:true` flag parity for `import_modules` + `delete_module` — write-class tools previously rejected the canonical commit flag with `MCP_INPUT_INVALID: apply is not allowed` despite their description promising it. Adds `SCHEMA_PROPS.apply` to both schema entries and pins a saturation test (`apply-flag-write-tools-saturation.test.ts`) that catches future regressions where a vba-sync tool drops its `apply` declaration. Dispatcher already normalizes via `resolveIsDryRun`; no dispatcher change (#1014)
- feat(mcp-schemas): same `apply:true` parity for 8 sibling write-class tools that exhibited the same drift — `fix_encoding`, `import_all`, `run_vba`, `vba_inline_execution` (vba-sync family) and `relink_tables`, `unlink_table`, `import_queries`, `localize_backend_links` (query-maintenance family). Mirror of the #1014 fix, restoring full parity with the cross-tool contract pinned in #977 (#1031, follow-up to #1014)
- feat(services): `find_references` accepts optional `limit` (1..1000, default 500) and `offset` (>=0, default 0) and reports `truncated` + `nextOffset` on every response — avoids MCP `-32001` timeouts on popular symbols on large benches without breaking backward compatibility for existing callers. Pagination does NOT solve the underlying scan bottleneck; if benchmarks later prove the scan itself exceeds the 30s mark, async streaming or a `jobId` pattern is needed as a follow-up. Path 1/4 left as separate follow-up issues if the surface demands (#1019)
- feat(mcp-schemas): ship runtime shape for `apply_form_design_plan.plan` — replaces the opaque `{type:"object", description:""}` entry with the real discriminator + per-property description shape that mirrors what `form_set_property` documents. Includes a focused test pin covering `add-control`, `delete-control`, `move-control`, `note`, `rename-control`, `set-property` (the six operation kinds the runtime's `dispatchOperation` accepts). Note that `dysflow`'s `JsonSchemaProperty` does NOT carry `oneOf`/`anyOf`/`allOf` — the hybrid "enum discriminator + per-property description" idiom is the only available contract expression, mirroring the vba-sync family convention from #757 (#1022)
- feat(mcp-schemas): publish non-opaque nested schemas for `generate_form_design_plan`, `copy_form_ui_pattern`, `verify_form_ui` — same hybrid strategy from #1022 applied to three sister form-ui tools. The TODO-scaffold example files in `dysflow-usage/assets/examples/` for these three remain out of repo scope and belong to a future round in the `DysTelefonica/team-skills` monorepo. Sub-agent caught and corrected an issue-body contract mismatch: `verify_form_ui` does NOT accept the claimed `checks[]` field — the runtime's real contract (`sourceContract` / `appliedContract`) was documented instead of inventing a second shape (#1033)

### Fixed

- fix(vba-sync): keep MSACCESS handles released on the failure path of binary-mutating tools — `form_set_properties` (plural) and `cleanup_access_operation` previously left orphaned `MSACCESS.EXE` processes (4 PIDs unkillable via MCP) when the failure was not a timeout. Adds a part-A "reap on non-timeout failure" path in `vba-sync-adapter.ts`, a part-B `CLEANUP_KILL_UNVERIFIED` after post-kill re-inspection in `access-operation-cleanup.ts`, and a part-C relaxation of the orphan-cleanup command-line gate to accept `-Embedding` / `/automation` COM child markers in `access-orphan-cleanup.ts`. Pre-existing `try { ... } catch { /* ignore */ }` envelopes keep all paths best-effort. The single-write/single-import atomic gate from #951 remains intact (#1016, lifecycle regression)
- fix(codegraph-vba): resolve Windows `ENOENT` spawn for `map_form_behavior autoFetchCodeGraph` — the invoker now resolves the `codegraph-vba` binary through a multi-extension fallback (`.cmd` → `.bat` → `.ps1` → `.exe`) instead of hard-coding one extension. Existing refusal paths preserved when the resolved binary is non-empty and not a COM child marker. The `codegraph-vba` runtime's behaviour on `--json` argparse remains out of scope (tracked in `ardelperal/codegraph-vba#200`) (#1015)
- fix(dysflow-vba-manager): preserve `Form_` / `Report_` prefix on `Attribute VB_Name` when the inbound `ModuleName` lacks the prefix — round-3 of an intermittent regression. Single-line surgical change: `Import-DocumentCodeBehind` now passes the resolved `$componentName` (which carries the prefix) to `Ensure-VbNameAttributeAtTop` instead of the basename `$ModuleName`. Two latent BeforeEach infrastructure bugs surfaced (broken scriptblock wrapper for the helper, and `function script:` scope shadowing) and were repaired in the same commit because the round-3 RED tests could not pass without them; the production behaviour change is strictly the one-line fix (#1020)
- fix(services): `find_references` populates `binaryReferences` from the binary walker — previously returned `binaryReferences: []` and `hasDifferences: true` for symbols whose callers were clearly in the binary (verified by `list_vba_modules`), producing phantom drift reports that wasted consumer tokens on re-import cycles. Adds a transient export materialized with `apply:true` and reports structured `BINARY_INSPECTION_UNAVAILABLE` on export failure. This is strictly local to the binary walker; the timeout symptom in the companion #1019 is a separate fix (#1018)
- fix(core/config): do not bind `contextId` as `projectId` in `ProjectConfigRequest` — six shared config/targeting seams explicitly used `projectId ?? contextId`, which promoted request-trace metadata to project identity when `projectId` was omitted (regression). All six fallbacks removed across `src/adapters/mcp/stdio.ts`, `src/core/config/dysflow-config.ts`, and `src/core/config/execution-target.ts`. Strict-equality test pins updated. The seam-by-seam `??` fallback pattern was a footgun; flag if it appears in similar contexts elsewhere (#1021)
- fix(form-duplicate): `form_duplicate_control` always regenerates the cloned control's `GUID` block (Route A — deterministic 32 hex chars matching the `create_form_from_template` precedent from #600) — previously cloned the source `GUID = Begin <hex> End` verbatim, contradicting the strip-on-clone policy. Preserves every other field byte-for-byte: `Type`, `Left`/`Top`/`Width`/`Height`, `FontSize`/`FontWeight`/`ForeColor`/`FontName`, `Caption`, `Picture`, `ControlTipText`, `OnClick` (`"[Event Procedure]"`), `TabIndex`, `TabStop`, and the full `ImageData` bytes. The shared `cloneFormFromTemplate` core now also strips the form-level GUID when `create_form_from_template` runs, restoring the #600 continuity that the original `#872` implementation partially missed. Atomic `#951` gate remains intact (#1032, ref `#600`/`#872`)

### Notes

- The full `C:\Proyectos\dysflow\E2E_testing` battery was not re-run for this release (per maintainer waiver, last full-battery pass is still valid for the new surface). Per-issue focused E2E coverage was authored inside each merged PR (see PR descriptions) where the shipped observable behaviour warranted it; per-skill, the full battery runs once at release time and the round-3 waiver continues to apply.
- Two dysflow-schemas sub-agent discoveries worth noting for future rounds: (a) the `JsonSchemaProperty` validator at `src/shared/validation/validator.ts` does NOT support `oneOf` / `anyOf` / `allOf` — only primitives, enum, and nested objects — so any polymorphic-union contract must be expressed as `enum` discriminator + per-property description table; (b) the saturation regression net introduced in PR #1030 (extended in PR #1034) catches every vba-sync tool that drops its `apply` declaration as a future regression, complementing the per-tool unit tests.
- Round-3 drained 11 issues via 11 squash-merged PRs (#1023, #1024, #1025, #1026, #1027, #1028, #1029, #1030, #1034, #1035, #1036). All branches merged into `main` (`@15fc3b40`) with `Quality gates` + `Windows PowerShell/Access smoke` CI green.
- Disk-hygiene sweep ran at every merge and at session end per the autonomous-issue-release-loop hard rule. Five physical worktree directories remain on disk for branches that were force-removed from the git registry; each contains a `.codegraph-vba/codegraph.db-wal` file held open by the active codegraph-vba MCP process (Windows denies `Rename-Item` while the file handle is open). Once the MCP releases the handles, those directories can be reaped with `Remove-Item -Recurse -Force`; the git registry is clean and rebase / cherry-pick against `main` is unaffected.

## [v2.19.1] - 2026-07-20

### Fixed

- fix(runner): `test_vba` runner now executes against a fresh snapshot of the configured `.accdb` taken at the moment the test run is prepared (`Get-TestSandboxPath` byte-exact copy under the OS temp tree, cleaned up by `Remove-TestSandbox` in the `finally` block). Previously the runner opened the source binary directly, which could surface stale compiled-bytecode or in-memory helper state and let the consumer observe helper output that did not match what `vba_inline_execution` produced against the same binary (#1013)

### Notes

- The full `C:\Proyectos\dysflow\E2E_testing` battery was not re-run for this release (per maintainer waiver, last full-battery pass is still valid for the new surface); a focused regression E2E for #1013 was authored in `E2E_testing/mcp-e2e-issue-1013-test-vba-sandbox-sync.mjs` and a focused RED→GREEN Pester suite in `scripts/tests/dysflow-vba-manager-issue1013.Tests.ps1`.

## [v2.19.0] - 2026-07-20

### Added

- feat(vba-lint): cross-form `DoCmd.OpenForm` producer / `Me.OpenArgs` consumer contract mismatch detection — new `openargs-contract-mismatch` rule exposed via the existing `lint_module` MCP tool. Pure-function project-lint engine (`src/core/services/vba-project-openargs-lint-service.ts`) joins producer (extracted from `DoCmd.OpenForm` OpenArgs literal, supporting both paren-form and statement-form invocations plus intra-module assignment tracing for bare-identifier OpenArgs) with consumer (extracted from `Me.OpenArgs` parser branches: `InStr`, `Split`, fallback assignments). Emits `code: "OPENARGS_CONTRACT_MISMATCH"` with both producer and consumer paths/lines, conflicting grammar, and silent-fallback risk flag (#1006)

### Fixed

- fix(vba-sync): preserve `WithEvents` member-level `Attribute <var>.VB_VarHelpID = -1` lines through the import path by short-circuiting the AddFromString F16 fallback when source contains `WithEvents` declarations; AddFromFile carries the import and, if it also truncates, the post-import check surfaces `IMPORT_TRUNCATED` instead of silent VBE-level attr stripping (#1007)
- fix(vba-sync): avoid false `IMPORT_TRUNCATED` for `WithEvents` member-level attributes — `Convert-VbaTextForCodeModuleString` now strips member-level metadata so the post-import truncation guard compares apples to apples and the `WithEvents` re-import path returns `status:"ok"` with all member-level attrs preserved on re-export (#1010, follow-up to #1007/#1008)

### Notes

- The full `C:\Proyectos\dysflow\E2E_testing` battery was not re-run for this release (per maintainer waiver, last full-battery pass is still valid for the new surface); a focused regression E2E for #1007 was authored in `E2E_testing/mcp-e2e-issue-1007-withevents-import.mjs` and shipped in the v2.18.1 commit (#1011).

## [v2.18.1] - 2026-07-20

### Fixed

- fix(vba-sync): avoid false IMPORT_TRUNCATED for WithEvents member-level `Attribute <var>.VB_VarHelpID` lines — `Convert-VbaTextForCodeModuleString` now strips member-level metadata (matching what VBE strips from `CodeModule.AddFromString`), so the post-import truncation guard compares apples to apples and the WithEvents re-import path returns `status:"ok"` (#1010, follow-up to #1007/#1008)


## [v2.18.0] - 2026-07-20

### Fixed

- fix(vba-sync): preserve WithEvents member-level `Attribute <var>.VB_VarHelpID = -1` lines through the import path by short-circuiting the AddFromString F16 fallback when source contains `WithEvents` declarations; AddFromFile carries the import and, if it also truncates, the existing post-import check surfaces `IMPORT_TRUNCATED` instead of silent VBE-level attr stripping (#1007)


## [v2.17.1] - 2026-07-19

- chore(quality): apply review round 2 fixes (#1005)


## [v2.17.0] - 2026-07-19

- feat(codegraph-drift): auto-rewrite stale supplement runtime refs (#961) (#1004) - docs(harness): embed canonical dysflow arn├®s v0.1.4 in project AGENTS.md - docs(testing): update MCP e2e spec to also reject C:\Proyectos\skills path leak


## [v2.16.0] - 2026-07-19

### Fixed

- fix(e2e): use mcp-e2e sandbox for per-issue scripts; sandbox isolation proven against the stale repo-root F16 config that triggered the original failure (#1001, closes #1003)
- fix(vba-sync): chunk-recursion guard for verify_code — `compareSourceAgainstBinary` no longer re-enters itself through `chunkSize` / `parallelChunks` / `onChunkTimeout` (chunk-control strip before single-flight comparison, 14 new regression assertions, #1001)
- fix(e2e): tolerate null `failure.detail` in the mcp-e2e failure-detail printer; previous code crashed with `TypeError: Cannot read properties of undefined (reading 'slice')` on 807 / 869 (#1001)

### Docs

- docs(review): voluntary post-merge review for PR #1003 (#1001) — focused `review-reliability` lens over the chunk-recursion fix, runnable post-merge by anyone who wants to close the audit gap left by the explicit review-gate bypass (see `docs/post-merge-review-1001.md`)

### Notes

- Explicit review-gate bypass: PR #1003 was merged with an explicit operator authorization bypassing the bounded-review receipt gate. The native `gentle-ai review start` refused the diff because two historical compact-v2 recovery edges in `.git/gentle-ai/review-transactions/v2/` carry both anomalies simultaneously (escalated disposition + free-form recovery binding); `gentle-ai 2.1.8` `reconcile-authority` supports each anomaly individually but refuses the combined class. Upstream fix `Gentleman-Programming/gentle-ai#1465` is open and mergeable, not yet released. No `--force` was used (none exists on `review *`); no `.git/gentle-ai/*` was hand-edited (forbidden by contract); no upstream release was bypassed. The diff passed `pnpm lint`, full unit / integration (93 + 14 new assertions), the public test suite (#979), and the `Quality gates` + `Windows PowerShell/Access smoke` CI jobs. Audit trail: PR #1003 body, issue #1001 closure comment, commit `e9b06453`, and Engram observation `20827` (topic `dysflow/issue-1001/bypass`, literal operator authorization text).
- Issue #961 (`dysflow-codegraph-update` ARN chain user-supplement drift) remains OPEN by design — the canonical fix lives in `DysTelefonica/workflow` (archived 2026-07-18). In-repo mitigation shipped: PR #999 (`b56de4af`, supplement drift detector). Closes when the upstream repo is unarchived and the ARN extension lands.
- The full `C:\Proyectos\dysflow\E2E_testing` battery was executed once at release time per the `autonomous-issue-release-loop` hard rule.

## [v2.15.0] - 2026-07-18

- chore(changelog): fold Unreleased into the upcoming release section - fix(forms): close form/report before SaveAsText (#957) (#960) - fix(forms): self-heal legacy .form.txt metadata and fail closed on structural damage before LoadFromText (#959, closes #958)


## [v2.14.2] - 2026-07-17

### Fixed

- fix(release): stamp the packaged runtime version from the immutable release tag and reject malformed tags (#946, closes #945)
- fix(mcp): resolve the diagnostics documentation bundle from the packaged runtime when long-lived clients retain a stale `DYSFLOW_HOME` (#947, closes #944)
- fix(release): make the diagnostics bundle quality gate deterministic on Windows while retaining real archive inspection on non-Windows runners (#949, closes #948)
- fix(vba-sync): preserve resolved Access object and VBA component identities when exporting forms or reports with anomalous module names (#953, closes #952)
- fix(vba-sync): treat structured per-module import failures as failed operations and roll back guarded form source writes atomically (#954, closes #951)

## [v2.14.1] - 2026-07-17

### Fixed

- fix(form): pre-validate property name and value type in `form_set_property` (#942, closes #941)
- fix(install): ship `references/error-codes.md`, `docs/diagnostics/hresult-guide.md`, and `docs/diagnostics/form-import-gate-failures.md` in the actual install, and expose a `documentationBundle` field on `get_capabilities` so consumers can detect missing diagnostics up-front (#943, closes #940)

## [v2.14.0] - 2026-07-17

### Added

- feat(compact-repair): default to the frontend database while supporting explicit frontend/backend selection and documented path precedence (#909, closes #893)
- feat(errors): add canonical remediation and sanitized structured details to typed MCP/import errors, with bundled diagnostic references (#906, closes #900)

### Changed

- fix(forms): make `propertyName` canonical for `form_set_property` while retaining `property` as an alias (#905, closes #901)
- refactor(architecture): enforce AST and module-resolution boundaries (#908, closes #898)
- refactor(mcp): decompose read tools through #917-#921 and retire the barrel while preserving contracts and single snapshots (closes #897, #913, #914, #915, #916)

### Fixed

- fix(forms): preserve FormIR string encoding (#899, commit 76b02551)
- fix(forms): recognize the AutoResize root marker (#904, closes #902)
- fix(semantic-diff): preserve order beyond the LCS budget (#910, closes #894)
- fix(e2e): align the `list_linked_tables` release-harness payload with its tool contract (#928, closes #924)
- fix(e2e): run write-capable Access E2E in isolated Git-owned sandboxes and align Unicode JSON-RPC parsing (#929, closes #925)
- test(vba): preserve conservative `bothChanged` / `manual_merge` evidence in the real fixture (#930, closes #927)
- fix(test): accept the current single-module import envelope while preserving legacy envelopes (#931, closes #926)
- fix(e2e): make the release sandbox Git-owned and write-ready without weakening production diagnostics (#935, closes #933)
- fix(e2e): hash the canonical installed launcher and `app/dist` runtime without a `bin/dist` compatibility copy (#936, closes #934)
- fix(test): run the non-ASCII module import integration workspace inside an isolated Git worktree (#938, closes #937)

### Security

- security(dependencies): add dependency-audit states, retries, and policy enforcement (#912, closes #896)

### CI

- ci(release): guard release titles against tag-name drift (#911, closes #895)

## [v2.13.3] - 2026-07-16

- fix(forms): write form properties through the source-only mutation path (#889, closes #886)
- fix(forms): prevent partial property mutations by rolling back failed updates (#891, closes #887)
- docs(forms): document import-gate failure codes and recovery procedures (#890, closes #888)

## [v2.13.2] - 2026-07-15

- fix(forms): probe `.codegraph-vba/` before `.codegraph/` for `map_form_behavior` auto-fetch and expose `codegraphIndexPath` (#881)

## [v2.13.1] - 2026-07-15

- fix(query_sql): honor caller-supplied `target` and `accessPath`, and report the selected database in `resolvedAccessPath` (#882)

  `query_sql` now projects `accessPath` onto the runner's explicit `databasePath` and preserves semantic `target` overrides, preventing the configured backend from silently winning. Simple, single-table `SELECT` statements receive conservative `TABLE_NOT_IN_DATABASE` / `COLUMN_NOT_IN_TABLE` schema errors; complex SQL retains the ACE/Jet classification rather than guessing.

## [v2.13.0] - 2026-07-15

- fix(config): allow `destinationRoot` inside the recognized sibling worktree that owns the configured Access binary, while continuing to reject foreign worktrees and arbitrary external directories (#880)

## [v2.12.1] - 2026-07-15

- docs(changelog): document env-isolated harness risk dismissal in v2.12.0 (#879) - docs(changelog): regenerate v2.12.0 entry to match released commits


## [v2.12.0] - 2026-07-15

- fix(mcp): explicit role-based target contracts for DAO/query tools (#871)
- fix(vba-sync): forward password env for list_vba_modules (closes #869) (#874)
- fix(config): accept real sibling Git worktree as owning tree for accessPath (#873)
- merge: bring origin/main into fix/873-sibling-worktree-owning-tree (#875)
- test(e2e): fix W-C2 assertion fields in mcp-e2e-issue-869-list-vba-modules-password-env (#876)
- feat(mcp): wire 4 form tools to address issue #872 UX frictions (#877)
- Merge pull request #875 from DysTelefonica/fix/873-sibling-worktree-owning-tree
- test(vba-sync): assert no password leak in spawnVbaManager args (issue 869 followup W-C1) (#878)

### Verified concerns (resolved, no code change required)

- **Env-isolated harness risk** (raised in the round-9 verify-report followups, vicinity of W-C2/W-C1): the `dysflow` MCP's `spawnMcp()` in the new E2E spreads `{ ...process.env, ACCESS_VBA_PASSWORD, DYSFLOW_ACCESS_PASSWORD }` to the child subprocess. `buildChildEnv` (`src/adapters/powershell/default-executor.ts:81-92`) uses a hardcoded 15-key whitelist (`POWERSHELL_SYSTEM_ENV_KEYS`: `SystemRoot`, `windir`, `PATH`, `PATHEXT`, `TEMP`, `TMP`, `USERPROFILE`, `USERNAME`, `COMPUTERNAME`, `LOCALAPPDATA`, `APPDATA`, `HOMEDRIVE`, `HOMEPATH`, `HOME`, `USER`) that excludes `ACCESS_VBA_PASSWORD` and `DYSFLOW_ACCESS_PASSWORD`. The `...process.env` spread is therefore functionally inconsequential — the password does not reach the child PowerShell via that path. Investigation and dismissal lives in PR #876's `explore.md` Q1-Q4.

## [v2.11.2] - 2026-07-15

Patch release fixing the v2.11.1 regression where `list_vba_modules` returned
`VBA_MANAGER_FAILED: No es una contraseña válida` against password-protected
Access projects (#869). The PowerShell child process never received
`$env:ACCESS_VBA_PASSWORD` because `list_vba_modules` is the only raw-executor
caller of `spawnVbaManager` that passes `password` without `env`; the sibling
tools (`list_objects`, `verify_code`, `export_modules`, …) all go through
`executeMappedTool` and attach the env explicitly.

### Fixed

- **vba-sync: forward `ACCESS_VBA_PASSWORD` / `DYSFLOW_ACCESS_PASSWORD` to the
  child PowerShell process when the raw-executor caller omits `env`
  (`src/adapters/vba-sync/vba-sync-adapter.ts:1355-1427`).** When
  `request.password !== undefined && request.env === undefined`,
  `spawnVbaManager` now derives the child env exactly the way
  `executeMappedTool` already does for mapped tools
  (`vba-sync-adapter.ts:592-595`), so the PS fallback at
  `scripts/dysflow-vba-manager.ps1:259` resolves `$env:ACCESS_VBA_PASSWORD` and
  `Open-AccessDatabase` accepts the protected binary. Explicit caller `env` is
  forwarded verbatim — the derivation rule does NOT merge on top and does NOT
  add a synthetic key. The contract is pinned by
  `test/adapters/vba-sync/spawn-vba-manager-command-line.test.ts` (Cases A / B / C)
  and the new E2E
  `E2E_testing/mcp-e2e-issue-869-list-vba-modules-password-env.mjs`
  (Round 1: `R1.password_env_forwarded_no_VBA_MANAGER_FAILED`; Round 2:
  `R2.round8_list_objects_still_works` non-regression).

### Deferred hardening

- **Variant 2 (add `-Password <value>` to the PowerShell args vector) is
  explicitly rejected** in `openspec/changes/r9-list-vba-modules-password-env/proposal.md`.
  Putting the password on the process command line would leak via `ps` /
  Process Monitor, require per-cmdlet `PSAvoidUsingPlainTextForPassword`
  suppression, and offers no marginal benefit over the env-fallback path.
  If a future threat model demands command-line isolation, the rejected
  variant 2 in the proposal is the hardening reference; the round-9 env
  derivation is the floor.

### Documentation

- New `docs/tools/list-vba-modules.md` documents the ownership chain
  (`VbaModulesAdapter.execute` → `runListVbaModules` → raw `spawnVbaManager`),
  the password-resolution contract, the shared dispatch surface (mapped
  tools via `executeMappedTool`, `verify_code` via
  `vba-source-comparison.ts:328-331`, and `list_vba_modules` via the new
  derivation rule), and the known limitations around the rejected
  `-Password` variant.

## [v2.11.1] - 2026-07-14

- Merge pull request #868 from DysTelefonica/fix/811-e2e-harness-full - fix(e2e): restore Claude's FormCPV-derived harness + apply-mode + inspect_form fix - Merge pull request #867 from DysTelefonica/fix/e2e-harness-fixture-count - fix(e2e): self-contained Form_DysflowMcpE2E fixture + count=5


## [v2.11.0] - 2026-07-14

- **feat(tools): add `lint_missing_callees` -- missing-callees detector for VBA callee resolution (#862).**
  The new `dysflow lint callees [source-root] [--json]` command scans `.bas` and `.cls` sources,
  reports actionable `src/path:LINE:COL  missing callee: Module.Name (kind)` diagnostics, supports
  consumer exclusions through `DYSFLOW_LINT_EXTRAS`, and honors `' dysflow:lint-ignore-line`.

### Project config runtime contract (#863)

- Added per-call `get_capabilities.projectConfig` diagnosis with normalized paths, typed status, write readiness, diagnostics, and exact remediation.
- Write-class MCP dispatch now fails closed with `PROJECT_CONFIG_NOT_WRITE_READY` before service, Access, or PowerShell execution, including explicit path overrides and dry-run requests.
- Config discovery and ownership are bounded to the active Git worktree with Windows-safe path identity; cross-worktree targets and ambiguous legacy config files are rejected.
- Added non-mutating `doctor --cwd` diagnosis and explicit `setup --cwd --apply` bootstrap. There is intentionally no unconfigured-target escape hatch.

## [v2.10.1] - 2026-07-14

Patch release fixing three v2.10.0 regressions surfaced by a consumer smoke session (#861).

- **Bulk-read no longer aborts on a VBA-project password (#861).** The AutoExec/StartupForm
  safety gate opened the database via DAO `OpenDatabase(...;PWD=)`, which expects a *database*
  password. `ACCESS_VBA_PASSWORD` is a VBA-*project* password, so on a DB with no database-level
  password DAO threw `No es una contraseña válida` and the gate aborted every tool that enumerates
  through `OpenDatabase` (`list_vba_modules`, `list_objects`, exports…). The maintenance opens now
  try the password first and transparently fall back to opening without one (new
  `Open-DaoDatabaseForMaintenance` seam), so the gate still disables startup code AND bulk-read
  succeeds. The gate remains active (it is not skipped); only the DAO open was hardened.
- **`import_modules` returns one consistent envelope (#861).** A best-effort post-import
  `Save-VbaProjectModules` could throw *after* every module already imported at `status:"ok"`
  (its per-module fallback wrongly targeted form/report document modules), making the script exit
  non-zero. The TS adapter then wrapped a fully-successful import in a misleading
  `VBA_MANAGER_FAILED exit code 1` envelope. Now a non-zero exit with an all-`ok` structured result
  is reported as success (same `{result, operation, willModifyAccess}` shape as a clean import), and
  the post-import save failure degrades to a warning instead of failing the run. Genuine per-module
  failures still surface as typed error envelopes.
- **Zombie MSACCESS cleanup no longer needs a caller-supplied PID (#861).**
  `access_force_cleanup_orphaned` (no `confirmPid`) enumerated only MSACCESS instances whose command
  line carried the `.accdb` path — which dysflow-spawned COM-automation instances never do. Failed
  operations that leave a live MSACCESS holding the lock are now enumerated from dysflow's own
  registry records (terminal status + matching project/accessPath), and `confirmPid` cleanup accepts
  that same registry proof of ownership (with a PID-recycle start-time guard) so those zombies can be
  retired without knowing the exact command line.
- Regression tests added at the ports: `Disable-StartupFeatures` password fallback (Pester),
  `import_modules_envelope_consistent_on_success` (vitest), and
  `orphan_cleanup_enumerates_dysflow_spawned_zombies` (vitest).

## [v2.10.0] - 2026-07-14

- Merge pull request #860 from DysTelefonica/feat/858-resumable-e2e - fix(e2e): harden resumable sandbox recovery (#858) - fix(e2e): preserve resumable suite quality gates (#858) - feat(e2e): resume MCP battery from safe checkpoints (#858) - Merge pull request #859 from DysTelefonica/fix/857-complete-form-controls - fix(e2e): complete synthetic form behavior controls (#857) - Merge pull request #856 from DysTelefonica/fix/850-inline-execution-contract - fix(vba): clarify inline result and cleanup contract (#850) - Merge pull request #855 from DysTelefonica/fix/851-link-tables-create-missing - feat(link_tables): create missing linked TableDefs in the runner (#851) - feat(link_tables): add opt-in create-or-relink API surface (#851) - fix(vba-sync): preserve form .cls linkage on form re-import (#849) (#854) - Merge pull request #853 from DysTelefonica/fix/852-non-canonical-form-name-resolver - fix(delete_module): delete non-canonical form document modules via DoCmd.DeleteObject (#852) - fix(forms): make Form_/Report_ source-path resolution idempotent (#852)


## [v2.9.3] - 2026-07-13

- Merge pull request #848 from DysTelefonica/fix/847-query-maintenance-developer-mode-dryrun - fix(dispatch): forward normalizedInput in query-maintenance branch (#847)
- **vba_inline_execution (#850):** Document the explicit `result = "OK"` return contract (`data.returnValue`), reject trailing bare string literals before any import with caller-relative remediation, and surface temporary-module/file cleanup failures without hiding the primary execution error.


## [v2.9.2] - 2026-07-13

- Merge pull request #846 from DysTelefonica/fix/dysflow-config-snapshot-drift - fix(test): isolate 3 dysflow-config tests from repo's project.json


## [v2.9.1] - 2026-07-13

- Merge pull request #845 from DysTelefonica/fix/stale-laccdb-should-not-block-import - docs(open-spec): add #844 SDD artifacts (proposal, design, tasks, explore, verify, pr-body) - fix(import): stale .laccdb no longer blocks import when no live process holds the binary (#844)


## [v2.9.0] - 2026-07-12

- Merge pull request #843 from DysTelefonica/feat/783-wire-write-execution-policy - feat(mcp): wire write-execution-policy through dispatch + add export-source guard (#783) - Merge pull request #842 from DysTelefonica/feat/757-unify-commit-flags - feat(mcp): unify write-side commit flags + enrich error envelopes (#757)


## [v2.8.0] - 2026-07-12

- Merge pull request #841 from DysTelefonica/feat/809-sync-binary-workflow - feat(vba-sync): sync_binary workflow tool - verify -> plan -> import/export -> re-verify (#809) - fix(forms): keep apply mode label out of the pure plan core (#840)


## [v2.7.0] - 2026-07-12

- Merge pull request #839 from DysTelefonica/feat/818-verify-form-bindings - feat(forms): verify_form_bindings ÔÇö validate ControlSource/RowSource against schema (#818) - Merge pull request #838 from DysTelefonica/feat/817-diff-form-preview - feat(forms): diff_form_preview - before/after visual diff (#817) - Merge pull request #837 from DysTelefonica/feat/816-align-distribute-controls - feat(forms): form_align_controls + form_distribute_controls ÔÇö batch geometry ergonomics - Merge pull request #836 from DysTelefonica/feat/815-analyze-form-layout - feat(forms): analyze_form_layout - geometry lint (overlap, alignment, tab-order) - Merge pull request #835 from DysTelefonica/feat/814-render-form-preview - feat(forms): render_form_preview ÔÇö geometric SVG/ASCII render from FormIR twips (#814) - Merge pull request #834 from DysTelefonica/feat/831-extend-verify-form-ui - feat(verify): extend verify_form_ui with geometry/tab-order/property checks (#831) - Merge pull request #833 from DysTelefonica/feat/830-internal-codegraph-invoker - feat(forms): internal codegraph-vba invoker for map_form_behavior (#830) - Merge pull request #832 from DysTelefonica/refactor/829-derived-applied-contract - refactor(forms): derive appliedContract from mutated FormIR - Merge pull request #828 from DysTelefonica/docs/819-skill-alignment - docs(skills): align access-form-ui-builder with v2.6.0 + Phase 6 apply semantics


## [v2.6.0] - 2026-07-11

- Merge pull request #827 from DysTelefonica/feat/813-phase6-atomic-exposure - feat(813): atomic MCP exposure for apply_form_design_plan family - Merge pull request #826 from DysTelefonica/feat/813-phase5-execution-internals - feat(813): execution internals for apply_form_design_plan (PR 5)


## [v2.5.4] - 2026-07-11

- Merge pull request #825 from DysTelefonica/feat/813-phase4-guarded-seam - style(vba-sync): apply biome lint to Phase 4.1 seam files - docs(sdd): mark Phase 4.1 task 4.1 complete in tasks.md - refactor(vba-sync): extract applyGuardedFormWrite seam (PR 4 / #813) - Merge pull request #824 from DysTelefonica/feat/813-apply-form-design-plan - feat(813): pure six-kind form UI planning + vocabulary reconciliation


## [v2.5.3] - 2026-07-10

Patch release. Closes the two-PR chain for #811 (`form-ui-execution-wiring`) Phase 1+2: ships the canonical SDD artifacts under `openspec/changes/form-ui-execution-wiring/` and the pure FormIR mutation primitives (`setProperty`, `deleteControl`) that downstream wiring (#813) will compose. All changes are backward-compatible (additive or behavior-preserving).

### Added

- **#811 PR 1 (docs, #822)**: OpenSpec artifacts preserved at `openspec/changes/form-ui-execution-wiring/` — `proposal.md`, `design.md`, `tasks.md`, `specs/ai-form-ui-builder/spec.md`. Captures the form UI execution wiring contract for downstream wiring (#813) and migration-ready documentation per `access-vba-capability-docs`.
- **#812 PR 2 (runtime, #823)**: pure FormIR mutation primitives in `src/core/services/form-ir-service.ts`.
  - `setProperty(ir, input)` — guarded upsert of a single property on a named control. Refuses protected keys (`Name`, `Format`, metadata block, blob blocks), missing controls, and blob/scalar collisions. Coerces booleans/numbers to canonical Access tokens (`NotDefault` / `0` / `String(value)`).
  - `deleteControl(ir, input)` — recursive fail-closed deletion that refuses when the target or any descendant is bound to a custom event procedure or has named child controls.
  - Both primitives preserve the ordered-array `FormIR` shape, leave `codeBehind` untouched, and run `assertMetadataPreserved` on the success path so `Checksum` / `Format` / `PrtDevMode` loss fails closed with `FORM_METADATA_LOSS`.
- **#811 PR 1 (docs, #822)**: input types `SetPropertyInput`, `DeleteControlInput` added to `src/core/models/form-ir.ts` for typed caller contracts.

### Tests

- **Vitest**: 2930 passed, 1 skipped, 1 todo (vs baseline 2920; +10 focused mutation cases — happy paths, refusals: missing control, protected key, blob collision, own/descendant event binding, named children; scalar coercion; `expectRefusalWithoutMutation` helper asserts both throw and no-mutation invariant).
- **CI**: both Quality gates (2m59s) and Windows PowerShell/Access smoke (1m35s) green on PR #823 against `main`. Reviewer verdict: PASS_WITH_NITS, recommendation commit-as-is.

## [v2.5.2] - 2026-07-10

Patch release. Closes the four-PR chain for #718 (`projectId Form Source Resolution`) and adds a cross-platform fix surfaced by PR 4 CI. All changes are backward-compatible (additive or behavior-preserving).

### Fixed

- **resolve-project-tool (#718)**: previously the tool read `parsed[SOURCE_ROOT_FIELD]` and returned `sourceRoot: null` whenever the project's `.dysflow/project.json` used the canonical `destinationRoot` key (default after the dysflow-config migration). It now reads `destinationRoot` first and falls back to legacy `sourceRoot` for configs that still use the old key. Output field name stays `sourceRoot` so the MCP response shape is unchanged.
- **vba-forms-clone-tools (#718, Group C)**: the projectRoot fallback (`resolveMutationPath(projectRoot, 'forms/{name}')`) now delegates to the pure resolver against `destinationRoot` instead. The bench-cache tier is untouched. Fixes a real split-project-layout miss where the source form lived under `destinationRoot/forms/` but the tool was looking under `projectRoot/forms/`.
- **vba-forms-lint-adapter (cross-platform)**: the raw-path fallback branch (no `projectId`) used `node:path.resolve` which prepends the platform-specific drive root to Windows-style path strings (`C:\` on Windows, `/c/` on Linux). The fallback's intent is "use the path as-given", so it's now `node:path.join`. On Windows the result is byte-identical to `resolve` for absolute Windows-style inputs; on Linux the test fixture (and any cross-platform caller) now sees a consistent path. Latent defect from PR 3 of the chain, exposed by PR 4 CI on ubuntu-latest.

### Added

- **#718 chain (PR 1–4)**: unified form on-disk source resolution behind a single pure resolver (`src/core/config/form-source-resolver.ts`). `projectId + formName`, `destinationRoot`, `sourcePath`, and aliases now resolve consistently across all form tools (`lint_form_code`, `inspect_form`, `compare_form`, `form_serialize`, `clone_form_from_template`, `resolve_project`). This is the foundation plumbing for the broader #811 Phase 2 AI-first Access form UI epic — the user-facing form UI tools (`analyze_form_ui`, `map_form_behavior`, `generate_form_design_plan`, `apply_form_design_plan`, `verify_form_ui`, `copy_form_ui_pattern`, `inspect_form`, `validate_form_spec`, `generate_form`, `harvest_form_catalog`, `catalog_add_control`) are already shipped and now have consistent path resolution underneath.
- **vba-sync-schemas**: `formName` / `name` (alias) on `inspect_form`; `formName` / `name` / `targetName` / `targetForm` (aliases) on `compare_form`. Closes the schema-vs-runtime gap from PR 3 — the runtime accepted these aliases since #810; the schema now declares them.
- **E2E harness** (`E2E_testing/mcp-e2e.mjs`): real `projectId` resolution test against the tracked fixture `E2E_testing/.dysflow/project.json` (`id: noconformidades-e2e`, `destinationRoot: "src"`) using an existing form (`FormCPV`). Test 1 asserts successful resolution end-to-end; Test 2 asserts the typed miss-remediation never contains the literal `[PATH]` substring. Idempotent — reuses the tracked fixture, never collateral-deletes it.

### Tests

- **Vitest**: 2920 passed, 1 skipped, 1 todo (vs baseline 2820; +100 across the chain — 60 in resolver, 40 across Groups A/B/C/E2E).
- **CI**: both Quality gates and Windows PowerShell/Access smoke green on PR 4 against `main`.

### Hard invariants preserved

- Conventional commits only, no AI co-author / attribution.
- **Human compiles** — no `compile_vba`, no `compile: true`. The runtime never compiles.
- **CodeGraph-first** — the resolver uses pure functions and explicit candidate ordering; no fs I/O during resolution.
- **Strict TDD** — every change RED-then-GREEN in `pnpm test` before commit.
- Backward compatibility: every public MCP tool response shape is unchanged. New fields are additive only.


## [v2.5.1] - 2026-07-10

- docs: align verify_code contract with v2.5.0


## [v2.5.0] - 2026-07-09

Minor release. `verify_code` in semantic mode is now consumer-ready: three additive fields let fleet consumers act directly on the response without post-processing. Round 5 of the fleet prompt series (the `expedientes` consumer, prompt `C:/00repos/codigo/00_EXPEDIENTES_staging/docs/prompts/prompt-ia-mantenedora-dysflow-round-2026-07-09-r5.md`) drove the shape. Backward-compatible: every existing field, key, and order is byte-identical. Strict mode is unaffected. **Note**: originally targeted v2.4.0; round 4 (#808) shipped first as v2.4.0, so this lands as v2.5.0 MINOR per SemVer (additive features on top of v2.4.0).

### Added

- **verify_code** (round 5): `summaryStructured` — nested companion to the flat `summary` with top-level counts (`matched`, `different`, `missingInSource`, `missingInBinary`) and `actionable.{sourceNewer, binaryNewer, bothChanged, total}` + `nonActionable.{caseOnly, whitespaceOnly, attributeOnly, formSerializationOnly, encodingOnly, total}`. Every `total` is sum-of-named-buckets. `different` is the count of semantic diffs (not including `missingIn*`).
- **verify_code** (round 5): per-entry `classification` and `reason` on every `nonActionableDifferent[*]` entry (and, for symmetry, on every `actionableDifferent[*]` entry). Same vocabulary already exposed on `diffs[*]`. Lets a consumer read the "why" without re-issuing `verify_code({ diff: true })`.
- **verify_code** (round 5): `bulkImportable` / `bulkImportableCount` and `bulkExportable` / `bulkExportableCount`. `bulkImportable = sourceNewer moduleNames ∪ missingInBinary moduleNames`; `bulkExportable = binaryNewer moduleNames ∪ missingInSource moduleNames`; `bothChanged` modules are EXCLUDED from both (they still need human review). Each list is pre-sorted lexicographically and deduped — direct drop-in for `import_modules({ moduleNames: bulkImportable })` and `export_modules({ moduleNames: bulkExportable })`, no client-side filter needed. Coexists with `recommendedAction: "manual_merge"`: a manual-merge call may still emit a non-empty `bulkImportable` for the unambiguous `sourceNewer` slice.

### Consumer

- `expedientes` (round 5): same fleet prompt series that produced rounds 1–4. The 244-module scan loop now reads `bulkImportable` directly and passes it to `import_modules`; the per-category counts come from `summaryStructured.nonActionable` instead of being computed by re-issuing `verify_code({ diff: true })` and grouping the response.

## [v2.4.0] - 2026-07-09

Minor release. Three additive features for the `expedientes` consumer's bulk-VBA workflows (issue #807). All three are backward compatible (defaults preserve the current behavior) and have no breaking surface changes.

### Added

- **list_vba_modules (new tool)**: enumerates the VBA project's components (standard modules, classes, forms, reports, document modules) with a binary↔source cross-reference. The runner walks `VBProject.VBComponents` ONCE and releases every component COM reference in `finally { FinalReleaseComObject }`. The TS service does the source-side walk (filesystem only) and assembles the `{modules[], summary}` payload. Read-only; the tool never mutates the binary or the source tree. Optional `typeFilter` (`standard` | `class` | `form` | `report` | `document`) and `namePattern` (glob) narrow the result. Summary: `{ total, inBinaryOnly, inSourceOnly, inBoth }`.
- **import_modules bulk-by-directory**: new additive schema properties — `sourceDir`, `recursive`, `filePattern`, `includeTests`, `includeForms`, `chunkSize`, `onChunkError`. When `sourceDir` is provided AND `moduleNames` is empty/omitted, the adapter walks the directory, applies the filters, and chunks the resolved names by `chunkSize` (default 10). Each chunk goes through the existing `import_modules` path; the cross-referenced plan is built once TS-side. `dryRun` (default `true`) returns the plan without writing; `apply: true` commits chunk-by-chunk. `onChunkError: continue` (default) records per-chunk failures; `onChunkError: abort` stops after the first failed chunk. Backward compatibility: when `moduleNames` is provided, the new params are ignored.
- **verify_code internal chunking + parallel chunks**: new additive schema properties — `chunkSize` (default 25), `parallelChunks` (default 2), `onChunkTimeout` (`retry` | `skip` | `fail`, default `retry`). When `moduleNames.length > chunkSize`, the driver splits the list into chunks and runs up to `parallelChunks` concurrently. The hard invariant from #805 is preserved: `ok: true` is the default; missing modules NEVER abort the call — they go to `missingInBinary`. The `onChunkTimeout` policy is applied per-chunk: `retry` re-runs once; `skip` records `chunkTimedOut`; `fail` aborts. The result merges all chunks' `matched` / `different` / `missingInSource` / `missingInBinary` and adds `chunkFailures[]` when any chunk fails. `parallelChunks` is bounded to 1..8 because Access COM does not reliably support concurrent invocations against the same .accdb.

### Tests

- **Vitest**: 2872 passed, 1 skipped, 1 todo (vs baseline 2820; +52 new tests).
- **Pester**: 188 passed, 4 skipped (vs baseline 183; +5 new tests for `Invoke-ListVbaModulesAction`).
- **E2E harness** (`E2E_testing/mcp-e2e-issue-807-features.mjs`): 6 assertions across 3 features, follows the existing pattern, skips cleanly when the `NoConformidades.accdb` fixture is absent. Marked blocking in CI via `DYSFLOW_REQUIRE_ACCESS_E2E=1`.

### Hard invariants preserved

- Em-dash fix from #806 (round 3): the runner has zero non-ASCII characters in any new line. ASCII-only.
- Encoding-safe PowerShell: every new `Write-Status`, error message, and label is ASCII.
- COM object lifetime: every `VBComponents.Item(index)` in `Invoke-ListVbaModulesAction` is wrapped in `try { ... } finally { [Marshal]::FinalReleaseComObject($c) | Out-Null } catch { Write-Debug "..." }`.
- Write-gate: every new write-class tool is unchanged. The bulk-import path uses the existing write-gated `import_modules` route. No new bypasses.
- Human compiles: no `compile: true`, no `compile_vba` resurrection.

## [v2.3.1] - 2026-07-09

Patch release. **Critical regression fix.** The v2.3.0 fix at `scripts/dysflow-vba-manager.ps1:4026` introduced a UTF-8 em-dash (U+2014) inside a string literal. The file has no UTF-8 BOM, so when the runtime spawns the script via PowerShell 5.1 (default on Windows), the file is read with the system locale codepage (Windows-1252) and the 3-byte em-dash is misinterpreted, shifting the string-literal boundary and producing cascading PowerShell parser errors. The runtime was effectively unusable for any PowerShell-based tool (`verify_code`, `exists`, `import_modules`, `lint_module`, `export_modules`). This release replaces the em-dash with an ASCII hyphen-minus, restoring the runtime.

### Fixed

- **runtime** (#806): PowerShell parser errors broke all VBA tools in v2.3.0. `Invoke-ExportAction`'s WARN message at line 4026 had a UTF-8 em-dash that was being misread by the runtime. The single-character fix (em-dash → hyphen) restores the runtime. Tests at `scripts/tests/dysflow-vba-manager.Tests.ps1` (block #804) still pass (4/4); the message text reads identically. pnpm test: 2820 passed, 0 regressions. CI: both jobs green.

## [v2.3.0] - 2026-07-09

Minor release. `verify_code({ moduleNames: [...] })` and `export_modules` / `export_all` (via `Invoke-ExportAction` in the PowerShell runner) no longer abort the entire call when one of the requested modules is missing from the binary. The pre-validation step is now **total over the input list** — a missing module is a per-module result, not a call-level error. It surfaces in the structured `warnings[]` payload with the stable error code `VBA_MODULE_NOT_FOUND` and the export continues with the modules that DO exist (#804). The TS compare phase (`vba-source-comparison.ts:666-668`) then naturally places the missing modules in `missingInBinary` because no file was written to the temp dir.

### Fixed

- **verify_code / export_all / export_modules** (#804): pre-validation no longer throws on the first missing module. `Invoke-ExportAction` collects missing module names into `warnings[]` and continues. The `verify_code` response shape (`matched` / `different` / `missingInSource` / `missingInBinary` / `nonActionableDifferent` / `hasFunctionalDifferences` / `actionableOk` / `recommendedAction`) is unchanged — only the contract that `missingInBinary` is correctly populated for comprehensive input lists is now honored. Tests at `scripts/tests/dysflow-vba-manager.Tests.ps1` (new `Invoke-ExportAction — missing module pre-validation (#804, total over input)` block, 4 tests) pin the contract from the outside: a mixed list does not throw and the missing module surfaces in `warnings[].error="VBA_MODULE_NOT_FOUND"`; an all-missing list is total and emits every name in `warnings[]`.

## [v2.2.1] - 2026-07-09

- Merge branch 'feat/ai-form-ui-builder' - feat(forms): finalize AI-first form UI builder workflow


## [v2.2.0] - 2026-07-09

Minor release. `export_all({ diff: true })` and `export_modules({ diff: true })` are now rejected at the dispatch seam with the typed error `DIFF_MODE_REQUIRES_VERIFY_CODE` (#802). The previous behavior silently wrote to the source tree — the diff flag was documented as read-only but the adapter never honored it (the PowerShell runner has no `$Diff` parameter and the `MODULE_MAPPINGS.export_all.extra` mapping only forwards `verbose`), causing partial writes on `VBA_MANAGER_TIMEOUT`. Callers that want a real read-only compare should use `verify_code({ strict, moduleNames })`.

### Fixed

- **export_all / export_modules** (#802): `diff:true` no longer silently writes to the source tree. The flag is refused at the adapter level with `DIFF_MODE_REQUIRES_VERIFY_CODE` and the public docstring (`tool-parity-registry.ts:109`) now matches runtime behavior. Tests at `test/adapters/vba-sync/vba-modules-adapter-diff-flag.test.ts` pin the contract from the outside: typed refusal for `export_all(diff:true)` and `export_modules(diff:true)`, plus a regression guard that the normal export path is unchanged when `diff` is absent.

## [v2.1.7] - 2026-07-09

- feat(forms): unified AI-friendly outputMode (summary|file|full) across form tools (#794)


## [v2.1.6] - 2026-07-09

- test(vba-sync): add comprehensive unit/behavior tests for vba-forms-lint-adapter (closes #652) - chore(release): prepare v2.1.5 - feat(lint): add logical-short-circuit, implicit-variant, missing-exit-handler, and invalid-static-class-call rules


## [v2.1.5] - 2026-07-09

- feat(lint): add logical-short-circuit, implicit-variant, missing-exit-handler, and invalid-static-class-call rules


## [v2.1.4] - 2026-07-08

Patch release. Inverts the default severity of the `identifier-safety` lint rule's non-ASCII check from `error` to `warning` and adds an explicit opt-in for the historical strict contract. Closes #789.

### Fixed

- **lint** (#789): `identifier-safety` no longer rejects valid VBA identifiers with non-ASCII characters as `error` by default. Spanish / Portuguese / French / German / Italian identifiers (e.g. `EnumSiNo.Sí`, `AñoActual()`) are first-class VBA citizens — VBA compiles them natively, `import_modules` with sha256 match works, and the human-compile in Access completes without errors. The check now emits `warning` by default; `isClean: true` reflects this when no other defect is present. The `._` dot-underscore and reserved-word findings stay at `error` always (real syntactic defects).
- **lint** (#789): removed the false-positive alert fatigue in cross-fleet consumers (HPS, gestion_riesgos, no_conformidades, condor, cadete, ...) where Spanish-language identifiers were being flagged as errors despite compiling and shipping in production.

### Added

- **config** (#789): `capabilities.lint.identifierSafety.strictNonAscii: true` in `.dysflow/project.json` restores the historical strict (error) severity for non-ASCII identifiers. Default `false` (warning) for back-compat with the cross-fleet consumer base. `._` dot-underscore and reserved-word findings are unaffected by this flag.

### Test discipline

- ~13 new test atoms across 2 new test files (`test/core/services/vba-module-lint-service.test.ts` extensions and `test/core/config/dysflow-config-lint-identifier-safety.test.ts`).
- Existing 2733-test baseline preserved with no regressions; v2.1.4 baseline = 2738 passed / 1 skipped / 1 todo.

## [v2.1.3] - 2026-07-08

Patch release. Internal consolidation with no behavior change: collapses the duplicated `(mode × risk) → effectiveDryRunDefault` truth table to a single source of truth and removes dead-code / typing artifacts left by #785. Closes #790.

### Changed

- **mcp** (#790): `effectiveDryRunDefaultForTool` (consulted by the dispatch seam and the `get_capabilities` snapshot) now derives its answer from `DEFAULT_DRY_RUN_TABLE` in `core/runtime/write-execution-policy.ts` instead of re-implementing the `(mode × risk)` ladder inline. `resolveWriteExecutionPolicy` already reads the same table, so the helper and the resolver can no longer diverge. Advertised `effectiveDryRunDefault` values are byte-for-byte unchanged.

### Fixed

- **mcp** (#790): removed the inert `_registryCoversAllContracts` type pin in `mcp-tool-risks.ts` — it performed no real check; the `_everyContractCovered` IIFE is the genuine build-time guard that throws when a contract tool lacks a risk entry.
- **vba-modules** (#790): `auditOrphans` no longer casts the `list_objects` result to `any`; it uses a narrow local `VbeObjectList` shape, dropping the `biome-ignore`.

### Tests

- **mcp** (#790): new anti-divergence guard in `mcp-tool-risks.test.ts` asserts `effectiveDryRunDefaultForTool` agrees with `DEFAULT_DRY_RUN_TABLE` for every registered tool under every policy, so a future hand-rolled re-derivation that drifts from the table fails immediately.

## [v2.1.2] - 2026-07-08

Patch release. Wires the v2.1.0 risk-based write execution policy into the MCP dispatch path and enforces the export-source guard at runtime. Closes #785; delivers the runtime half of #783.

### Fixed

- **mcp** (#785): dispatch seam was advertising `effectiveDryRunDefault` in `get_capabilities` (v2.1.0) but never consulting it at the call path. The `writeExecutionPolicy` value is now threaded from `createDysflowMcpTools` through `registerMcpTools` and `createDispatchTool`; the new helper `resolveEffectiveDryRunInput(name, mode, input)` runs at the dispatch boundary AFTER the deprecation strip and schema validation. With `capabilities.writeExecutionPolicy: "developer"` set, `import_modules` and `test_vba` reach the runner without explicit flags; `safe-by-default` projects keep the historical `dryRun: true` default byte-for-byte.
- **mcp** (#785 / #783 partial): `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` is now live at runtime. In `developer` mode, `export_modules` / `export_all` whose destination overlaps the active source root is refused at the dispatch seam with a structured envelope (`code`, `destination`, `sourceRoot`, `remediation`). `confirmOverwriteSource: true` bypasses the guard. Source-root resolution prefers the MCP access-context resolver, falling back to the caller's own `destinationRoot` only when the resolver is unavailable.
- **vba-modules**: dropped the implicit `params.dryRun !== false` rule at `vba-modules-adapter.ts`. The dispatch seam now owns the policy-driven default; the adapter honors explicit `dryRun` / `apply` only.
- **vba-execution**: contract pin update at the `test_vba` gate clarifying that the dispatch seam is the source of the effective dryRun default; the existing `test_vba` gate semantics were already at the simplified state from Round-3 Item 5 (re-applied after #786's hotfix re-merged on top of main).
- **schema**: added `confirmOverwriteSource` to `export_modules` and `export_all` schemas (with `additionalProperties: false`) so the opt-in acknowledgment can be passed through MCP dispatch without `MCP_INPUT_INVALID`.

### Changed

- **mcp**: optional parameters added to the dispatch registration chain: `createDysflowMcpTools` → `registerMcpTools` → `createDispatchTool` now thread `writeExecutionPolicy` (defaults to `"safe-by-default"`) and `accessContextResolver`. Both are optional; existing call sites preserve byte-for-byte behavior. Production wiring (via `createDysflowMcpTools`) forwards both.
- **hard rules preserved**: the write-gate (`writesProcess.enabled`, `writesProject.allowWrites`, `allowedProcedures`) is still authoritative; the new policy does not bypass any of these. Explicit caller intent (`dryRun`, `apply`) always wins over the policy default.
- **README**: §3b now documents the v2.1.2 runtime enforcement (was deferred from v2.1.0). The "Runtime enforcement live in v2.1.2" paragraph pins the contract for consumers reading the docs.
- **docs**: `openspec/changes/wire-write-policy-runtime-785/` is the source of truth (proposal, design, tasks).

### Test discipline

- ~100 new test atoms across 6 new test files (`write-execution-dispatch.test.ts`, `vba-modules-adapter-write-policy.test.ts`, `vba-execution-adapter-write-policy.test.ts`, `export-source-guard.test.ts`, `write-execution-dispatch-confirmation.test.ts`, `dispatch-write-policy-overrides.test.ts`, `capabilities-effective-default-consistency.test.ts`).
- Full suite on the rebased branch (v2.1.1 + #785): **2725 passed / 1 skipped / 1 todo (2727 total)**. No regressions in the v2.1.1 / v2.1.0 / v2.0.x lanes.

### Follow-up (out of scope for v2.1.2, tracked in #783)

- Alias per-call gating refinement for `cleanup_access_operation(force)` / `access_force_cleanup_orphaned(confirmPid)` — already correctly enforced; #783 lists it as documentation-only.
- `developer-mode-extra-strict` mode — extends `confirmOverwriteSource` to non-export tools. New feature, tracked in #783.

## [v2.1.1] - 2026-07-08

Patch release. Fixes `vba_inline_execution`, which failed on every call with
`no encuentra el procedimiento '__dysflow_inline__.ExecuteInline'`.

### Fixed

- **mcp**: `vba_inline_execution` failed with "procedure not found" (`#786`). Root cause was the module-qualified procedure name passed to `Application.Run`: Access reads a dotted prefix as a **project** qualifier, so `__dysflow_inline__.ExecuteInline` resolved to a non-existent project. The inline path now runs the snippet by its **bare** procedure name. Verified end-to-end against real Access. This was NOT a missing-compile issue — save-only import is sufficient; no compile machinery was reintroduced (`feat-759-no-compile` is preserved, `compile_vba` stays removed).
- **mcp**: inline snippets can now **return a value**. The snippet is wrapped in a `Function` that returns a bare `result` variable (previously a `Sub`, which silently discarded it), so read-only introspection like `result = "Attrs=" & fld.Attributes` surfaces via `returnValue`. Makes `vba_inline_execution` usable for reading runtime-only DAO metadata without opening Access.

## [v2.1.0] - 2026-07-08

Minor release. Ships the foundation of the risk-based write execution policy so the routine Dysflow dev loop (`import_modules → test_vba → verify_code`) can opt into a developer mode that flips the dry-run default for routine tools, without weakening any existing gate.

### Added

- **runtime**: `writeExecutionPolicy` resolver (`safe-by-default` | `developer`) — pure function returning `{ effectiveDryRunDefault, requiresConfirmOverwriteSource }`.
- **config**: `capabilities.writeExecutionPolicy` schema field. Omitting the field keeps the historical `safe-by-default` behavior; unknown values surface `CONFIG_UNKNOWN_WRITE_EXECUTION_POLICY` so a typo cannot silently flip the mode.
- **runtime**: `pathOverlapsSourceRoot(destination, sourceRoot, managedFolders?)` — Windows-aware overlap detector (case-insensitive, nested-path aware) used by the export-source guard.
- **mcp**: additive `risk` field per dispatch route. Six risk categories: `read-only`, `routine-dev-write`, `protected-write`, `destructive-write`, `arbitrary-write`, `process-control`. The `mutatesBinary` / `mutatesFilesystem` route semantics are unchanged.
- **mcp**: unified `MCP_TOOL_RISKS` registry covering every contract tool (generated routes + modern + alias). Single source of truth for `effectiveDryRunDefaultForTool(name, mode)`.
- **mcp**: `get_capabilities` exposes `writeExecutionPolicy` + per-tool `effectiveDryRunDefault` map so consumers predict what the runtime will do before invoking a write-class tool.

### Hard rules preserved

- The write-gate (`writesProcess.enabled`, `writesProject.allowWrites`, `allowedProcedures`) is authoritative. The new policy does not bypass any existing gate.
- `test_vba` / `run_vba` allowlist gate is preserved in both modes.
- Top-level `allowWrites` / `allowedProcedures` aliases in `project.json` remain rejected (T18 invariant).

### Documentation

- README §3a (risk-based write execution policy) and §3b (export-source guard) explain the policy, the per-tool risk classification, and the export confirmation contract.

### Follow-up

- Dispatch-layer integration of `effectiveDryRunDefault` (developer mode flips the dry-run default at the adapter level) and the runtime enforcement of `confirmOverwriteSource` for `export_modules` / `export_all` is tracked in issue #783. The foundation in this release makes that integration a single layer above the existing dispatch path.

## [v2.0.1] - 2026-07-08

Patch release. Closes #781 — auditoría externa detectó 4 hallazgos técnicos sobre v2.0.0; todos confirmados contra el source y corregidos.

### Fixed

- **orphan-cleanup** (#781 P2): dedupe headless-gate + revalidate-before-kill sequence. `scanAndCleanOrphans` y `retireUnownedRecord` ya no duplican la coreografía; se extrajo un helper privado `killIfHeadlessAccess` con los mismos diagnostic codes (`CLEANUP_RACE_PID_REUSED`).
- **powershell** (#781 P2): `spawnPowerShellProcess` ahora distingue "pwsh no encontrado / spawn ENOENT" de un timeout-kill. El resultado lleva un campo `spawnError?: string` y los call-sites en `vba-sync-adapter` lo surfacing con un diagnostic code `POWERSHELL_SPAWN_FAILED`.
- **mcp** (#781 P3): `createDysflowMcpTools` pasa de 9 parámetros posicionales a un options object. Renames: `writesEnabled` → `writes`, `lintRulesOverride` → `lintOverrides`. Comportamiento idéntico para call-sites que omiten campos opcionales.

### Removed

- **vba-semantic-classifier** (#781 cleanup): `neutralizeLossyEncodingEverywhere` borrado. Era código muerto desde T14 (sólo lo referenciaban tests que documentaban la conducta vieja del bug #1) y una función-trampa que un edit futuro podría re-cablear.

## [v2.0.0] - 2026-07-08

### BREAKING CHANGES

- **config**: Top-level `allowWrites` and `allowedProcedures` fields in `project.json` are now rejected with `CONFIG_TOP_LEVEL_FIELDS_REMOVED`. Migrate to the `capabilities` block. (T18)

### Fixed

- **config**: Reject deprecated top-level config fields with clear migration guidance (T18)
- **orphan-cleanup**: Require positive ownership proof for PWSH.EXE cleanup (T16)
- **vba-semantic-classifier**: Scope toggle normalization to known toggle property names (T15)
- **vba-semantic-classifier**: Use string-aware `neutralizeLossyEncoding` in post-normalization classification sites (T14)

## [v1.22.0] - 2026-07-07

### Changed (canonical MCP tool names — Opción A continuation, #777)

Thirteen legacy `dysflow_*` MCP tools are renamed to their canonical
(unprefixed) names. This is a continuation of the Opción A reference
commit (`58405eb2`, v1.21.0) which renamed 7 tools whose canonical
names already existed in `alias-tools.ts`. v1.22.0 finishes the rename
for the remaining 13 tools (11 from the original Opción A
continuation + 2 read-only introspection tools that slipped through
the alias-ownership check); no back-compat alias is added — the
canonical name is the only name advertised on the MCP `tools/list`
projection.

| # | Legacy (REMOVED)         | Canonical               | Class              |
|---|--------------------------|-------------------------|--------------------|
| 1 | `dysflow_vba_execute`    | `run_vba`               | alias-override    |
| 2 | `dysflow_query_execute`  | `query_execute`         | bespoke-to-bespoke |
| 3 | `dysflow_doctor`         | `doctor`                | bespoke-to-bespoke |
| 4 | `dysflow_access_operations_list` | `list_access_operations` | alias-override |
| 5 | `dysflow_access_cleanup` | `cleanup_access_operation` | alias-override |
| 6 | `dysflow_access_force_cleanup_orphaned` | `access_force_cleanup_orphaned` | bespoke-to-bespoke |
| 7 | `dysflow_list_procedures` | `list_procedures`     | bespoke-to-bespoke |
| 8 | `dysflow_get_procedure`  | `get_procedure`         | bespoke-to-bespoke |
| 9 | `dysflow_find_references` | `find_references`     | bespoke-to-bespoke |
| 10 | `dysflow_detect_dead_code` | `detect_dead_code`   | bespoke-to-bespoke |
| 11 | `dysflow_validate_manifest` | `validate_manifest`  | bespoke-to-bespoke |
| 12 | `dysflow_get_capabilities` | `get_capabilities`   | bespoke-to-bespoke |
| 13 | `dysflow_resolve_project` | `resolve_project`     | bespoke-to-bespoke |

Tool count: 67 visible MCP tools → **64** (drop of 3 — the three
alias-override rows that had a duplicate registration in both
`alias-tools.ts` and `tools.ts`; the other 10 are bespoke-to-bespoke
renames, 1-for-1 with the legacy).

Notes:
- The canonical `run_vba` was already registered by `alias-tools.ts`
  (preexisting alias). The bespoke registration that lived alongside
  it was removed; the alias handler is now the sole source.
- The canonical `list_access_operations` and `cleanup_access_operation`
  were also preexisting aliases with bespoke handlers; the same
  treatment applies.
- The other ten canonical names are new and have no pre-existing
  alias registration; their handlers were moved from
  `src/adapters/mcp/tools.ts` exactly once.
- The two final renames (#12 and #13) were originally left behind
  because they were intentional canonical names registered in
  bespoke factory files (`get-capabilities-tool.ts` and
  `dysflow-resolve-project-tool.ts`), not as legacy aliases of an
  already-canonical tool. They are now renamed to the canonical
  form. The `dysflow-resolve-project-tool.ts` file is renamed to
  `resolve-project-tool.ts` to match the canonical name.
- The `MCP_TOOL_CONTRACTS.dysflow_*` entries were renamed or removed
  in lockstep. Tools whose contract was previously in
  `modernContracts` (the 8 new canonical names and the pre-existing
  `run_vba`) now read from `modernContracts.<canonical>` (or
  `aliasContracts.<canonical>` for the 3 pre-existing aliases). The
  legacy keys are removed.
- Per-tool schemas: `MODULE_LIST`, `MODULE_GET`, and the modern
  canonical surface now use `mcpSchemaFor(<canonical>)`. The legacy
  schemas `MODULE_LIST` / `MODULE_GET` (which still existed as the
  bespoke `dysflow_*` schemas) were folded into the canonical schemas.
- `MCP_TOOL_SCHEMAS` and `TOOL_DESCRIPTIONS` carry the canonical names;
  the legacy `MODERN_TOOL_NAMES` array no longer mentions any
  `dysflow_*` string.
- A new regression test
  (`test/adapters/mcp/advertised-tool-count.test.ts`) asserts that
  no advertised MCP tool name starts with `dysflow_`. This is the
  contract for all future releases — the Opción A directive
  ("no legacy ni non legacy, todos han de ser iguales") is now
  mechanically enforced.

### Breaking change

Any consumer (human or AI agent) that calls a `dysflow_*` MCP tool
must migrate to the canonical unprefixed name. There is no back-compat
alias. The previous version (v1.21.0) removed the alias for 7 form
and lint tools; v1.22.0 removes the alias for the remaining 13.

Refs #777. Implementation commits per work unit are listed in
`openspec/changes/<change>/tasks.md` (when the change ships).

## [v1.21.0] - 2026-07-07

### Fixed (multi-AI friction log F11, F13, F14)

Four source commits ported in this batch — one per logical friction —
to keep CHANGELOG.md edits from conflicting with each other (every
commit on the tactical branch `fricciones-dysflow-F11-F23-2026-07-06`
wanted to append a `[Unreleased]` block, which made a sequential
cherry-pick fragile). The consolidated entry below summarizes all four
commits in the order they were ported onto `fricciones-port-2026-07-07`.

- **F11 — E2E sandbox source-path stabilization** (issue #766, commit
  `37649fab`). The MCP E2E battery's `dysflow_list_procedures` disk-path
  probe was passing the sandbox's own `destinationRoot` to
  `resolveVbaSourceFile`, which rejected it because the security check
  insists on the configured project's source root. Two surgical fixes
  in `E2E_testing/_helpers/mcp-e2e-sandbox.mjs` (move `catalogPath`
  under `src/`) and `E2E_testing/mcp-e2e.mjs` (inline `source` read
  from `E2E_testing/src` for the configured project root, plus mark the
  `unlink_table` negative case as `expected: "error"` to make the
  structured failure explicit). No unit-test impact — these are E2E
  harness paths only. `pnpm test:e2e:mcp` exercises the path end-to-end.

- **F13 — deprecated `compile` / `rollbackOnCompileFail` silent strip
  on `import_modules` / `import_all`** (issue #759 follow-up, commit
  `70dd5665`). The `compile_vba` tool and the `compile` parameter on
  `import_modules` / `import_all` were removed end-to-end in v1.19.0
  (hard break — the runtime no longer compiles; the human compiles in
  Access via Debug → Compile). Existing orchestrator briefs written
  before v1.19.0 still hard-code `compile: false` / `compile: true`.
  Without the strip those briefs receive `MCP_INPUT_INVALID: compile is
  not allowed` from the schema layer. The dispatch factory now silently
  strips the deprecated keys BEFORE schema validation, so:
  * The schema layer (`validateInput`) keeps rejecting `compile` via
    `additionalProperties: false`. The v1.19.0 contract pinned by
    `test/adapters/mcp/schemas/vba-sync-schemas.test.ts` is unchanged.
  * A legacy brief passing `compile: true` or `rollbackOnCompileFail`
    does NOT receive the rejection. The call succeeds.
  * The forwarded payload to `vbaSyncToolService.execute` does NOT
    carry `compile` / `rollbackOnCompileFail` — the strip is real, not a
    bypass that leaves the deprecated keys downstream.
  A `console.warn` surfaces the `compile: true` case (the one that used
  to trigger `compile_vba`). 7 new atoms in
  `test/adapters/mcp/import-modules-compile-flag.test.ts` lock the
  contract.

- **F14 — JSON-stringifiable MCP tool result normalization** (commits
  `5ce73eb5` and `9f6ddcbe`, 16 + 2 atoms). When a dysflow MCP tool
  returns a value that `JSON.stringify` cannot serialize (a `Symbol`,
  a function, a `BigInt`, a top-level `undefined`, an `Error` with
  non-enumerable `message`, or an object with a circular reference),
  the consumer previously got either a thrown `TypeError`
  (`Converting circular structure to JSON` / `Do not know how to
  serialize a BigInt`) or silently-dropped information
  (`JSON.stringify({fn: () => {}})` returns `{}`). The new
  `stringifyForMcp` helper routes the value through the appropriate
  serializer and guarantees that `content[0].text` is ALWAYS a JSON
  document that `JSON.parse` and a second `JSON.stringify` will accept
  (the F14 contract). The helper:
  * top-level primitives (null/string/number/boolean) → fast path
  * `Symbol` / `function` / `BigInt` / `undefined` top-level → envelope
    `{ raw: <serializable string>, type: <kind> }`
  * `Error` instance → envelope exposing `.message`, `.stack`, `.name`,
    `.code`, and any extra fields
  * Object/array with circular refs → encoded with `__circular__`
    placeholders for back-edges (via `normalizeForJsonStringify`)
  * Nested `function` / `Symbol` / `BigInt` / `Error` are deep-walked
    before the fast path so they are never silently dropped (F14
    nested — commit `9f6ddcbe` adds the `requiresDeepNormalization`
    guard).
  18 atoms in
  `test/adapters/mcp/result-translation-stringifiable.test.ts` lock the
  contract.

Implementation commits (in order, all on `fricciones-port-2026-07-07`):
`37649fab` (F11), `70dd5665` (F13), `5ce73eb5` (F14 root),
`9f6ddcbe` (F14 nested).

### Added (multi-AI friction log F22)

- **`lint_module` ships the `forbidden-name` rule** (Friction F22,
  multi-AI friction log 2026-07-06). The new rule flags identifiers
  declared in any VBA module that shadow VBA / Access / DAO / ADO /
  Scripting globals or reserved words (`Err`, `Error`, `Date`, `Time`,
  `Now`, `Name`, `Type`, `Left`, `Right`, `Mid`, `Trim`, `Len`, `Replace`,
  `Format`, `Array`, `Collection`, `Dictionary`, `Object`, `String`,
  `Integer`, `Long`, `Boolean`, `Double`, `Currency`, `Variant`, `Form`,
  `Report`, `Control`, `Recordset`, `Database`, `Field`, `Fields`,
  `TableDef`, `QueryDef`, `DoCmd`, `CurrentDb`, `Application`, `Screen`,
  `Forms`, `Reports`, `Me`, `Parent`, `New`, `Nothing`, `Null`, `Empty`,
  `True`, `False`). The check is case-insensitive (lowercase fold at
  match time) and fires on every declaration form: `Dim`, `Const`, `Type`,
  `Enum`, `Declare ... Function/Sub`, `Sub`, `Function`, `Property
  Get/Let/Set`, and the parameter list of any procedure header. The
  diagnostic carries the structured `code: "FORBIDDEN_NAME"`, a line
  number, the violating identifier, and a per-name recommendation
  aligned to the project's convention (`errMsg` / `fechaAlta` / `db` /
  `rs` / `qdf` / etc.). Severity is `error`: a shadowed identifier
  compiles in some code paths and breaks in others with the misleading
  `Calificador no válido` / `Invalid qualifier` class of error, so the
  rule belongs on the same gate as the other `lint_module` errors.
  Wired into the `lint_module` MCP tool's `rules` array and
  listed in `LINT_MODULE_SCHEMA`, `KNOWN_LINT_RULE_IDS`, and the
  `LintRuleId` type so a project can opt out via
  `.dysflow/project.json` `capabilities.lint.rules.forbidden-name =
  { enabled: false }` for legacy codebases.

## [v1.20.1] - 2026-07-07

- **F16 import_modules grow-in-place hotfix**: updating an existing standard
  module/class with a larger source file no longer requires a manual
  `delete_module` + `import_modules` workaround. The import path still starts
  with the existing headless-safe `CodeModule.DeleteLines` + `AddFromFile`
  flow, then falls back to clearing the same component and using
  `CodeModule.AddFromString` when Access keeps the old `CountOfLines` cap.
  `VBComponents.Remove()` is deliberately not used, avoiding visible VBE
  "Save As module" prompts. The `IMPORT_TRUNCATED` check remains as a
  defensive safety net. Release verification included the required real Access
  E2E gate:
  `DYSFLOW_REQUIRE_ACCESS_E2E=1 node E2E_testing/mcp-e2e-import-grow-in-place.mjs`
  (exit 0, `[f16-import-grow] passed: larger source imported through MCP
  without IMPORT_TRUNCATED.`).

Implementation commits: PR #775 merge `f34568ad`; harness follow-up
`a8dddba0` (`test(e2e): fix F16 import harness MCP payload`).

## [v1.20.0] - 2026-07-07

- **`target: "auto"` mode on read-only schema/query tools** (#763, GH issue
  originally raised as deferred AC of #716). The cross-DB lookup primitive
  (`src/core/runtime/cross-db-table-lookup.ts`) tries the configured backend
  first, then the frontend, and returns which one contained the table.
  Caller can read `get_capabilities.toolsVisible` (still 68) and
  the resolved `databasePath` from the result to determine which DB
  served the data. **Migration**: existing `target: "frontend" |
  "backend"` callers are unaffected; new `target: "auto"` callers get
  the cross-DB resolution.
- **Cross-DB ambiguity detection for read tools** (#764, deferred AC of
  #716). When a caller invokes a read-only tool (`dysflow_get_schema`,
  `dysflow_list_tables`, `dysflow_count_rows`, `dysflow_distinct_values`)
  WITHOUT an explicit `target` / `databasePath`, and the table exists in
  BOTH configured DBs, dysflow returns a typed `ACCESS_TABLE_AMBIGUOUS`
  error with `error.details.roles: ["frontend", "backend"]` and the
  candidates. Single-DB tables still resolve normally. **Hard break for
  callers** that previously got a non-deterministic answer on ambiguous
  tables — they now get a typed error. **Migration**: pass `target:
  "frontend" | "backend" | "auto"` to disambiguate.
- **Human-compile-reminder surface** (#762, PR-1 of v1.20.0). Before
  any test run / module import, dysflow tracks the last persistence +
  last `dysflow_verify_code` round-trip per `accessPath` and exposes:
  - `get_capabilities.humanCompilePending: bool` — true when the
    human has not compiled since the last save-only persistence.
  - `humanCompileReminder: "Dysflow did not compile. The human must
    compile this project in Access (Debug > Compile) before any test
    run. Last save-only persistence: <ISO timestamp>."` in the structured
    result of `dysflow_import_modules` / `dysflow_import_all` /
    `dysflow_delete_module` / `dysflow_test_vba` / `dysflow_run_vba`
    when the human is pending. **ADDITIVE** — consumers that ignore
    the reminder keep working.
- **No new error codes** beyond `ACCESS_TABLE_AMBIGUOUS` (which is new in
  v1.20.0). **No new tools** (existing tool count 68 unchanged). **No
  defaults change**. The only contract changes are: new `target: "auto"`
  enum value, new `humanCompilePending` capability field, new
  `humanCompileReminder` result field on import / test / run tools,
  and the ambiguity error code. v1.19.0's hard-break hold (zero
  compile in dysflow) is preserved and reinforced.
- **Migration note** (in CHANGELOG entry): the v1.20.0 behavior is
  backward-compatible for single-DB projects (95% of consumers; the
  `noconformidades-e2e` test fixture is a single-DB project and resolves
  without changes). For multi-DB projects, callers passing no
  `target` / `databasePath` on a table that exists in both DBs will now
  get `ACCESS_TABLE_AMBIGUOUS` — they should either pass `target:
  "auto"` to get the lookup result, or pass `target: "frontend" |
  "backend"` to disambiguate explicitly.

Implementation commits: PR-1 #765 (PR #762) `6ac401d7` (commits
`7bc58b4e` … `c508f96b`); PR-2 #772 (PR #763 + #764) `1ead192b`
(commits `31cc19ba` … `29481bbb`). Merge commits on main: `6ac401d7`
(PR-1), `1ead192b` (PR-2).

## [v1.19.0] - 2026-07-06

Hard-break removal of all dysflow-managed VBA compilation (#759). The
runtime no longer compiles; the human compiles in Access (Debug > Compile).
Mutations persist via save-only (`acCmdSaveAllModules` = `RunCommand(280)`),
which fixes the structural root cause of the consumer-reported "Active
lock detected" / `VBA_IMPORT_PHASE_FAILED` chain on broken projects
(merged in PR #760). This release removes every public surface that
exposed the compile machinery:

### Removed (hard break)

- **`compile_vba` MCP tool** (`commit f6607bb8`). Registered in
  `VBA_SYNC_TOOL_NAMES`, `MCP_TOOL_ROUTES`, `VBA_SYNC_TOOL_SCHEMAS`,
  `TOOL_PARITY_REGISTRY`, `EXECUTION_MAPPINGS` — every surface drops the
  entry. `dysflow_get_capabilities.toolsVisible` decreases by
  1 (68 -> 67). Any caller invoking `compile_vba` reaches an unknown
  tool error.
- **`compile` and `rollbackOnCompileFail` parameters on `import_modules` /
  `import_all`** (`commit 68b27a46`). Removed `SCHEMA_PROPS.compile`,
  removed the parameters from the Zod schemas (`additionalProperties:false`
  rejects unknown keys with `MCP_INPUT_INVALID`), removed the post-import
  compile block + rollback snapshot in `VbaModulesAdapter`, removed the
  `truthy(params.compile)` check in `VbaExecutionAdapter.executeTestVba`,
  and removed the dead HTTP surface mirror.
- **`VBA_COMPILE_ERROR` error code** (`commit 39ddab41`). Removed from the
  error taxonomy; no adapter or PowerShell runner can emit it. `compile:false`
  / `compile:true` consumer failures are now `MCP_INPUT_INVALID` at the
  schema boundary before any runner call.
- **PowerShell compile machinery** (`commit cf974e0c`). Deleted four
  function definitions from `scripts/dysflow-vba-manager.ps1`:
  `Get-ActiveVbeLocation`, `New-CompileFailureResult`,
  `Invoke-CompileVbaProject`, `Invoke-CompileAction`. The
  `-Action "Compile"` dispatcher branch is gone. `Compile` is removed
  from both `ValidateSet` declarations. The four `RunCommand(126)`
  sites in the persistence paths were already replaced with
  `RunCommand(280)` in PR #760.

### Changed

- **Save-only persistence is now canonical** (openspec/specs/vba-manager-actions/spec.md
  "Save-only persistence (no compile)"). `import_modules`,
  `import_all`, and `delete_module` complete via
  `acCmdSaveAllModules` = `RunCommand(280)`. No compile step is invoked.
- **vba_inline_execution skips its explicit compile step**. The inline
  path imports `__dysflow_inline__` and runs it directly; Access
  validates the procedure at call time. Any compile error against the
  temp module now surfaces via `run_vba`'s normal failure path
  (no `VBA_COMPILE_ERROR` type).

### Migration

Existing callers passing `compile: true` or `rollbackOnCompileFail: true`
on `import_modules` / `import_all` receive `MCP_INPUT_INVALID` from the
Zod `additionalProperties:false` validator. Existing callers invoking
`compile_vba` reach an unknown tool error. Both are loud, schema-layer
rejections; the migration is mechanical — drop the parameter / tool
invocation and rely on Access (Debug > Compile) before re-running
`test_vba` or trusting the binary.

### Implementation commits (PR-2)

- `0b98641c` test(schemas): pin rejection of removed compile + rollbackOnCompileFail params (RED)
- `68b27a46` feat(mcp): drop compile + rollbackOnCompileFail params from import schemas (BREAKING)
- `e546986b` test(mcp): pin removal of compile_vba tool across all registration surfaces (RED)
- `f6607bb8` feat(mcp): drop compile_vba tool end-to-end (BREAKING)
- `cf974e0c` chore(ps): remove Invoke-Compile* + New-CompileFailureResult from dysflow-vba-manager.ps1
- `57ce8552` test(errors): pin VBA_COMPILE_ERROR removal from src/ source (RED)
- `39ddab41` feat(mcp): drop VBA_COMPILE_ERROR from error taxonomy
- `e0f632c3` test: drop compile_vba + compile:true test cases; cleanup obsolete tests
- `0e63f920` docs(sweep): zero compile in working docs + update live OpenSpec specs

PR-1 (Slice 1, already merged at `35d5fbe2`) replaced the persistence
path's `RunCommand(126)` -> `RunCommand(280)` for the two delete
paths. The four `RunCommand(126)` sites that remained inside
`Invoke-CompileVbaProject` are removed in PR-2 commit `cf974e0c`.

## [v1.18.0] - 2026-07-06

MCP friction consolidation from consumer production work (#757). Four
independent fixes that make the MCP surface honest and agent-friendly under
real TDD workflows, each traceable to a reported friction ID:

- **F7 — `test_vba` honors mid-session `.dysflow/project.json` edits without a
  restart.** The `test_vba` allowlist gate ran through `VbaExecutionAdapter`
  with the project's `allowedProcedures` **frozen** at service-factory time and
  then reused via the service cache, so adding a procedure to the allowlist was
  ignored until the MCP server restarted — hostile to TDD. The composition root
  (`stdio.ts:createConfiguredServices`) now forwards a per-input **resolver**
  instead of the frozen array, mirroring the MCP-handler gate that already gave
  `run_vba` this behavior (#674/#748). `loadDysflowConfig` has no cache, so each
  call re-reads the file and a newly-added test takes effect immediately. No new
  tool was needed — the fix is the wiring, not a cache-invalidation primitive.
- **F6 — distinct `MCP_ALLOWLIST_NOT_CONFIGURED` error code.** The
  "project declares no `allowedProcedures`" refusal was reported as the generic
  `MCP_INPUT_INVALID`, indistinguishable from a real input-shape error. It now
  carries its own code (the name reserved earlier in the #659 test notes) in
  BOTH gates — `ensureProcedureAllowed` (run_vba/`dysflow_vba_execute`) and
  `VbaExecutionAdapter.ensureTestProceduresAllowed` (test_vba) — plus the HTTP
  `/vba/test` path, so a consumer greps one string regardless of the layer that
  refused. The HTTP status stays `400` (unchanged from the old code).
- **F3 — structured `VBA_MANAGER_TIMEOUT` envelope.** The bare
  `{ code, message }` timeout forced agents to hand-audit `MSACCESS.EXE` and
  `.laccdb` locks. The error now carries `error.details` with `phase`,
  `wasApply`, `operationTimeoutMs`, `reapedProcessPids` (orphans dysflow already
  reaped), `cleanupWarnings` (kills it could NOT complete — may still linger),
  and a derived `expectedLockFile`, plus a top-level `error.remediation`
  pointing at `dysflow_access_force_cleanup_orphaned`. All fields come from data
  dysflow already had — no new OS scans.
- **F1 — `export_all` description leads with write-by-default semantics.** The
  advertised description now opens with "By default this WRITES to disk … Pass
  diff:true to NOT write" so a caller cannot mistake the default for a no-op.

## [v1.17.0] - 2026-07-06

Read-tool project-aware target resolution (#716) plus a runner invariant
repair. The new `target: "frontend" | "backend"` semantic lets MCP callers
pass `projectId` plus `target` without `databasePath` / `backendPath` /
`accessPath` / `sourcePath` and have Dysflow resolve the role against
`.dysflow/project.json` for read-only schema/query tools (`get_schema`,
`count_rows`, `distinct_values`, `list_tables`, `list_linked_tables`,
`get_relationships`, `compare_backends`, `list_links`). An unresolvable
role returns a typed `CONFIG_MISSING_TARGET_PATH` error before the
PowerShell executor runs. Closes #716 for the frontend-local + backend
lookup + explicit precedence + typed-error acceptance subset; `auto` mode
+ cross-DB ambiguity detection remain acknowledged follow-ups (see
`openspec/changes/feat-716-target-frontend-backend/verify-report.md`).

- **Semantic `target` role on read-only MCP schema/query tools** (#716). All
  read tools that share the `READ_TARGET_OVERRIDE` input block now accept
  a new `target` parameter: `"frontend"` resolves to the configured
  `accessPath` from `.dysflow/project.json`; `"backend"` resolves to the
  configured `backendPath`. Explicit `accessPath` / `backendPath` /
  `databasePath` / `sourcePath` continue to win, so no caller that
  previously passed a concrete path regresses. The schema enum is closed
  (`frontend` / `backend`) and `auto` mode is not implemented in this
  slice — the issue hedges that AC with *"if implemented"* and the new
  explicit role already gives callers the unambiguous choice. When the
  role cannot be resolved against the project config (e.g.
  `target="backend"` against a project without `backendPath`), the
  runner returns the typed `CONFIG_MISSING_TARGET_PATH` error **before**
  invoking the PowerShell executor, so no orphan PIDs /
  operation-registry entries are created on the unresolvable path.
- **Runner default-fallback block re-keyed off `finalOperation.request`**
  (`src/core/runner/access-runner.ts:285-322`). Discovered while rebasing
  the prior-session WIP onto current `main`: the existing fallback that
  defaults a missing path to `config.backendPath` / `config.accessDbPath`
  was reading the **original** `operation.request`, so any upstream
  resolution that had already populated a path (or cleared a `target`)
  was silently overwritten by the spread. New `if (finalOperation.kind
  === "query")` guard re-narrows TypeScript's discriminated union across
  the `let` reassignment. Refactor-safe tests now assert on the parsed
  `-PayloadJson` JSON content (what the PowerShell script actually sees)
  rather than on top-level argument flags, so any future change to the
  args layout that preserves the data semantics keeps the suite green.

Implementation commits (PR #755): `f97810d`, `64018ea`. Merge commit: `c3f4f7a`.

## [Unreleased]

## [v1.15.0] - 2026-07-05

- Merge pull request #722 from DysTelefonica/feat/704-lint-module - fix(mcp): guard merged vba runtime tools - docs(mcp): fix containment comment - fix(mcp): contain VBA source resolution - refactor(vba-sync): split forms adapter - feat(mcp): add VBA module lint tool - Merge pull request #712 from DysTelefonica/feat/703-validate-manifest - feat(mcp): add VBA test manifest validation - feat(mcp): add dead code detection tool - docs(openspec): archive 2026-07-01 audit records - fix(ci): repair release workflow indentation - Merge pull request #707 from DysTelefonica/feat/701-procedure-read-tools - docs: document dysflow_find_references tool in README - feat(mcp): implement dysflow_find_references tool (closes #702) - test(mcp): RED for find_references no-such-symbol typed error - test(mcp): RED for find_references call sites - feat(mcp): implement dysflow_get_procedure and dysflow_list_procedures (closes #701) - test(mcp): RED for list_procedures typing filter - test(mcp): RED for get_procedure non-existent module - test(mcp): RED for get_procedure default empty - docs(testing): refresh coverage gates (#706) - fix(forms): report rollback outcomes (#700) - fix(mcp): reject relink inline passwords (#699) - fix(http): gate test_vba route by allowlist (#698) - fix(vba-sync): guard prune export inventory (#697) - fix(verify-code): surface export warnings (#696) - fix(test): serialize unit vitest workers (#695) - refactor(core): inject filesystem ports from adapters - fix(vba-sync): transition registry record to running - chore(lint): wire script helper coverage into CI gate (#687) - fix(forms): add path-containment guard to generate_form / catalog_add_control / create_form_from_template (#675) (#685) - fix(mcp): resolve allowedProcedures per-input, not per-startup (#674) (#684) - feat(mcp): expose import_queries.importPath in the MCP schema (#672) (#681) - ci(release): inline the release-name == tag assert, drop dead guard workflow (#668) (#680) - fix(dispatch-routes): correct mutates* declarations for export_* / generate_erd / fix_encoding (#665) (#678) - fix(vba-execution-adapter): gate allowlist BEFORE compile when compile:true (#667) (#679) - fix(classifier): normalize toggle values to TOGGLE token, surface presence-vs-absence (#671) (#683) - fix(serve): fail-closed on non-loopback host without --token (#669) (#682) - fix(update): include pnpm-lock.yaml in tarball + --frozen-lockfile in extractor (#666) (#677) - feat(errors): split MCP_INPUT_INVALID into MCP_PROCEDURE_NOT_ALLOWED (#659) (#676)


## [Unreleased]

- **Semantic `target` role on read-only MCP schema/query tools** (#716). All
  read tools that share the `READ_TARGET_OVERRIDE` input block
  (`get_schema`, `count_rows`, `distinct_values`, `list_tables`,
  `list_linked_tables`, `get_relationships`, `compare_backends`,
  `list_access_files`, `list_links`) now accept a new `target`
  parameter: `"frontend"` resolves to the configured `accessPath`
  from `.dysflow/project.json`; `"backend"` resolves to the configured
  `backendPath`. Explicit `accessPath` / `backendPath` / `databasePath`
  / `sourcePath` continue to win, so no caller that previously passed
  a concrete path regresses. The schema enum is closed (`frontend` /
  `backend`) and `auto` mode is not implemented in this slice — the
  issue hedges that AC with *"if implemented"* and the new explicit
  role already gives callers the unambiguous choice. When the role
  cannot be resolved against the project config (e.g. `target="backend"`
  against a project without `backendPath`), the runner returns the
  typed `CONFIG_MISSING_TARGET_PATH` error **before** invoking the
  PowerShell executor, so no orphan PIDs / operation-registry entries
  are created on the unresolvable path. Closes #716 for the
  frontend-local + backend lookup + explicit precedence + typed-error
  acceptance subset; `auto` mode + cross-DB ambiguity detection
  remain acknowledged follow-ups in
  `openspec/changes/feat-716-target-frontend-backend/verify-report.md`.
- **Runner default-fallback block re-keyed off `finalOperation.request`**
  (#716 follow-up, `src/core/runner/access-runner.ts:285-322`).
  Discovered while rebasing the prior-session WIP onto current `main`:
  the existing fallback that defaults a missing path to
  `config.backendPath` / `config.accessDbPath` was reading the
  **original** `operation.request`, so any upstream resolution that
  had already populated a path (or cleared a `target`) was silently
  overwritten by the spread. New `if (finalOperation.kind === "query")`
  guard re-narrows TypeScript's discriminated union across the `let`
  reassignment. Refactor-safe tests now assert on the parsed
  `-PayloadJson` JSON content (what the PowerShell script actually
  sees) rather than on top-level argument flags, so any future change
  to the args layout that preserves the data semantics keeps the
  suite green.

## [v1.16.1] - 2026-07-06

Truncation-safe `import_modules` + opt-in verbose observability (issue #752). The
v1.15.7 hotfix path silently truncated source files at the pre-existing module's
`CountOfLines` when the source's `Attribute VB_Name` resolved to an existing
component (2035 → 630 in repro). v1.16.1 makes that mode fail loud and adds a
per-module source/destination observability surface.

- **Defensive validations in `Import-VbaModule`** (typed `error.code` per-module):
  `VB_NAME_MISMATCH` (refuses when source's `Attribute VB_Name` ≠ resolved
  component name), `DUPLICATE_OPTION_DIRECTIVE` (refuses when source has
  duplicate `Option Explicit` / `Option Compare` / `Option Base` /
  `Option Private Module`), `IMPORT_TRUNCATED` (refuses when post-`AddFromFile`
  `CountOfLines` is strictly smaller than the source's line count).
- **Opt-in `verbose: bool` flag** on `dysflow_import_modules` /
  `dysflow_export_modules` / `import_all` / `export_all`. PowerShell switch
  is `-VerboseContract` (the JSON `verbose` key is rewritten to
  `-VerboseContract` at dispatch to avoid collision with
  `[CmdletBinding()]$Verbose`). When set, every per-module result gains
  `{source:{bytes,lines,sha256}, destination:{bytes,lines,sha256}, truncated,
  mismatchReason}` so an AI caller can detect silent truncation instead of
  trusting `status:ok`. Backward-compatible: omitted flag → field absent.
- **Tests** — 16 new RED Pester atoms (`Get-VbNameFromSourceFile` x6,
  `Test-SourceFileHasDuplicateOptions` x6, `Get-SourceFileSizeSnapshot` x4)
  nested inside the parent pure-helper `Describe` so the existing AST
  extraction at line 318 covers them. New E2E
  `test/integration/vba-modules-import-verbose-truncation.e2e.test.ts`
  covers the verbose envelope, the verbose:false backward-compat path, and
  the `VB_NAME_MISMATCH` typed-error path.

Implementation commits (PR #753): `60f5428`. Merge commit: `89d2b44`.

## [v1.16.0] - 2026-07-06

Round-3 P0 fixes for the Dysflow MCP runtime. This release changes internal
behavior of three MCP tool paths and tightens the read-only contract; no new
tools were added (visible MCP tool count stays at 68) and no schema shape
changed.

- **`VbaExecutionAdapter` uses a per-input `allowedProcedures` resolver** (round-3 Item 1, #674 / #684 follow-up / #748). The adapter no longer relies on the resolution that was bound once at MCP stdio startup; every `dysflow_vba_execute` call now resolves its `allowedProcedures` against the request that just arrived, so a project that enables the gate AFTER the stdio server has started is correctly enforced on the next call (and a project that disables it is correctly released). Closes the long-standing contract divergence where the gate surface and the docs promised per-input resolution but the implementation cached it once. New RED tests pin the resolver behavior at `test/adapters/vba-sync/vba-execution-adapter.test.ts`.
- **`AccessRunner` skips the cross-process file lock for read-only paths — `dysflow_doctor`, `export_modules`, `export_all`** (round-3 Items 1+5+export, #750). The cross-process file lock that was acquired unconditionally before any PowerShell dispatch is now skipped for read-only paths (`dysflow_doctor`, `export_modules`, `export_all`, and any future read-only path). The previous behavior acquired the lock even when no Access process was about to be spawned, leaving orphan `.laccdb` lock files in the Access profile directory after every `dysflow_doctor` call. Three new test files pin the contract: `test/core/runner/access-runner-readlock.test.ts` (175 lines), `test/e2e/access-runner-readlock.e2e.test.ts` (136 lines), and `test/core/scripts/dysflow-access-runner-static.test.ts` (217 lines).
- **Diagnostics branch returns BEFORE the canonical Access-open path** (round-3, #750). Even when the cross-process file lock is acquired, the diagnostics branch (`dysflow_doctor` `includeEnvironment:false`) now returns its result BEFORE the canonical Access-open path runs. Previously the canonical path could execute (and modify `.accdb` file metadata such as the `LastModified` stamp) even when the diagnostics had already concluded. The Access file is now guaranteed to remain unmodified on the diagnostics path. Companion to the read-only lock skip above; together they fix the "doctor modified my `.accdb`" finding.
- **Test suite repair for #750's read-only dispatch** (#751 follow-up, `1ac39d9`). Pre-existing tests in `access-runner.test.ts` and `access-runner-lock-heartbeat.test.ts` assumed the canonical Access-open side-effect was always reached. Updated to skip non-Windows / use `existsSync` to skip when Access COM is unavailable, so CI stays green without compromising the new read-only contract.
- **CI lint repair (TypeScript + biome)** (#751 follow-up, `8286ae0`). Sorted imports per biome (alphabetical order) and added optional chaining (`?.`) for `tool.inputSchema` (TS18048) to keep `pnpm lint` green after the round-3 changes.
- **Tool count unchanged**: 68 visible MCP tools. This release is a behavior/internal-contracts fix; no tool was added, removed, or renamed.

Implementation commits (PR #751): `7a95687`, `a215b93`, `47e7d1c`, `1ac39d9`, `8286ae0`. Merge commit: `e78449b`.

## [v1.15.7] - 2026-07-06

- **Export trust contract** (#745): `export_modules` and `export_all` now set `ok: false` when any module produces warnings instead of silently returning success with zero files written. New `Build-ExportResultSummary` function (renamed from `Merge-ExportResultSummary` to avoid PowerShell 5.1 cmdlet collisions) is the single source of truth for the export result trust contract. 4 Pester test atoms verify the contract across clean/partial/total failure scenarios.
- **`AccessVbaService.execute({dryRun:true})` short-circuit** (#746): when the top-level service receives `dryRun: true`, it returns a structured plan without opening Access, spawning PowerShell, or touching any state. Covers the MCP dispatch path so every vba-sync tool that sets `dryRun:true` reaches this guard.
- **`dryRun:true` for `test_vba` and `delete_module`** (round-3 Item 5): both tools now accept an explicit `dryRun:true` parameter that returns a structured plan without running VBA or deleting anything. `dryRun:true` is EXPLICIT-ONLY (no default) so production operations don't accidentally dry-run. Schema additions in `vba-sync-schemas.ts`, adapter short-circuits in `vba-execution-adapter` and `vba-modules-adapter`, `DeletePlanResult` type in `vba-import-plan.ts`. RED tests in both adapter test suites.
- **`resolve_project` tool** (round-3 Item 1): new read-only MCP tool that resolves a project identity to its Access/backend paths via the `ProjectRegistry`. Pure helper `tryResolveProject()` — never opens Access, never mutates state. Registered in `MODERN_TOOL_NAMES` and `MCP_TOOL_CONTRACTS`. 8 dedicated tests. Tool count now 68.

## [v1.15.6] - 2026-07-06
- Fix every write-class MCP tool contract (`MCP_TOOL_CONTRACTS`) to declare `dryRunDefault: true`, aligning the `get_capabilities` snapshot with the AGENTS.md + CHANGELOG v1.14 promise of "standardized dryRun defaults". Previously `contractFromGeneratedRoute` set `dryRunDefault: route.kind !== "vba-sync"`, which silently returned `false` for every vba-sync route (`import_modules`, `import_all`, `compile_vba`, `delete_module`, `fix_encoding`, `vba_inline_execution`, `dysflow_form_*`, `create_form_from_template`) and made the global `dryRunDefault` aggregate return `false` whenever any of those tools existed — directly contradicting the documented "plan first by default" stance. The dispatcher path already honors `dryRun: true` for these tools (`resolveIsDryRun` for query aliases, `buildMaintenanceRequest` for query-maintenance, `VbaModulesAdapter.execute`'s `params.dryRun !== false` rule for vba-sync), so the contract surface now reflects reality. RED test covers the per-tool contracts and the global snapshot field; 504/504 MCP suite tests pass (#746).
- Fix `form_serialize` (`src/adapters/vba-sync/vba-forms-serialization-tools.ts:serializeForm`) to honor the round-trip guarantee documented on `serializeFormTxt` (`serializeFormTxt(parseFormTxt(x)) === normalizeLineEndings(x)`). Previously `byteEqual = serialized === originalText` compared against the RAW original so any CRLF fixture (the realistic Access SaveAsText encoding on Windows) reported `byteEqual: false` and `byteDiff > 0` even on a clean round-trip — the existing RED test `byteEqual is true for a clean round-trip fixture` had been failing on every CI run since the test landed in PR #741. `byteEqual` and `byteDiff` now both compare against `normalizeLineEndings(originalText)`: a clean round-trip reports `byteEqual:true, byteDiff:0` for either CRLF or LF originals, and real content mutations (BOM, whitespace, etc.) still flip them. 2347/2347 unit tests pass, including the previously-blank RED (#747).

- Fix `Export-VbaModule` so form `.form.txt` files and their sibling `.cls` code-behind files always carry `Attribute VB_Name = "<FormName>"` as their canonical identity. Two pure helpers do the work: `Ensure-VbNameAttributeAtTop` (top-of-file guard for the .cls sibling emission that `$codeModule.Lines(1, N)` cannot include for document modules in Access) and `Ensure-CodeBehindFormVbName` (post-`SaveAsText` guard for the `.form.txt` `CodeBehindForm` block, which the binary may already be missing on legacy graphs that imported through older dysflow versions). Without either, Access invents `Form_TempSccObj1`, `Form_TempSccObj2`, ... on the next import and downstream `Me.<Control>` references fail with "No se encontró el método o el dato miembro". Both helpers are exposed via the existing `dysflow-vba-manager.Tests.ps1` AST harness (no COM required); 9 new Pester tests pin the contract (RED→GREEN) and 152 existing tests stay green (#743). Update to the stale "Attribute VB_Name + Option Explicit are stripped" comment in `dysflow-vba-manager-unicode-roundtrip.Tests.ps1` to reflect the new emission-side contract.

## [v1.15.4] - 2026-07-05

- Fix `import_modules` with `compile:true` to roll back the partial write when the post-import project-wide compile fails. New `snapshotModulesForRollback` exports the binary state of every imported module via `export_modules` BEFORE the import; on a trustworthy compile failure (standard/class only, not the document-module unverified gate) the snapshot is re-imported with `importMode:"replace"`, leaving the `.accdb` in its pre-call state. Brand-new modules that did not exist pre-call are flagged `rollbackFailed: true, rollbackReason: "no_baseline_snapshot"` as a best-effort warning (NOT deleted). New `rollbackOnCompileFail: boolean` schema knob (default `true`); set to `false` to preserve the legacy partial-write behavior. Fixes the `import_modules` partial-write state (#732, #737).
- Fix `lint_module` `identifier-safety` rule to support per-rule overrides and legacy auto-detection. `capabilities.lint.rules.<RuleId>.enabled: false` emits a single `LINT_SUPPRESSED` info diagnostic and suppresses the rule entirely. When the operator's `src/` contains at least one non-ASCII identifier AND no `.dysflow-no-auto-allow` marker is present, `identifier-safety` non-ASCII findings downgrade from `error` to `warning` so legacy Spanish-language projects no longer fail the import_modules pre-import gate. The dot-underscore and reserved-word sub-rules stay at `error` severity in both paths. Fixes the `identifier-safety` false positives on legacy non-ASCII VBA identifiers (#731, #736).
- Fix `Open-CanonicalAccess` in `scripts/lib/dysflow-access-com.ps1` to force `Visible`/`UserControl` to `$false` BEFORE `OpenCurrentDatabase` so the Microsoft Access splash never paints. The previous post-spawn `try { Visible = $false } catch { Write-Debug }` rescue was both too late (the splash had already painted) and too silent (the failure was lost in `Write-Debug`). On failure, the canonical now throws a typed `DYSFLOW_HEADLESS_LAUNCH_FAILED` so the regression is loud. Fixes the `import_modules` visible-window violation on the write path (#730, #734).

## [v1.15.3] - 2026-07-05

- Fix `verify_code` phase-aware timeout errors and `moduleNames` subset forwarding. Focused `verify_code` calls now report a typed Dysflow error (`VERIFY_CODE_PHASE_TIMEOUT` for preflight/compare stalls, refined `VBA_MANAGER_TIMEOUT` for export stalls with `details.durationMs` and post-timeout `details.cleanupTimedOut`) before the outer MCP request timeout, and `moduleNames` is confirmed to scope the live Access export (no `-ModuleNamesJson` is emitted for whole-project verifies). Empty `moduleNames: []` is rejected with `INVALID_INPUT` so a focused call cannot silently widen to the whole project (#715, #728).

## [v1.15.2] - 2026-07-05

- Fix `lint_form_code` `form-control-binding` false positives for intrinsic Access Form/Report `Me.*` members such as `Name`, `Caption`, `InsideHeight`, and `InsideWidth` (#725, #726).

## [v1.15.1] - 2026-07-05

- Fix `lint_form_code` nested-control resolution so form-code lint reuses the same recursive FormIR control collection as form inspection. This prevents false `controls: <none>` missing-control diagnostics for nested controls such as `FormDetalle` in real Access forms (#714, #723).

## [v1.14.2] - 2026-07-03
### e2e-suite-contracts-pin-sync (#666)
- **Repo-side CI fix — `test/quality-gates/mcp-e2e-suite-contracts.test.ts`
  advertised-tool-count string pin bumped `"54 tools" → "61 tools"`.** The
  meta-test reads the harness source and asserts a literal substring; it was
  pinned to the pre-#655 count and started failing once the harness moved to
  61. The runtime of v1.14.1 was unaffected (the harness itself was correct),
  but every CI run on the release-prep commit (`a23f502`) flipped red. With
  this commit, all three advertised-count pins are back in sync:
  - `E2E_testing/mcp-e2e.mjs` (runtime gate) — 61
  - `test/adapters/mcp/advertised-tool-count.test.ts` (unit pin) — 61
  - `test/quality-gates/mcp-e2e-suite-contracts.test.ts` (meta guard) — 61
- **No user-facing product changes.** Pure test-infrastructure patch.

## [v1.14.1] - 2026-07-03
### e2e-harness-sync (#665)
- **Release-gate fix — `E2E_testing/mcp-e2e.mjs` advertised count bumped `54 → 61`.**
  The harness hardcoded `advertised.length === 54` while
  `test/adapters/mcp/advertised-tool-count.test.ts:25` already pinned **61** (the count
  after the gate-introspection epic added `get_capabilities` in PR #661). Every
  pre-release E2E run flipped the protocol preflight red and aborted the battery on
  STOP-ON-FAIL — the release gate was broken since v1.14.0. The two are pinned together
  by an explicit comment in the harness (`update both together`); this commit realigns
  them so the gate runs green.
- **`get_capabilities` E2E coverage added** (epic #655, PR #661). New
  `capabilities` area row exercises the tool through the suite-owned PID wrapper
  (`record()`, with preflight + post-tool `:zombie-check`). A second row,
  `get_capabilities:toolsVisible-matches-advertised`, cross-checks the
  snapshot's `toolsVisible` against the live registry — drift between the unit pin
  and the live MCP server now surfaces immediately in the report instead of failing
  silently.
- **`E2E_testing/README.md` rewritten** with the testing strategy (`pnpm test` →
  `pnpm test:integration -t <pattern>` → targeted JSON-RPC smoke → full battery only
  at release), the `record()` invariant, the launcher sync path (`bin/dist/`, NOT
  `app/dist/`), and the maintenance rule that keeps the harness in sync with new
  feature/bug work in the same PR.

## [v1.14.0] - 2026-07-03
### get-capabilities-mcp (#656)
- **New `get_capabilities` MCP tool exposes a single introspectable source-of-truth
  for the MCP write gate, per-project `allowWrites` resolution, the `allowedProcedures`
  allowlist gate, and the implicit `dryRun:true` default.** A new IA consumer calls this
  tool once per session and decides every subsequent call without consulting docs. The
  adapter (`src/adapters/mcp/get-capabilities-tool.ts:195`) emits a structured JSON
  payload keyed by gate, listing the resolved write posture, the matched
  `allowWrites` project, the currently-allowed procedure prefixes, and the runtime's
  default `dryRun` policy. Wired into the tool registry at
  `src/adapters/mcp/tools.ts:21` and the dispatch contracts at
  `src/adapters/mcp/mcp-tool-contracts.ts:9`. Three unit tests pin the contract at
  `test/adapters/mcp/dysflow-get-capabilities-tool.test.ts:207`,
  `test/adapters/mcp/capabilities-via-dispatch.test.ts:61`, and
  `test/adapters/mcp/release-matrix-gate.test.ts:7`.

### project-capabilities-config (#657)
- **New `.dysflow/project.json` `capabilities` consolidated block** lets operators
  declare per-project capability hints in a single, version-controlled location
  (`src/core/config/dysflow-config.ts:197` — `capabilities.*` with `tools`,
  `procedures`, `writes`, and `dryRun` sub-keys). The block is consumed by
  `get_capabilities` (#656) and by the MCP tool-contracts layer so a future
  consumer never needs to re-derive project intent from docs. The node loader
  (`src/adapters/config/dysflow-config-node.ts:27`) merges the block with sensible
  defaults. Two unit tests pin the contract:
  `test/adapters/config/dysflow-config-capabilities-block.test.ts:237` and
  `test/adapters/config/dysflow-config-discovery-fallback.test.ts:267`.

### allowed-procedures-discovery (#658)
- **`allowedProcedures` discovery scans `src/` by default and emits the union of
  declared procedure prefixes.** The discovery service
  (`src/core/services/allowed-procedures-discovery.ts:341`) walks the project source
  tree, harvests VBA procedure declarations, and produces a `prefix:` allowlist
  ready to paste into `project.json`. A single-line `@dysflow: dangerous` comment
  on any `Sub`/`Function` declaration opts that procedure OUT of the prefix list
  (mirroring the existing `@dysflow:` annotation convention) — dangerous entry
  points must be opted in explicitly. The MCP adapter
  (`src/adapters/discovery/allowed-procedures-adapter.ts:88`) renders the discovery
  result for `get_capabilities`. Five unit tests at
  `test/core/services/allowed-procedures-discovery.test.ts:565` pin the contract:
  default scan, dangerous opt-out, empty project, nested modules, and
  prefix-collision rules.

## [v1.13.1] - 2026-07-02
### compile-vba-exit-code (#543)
- **`compile_vba` now exits non-zero when VBA compilation fails.** The top-level PowerShell `Compile`
  action previously called `Invoke-CompileAction -Json`, which emits the structured `DYSFLOW_RESULT`
  sentinel but returns `$null`; the subsequent `$compileActionResult` check therefore never detected a
  failed compile and the process exited `0`. The TypeScript adapter could then receive a structured
  `VBA_COMPILE_ERROR` payload as a non-error MCP result. The handler now calls
  `Invoke-CompileVbaProject` directly, writes the same structured payload, and exits `1` when
  `ok = false`, so failed compilations travel through the adapter's structured-error path.

### runtime-guard-exportpath (#644)
- **Fix runtime-guard regression on `export_modules` / `export_all` (#644).** The F1 destinationRoot guard (#619, `src/adapters/vba-sync/vba-modules-adapter.ts:223-241`) fired against the orchestrator's resolved `destinationRoot` even when the user had explicitly supplied a safe `exportPath`. When the user passes `exportPath`, the runner writes to that path (the guard above already validated the user's intent) — the orchestrator's resolution is irrelevant for the safety check. The fix narrows the F1 guard to fire ONLY when the user did NOT provide an `exportPath` (`exportPath === undefined && isWithinRuntime(target.data.destinationRoot, env)`). The no-exportPath safety net (#619 F1) is preserved for callers who rely on the orchestrator's project-config resolution. Three new unit tests in `test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts` and `test/adapters/mcp/runtime-guard-dispatch-exportpath.test.ts` pin the contract at the unit layer (mirror the E2E test at `test/e2e/runtime-guard-mcp-integration.e2e.test.ts:309-331`, which now passes); both fail RED against the pre-fix code and pass GREEN after the conditional. The MCP-dispatch-path test goes through `createDispatchTool` → `validateInput` → `services.vbaSyncToolService.execute` → `VbaModulesAdapter.execute`, so future regressions in the schema validator, the dispatch handler, or the orchestrator wiring surface at the cheap unit layer instead of waiting for the expensive E2E.

### vba-import-vbname-preserve (#646)

#### Bugfix — `Attribute VB_Name` was dropped on every VBA import, silently corrupting module identity
- **`Normalize-VbaImportText` no longer strips `Attribute VB_Name`.** `Test-IsVbaImportMetadataLine`'s
  broad `^Attribute\s+VB_` match caused the import-normalization path to strip `Attribute VB_Name`
  along with every other `Attribute VB_*` line before every `AddFromFile` write, so `VB_Name` never
  reached the compiled binary. Reimporting affected forms dropped their identity line and could cause
  Access to spawn a broken placeholder component. A new predicate,
  `Test-IsVbaImportDroppableMetadataLine` (identical to the old one except it excludes
  `Attribute VB_Name`), is now used at both `Normalize-VbaImportText` call sites. The original
  `Test-IsVbaImportMetadataLine` is unchanged and still used by `Split-VbaHeaderAndBody` /
  `Merge-AccessDocumentWithCanonicalHeader`, which correctly need the broad match to avoid emitting a
  duplicate `Attribute VB_Name` line.
- **`verify_code` no longer masks a one-side-missing `Attribute VB_Name` as `attributeOnly`.** The
  semantic classifier's `keepVbName` flag previously stripped `VB_Name` from both sides whenever
  *either* side omitted it, hiding this exact import defect from drift audits. `keepVbName` now
  triggers whenever the two sides disagree (a real rename, or one side omitting it entirely), so the
  dropped-identity defect surfaces as an actionable difference instead of a non-functional one.

### mcp-writes-enabled-default (#645)

#### Trust-posture change — `dysflow mcp` now starts with writes enabled by default
- **`dysflow mcp` (stdio) enables write-capable tools by default.** Previously, bare
  `dysflow mcp` started read-only and required `--enable-writes` to unlock
  `delete_module`, `import_modules`/`import_all`, write-mode SQL, cleanup with
  `force: true`, `vba_inline_execution`, and other write-gated tools. The stdio
  surface is process-ownership-trusted (the parent process that spawns `dysflow mcp`
  is the operator), so the friction of a manual opt-in every session was not
  justified — see `docs/security/adapter-write-gates.md#process-wide-write-default`.
- **New `--disable-writes` flag opts out** to the previous read-only behavior:
  `dysflow mcp --disable-writes`. `--enable-writes` is still accepted as a
  backward-compatible no-op. Passing both `--enable-writes` and `--disable-writes`
  together is rejected (`exitCode 1`) with a mutual-exclusion error and usage.
- **`dysflow serve` (HTTP) is unaffected** — the network surface keeps its
  writes-disabled-by-default posture; this change is stdio-only.
- **Per-repo `allowWrites` is unaffected** — set `"allowWrites": false` in a repo's
  `.dysflow/project.json` to keep that project read-only even while the process-wide
  MCP default is enabled.
- **Action required**: agents/scripts relying on the old read-only-by-default stdio
  behavior must add `--disable-writes` (or set `"allowWrites": false` per repo) to
  preserve the previous posture after upgrading.

### hexagonal-tech-debt (#624)

#### #B.2 ELIGIBLE_STATUSES unification (PR 1 of 5)
- **Fix latent cleanup-eligibility divergence for `pid_unknown` records.** `ELIGIBLE_STATUSES` was historically declared in two places with different membership: `src/core/operations/access-operation-preflight.ts` (4 statuses, includes `pid_unknown`) and `src/core/operations/access-operation-cleanup.ts` (3 statuses, missing `pid_unknown`). The new canonical module `src/core/operations/access-operation-status.ts` exports the single source of truth (`ReadonlySet<AccessOperationStatus>` with `{timed_out, failed, cleanup_pending, pid_unknown}`); both preflight and cleanup now import (and re-export) the same `Set` reference. Net runtime behavior change: **none** — preflight already treated `pid_unknown` as eligible, and cleanup's `pid_unknown` refusal is governed by an independent `CLEANUP_PID_UNKNOWN` guard at `access-operation-cleanup.ts:124` that runs BEFORE the `ELIGIBLE_STATUSES.has(...)` check. The fix closes the latent divergence that would have surfaced as a 4-vs-3 mismatch on any future membership edit.

#### #A FS port injection (PR 4 of 5)
- **Extract Node FS ports for `FileAccessOperationRegistry` and `VbaFormService` (hexagonal split).** Both files no longer import `node:fs/promises` directly — every filesystem call now routes through an injected port. `FileAccessOperationRegistry` accepts a `fileSystem: RegistryFileSystemPort` option (default = `nodeRegistryFileSystem` at `src/adapters/operations/node-registry-file-system.ts`); the port surface explicitly supports the `wx` flag on `writeFile` for the atomic lock creation in `acquireRegistryMutationLock` (the flag is the primitive that gives registry acquisition its mutual-exclusion guarantee — removing it would silently break the lock). `VbaFormService` keeps its existing `VbaFormServiceOptions.fileSystem` injection seam; the default `nodeFileSystem` constant was moved out of `src/core/services/` to `src/adapters/services/node-form-file-system.ts`. Production behavior is byte-equivalent (defaults wire the Node impl). Both new test files pin the post-refactor contract: `test/core/operations/access-operation-registry-file-system-port.test.ts` (4 tests: port injection, `wx`-flag regression pin, default Node adapter, failing-fake adversarial) and `test/core/services/vba-form-service-file-system-port.test.ts` (4 tests: port injection, default Node adapter, failing-fake adversarial, structural pin that the source no longer imports `node:fs/promises` and no longer declares a local `const nodeFileSystem`). The `core-boundary.test.ts` ratchet gains a parallel `KNOWN_ADAPTER_IMPORT_DEBT` set for these two files; the cleaner pattern (port REQUIRED in core, default wired from the composition root, per the `cross-process-lock.ts` precedent) is deferred to a follow-up that does not require touching the 37 existing test sites that construct the registry without a port.


### form-ir-bugs (#622)

#### F2 (PR 2 of 3 — this PR)
- **Preserved-metadata key predicate is now exact-match** in `applyTokenMap` (`src/core/services/form-ir-service.ts`). Keys that share a prefix with a preserved key (e.g. `FormatConditions`, `FormatHeader`) are no longer mis-classified as preserved; they flow through token replacement like ordinary layout keys. **Behavior change** for any template whose `{{Token}}` lives inside a `Format*` (or `PrtDevMode*` / `Checksum`) key — that token now gets replaced.
- **`appliedTokens` now reflects actual replacement**, derived from a post-IR serialization diff (`serializeFormTxt(next)` vs source tokens). Previously `appliedTokens` was `Object.hasOwn(tokenMap, sourceToken)`, which lied when a token's only occurrence lived inside a preserved metadata key — the result reported `applied` while the serialized IR still contained `{{Token}}`. **Behavior change — strict policy**: a source token whose only `{{...}}` occurrence lives inside a preserved metadata key now triggers `FORM_MUTATION_INVALID` under `missingTokenPolicy: "strict"`. Previously the operation reported success. `warn-pass-through` (default) is unchanged for the IR text — preserved keys still keep their tokens verbatim — only the truth of `appliedTokens`/`missingTokens` changes.
- **Action required for strict-policy users**: if your source forms contain tokens inside `Checksum`, `Format`, or `PrtDevMode` scalars, either widen the token map to cover them or remove the tokens from the preserved-key scalars before re-running under strict policy.

#### F3 (PR 3 of 3 — this PR)
- **`catalogAddControl` now refuses a corrupt catalog with `VBA_CATALOG_CORRUPT`** instead of silently overwriting it with a one-control stub. The catalog read happens BEFORE the `dryRun` short-circuit, so corruption is visible in both `apply` and `dryRun`. **Behavior change**: any caller that previously got silent overwrites on a corrupt catalog now receives `{ ok: false, error: { code: "VBA_CATALOG_CORRUPT" } }` and the on-disk catalog is NOT modified. **Recovery**: inspect the catalog file at the path in the error message, restore from backup, or delete it to let the tool rebuild it on the next run. ENOENT (genuinely missing catalog) keeps existing behavior — the operation proceeds with an empty catalog.

### mcp-contract-safety (#621)

#### F1 (PR 1a of 4 — this PR)
- **`run_vba` / `dysflow_vba_execute` now default-deny** when no `allowedProcedures` is configured and `dryRun: true` is not passed. The MCP contract (`MCP_TOOL_CONTRACTS`) reclassifies both as `conditional-write` / `writeGate: "conditional"` with summaries that mention the allowlist and `dryRun`. The handler at `canonical-handlers.ts:ensureProcedureAllowed` refuses with `MCP_INPUT_INVALID` (text matching `/allowedProcedures|dryRun/`) when the call would otherwise run arbitrary compiled VBA. `dryRun: true` is the explicit escape hatch for unconfigured projects. `test_vba` contract metadata is also reclassified; runtime gate for `test_vba` lands in PR 1b.
- **`AccessVbaRequest` gains `dryRun?: boolean`** (`src/core/contracts/index.ts`) — projects through `buildRunVbaRequest` (`alias-tools.ts`) and the modern handler. Schema exposes `dryRun: boolean` on both `VBA_EXECUTE_SCHEMA` (`dysflow-schemas.ts`) and the legacy `run_vba` schema (`vba-sync-schemas.ts`). Migration: agents that relied on implicit ad-hoc `run_vba` with no allowlist must either set `allowedProcedures` in `.dysflow/project.json` or pass `dryRun: true`. See `docs/mcp-examples.md` (updated separately) for the new pattern.

#### F2 (PR 2 of 4)
- **`dysflow_query_execute` write mode now accepts `allowTables` / `denyTables`** — same semantics as `exec_sql`. The `QUERY_EXECUTE_SCHEMA` advertises the fields (`src/adapters/mcp/schemas/dysflow-schemas.ts`) and the modern handler passes them through to `AccessQueryService.execute()` via the existing `...request` spread. The PowerShell layer (`scripts/dysflow-access-runner.ps1:1062-1072`) already enforces them for the legacy path; modern was just missing the schema declaration.
- **`dysflow_access_cleanup` now passes through the full `CLEANUP_SCHEMA` surface** (`operationId` + `accessPath` + `force` + `projectId` + `contextId` + `backendPath` + `destinationRoot` + `projectRoot` + `timeoutMs` + `strictContext` + `expectedAccessPath` + `expectedProjectRoot` + `expectedDestinationRoot`). The previous bare cast at `tools.ts` silently dropped every field except the three required ones. Both `CLEANUP_SCHEMA` (modern) and the legacy `cleanup_access_operation` schema now declare the same optional surface; both handlers route through `buildCleanupRequest`, producing identical field sets. The core cleanup service does not yet enforce `strictContext` (forward-compat only — that ripples through `AccessOperationCleanupService.cleanup()` signature + `stdio.ts:243-255` + `access-operation-preflight.ts`; tracked as a follow-up). Additive — non-breaking.

#### CI (PR 3 of 4)
- **Release CI now fails when `title !== tag_name`** on `release: [created, edited]`. The new `.github/workflows/release-title-guard.yml` workflow asserts the invariant and reports both values on mismatch so a maintainer can re-set the release title in the GitHub UI without re-running the workflow. `release.yml` also passes `name: ${{ github.ref_name }}` to the `softprops/action-gh-release@v3` step so the published release's name field equals the tag by construction (defense-in-depth — the guard catches post-creation edits). Pinned by `test/quality-gates/release-title-guard.test.ts`.

### process-lifecycle-safety (#620)

#### F2
- **`dysflow_access_cleanup(force: true)` now refuses to kill a `running` operation whose owned PID is still alive (`CLEANUP_RUNNING_FORCE_REFUSED`).** Previously, `force: true` bypassed the running gate entirely, which violated the "this tier must not kill anything" rule for an operation that is still legitimately in flight (and can take minutes). Callers that relied on the old bypass must wait for natural completion or update the registry record to a terminal status first. Dead-PID running records (process already gone) remain cleanable.

#### F3a
- **Orphan kill at preflight sites (`scanAndCleanOrphans`, `retireUnownedRecord`) now revalidates the PID immediately before calling `processKiller.kill`.** Closes the TOCTOU race where a PID is recycled (killing an unrelated process) or the original process exits between scan and kill. If `processInspector.getProcess(pid)` returns `undefined`, the kill is suppressed and a warning diagnostic is recorded naming the PID. If the revalidation shows a different process (`name` mismatch or `startTime` mismatch), the kill is refused with a `CLEANUP_RACE_PID_REUSED` diagnostic embedded in `result.errors[].message`. Mirrors the pattern already used by `AccessOrphanCleanupService.cleanupOrphan` (`src/core/operations/access-orphan-cleanup.ts:124-141`).

#### F3b
- **`runWithAccessExecutionLock` now accepts an optional 6th parameter `onHeartbeatError`.** Production wiring (`AccessPowerShellRunner.run`) supplies an explicit sink that collects non-ENOENT heartbeat failures (e.g. `EPERM`, `EIO`) and surfaces them as warning `access.heartbeat` diagnostics on the returned `OperationResult`. ENOENT (lock already released) remains suppressed — that is the normal teardown race, not a failure. The default `onHeartbeatError` callback when the caller omits it is now a silent no-op; previously the default was a `console.debug` sink via `logSwallowedIoError` that nobody read. Callers that already pass an explicit callback are unaffected.

### runtime-path-safety (#619)

#### F2
- **`resolveExecutionTarget` branch 2 now propagates caller-supplied `backendPath`** instead of silently dropping it (#13228 family, #619).

#### F3
- **Empty-string caller overrides for `accessDbPath`/`backendPath`/`destinationRoot`/`projectRoot` are now treated as no override.** Previously `""` silently won the `??` precedence test, overwriting repo-config defaults. Callers relying on `""` as a fallback marker must now omit the field instead (#619).

#### F4
- **`export_all prune` no longer deletes legacy `.frm` orphan files.** The allow-list now exactly matches AGENTS.md: `.bas`/`.cls`/`.form.txt`/`.report.txt`. `.frm` (the legacy binary form format) is not in the managed allow-list and survives prune even when no matching VBE module exists (#619).


## [v1.13.0] - 2026-07-01

- chore(openspec): archive forms-ui-factory-slice-5-create-from-template - chore(sdd): apply-progress + tasks.md for slice 5 PR 3 ÔÇö 18/18 complete - feat(mcp): align parity registry + contract tests with new tool - docs(mcp): document create_form_from_template in README - chore(sdd): apply-progress + tasks.md for slice 5 PR 2 - test(integration): bench round-trip with injected {{FormName}} and {{TitleCaption}} tokens - feat(adapter): bench-cache-first path resolution and restore-on-failure for create-from-template - feat(mcp): register create_form_from_template with write gate - chore(sdd): apply-progress + tasks.md for slice 5 PR 1 - refactor(core): share preserved-metadata-key predicate with applyTokenMap - feat(core): add cloneFormFromTemplate + applyTokenMap (issue #618, slice 5 PR 1) - chore(openspec): scaffold slice 5 create-from-template change - feat(mcp-tools): expose serialize/deserialize for Forms IR (slice 3) - chore(openspec): archive forms-ui-factory-slice-4-mutation-primitives


## [v1.12.0] - 2026-06-30

- feat(forms): add MCP form mutation primitives (`form_add_control`, `form_move_control`, `form_rename_control`) with strict write gates and canonical LoadFromText verification on `Gestion_Riesgos.accdb`.
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
