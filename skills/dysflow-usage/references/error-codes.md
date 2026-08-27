# Dysflow MCP Error Codes Reference

> **Source of truth**: candidate-runtime full schema and selective `describe_tool({name:"<X>"}).errorCodes` captures verified for the v4.2.0 release on 2026-08-26. The runtime is authoritative.
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
| `MCP_INPUT_INVALID` | input schema | Input fails JSON-Schema validation (missing required field, wrong type, parameter outside the anyOf alternatives). Same code is also returned for rejected legacy flag combinations (`dryRun:true`, `options.confirm:true`, etc. — see `migrationNotes` in `get_capabilities`). | Re-run `describe_tool({name:"X"})` or `schema({view:"full"})` and align the call. Migration map for legacy flags is in `dysflow-usage/SKILL.md` §6. |
| `MCP_WRITES_DISABLED` | process gate | Process-level `writesProcess.enabled === false`. Every write-class call returns this code until the MCP is restarted with `--enable-writes`. | Restart the MCP server, OR pass `dryRun:true` (legacy alias) to preview. Note: `dryRun:true` is itself a legacy alias — prefer `apply:false`. |
| `CAPABILITIES_DISALLOW_WRITE` | project gate | Project-level `capabilities.allowWrites === false`. Set in `.dysflow/project.json`. Independent of process gate. | Update `.dysflow/project.json` `capabilities.allowWrites` to `true`, then retry the call. |
| `PROJECT_ID_MISMATCH` | project resolve | The `projectId` you passed does not match the resolved project (from `.dysflow/project.json`, cwd-aware worktree detection, or recovery-token answer). | Drop the `projectId` and let the resolver pick, OR pass the correct `projectId` + the recovery-token trio (`resolve_project({outcome:"resolved"})` first). See HR-11. |
| `WRITE_LOCKED_BY_RUNNING_OP` | concurrency | A concurrent dysflow operation holds the project's write lock. | Wait for the in-flight operation to finish, OR call `cleanup_access_operation({operationId:"<real id>"})` to retire it explicitly. Never `Stop-Process -Name MSACCESS` (HR-2 of `dysflow-arnes`). |
| `OUTSIDE_PROJECT_ROOT` | path containment | The target path (read or write) sits outside the configured `projectRoot` / `destinationRoot`. Case-insensitive on Windows. | Pass a path that sits inside the project root, OR use a linked worktree (HR-9 of `dysflow-arnes`) and operate on it. |
| `DESTINATION_ROOT_NOT_FOUND` | path resolution | `projectRoot` / `destinationRoot` is missing or unconfigured for the resolved project. | Configure it in `.dysflow/project.json` and retry, OR pass an explicit `destinationRoot` per call (preferred for one-shot destinations, HR-via-§3 of `dysflow-usage`). Note `export_modules` / `export_all` also fire `DESTINATION_ROOT_REQUIRED` BEFORE this guard if neither `destinationRoot`, `exportPath`, nor `allowConfiguredDestinationRoot` is set. |
| `INVALID_READ_ONLY_QUERY` | mode contract | `query_execute({mode:"read"})` rejected a SQL that mutates the database (DDL or DML with side effects). | Restrict the SQL to read-only statements, OR explicitly set `mode:"write"` (which also requires `apply:true`). |
| `PROCEDURE_NOT_FOUND` | VBA runtime | `run_vba` plan succeeded with `moduleName` / `procedureName` populated, but apply returns this because the binary's compiled p-code is stale after an uncompiled import. | Force a manual recompile in Access VBE (Debug -> Compile VBA Project), then retry. NEVER chase a phantom import issue (HR-7 of `dysflow-arnes`). |
| `PROCEDURE_NOT_CALLABLE` | VBA runtime | `apply` failed because Access COM cannot invoke the procedure despite it being present in `VBComponents`. Stale p-code. | Same as above: force a manual recompile, retry. |
| `RUNNER_FAILED` | VBA runner | The runner threw an unhandled exception. The reclassifier should map this to a typed envelope; if you see the raw code, the reclassifier at `src/core/services/vba-service.ts::reclassifyRunnerFailure` missed it. | File a dysflow bug with the call payload and the runner log. |
| `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` | export-source guard | `export_modules` / `export_all` destination overlaps the configured source root. | Either pass an explicit `destinationRoot`, or set `allowConfiguredDestinationRoot:true`, OR (after explicit human approval) re-call with `implements_check:"export_overwrites_source_precheck"` + `confirmedRequiresConfirmation:true`. Both nested managed folder and exact source-root match are also refused. Case-insensitive on Windows. |
| `STALE_LACCDB_DETECTED` | lock discovery | `import_modules` / `sync_binary` etc. detected a stale `.laccdb` file (unowned leftover from a prior Access session). Auto-removed when the live process holds no handle. | No action required; the dispatch removes the stale lock and emits this code as informational. |
| `LIVE_PROCESS_HOLDS_LACCDB` | lock discovery | Same shape as `STALE_LACCDB_DETECTED` but a live `MSACCESS.EXE` holds the lock. The PID is in `error.lockHolderPid`. | Run `access_force_cleanup_orphaned({pid:<real>, implements_check:"orphans_msaccess", confirmedRequiresConfirmation:true})` AFTER explicit human approval. Never generic `taskkill /F /IM MSACCESS.EXE` (HR-2 of `dysflow-arnes`). |
| `INHERITED_WORKTREE_MISMATCH` | worktree resolve | Inherited sibling path without an explicit per-call target. | Use `register_worktree({cwd:"<sibling>"})` or `resolve_project({cwd,projectId})` to select the intended worktree explicitly. Never edit one worktree's config to point at another (HR-9). |
| `FRONTEND_TARGET_MISSING` / `FRONTEND_TARGET_AMBIGUOUS` / `FRONTEND_PATH_NOT_BASENAME` / `PROJECT_ID_COLLISION` | project resolution | `resolve_project({})` could not decide which project is the active target (no frontends, multiple, absolute path, or sibling id collision). | Follow HR-11: ask the human for one `availableProjects[]` entry; pass the trio `projectId` + `projectChoiceReason:"user_selected_after_ambiguous_project"` + opaque `recoveryToken`. |
| `DESTINATION_ROOT_REQUIRED` | export pre-resolve guard | `export_modules` / `export_all` was called WITHOUT any of `destinationRoot`, `exportPath`, or `allowConfiguredDestinationRoot`. | Pass one of the three explicitly. NOTE: this is the pre-resolve gate; the post-resolve guard (`EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION`) fires AFTER if destination overlaps source. |

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
