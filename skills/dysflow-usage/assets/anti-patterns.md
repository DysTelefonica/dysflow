# Dysflow MCP Anti-Patterns

> **Source of truth**: live runtime observations + the `dysflow-arnes` skill §6 Anti-patterns and `dysflow-usage` §6. Each row is `Symptom | Fix` and is grounded in either a real guardrail (HR-N of `dysflow-arnes`) or a runtime error envelope (`references/error-codes.md`).
>
> **Use as**: pre-flight checklist before any dysflow MCP call. Each row pairs a smell with the canonical fix.

## Killing MSACCESS or generic process tools

| Symptom | Fix |
|---|---|
| `Stop-Process -Name MSACCESS` (any variant: `taskkill /F /IM MSACCESS.EXE`, `pkill MSACCESS`, `Get-Process | Stop-Process -Force`, `kill -9`) | Use only dysflow-owned cleanup paths: `list_access_operations` -> `cleanup_access_operation({operationId:<real>})`, or `access_force_cleanup_orphaned({pid:<listed>, implements_check:"orphans_msaccess", confirmedRequiresConfirmation:true})` AFTER explicit human approval. HR-2 of `dysflow-arnes`. |
| Forcing a kill on a `MSACCESS.EXE` you suspect is stuck | First read `list_access_operations` to confirm what `dysflow` itself owns. Then `cleanup_access_operation({force:false, operationId:<id>})` for owned operations. Only the orphan PID path should reach `kill` semantics. |

## Missing destructive confirmation

| Symptom | Fix |
|---|---|
| `delete_module({apply:true})` | Plan first, verify references and backup/export state, then add `implements_check:"delete_module_precheck", confirmedRequiresConfirmation:true`. |
| `compact_repair({apply:true})` | Back up the target and close VBE references, then add `implements_check:"compact_repair_precheck", confirmedRequiresConfirmation:true`. |
| `relink_directory({apply:true})` | Validate the backend path and production impact, then add `implements_check:"relink_directory_precheck", confirmedRequiresConfirmation:true`. |
| `localize_backend_links({apply:true})` | Confirm the irreversible conversion and backup linked data, then add `implements_check:"localize_backend_precheck", confirmedRequiresConfirmation:true`. |
| `drop_table({apply:true})` | Confirm the table is disposable test data or backed up, then add `implements_check:"drop_table_precheck", confirmedRequiresConfirmation:true`. |
| `teardown_fixture({apply:true})` | Confirm the creating test atom completed and the bounded predicate is correct, then add `implements_check:"teardown_fixture_precheck", confirmedRequiresConfirmation:true`. |

`apply:false` remains the non-mutating planning path and needs no second confirmation. Do not add this gate to reversible bulk sync, registry cleanup, or human-compile-gated VBA execution.

## Skipping the human-compile gate

| Symptom | Fix |
|---|---|
| Calling `compile_vba` directly | NEVER. Compile lives outside dysflow's surface. HR-1 of `dysflow-arnes`. |
| Passing `compile:true` on `import_modules` / `import_all` | Remove the flag. Route through the HR-1 human-compile loop: write source -> `import_modules({apply:false})` -> ask the human to Debug -> Compile VBA Project -> wait for "ya esta" -> THEN `test_vba`. |
| Calling `test_vba` while `humanCompilePending === true` | STOP. Ask the human, wait for "ya esta", then call. |
| Treating `test_vba` / `run_vba` "all green" as TDD-green without both user-confirmed compile AND all-green test result | Surface both gates; HR-7 of `dysflow-arnes`. |

## Caching runtime state across sessions

| Symptom | Fix |
|---|---|
| Trusting a remembered `adapterVersion` from a previous session | Re-run `bootstrap({})` at session start. The runtime is the only authority. |
| Reusing a `projectId` from a previous session without resolving it again | Call `resolve_project({cwd, projectId})` to verify the active project before any write-class dispatch. |
| Reusing an old worktree context after a config change | Call `register_worktree({cwd})` or `clear_worktree_cache({cwd})` to force a rescan. |
| Caching `effectiveDryRunDefault[toolName]` across sessions | Re-fetch the bounded `get_capabilities({view:"compact"})` block after bootstrap. |

## Misusing `apply` and legacy flags

| Symptom | Fix |
|---|---|
| Passing `dryRun: true` on a write-class tool | Replace with `apply: false`. See `migrationNotes.dryRun`. HR-9 of `dysflow-usage`. |
| Passing `options.confirm: true` | Replace with `implements_check: "stale_markers"` + `confirmedRequiresConfirmation: true`. See `migrationNotes.confirm`. |
| Passing `confirmOverwriteSource: true` alone | Set `destinationRoot` (or `allowConfiguredDestinationRoot: true`) AND pass `implements_check: "export_overwrites_source_precheck"` + `confirmedRequiresConfirmation: true`. See `migrationNotes.confirmOverwriteSource`. |
| Passing `confirmPid: 12345` alone | Set `pid: 12345` AND `implements_check: "orphans_msaccess"` AND `confirmedRequiresConfirmation: true`. See `migrationNotes.confirmPid`. |
| Calling `query_execute` with `apply: true` but no `mode` | Add `mode: "read"` or `mode: "write"`. `apply` alone never picks a write path. Runtime emits `MCP_INPUT_INVALID` with `error.missingParam:"mode"`. HR-3 of `dysflow-usage`. |
| Treating `toolsVisible` as one universal count | Use schema index for callable names and `toolInventory` for `{callable,advertised,surface}`. Bootstrap's legacy count is advertised; capabilities' legacy count is callable. |
| Auto-picking `availableProjects[0]` when `resolve_project` returns `ambiguous` | STOP. Ask the human. Pass the trio `projectId` + `projectChoiceReason:"user_selected_after_ambiguous_project"` + opaque `recoveryToken`. HR-11 of `dysflow-usage`. |
| Calling `setup_project` without `projectId` | Pass explicit `projectId`. Bootstrap is fail-closed; `cwd` basename is never used to invent an id. HR-10 of `dysflow-arnes`. |

## Skipping the worktree selector

| Symptom | Fix |
|---|---|
| Bypassing the per-call `cwd` / `projectId` / `accessPath` selector to "just use the default" | Per-call selector is REQUIRED when operating on a sibling worktree; inherit is unsafe. HR-10 of `dysflow-usage`. |
| Editing one worktree's `.dysflow/project.json` to point at another worktree | NEVER weaken the per-worktree guard. Use `register_worktree({cwd})` to pre-warm, `resolve_project({cwd,projectId})` to verify. HR-9 of `dysflow-arnes`. |
| Restarting the MCP to "switch worktrees" | Per-call `cwd` exists precisely to avoid restart. Never restart MCP for a worktree switch. |
| Reusing sibling paths the user never confirmed | HR-12 of `dysflow-pointer-rollout`: walk the Git worktree list dynamically; never hardcode the 9th target. |

## Misreading form-IR and shapes

| Symptom | Fix |
|---|---|
| Reading a `.form.txt` with `Read` to extract bindings that `analyze_form_ui` reported empty | Empty `bindings[]` means the form is **unattended**: bindings live in `Form_Open` / `Form_Load` of the sibling `.cls`. Use `map_form_behavior({sourcePath, autoFetchCodeGraph:true, outputMode:"full"})` + `verify_form_bindings({sourcePath, schema, outputMode:"full"})`. HR-14 of `dysflow-arnes`. |
| Hand-parsing `.form.txt` for `ControlSource =` | WRONG shape for unattended forms. Use the verify chain above. AP-12 of `dysflow-arnes`. |
| Using `query_sql` / `exec_sql` instead of `query_execute` | They are `status:"legacy"`. Migrate to `query_execute({mode})` (HR-3 of `dysflow-usage`). |
| Treating `_meta["dysflow/workflow"]` `status:"specialized"` as a recommendation | `status:"preferred"` is the recommendation set; `specialized` is for niche cases. |

## Misusing sandbox + production boundaries

| Symptom | Fix |
|---|---|
| Mutating `TbConfiguracionBackends` from test code | Tests READ it once via `BeginTestSession`; NEVER WRITE. Config table is production state. AP-8 of `dysflow-arnes`. |
| `DELETE` without `WHERE` (even in sandbox) | Use `TEST_ID_BASE` (900000+) as guard for fixture cleanup. AP-10 of `dysflow-arnes`. |
| `Debug.Print` / `MsgBox` in test atoms | `Debug.Print` is invisible to COM; `MsgBox` blocks unattended execution. AP-9 of `dysflow-arnes`. |
| Mocking to skip a real integration test | Fakes isolate LOGIC from DATA; never serve to skip the data-layer E2E. AP-7 of `dysflow-arnes`. |
| Editing the production `.accdb` or bypassing the `allowWrites` gate | NEVER; the per-call gate is authoritative in both policies. HR-3 of `dysflow-arnes`. |

## Bypassing dispatch invariants

| Symptom | Fix |
|---|---|
| Adding test names to `.dysflow/project.json` allowlist on each fix | Remove; test definitions live in `tests/*.json` only. HR-6 of `dysflow-arnes`. AP-6. |
| Treating a successful plan as agreement with apply for the same input | Verify plan succeeds with `moduleName` / `procedureName` populated before `apply:true`. If plan OK but apply returns `PROCEDURE_NOT_FOUND` or `PROCEDURE_NOT_CALLABLE`, force a manual VBE recompile and retry (HR-7 of `dysflow-arnes`). |
| Calling `run_vba` with bare `procedureName` and expecting plan/apply to agree | `procedureName` is parsed as `<module>.<procedure>` once and threaded through both paths. AP of `dysflow-usage` §6 row "Calling `run_vba` expecting plan/apply to agree". |
| Use the canonical `apply:false -> review -> apply:true` flow, then call the `apply` path with `dryRunWithPreflight:true` if your tool supports it | The `dryRunWithPreflight` flag in `sharedBlockSupport` is a tool-level capability. Honor it where present. |

## Defensive parsing mishaps

| Symptom | Fix |
|---|---|
| Treating `typeof raw === "object"` as proof that the response is a parsed envelope | OpenCode Code-Mode wraps the entire envelope as a JSON-encoded string. Branch on `env.schemaVersion === "dysflow.result/v1"` after `JSON.parse` if the raw is a string. See `dysflow-usage` §1 (defensive Code-Mode parse). HR-13 of `dysflow-arnes`. |
| Continuing to read payload when `schemaVersion` is missing or different | Fail closed. The discriminator is `dysflow.result/v1`; never invent a literal. |
| Failing to parse `error.missingParam` | When `MCP_INPUT_INVALID` is returned, `error.missingParam` (string, distinct from `rejectedFlag`) names the missing parameter. Surface it directly in the failure message. |

## Reading the run_vba / test_vba lifecycle

| Symptom | Fix |
|---|---|
| Calling `run_vba` and getting `PROCEDURE_NOT_FOUND` after a successful plan with the same `procedureName` | Force manual recompile in Access VBE (Debug -> Compile). The binary's compiled p-code is stale; do NOT chase a phantom import issue. AP of `dysflow-usage` §6. |
| Calling `run_vba` and getting `RUNNER_FAILED` whose message matches `Excepcion al llamar a "Run"` | The reclassifier at `src/core/services/vba-service.ts::reclassifyRunnerFailure` missed it. File a dysflow bug with the payload + runner log. |
| Claiming "TDD-green" without BOTH user-confirmed compile AND all-green `test_vba` result | Surface both gates; HR-1 / HR-7 of `dysflow-arnes`. |

## Project-config migration mistakes

| Symptom | Fix |
|---|---|
| Hand-editing `.dysflow/project.json` to convert legacy `accessPath` | Use `migrate_project_config({cwd, apply:true})` (HR-13 of `dysflow-codegraph-update`). For one-line refactor: replace `"accessPath": "../../.../frontend.accdb"` with `"frontendFile": "frontend.accdb"`. `frontendFile` is a basename; the runtime resolves it against the active worktree root, so the same config works across every worktree. Per-call override (`accessPath`) still wins when a genuinely different frontend is needed. |
| Treating a sibling id passed as `projectId` as a free choice | Duplicate sibling ids fail with `PROJECT_ID_COLLISION` rather than first-match behavior. `resolve_project({outcome:"ambiguous"})` is the only path forward. |
| Editing `<legacy-skills-mirror>` directly | Deprecated mirror (issue #9). The installer owns propagation to supported agent SkillsDirs. |

## See also

- `dysflow-arnes/SKILL.md` §6 Anti-patterns (the canonical AP-1..AP-12 list).
- `dysflow-usage/SKILL.md` §6 (the runtime-shape APs from this file's mirror).
- `references/error-codes.md` for the typed envelopes referenced by these fixes.
- `assets/examples/<tool>.md` for per-tool "Common errors" tables that map to this file.
- `assets/scripts/verify-examples-vs-runtime.ps1` for an automatic structural check that catches re-introductions.
