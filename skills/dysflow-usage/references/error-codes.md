# Dysflow MCP Error Codes Reference

> **Source of truth**: candidate-runtime full schema and selective `describe_tool({name:"<X>"}).errorCodes` captures verified for the v4.5.1 release on 2026-10-25. The runtime is authoritative.
>
> **How to update**: re-run `describe_tool({name:"X"})` for one tool per preferredAgentWorkflows phase, aggregate the union into the table below, bump the version / commit / run the canonical verifier.
>
> **Companion to** `dysflow-usage/SKILL.md` §3 Decision Gates and §6 Anti-patterns. Referenced from each scaffold in `assets/examples/<tool>.md`.

## Envelope contract

Every MCP response carries a top-level `schemaVersion: "dysflow.result/v1"`. On error:

```json
{
  "ok": false,
  "schemaVersion": "dysflow.result/v1",
  "isError": true,
  "error": {
    "code": "MCP_INPUT_INVALID",
    "message": "...",
    "remediation": "...",
    "toolName": "<the failing tool>",
    "missingParam": "...",
    "rejectedFlag": "...",
    "rejectedFlags": [],
    "toolCommitFlag": "apply"
  }
}
```

Discriminate on `schemaVersion` BEFORE reading the payload; the parser pattern lives in `dysflow-usage` §1 (defensive Code-Mode parse).

## Error code taxonomy

| Code | Category | When it fires | Recovery |
|---|---|---|---|
| `SCHEMA_VIEW_REQUIRED` | discovery routing | `schema` was called without explicit `view`; the handler preserves a typed error instead of generic validation. | Retry with `view:"index"`, `"compact"`, or deliberate `"full"`. |
| `PROJECT_CONTEXT_MISSING` | context resolution (#1867) | The call names no `cwd`, `projectRoot` or `projectId`, no project is fixed for the session, and the MCP startup cwd is not a configured project. | Pass `cwd` set to the worktree root, or call `resolve_project` with that `cwd` first. |
| `MCP_INPUT_INVALID` | input schema | Input fails JSON-Schema validation (missing required field, wrong type, parameter outside the anyOf alternatives). Same code is also returned for rejected legacy flag combinations (`dryRun:true`, `options.confirm:true`, etc. — see `migrationNotes` in `get_capabilities`). | Re-run `describe_tool({name:"X"})` or `schema({view:"full"})` and align the call. Migration map for legacy flags is in `dysflow-usage/SKILL.md` §6. |
| `FROMCWD_NOT_FOUND` | project bootstrap | `setup_project` received a `fromCwd` whose `.dysflow/project.json` does not exist. | Pass an existing source worktree containing `.dysflow/project.json`, then retry with `overrideProjectRoot` equal to the target `cwd`. |
| `FROMCWD_CONFIG_INVALID` | project bootstrap | The `fromCwd` config is malformed or does not pass project-config validation. | Repair the source config and confirm it resolves as write-ready before retrying the import. |
| `MCP_WRITES_DISABLED` | process gate | Process-level `writesProcess.enabled === false`. Every write-class call returns this code until the MCP is restarted with `--enable-writes`. | Restart the MCP server to enable writes, OR pass `apply:false` to preview. The removed `dryRun` input is not accepted. The catalog's `errorCodes[MCP_WRITES_DISABLED]` hint is derived per tool from its inputSchema, so it only names a plan flag that tool accepts. |
| `CAPABILITIES_DISALLOW_WRITE` | project gate | Project-level `capabilities.allowWrites === false`. Set in `.dysflow/project.json`. Independent of process gate. | Update `.dysflow/project.json` `capabilities.allowWrites` to `true`, then retry the call. |
| `PROJECT_ID_MISMATCH` | project resolve | The `projectId` you passed does not match the resolved project (from `.dysflow/project.json`, cwd-aware worktree detection, or recovery-token answer). | Drop the `projectId` and let the resolver pick, OR pass the correct `projectId` + the recovery-token trio (`resolve_project({outcome:"resolved"})` first). See HR-11. |
| `WRITE_LOCKED_BY_RUNNING_OP` | concurrency | A concurrent dysflow operation holds the project's write lock. | Wait for the in-flight operation to finish, OR call `cleanup_access_operation({operationId:"<real id>"})` to retire it explicitly. Never `Stop-Process -Name MSACCESS` (HR-2 of `dysflow-arnes`). |
| `OUTSIDE_PROJECT_ROOT` | path containment | The target path (read or write) sits outside the configured `projectRoot` / `destinationRoot`. Case-insensitive on Windows. | Pass a path that sits inside the project root, OR use a linked worktree (HR-9 of `dysflow-arnes`) and operate on it. |
| `DESTINATION_ROOT_NOT_FOUND` | path resolution | The effective destination directory does not exist; the error names the exact normalized path. | Create or restore that directory, then recheck project readiness and retry the same target. For genuinely missing or invalid project configuration, preview `setup_project` first; a valid hand-authored config needs no provenance reset. Note `export_modules` / `export_all` also fire `DESTINATION_ROOT_REQUIRED` BEFORE this guard if neither `destinationRoot`, `exportPath`, nor `allowConfiguredDestinationRoot` is set. A missing explicit `exportPath` / `destinationRoot` override also returns this code before the worker spawns, naming that parameter, never `POWERSHELL_SPAWN_FAILED` (#1914). |
| `INVALID_READ_ONLY_QUERY` | mode contract | `query_execute({mode:"read"})` rejected a SQL that mutates the database (DDL or DML with side effects). | Restrict the SQL to read-only statements, OR explicitly set `mode:"write"` (which also requires `apply:true`). |
| `PROCEDURE_NOT_FOUND` | VBA runtime | `run_vba` plan succeeded with `moduleName` / `procedureName` populated, but apply returns this because the binary's compiled p-code is stale after an uncompiled import. | Force a manual recompile in Access VBE (Debug -> Compile VBA Project), then retry. NEVER chase a phantom import issue (HR-1 of `dysflow-arnes`). |
| `PROCEDURE_NOT_CALLABLE` | VBA runtime | `apply` failed because Access refused to invoke the procedure despite it being present in `VBComponents`. Recognized from Access's own "cannot run the macro" / "can't find the procedure" / "object closed or doesn't exist" messages, in either localization. | Read `error.remediation`. dysflow derives it from the source preflight (#1787): when it stripped a verified module prefix, qualification is ruled out and stale p-code is the cause — force a manual recompile and retry. When the qualifier could not be tied to a module of this project, the remediation names it and asks whether it is a referenced database whose reference resolves. |
| `VBA_RUNTIME_ERROR` | VBA runtime | `apply` reached the procedure, it ran, and it raised. The service unwraps the PowerShell invocation wrapper and reports the VBA error the procedure emitted (#1681). | Read `error.details.vbaMessage` and fix the procedure or the data it depends on. Do NOT recompile — the procedure is callable and running, so a recompile changes nothing. |
| `ATOM_OUTPUT_UNPARSABLE` | VBA test atom | `test_vba` ran the atom, but its returned envelope opens as a JSON object (`{"` or `{}`) and is not valid JSON; a braced GUID is not an envelope and still passes, so its `ok`/`error` cannot be read. It appears as `cause.code` of that atom's entry in `error.details.failures[]` under `VBA_TESTS_FAILED`; the other atoms are still reported (#1850). | Read `failures[].outputExcerpt` (at most 240 characters around the parse failure) and fix the atom's JSON builder: escape backslashes, quotes and control characters, and drop trailing commas. Do NOT recompile — the atom ran. |
| `RUNNER_FAILED` | VBA runner | The runner threw an unhandled exception. The reclassifier should map this to a typed envelope; if you see the raw code, the reclassifier at `src/core/services/vba-service.ts::reclassifyRunnerFailure` missed it. | File a dysflow bug with the call payload and the runner log. |
| `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` | export-source guard | `export_modules` / `export_all` destination overlaps the configured source root. | Either pass an explicit `destinationRoot`, or set `allowConfiguredDestinationRoot:true`, OR (after explicit human approval) re-call with `implements_check:"export_overwrites_source_precheck"` + `confirmedRequiresConfirmation:true`. Both nested managed folder and exact source-root match are also refused. Case-insensitive on Windows. |
| `STALE_LACCDB_DETECTED` | lock discovery | `import_modules` / `sync_binary` etc. detected a stale `.laccdb` file (unowned leftover from a prior Access session). Auto-removed when the live process holds no handle. | No action required; the dispatch removes the stale lock and emits this code as informational. |
| `LIVE_PROCESS_HOLDS_LACCDB` | lock discovery | Same shape as `STALE_LACCDB_DETECTED` but a live `MSACCESS.EXE` holds the lock. The PID is in `error.lockHolderPid`. | Run `access_force_cleanup_orphaned({pid:<real>, implements_check:"orphans_msaccess", confirmedRequiresConfirmation:true})` AFTER explicit human approval. Never generic `taskkill /F /IM MSACCESS.EXE` (HR-2 of `dysflow-arnes`). |
| `ACCESS_DATABASE_LOCKED` | lock discovery (#1912) | Another process holds the `.accdb` open, so Access has no exclusive access and cannot save VBA changes ("You do not have exclusive access..." / "No tiene acceso exclusivo..."). Returned by `import_modules` / `import_all` as a top-level code or a per-module `error.code`. | Run `list_access_operations` and `access_force_cleanup_orphaned` to find the holder; release it only after verifying its pid (HR-2), then retry the same call. Never kill `MSACCESS.EXE` by name. |
| `INHERITED_WORKTREE_MISMATCH` | worktree resolve | Inherited sibling path without an explicit per-call target. | Use `register_worktree({cwd:"<sibling>"})` or `resolve_project({cwd,projectId})` to select the intended worktree explicitly. Never edit one worktree's config to point at another (HR-9). |
| `FRONTEND_TARGET_MISSING` / `FRONTEND_TARGET_AMBIGUOUS` / `FRONTEND_PATH_NOT_BASENAME` / `PROJECT_ID_COLLISION` | project resolution | `resolve_project({})` could not decide which project is the active target (no frontends, multiple, absolute path, or sibling id collision). | Follow HR-11: ask the human for one `availableProjects[]` entry; pass the trio `projectId` + `projectChoiceReason:"user_selected_after_ambiguous_project"` + opaque `recoveryToken`. |
| `DESTINATION_ROOT_REQUIRED` | export pre-resolve guard | `export_modules` / `export_all` was called WITHOUT any of `destinationRoot`, `exportPath`, or `allowConfiguredDestinationRoot`. | Pass one of the three explicitly. NOTE: this is the pre-resolve gate; the post-resolve guard (`EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION`) fires AFTER if destination overlaps source. |
| `LINT_FINDINGS_ERROR` | import lint gate (#1863) | `import_modules` / `import_all` `apply:true` found a NEW error-severity lint finding in a module it would load. Findings the module already had in its committed version are inherited: they are warnings and never block. Refused before Access starts. | Fix the listed new findings and retry. `apply:false` lists every finding, marked new or inherited. |
| `FORM_CODE_BEHIND_DIVERGES` | form import guard (#1865) | `import_modules` / `import_all` `apply:true` found a form whose `CodeBehindForm` copy functionally differs from its sibling `.cls`; the `.cls` would overwrite the copy edit. Refused before Access starts. `apply:false` reports the same condition as a warning. | Move the edit into the `.cls`, or pass `acknowledgeCodeBehindWins:true` to let the `.cls` win. |
| `VBA_IMPORT_FAILED` | import orchestration (#1859) | Top-level code of a failed `import_modules` / `import_all`: at least one module still failed after the last pass. Nothing was saved. The per-module entries, each with its own `error.code`, `phase` and `remediation`, are in the runner's `DYSFLOW_RESULT` line inside `error.details.stdout`. Also returned when the orchestration bridge fails after a pass; the transport then rolls back the pass. | Read the module-level codes, fix each failed source, and retry the import. See `form-ui-and-sync.md` (Import orchestration contract). |
| `VB_NAME_MISMATCH` | import module (#752) | Module-level code: the source declares `Attribute VB_Name` with a name other than the existing component it resolves to. Access would rename the module silently, so the import refuses it. | Make `Attribute VB_Name` match the target module, or pass the matching `moduleNames` entry, then retry. |
| `VBA_IMPORT_PHASE_FAILED` | import module | Module-level default: Access rejected the module during the import phase named in `phase`, and the failure matched no more specific code. | Validate the source at the reported `phase`. Other module-level codes are `DUPLICATE_OPTION_DIRECTIVE`, `IMPORT_TRUNCATED`, `VBA_IMPORT_ROLLBACK_SNAPSHOT_FAILED`, `FORM_NAME_RESOLUTION_FAILED`, `FORM_VBNAME_PREFIX_MISMATCH`, `FORM_SOURCE_MALFORMED` and `ACCESS_DATABASE_LOCKED`; each carries its own `remediation`. |
| `VBA_CREATED_MODULE_SAVE_FAILED` | import save | Not an `error.code`: a prefix in `error.message` of a `VBA_MANAGER_FAILED` result. Every module imported, but the named save of a new or modified module failed. Unlike a form or report save failure, which only warns, this fails the call. | Read the module name and the Access error in `error.message`, fix the cause, then retry the import. |
| `VBA_IMPORT_SAVE_FAILED` | import save (#1912) | Per-module `error.code` in a `VBA_IMPORT_FAILED` result: the batch had failed modules, this module imported, and its save only warned, so the change may not be in the database. Not retryable as-is. | Fix the other failing modules, then import this module again. |

## Severity classification

The `error.code` field is the discriminator. Severity is inferred from category:

| Category | Default severity |
|---|---|
| `input schema` (MCP_INPUT_INVALID, etc.) | recoverable — caller fixes and retries |
| `*gate*` (process, project, worktree) | recoverable — caller configures the gate |
| `path containment` | recoverable — caller adjusts path |
| `mode contract` (query_execute) | recoverable — caller flips mode |
| `VBA runtime` (PROCEDURE_*, RUNNER_*) | recoverable — caller recompiles or files bug |
| `lock discovery` (STALE_LACCDB_*, LIVE_*) | recoverable to critical — depends on lock holder |
| `envelope / parser` (`schemaVersion` mismatch, transport wrapper flattened) | critical — call the transport layer, not the dispatcher |

A code marked `recoverable: true` in the runtime envelope means: the same call, after fixing the issue, is expected to succeed. A `recoverable: false` (rare) means: the situation is unrecoverable from the caller side (file a bug).

## Tool-category coverage (cross-reference)

| Tool category | Coverage scope |
|---|---|
| `bootstrap` (7 tools) | All input schema / gate / worktree errors. |
| `sync` (1 tool, `sync_binary`) | All input / gate / path / concurrency / pre-resolve errors. Plus `EXPORT_OVERWRITES_SOURCE_*` per #1226. |
| `tests` (2 tools) | All input / gate / concurrency errors, plus `PROCEDURE_NOT_FOUND` / `PROCEDURE_NOT_CALLABLE` for `test_vba` path. |
| `sql` (1 tool, `query_execute`) | All input / gate, plus `INVALID_READ_ONLY_QUERY`. |
| `forms` (7 tools) | All input / gate / path errors, plus `OUTSIDE_PROJECT_ROOT` for form-aware mutations. |
| `recovery` (4 tools) | All input / gate errors. Plus `LIVE_PROCESS_HOLDS_LACCDB` for `access_force_cleanup_orphaned` and `WRITE_LOCKED_BY_RUNNING_OP` for `cleanup_access_operation({force:true})`. |

## How to read `error` in the response

The `error` object is on the response envelope (NOT in `content[].text`). For OpenCode Code-Mode defensive parsing, branch on `schemaVersion` first, then read `error.code` directly:

```js
const env = await tools.dysflow.<tool>(args);
if (env?.schemaVersion !== "dysflow.result/v1") {
  throw new Error("not a dysflow envelope");
}
if (env?.error?.code) {
  // see table above for the meaning + recovery
  throw new Error(`[${env.error.code}] ${env.error.message}`);
}
```

Prefer the typed `error.code` over text matching — the runtime reserves the right to change the human-readable text without bumping the contract.

## When this file gets stale

Run `dysflow doctor`. If it reports tools whose `errorCodes` array has changed (added / removed / renamed), bump `last_verified` in your local Skill mirror, regenerate from live `describe_tool` snapshots, and PR against DysTelefonica/dysflow (per `dysflow-codegraph-update` HR-10).
