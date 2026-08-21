# Dysflow MCP Tool Reference

Every visible MCP tool dysflow advertises over stdio, with its parameters and result contract.

The transport strategy lives in [MCP protocol](../mcp-protocol.md). Copy-pasteable payloads live in [MCP examples](../mcp-examples.md).

[Back to README](../../README.md)

## Common Input Parameters

Many MCP tools share common context and override parameters:
* **Context / Identity**:
  - `projectId` (string, optional): Canonical project identity for traceability. Best matched to the Engram project name when available.
  - `contextId` (string, optional): Optional run/context id for distinct executions.
* **Access Database Path Overrides**:
  - `accessPath` / `databasePath` / `sourcePath` (string, optional): Paths to the frontend Access database. Overrides `.dysflow/project.json` settings.
  - `backendPath` / `comparePath` (string, optional): Paths to the backend database.
  - `target` selects a semantic database role for project-aware DAO tools. Database-wide reads (`query_sql`, `list_tables`, `get_relationships`) accept `frontend | backend`; table-aware reads (`get_schema`, `count_rows`, `distinct_values`) also accept `auto`, which probes both configured databases by `tableName` and rejects missing or ambiguous matches. Frontend-only linked-table and QueryDef tools accept only `frontend` and default to the configured `accessPath`. Explicit `databasePath` / `sourcePath` overrides the role for general reads. Unresolvable roles surface as `CONFIG_MISSING_TARGET_PATH` before execution.
* **Workspace Overrides**:
  - `destinationRoot` (string, optional): Directory for VBA module source exports (usually `src`). Override precedence and the gate contract are described in [`destinationRoot override`](#destinationroot-override-contract) below.
  - `projectRoot` (string, optional): Root directory of the repository/worktree.
* **Operation Safeguards**:
  - `timeoutMs` (number, optional): Operation timeout override in milliseconds.
  - `dryRun` (boolean, optional): Evaluate operations (like writes or imports) without applying changes.
  - `apply` (boolean, optional): Explicitly apply write actions (mutually exclusive with `dryRun` mode).

### `destinationRoot` override contract

Override precedence, path normalization, and the pre-flight gate contract for `destinationRoot` are uniform across every write-class tool that reads or writes managed source files (`export_modules`, `export_all`, `import_modules`, `import_all`, `delete_module`, `sync_binary`, `form_serialize`, `form_deserialize`).

| Aspect | Contract | Evidence |
|---|---|---|
| Precedence | Caller-supplied `destinationRoot` wins over the configured value from `.dysflow/project.json` for the duration of the call. The configured value stays in `projectConfig.destinationRoot` for audit. | `src/adapters/vba-sync/destination-root-override.ts:98-119` |
| Path normalization | Forward slashes, backslashes, and mixed separators are accepted on Windows; relative paths resolve against the worktree root; case-insensitive comparison. | `src/core/config/execution-target.ts:107-128`, `src/adapters/config/project-config-diagnostic.ts:460-470` |
| Pre-flight gate (v2.37.2+) | `existsSync` checks the EFFECTIVE path (override OR configured), so the `git rm -r src/ && mkdir -p src/{classes,forms,modules,reports}` flow plus an `export_all` call with `destinationRoot: "<absolute>/src"` succeeds when the override exists. | `test/adapters/config/issue-1438-destination-root-gate.test.ts`, `src/adapters/config/project-config-diagnostic.ts:587-593` |
| Containment | An override that escapes the worktree fails with `OUTSIDE_PROJECT_ROOT` (typed), not the generic `DESTINATION_ROOT_NOT_FOUND`. The round-14 containment check (#1228) runs **before** the existence check so escape paths get the typed verdict. | `src/adapters/config/project-config-diagnostic.ts:555-587` |
| Error envelope | `DESTINATION_ROOT_NOT_FOUND` references the exact path the gate tried to read, post-normalization. The legacy wording "Configured destinationRoot" is gone. | `src/adapters/config/project-config-diagnostic.ts:587-593`, `src/core/contracts/remediation.ts:144-156` |

The success envelope adds two stable fields for every write-class tool that resolved the override path: `resolvedDestinationRoot` (the path the pure runner actually wrote to) and `destinationRootSource` (`override | config | projectRoot | cwd | default`). Consumers can audit override-vs-configured precedence without re-running the resolver.

Reference: issue #1438, section "What changes" in the v2.37.2 CHANGELOG entry.

---

## Core MCP Tools

### `run_vba`
Execute a public VBA procedure via COM automation. Enforces `allowedProcedures` when configured.
* **Parameters**:
  - `procedureName` (string, **required**): Public VBA procedure name to execute.
  - `moduleName` (string, optional): Target module containing the procedure.
  - `arguments` (array, optional): Positional arguments passed to the procedure.
  - `projectId`, `contextId` (optional)
  - `accessPath`, `backendPath`, `destinationRoot`, `projectRoot`, `timeoutMs` (optional overrides)

### `query_execute`
Run arbitrary SQL statements. Writes are guarded by the write-safety model.
* **Parameters**:
  - `sql` (string, **required**): SQL query to run.
  - `mode` (string, **required**): Execution mode (`read` or `write`).
  - `projectId`, `contextId` (optional)

### `doctor`
Run diagnostics on the MCP connection, Access installation, and configuration.
* **Parameters**:
  - `includeEnvironment` (boolean, optional): True to query environment settings and logs.
  - `projectId`, `contextId` (optional)
  - `accessPath`, `backendPath`, `destinationRoot`, `projectRoot`, `timeoutMs` (optional overrides)

### `list_access_operations`
Retrieve active and completed Access operation handles managed by Dysflow.
* **Parameters**: None.

### `cleanup_access_operation`
Safely terminate stuck or left-over `MSACCESS.EXE` processes owned by Dysflow.
* **Parameters**:
  - `operationId` (string, **required**): Handle ID of the operation to clean.
  - `accessPath` (string, **required**): Database file path associated with the target operation.
  - `force` (boolean, optional): Terminate immediately. Requires writes to be enabled (`MCP_WRITES_DISABLED` is returned when writes are off); non-force cleanup is always allowed.

### `access_force_cleanup_orphaned`
List orphaned headless `MSACCESS.EXE` processes holding the project's `accessPath`, or kill exactly one verified orphan only when `confirmPid` is explicitly provided.
* **Parameters**:
  - `projectId` / `accessPath` (optional): Resolve the frontend database whose lock holders should be inspected.
  - `confirmPid` (number, optional): When omitted, the tool lists candidates only. When provided, killing is write-gated and still refuses non-headless, wrong-path, or Dysflow-owned processes.

### `get_capabilities`
Return the aggregated capabilities snapshot for the live Dysflow MCP adapter. Read-only — does not open Access, does not spawn PowerShell, does not mutate state.

Call `get_capabilities({})` first. It reports:

- The running version, live write gates, and project resolution.
- Effective defaults and canonical commit flags.
- Six machine-readable `preferredAgentWorkflows`.

Then use `schema({ "view": "compact" })` for catalog-wide discovery, or `describe_tool({ "name": "<tool>" })` for one tool's complete static contract.

Every MCP response, including this one, carries top-level `schemaVersion: "dysflow.result/v1"`.

Consumers must defensively parse a stringified host-wrapper result before requiring that discriminator.
* **Parameters**: optional `cwd`; omit it to use the MCP startup worktree. An empty `{}` remains valid.
* **Preferred workflows**: `bootstrap`, `sync`, `tests`, `sql`, `forms`, and `recovery`; every listed tool is classified as `preferred` in the schema catalog. `resolve_project` intentionally belongs to both `bootstrap` and `recovery`.
* **Per-tool advertisement**: every `tools/list` entry carries standard MCP `annotations` (`title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint`) plus Dysflow-specific workflow metadata at `_meta["dysflow/workflow"]`. The namespaced value contains `phases[]`, `preferredFor[]`, and `status`; every advertised tool has at least one phase. MCP 2025-06-18 does **not** define `annotations.category` or `annotations.preferredFor`, so Dysflow does not emit them or claim that generic clients group tools automatically. Clients may opt in to grouping by the namespaced metadata.

### `setup_project`
Plan or atomically create `.dysflow/project.json` for a fresh Git worktree.

- Omitting `apply` returns the resolved config without writing.
- `apply:true` requires process writes to be enabled and the candidate `capabilities.allowWrites` to be true.
- Unlike ordinary write tools, bootstrap does not require a pre-existing write-ready project config.
- The tool also accepts the complete `projectId` + `projectChoiceReason` + `recoveryToken` trio after an ambiguous `resolve_project` result.
- Recovery mode only caches the selected existing project and returns `mode: "resolution"`. It never creates or overwrites project config, regardless of `apply`.
* **Parameters**: bootstrap mode requires `frontendFile` (basename), plus an explicit `projectId` unless the selected WorktreeContext already has an id that can be reused. It accepts optional `cwd`, `backendPath`, `destinationRoot`, `capabilities`, `timeoutMs`, and `apply`. With no explicit or reusable id it returns `MCP_INPUT_INVALID` (`projectId is required`) and never derives one from the cwd basename. Recovery mode requires the complete recovery trio, which is consumed before collision detection.

### `register_worktree`
Eagerly scan and cache one canonical worktree context without changing files or
opening Access. The result exposes `cache.status` (`hit` or `miss`) plus bounded
cache telemetry.
* **Parameters**: `cwd` (string, **required**).

### `clear_worktree_cache`
Clear one canonical worktree cache entry or every process-local entry. The next
cwd-bound operation performs a fresh scan; project files and Access are never
modified.
* **Parameters**: optional `cwd`; omit it to clear all entries.

### `list_procedures`
List VBA procedures in a source module without opening Access. Read-only.

The tool parses inline `source` when supplied, otherwise it resolves `module` from the configured source root (`modules/`, `classes/`, `forms/`, or `reports/`).
* **Parameters**:
  - `module` (string, **required**): VBA module name without extension.
  - `filter` (string, optional): Substring filter for procedure names.
  - `kind` (string, optional): `Sub`, `Function`, `Property`, or `both`.
  - `source` (string, optional): Inline VBA source text.
  - `projectId`, `contextId`, `destinationRoot`, `projectRoot` (optional context/overrides)

### `get_procedure`
Retrieve one VBA procedure body from a source module without opening Access. The tool parses inline `source` when supplied, otherwise it resolves `module` from the configured source root. Read-only.
* **Parameters**:
  - `module` (string, **required**): VBA module name without extension.
  - `procedure` (string, **required**): Procedure name to retrieve.
  - `source` (string, optional): Inline VBA source text.
  - `projectId`, `contextId`, `destinationRoot`, `projectRoot` (optional context/overrides)

### `find_references`
Find all references to a given symbol across a set of modules. Read-only.

The tool parses inline `modules` when supplied, otherwise it resolves modules from the configured source root and/or exports them from the binary.
* **Parameters**:
  - `symbol` (string, **required**): Symbol name to find references for.
  - `scope` (string, optional): `module`, `binary`, `source`, or `all` (default).
  - `module` (string, optional): Search only in this specific module.
  - `modules` (object, optional): Key-value pair of module names to their inline VBA source code.
  - `projectId`, `contextId`, `destinationRoot`, `projectRoot` (optional context/overrides)

### `detect_dead_code`
Find VBA procedures and module-level declarations defined but never referenced. Read-only.

Pure string-in / string-out analysis over the supplied `modules` map — never opens Access, never spawns PowerShell, never mutates the filesystem.
* **Parameters**:
  - `scope` (string, **required**): `binary`, `source`, or `module`. Echoed back on the report for caller introspection.
  - `modules` (object, optional): Key-value pair of module names to their inline VBA source code. When omitted, the tool resolves modules from the configured source root.
  - `module` (string, optional): Module-name constraint; restricts the analysis to a single module and elevates risk for surviving private-procedure findings.
  - `projectId`, `contextId`, `destinationRoot`, `projectRoot` (optional context/overrides)

### `validate_manifest`
Validate a VBA test manifest before running `test_vba`. Read-only.

The tool parses an inline `manifest` or reads `testsPath`/`path`, and resolves VBA source modules from the configured source root unless inline `modules` are supplied.

It returns `valid`, separate `errors`/`warnings`, and a `summary`.
* **Parameters**:
  - `testsPath` / `path` (string, optional): VBA test manifest path. Relative paths resolve against the project root.
  - `manifest` (object or array, optional): Inline test manifest object with a `tests` array, or an array of test entries.
  - `modules` (object, optional): Key-value pair of module names to inline VBA source code.
  - `projectId`, `contextId`, `destinationRoot`, `projectRoot` (optional context/overrides)

### `lint_module`
Lint one `.bas`/`.cls` VBA module before importing it into Access. Read-only.

The tool parses inline `source` when supplied, otherwise it resolves `module` from the configured source root (`modules/`, `classes/`, `forms/`, or `reports/`).

It never opens Access, never spawns PowerShell, and never mutates files.
* **Parameters**:
  - `module` (string, **required**): VBA module name without extension.
  - `source` (string, optional): Inline VBA source text.
  - `rules` (array, optional): Filter to any of `option-declaration`, `identifier-safety`, `declaration-order`, `arg-type-match`, `forbidden-name` (F22 — flags identifiers that shadow VBA / Access / DAO globals).
  - `projectId`, `contextId`, `destinationRoot`, `projectRoot` (optional context/overrides)
* **Returns**: `{ module, rules, isClean, diagnostics, flatDiagnostics, summary }`, where `diagnostics` groups findings by rule name, `flatDiagnostics` is a flat array for backward compatibility, and `summary` counts `errors` and `warnings`.

### `resolve_project`
Read `.dysflow/project.json` from the supplied `cwd` and return a structured diagnosis. It never writes files, opens Access, or spawns PowerShell.

Companion to `get_capabilities`: the snapshot tool reports the `projectId` captured at factory construction, while this tool re-checks the project config on disk.

On ambiguity it creates a short-lived, process-local recovery token, so an exact human choice can be cached without editing project config.
* **Parameters**:
  - `projectId` (string, optional): The projectId to test for an explicit match.
  - `cwd` (string, optional): Working directory to resolve from. Defaults to the current working directory.
  - `projectChoiceReason` (`"user_selected_after_ambiguous_project"`, optional): Exact acknowledgement that a human selected the supplied project from the recovery envelope.
  - `recoveryToken` (string, optional): Opaque one-shot token returned by the ambiguous call. Supply it only with `projectId` and `projectChoiceReason`.
  - `clearResolution` (boolean, optional): Drop cached choice and outstanding tokens before resolving again.
* **Returns**: `{ projectId, outcome, reason, accessPath, projectRoot, sourceRoot }`. `outcome` is `resolved`, `unresolved`, or `ambiguous`. The ambiguous branch additionally returns `{ availableProjects, recoveryToken, recoveryInstruction }`. A valid trio passed to `resolve_project` commits the in-memory choice even though the tool remains filesystem-read-only; every write-class dispatcher accepts the same trio. See [`assets/examples/resolve-project-recovery.md`](../../assets/examples/resolve-project-recovery.md).

### `clean_stale_markers`
Sweep `<projectRoot>/.dysflow/runtime/markers/` and either plan or apply marker transitions to `status: "abandoned"`.

- Stale `status: "running"` markers are always reap candidates.
- Stale `status: "failed"` markers are included only when `keepFailed` is false.
- User-callable companion to the #967 auto-cleanup.
- Safe-by-default: dry-run is the default. Any apply call requires `options.confirm: true` AND writes enabled (returns `MCP_WRITES_DISABLED` when writes are off).
* **Parameters**:
  - `projectId` (optional): Trace identity; `accessPath` resolves from `.dysflow/project.json` when omitted.
  - `options.olderThanMinutes` (number, optional, default `30`): Stale cutoff in minutes. Markers with `updatedAt` older than this are reap candidates.
  - `options.dryRun` (boolean, optional, default `true`): When true (default), return the plan without writing. When false, perform real transitions (requires `confirm: true`).
  - `options.keepFailed` (boolean, optional, default `true`): When true, markers from failed operations are NEVER transitioned regardless of age. Set false to also reap stale failed markers.
  - `options.confirm` (boolean, optional): Required for any non-dry-run call. Literal `true` is the only acceptable value; omitting it or passing false leaves the tool in dry-run mode.
* **Returns**: `{ ok, scanned, removed, kept, removedMarkerIds, keptMarkerIds, errors }`. `scanned` counts every `*.json` file inspected; `removed` + `kept` partition successful decisions; `errors[]` carries per-file failures that did not abort the sweep.

### `migrate_project_config`
Read `.dysflow/project.json` and, optionally with `apply:true`, rewrite it in place.

- Drives legacy config migrations deterministically — no more hand-editing absolute `accessPath` vs basename `frontendFile`, or top-level `allowWrites` vs `capabilities.allowWrites`.
- The read-only default returns `{ current, proposed, diff, remediation[] }` for review.
- The apply path atomically rewrites the file and refuses with `MCP_WRITES_DISABLED` when writes are off.
- Idempotent: an already-migrated config returns an empty diff and `applied:false`.
* **Parameters**:
  - `projectId` (string, optional): Reserved for cross-worktree parity — currently informational.
  - `cwd` (string, optional): Per-call cwd override (#1057 F10). Must be an existing directory containing `.dysflow/project.json`. Omit to use the MCP factory cwd.
  - `apply` (boolean, optional, default `false`): When `true`, atomically rewrites `.dysflow/project.json` with the proposed migration. Refuses with `MCP_WRITES_DISABLED` when writes are disabled. When omitted (or `false`), returns the proposed diff without writing — pure introspection.
* **Returns**: `{ outcome, configPath, current, proposed, diff, remediation[], applied }`. `applied` is `true` only when an `apply:true` call produced a non-empty diff; idempotent re-runs return `applied:false` and an empty `diff`.

### `schema`
Return static tool contracts in one of two views. Read-only — never opens Access, never spawns PowerShell, never mutates state.

- `compact` — low-context discovery across all 94 advertised tools.
- `full` — complete input JSON Schema, canonical aliases, errors, use cases, references, and tool-specific result contracts.

Omitting `view` preserves the legacy full response. Both views are deterministic and support the same `toolName` filter.
* **Parameters**:
  - `projectId` (string, optional): Reserved for a future per-project scoping extension. The current catalog is global.
  - `toolName` (string, optional): Filter either view to one exact tool name. Omit for every advertised tool.
  - `view` (`"compact" | "full"`, optional, default `"full"`): Select low-context discovery or the complete backward-compatible contract.
* **Compact returns**: `{ projectId, tools: [{ name, purpose, access, annotations, _meta, agentWorkflow, requiredParameters, requiredParameterGroups, defaults, writeIntent, primaryResult, recommendations }] }`.
* **Full returns**: `{ projectId, tools: [{ name, description, access, annotations, _meta, agentWorkflow, inputSchema, parameters, returns, errorCodes, crossReferences, requiredCapabilities, safeByDefault, useCases, compositionConstraints, resultContract }] }`.
* **Workflow classification**:
  - `preferred`: belongs to a declared golden path or is the preferred batch wrapper.
  - `specialized`: `specializedWhen` states when its focused contract is better than a broader preferred wrapper.
  - `legacy`: `supersededBy`, `migrationGuidance`, and `deprecationPolicy` provide a terminal migration path. `query_sql` and `exec_sql` remain callable compatibility tools; new SQL consumers use `query_execute`.
  - `useCases` is copied from `agentWorkflow.preferFor`, so compact, full, and one-tool discovery cannot drift.
* **Recommended discovery path**:
  1. `get_capabilities({})` for live version, gates, policy, and canonical commit flags.
  2. `schema({ "view": "compact" })` to choose a tool, optionally filtered with `toolName`.
  3. `describe_tool({ "name": "<tool>" })` for the preferred one-tool deep view.
  4. `schema({ "view": "full" })` only for bulk analysis that genuinely needs every complete contract.

### `describe_tool`
Preferred one-tool deep introspection view. Read-only — never opens Access, never spawns PowerShell, never mutates state.

It returns the same complete entry generated for `schema({ "view": "full", "toolName": "<tool>" })`, plus `params` as an alias of `parameters`.

Use it after compact discovery instead of fetching the complete tool catalog.
* **Parameters**:
  - `name` (string): Tool name to describe (canonical param).
  - `toolName` (string, optional): Alias of `name` for symmetry with the `schema` filter.
  - `projectId` (string, optional): Reserved for a future per-project scoping extension. The current catalog is global.
* **Returns**: the full single-tool contract — `{ name, description, access, annotations, _meta, agentWorkflow, inputSchema, parameters, params, returns, errorCodes, crossReferences, requiredCapabilities, safeByDefault, useCases, compositionConstraints, resultContract }`. Unknown tool → `TOOL_NOT_FOUND`; missing `name` → `MCP_INPUT_INVALID`.
* **Result validation policy**: the stdio runtime validates every successful JSON payload against this executable `resultContract` before serialization. The active policy is reported by `get_capabilities.resultValidationPolicy` and defaults to `"enforce"`. A handler/contract mismatch fails closed with `RESULT_CONTRACT_VIOLATION`; the invalid payload is not returned or included in diagnostics. Typed tool errors continue to use the published `errorEnvelope`, and callable compatibility aliases project the canonical tool's payload contract.
* **Consumer pattern**: obtain `describe_tool({ "name": "<tool>" })`, call the tool, then validate success against `resultContract.dataSchema` or failure against `resultContract.errorEnvelope.shape`. Do not maintain a second result-schema registry in the consumer.

### `diagnose`
Return aggregated project health (`projectConfig` + `filesystem` + `runtime`) in a single call. Read-only — does not open Access, does not spawn PowerShell, does not mutate state.

It replaces the 4-5 round-trip pattern: `get_capabilities` + `resolve_project` + `list_access_operations` + `access_force_cleanup_orphaned` listing + filesystem stat.

Pairs with `get_capabilities` (live adapter state) and `schema` (static contract). `diagnose` surfaces the unified "is this project healthy?" verdict every consumer wants.
* **Parameters**:
  - `projectId` (string, optional): ProjectId to verify against `.dysflow/project.json`. Mirrors `resolve_project` semantics.
  - `accessPath` (string, optional): Explicit Access target override. Reserved for v2.16.x.
  - `contextId` (string, optional): Reserved for a future per-context scoping extension (#966 follow-up).
  - `verbose` (boolean, optional): Reserved for v2.16.x — currently always reports the default stale-marker threshold (5 minutes).
* **Returns**: `{ projectConfig: { status, projectId, writeReady, diagnostics[], owningWorktree }, filesystem: { accessPath, backendPath, destinationRoot, projectRoot }, runtime: { staleMarkers, activeOps, orphans, dysflowVersion, writeExecutionPolicy } }`. Each `filesystem.X` block carries `{ path, exists, hint? }` so the consumer can detect missing-directory footguns (the `destinationRoot.hint` includes the `git rm -r` remediation).

### `state`
Return the runtime operational state of a dysflow project as `{ operations, markers, locks, counters }`. Read-only — never opens Access, never spawns PowerShell, never mutates state.

- `operations` lists every persisted record from the access operation registry (cross-ref `list_access_operations`), normalized to `{ operationId, tool, status, startedAt, updatedAt, metadata }`.
- `markers` enumerates `<cwd>/.dysflow/runtime/markers/*.json` with `ageMinutes` computed against the wall clock.
- `counters` reports `totalOperations` plus `succeededLast24h` / `failedLast24h` / `abandonedLast24h` slices over the registry's persisted records.
- `locks` is reserved for a future lock-registry split (#967 follow-up); today it is an empty array.

Pairs with `resolve_project` (config), `diagnose` (current health), and `logs` (event timeline). `state` answers "what is happening right now?".
* **Parameters**:
  - `projectId` (string, optional): Reserved for a future per-project scoping extension. The current snapshot is global.
* **Returns**: `{ operations, markers, locks, counters }`. Each `operations[]` entry carries `operationId`, `tool` (= action), `status`, `startedAt`, `updatedAt`, and `metadata`. Each `markers[]` entry carries `operationId`, `action`, `status`, `updatedAt`, and `ageMinutes`. `counters.totalOperations` is the registry's full cardinality; `*Last24h` slices the registry's persisted records (terminal `completed` / `cleaned` records are ephemeral by design — see `logs` for the full audit trail).

### `logs`
Return runtime log entries from `.dysflow/runtime/` as a structured envelope. Read-only — never opens Access, never spawns PowerShell, never mutates state.

Sources are `invocations.jsonl`, `operations.json`, and per-operation markers.

Invocation entries identify the exact MCP tool, while the legacy operation ledger remains unchanged and joinable by `operationId`.
* **Parameters**:
  - `projectId` (string, optional): Canonical project identity for traceability. The runtime dir is always `<cwd>/.dysflow/runtime/`; `projectId` is echoed back in the response for future per-project scoping.
  - `options` (object, optional): Filters and pagination.
    - `since` (string, ISO 8601, optional): Lower bound on `timestamp`.
    - `until` (string, ISO 8601, optional): Upper bound on `timestamp`.
    - `level` (string, optional): One of `error`, `warning`, `info`, `debug`. Status mapping: `failed` / `timed_out` / `abandoned` → `error`; `cleanup_pending` → `warning`; `completed` / `cleaned` → `info`; everything else → `debug`.
    - `operationId` (string, optional): Narrow to a single operationId.
    - `tool` (string, optional): Filter by the exact MCP tool name (e.g. `query_sql` or `import_modules`).
    - `action` (string, optional): Filter by the coarse compatibility family (`vba`, `query`, `diagnostics`, `import`, `test`, or `run`).
    - `groupBy` (`"tool"`, optional): Add per-tool calls, split contract/runtime errors, p50/p95 latency, last-use timestamps, rejected-parameter frequencies, and omitted-required-parameter frequencies.
    - `limit` (number, optional, 1..1000): Maximum entries to return. Defaults to `100`.
    - `orderBy` (string, optional): `asc` or `desc`. Defaults to `desc` (most recent first).
* **Returns**: `{ entries, totalCount, truncated, aggregate? }` where each entry carries exact `tool`, separate `action`, nullable `operationId`, and privacy-safe invocation context. With `groupBy:"tool"`, `aggregate` contains `tools[]`, `rejectedParams[]`, and `missingParams[]`; it is computed across all filtered invocation entries rather than the paginated raw slice.

---

## MCP Tools

### 1. VBA Lifecycle & Testing
* **`export_modules`**: Export VBA source code modules to disk.
  - Parameters: `moduleNames` (array, optional), `filter` (string, optional), `destinationRoot` (string, optional), `verbose` (boolean, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional), `expectedAccessPath`/`expectedProjectRoot`/`expectedDestinationRoot` (string, optional)
  - With `verbose:true`, `verbose[]` contains one entry per exported module: `{ module, binary, file, classification, reason, srcUniqueFunctionalLines, binaryUniqueFunctionalLines, recommendation, actionable, classifierRules }`. `binary` is captured before export and `file` after the write; both snapshots contain `{ lines, bytes, sha256 }`. Hidden `Attribute VB_Name` metadata omitted by `CodeModule.Lines` is normalized before comparison. The verdict uses the same semantic classifier as `verify_code`, so line endings, trailing whitespace, and identifier case outside strings can be non-actionable while string literal and procedure-body changes remain actionable. The field is absent when `verbose` is false or omitted.
* **`export_all`**: Export all VBA modules (including code-less forms and reports visual layouts) and saved queries from the database.
  - Parameters: `filter` (string, optional), `diff` (boolean, optional), `prune` (boolean, optional), `verbose` (boolean, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
  - `verbose:true` returns the same per-module `binary`/`file` snapshots and canonical semantic verdict as `export_modules`; omitted or false keeps `verbose` absent.
  - **`prune`**: when `true`, after a **fully clean** export, deletes on-disk source files (`.bas`/`.cls`/`.form.txt`/`.report.txt`) whose module no longer exists in the binary, so the destination mirrors the binary. It deletes directly and lists the removed paths under `prune.deleted`. Guarantees:
    - **Never prunes after a warning.** If any module failed to serialize (e.g. a form open in design view) it is still live, so its file is kept; the response is `prune: { applied: false, reason: "export-had-warnings", deleted: [] }`.
    - **Incompatible with `filter`.** A filtered export only lists the matching modules, so pruning would delete every other on-disk file — this combination is rejected with `INVALID_INPUT`.
    - **Saved queries are never pruned.** Only the managed module/class/form/report folders are scanned.
* **`import_modules`**: Import VBA source modules from disk.
  - Parameters: `moduleNames` (array, optional), `importMode` (string, optional), `dryRun` (boolean, optional), `verbose` (boolean, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
  - With `verbose:true`, every successful module entry gains `{ source, destination, truncated, mismatchReason, classification, reason, srcUniqueFunctionalLines, binaryUniqueFunctionalLines, recommendation, actionable, classifierRules }`. Source comparison evidence comes from the original UTF-8 file before Access-compatible ANSI serialization, so lossy glyph changes inside strings remain actionable. A raw SHA mismatch may still retain legacy `mismatchReason:"content_hash"`, but consumers decide remediation from the canonical semantic fields. Raw module bodies are private classifier inputs and never appear in public success or failure envelopes. `IMPORT_TRUNCATED` remains fatal and rolls the module back; it is never downgraded to a semantic warning.
* **`import_all`**: Bulk import all local modules into the Access project.
  - Parameters: `importMode` (string, optional), `dryRun` (boolean, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
* **`fix_encoding`**: Normalize leading UTF-8 BOM artifacts in source files and round-trip affected module encoding in the binary. It does not restore lossy mojibake characters.
  - Parameters: `location` (string, optional), `timeoutMs` (number, optional)
* **`test_vba`**: Execute VBA unit tests.
  - Parameters: `proceduresJson` (string, optional), `filter` (string, optional), `testsPath` (string, optional), `timeoutMs` (number, optional)
  - `proceduresJson` is a JSON-encoded **string** that parses to an array of tests (or an object with a `tests` array). Each test is either a procedure-name string — shorthand for no args — or an object `{ "procedure": "Test_Name", "args": [...], "tags": [...] }` (`proc` is accepted as an alias for `procedure`). Both forms are equivalent: `"[\"Test_A\",\"Test_B\"]"` and `"[{\"procedure\":\"Test_A\",\"args\":[\"fixture\",1]}]"`. The same shapes apply to a `testsPath` manifest file.
  - On failure the result is `ok: false` with code `VBA_TESTS_FAILED`. The message names the failing procedures, and `error.details` carries the structured per-procedure report: `{ failedCount, failures[], results[] }`, where each failure keeps `procedure`, `error`, `logs`, `durationMs`, and `payload`.
  - Limitation: when a single procedure is an aggregate entry point (e.g. a VBA `RunAll`), Dysflow can only identify the inner failures if `RunAll` itself returns them in its JSON payload (`ok: false` plus `error`/`logs`). Dysflow does not parse VBA assertion output on its own.
* **`validate_manifest`**: Pre-validate a VBA test manifest before `test_vba`.
  - Parameters: `testsPath`/`path` (string, optional), `manifest` (object or array, optional), `modules` (object, optional), `destinationRoot`/`projectRoot` (optional)
  - Relative `testsPath` values resolve from the project root, matching `test_vba` manifest resolution.
  - Returns a validation report with `valid`, separate `errors` and `warnings` arrays, and a `summary` containing test and diagnostic counts.
* **`lint_module`**: Lint a `.bas`/`.cls` source module before import.
  - Parameters: `module` (string, required), `source` (string, optional), `rules` (array, optional), `destinationRoot`/`projectRoot` (optional)
  - Rules: `option-declaration`, `identifier-safety`, `declaration-order`, `arg-type-match` (same-module signatures only; detects clear literal-argument / declared-type mismatches only; no cross-module type inference or variable-flow analysis), and `forbidden-name` (F22 — flags identifiers that shadow VBA / Access / DAO / Scripting globals such as `Err`, `Date`, `Name`, `Form`, `DoCmd` — case-insensitive — on `Dim` / `Const` / `Type` / `Enum` / `Sub` / `Function` / `Property` / parameter declarations, with a project-convention recommendation like `errMsg` / `fechaAlta` / `db` / `rs` / `qdf`).
  - Returns `{ module, rules, isClean, diagnostics, flatDiagnostics, summary }` — diagnostics grouped by rule name, flatDiagnostics for backward compatibility, `isClean` true when no findings, and `summary` with error/warning counts.
* **`verify_code`**: The single dry-run tool that compares exported VBA/Form source against the disk tree. It NEVER mutates Access. One tool covers every comparison scope:
  - **Whole project** — omit `moduleNames`.
  - **A subset or a single module** — pass `moduleNames`. The filter is sent to the export phase, so the Access export targets only the requested modules (plus their normal form/report/code-behind artifacts), then the disk comparison is filtered to the same module names. It is not a broad whole-project export followed only by a filtered compare. If `moduleNames` is explicitly provided as an empty list, the request is rejected with `INVALID_INPUT`; omit `moduleNames` for a whole-project verify. If a non-empty `moduleNames` filter matches nothing in either side, it returns `MODULE_NOT_FOUND`.

  By default it classifies each differing module semantically (see [Semantic diff classification](#semantic-diff-classification)), separating non-functional noise from actionable functional differences.

  - Noise covers line endings/whitespace, `Attribute VB_*` headers, `.form.txt` serialization metadata, and encoding/mojibake.
  - It reports a per-category `summary`, structured counts in `summaryStructured`, and `actionableDifferent`/`nonActionableDifferent` lists.
  - `bulkImportable[]`/`bulkExportable[]` module lists drive direct sync planning, alongside a `hasFunctionalDifferences` / `actionableOk` signal.
  - Every diff carries `classification`, `reason`, and `recommendation`.
  - An aggregated, whole-comparison `recommendation` plus a machine `recommendedAction` (`no_action`, `import_to_binary`, `export_to_src`, or `manual_merge`) reads the sync direction in one shot.
  - Backward-compatible: still reports `matched`, `different`, and missing modules with optional diffs.
  - Parameters: `moduleNames` (array, optional), `diff` (boolean, optional), `strict` (boolean, optional — restore byte/text-exact comparison), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
  - Timeout contract: `timeoutMs` is the overall operation budget. `verify_code` keeps a small reserve before that deadline so preflight/export/compare stalls fail with a typed Dysflow error instead of falling through to the outer MCP request timeout. Export stalls return `VBA_MANAGER_TIMEOUT`; preflight and compare stalls return `VERIFY_CODE_PHASE_TIMEOUT`. All typed errors include `error.details` with `tool: "verify_code"`, `phase`, `moduleName`/`moduleNames`, `operationTimeoutMs`, and `phaseTimeoutMs`. Export-phase errors additionally carry `error.details.durationMs` (how long PowerShell had been running before the stall). Post-timeout Access orphan cleanup and temporary-directory cleanup are each bounded; if either exceeds its bound, the result returns promptly with a warning diagnostic instead of waiting indefinitely, and an export-phase stall where post-timeout cleanup also stalled additionally sets `error.details.cleanupTimedOut: true` and `error.details.cleanupTimeoutMs` so consumers can distinguish "the export stalled" from "the export stalled AND we could not reap the orphan within the bound".

  > **Migration note:** `verify_binary`, `reconcile_binary`, and `compare_module` were four names over this one engine and have been **removed**. Use `verify_code` for all of them: omit `moduleNames` for the whole project (old `verify_binary`), pass a single module for the old `compare_module`, and read `recommendation`/`recommendedAction` for the old `reconcile_binary` plan.
* **`delete_module`**: Delete one or more modules from the VBA project. Pass `moduleNames` (array) to delete a batch in a single Access session — this avoids the COM collisions that arise from issuing many parallel single-module calls; `moduleName` (singular) is still accepted for one module. The result reports per-module outcomes. When deletion fails with the corruption HRESULT `0x800ADEB9`, pass `force: true` to attempt a fallback (compact + retry / `DoCmd.DeleteObject`); otherwise the error returns bilingual remediation steps (see [`docs/diagnostics/hresult-guide.md`](../diagnostics/hresult-guide.md)). Write-gated.

Typed error envelopes expose a top-level `error.remediation` when the runtime has a canonical next action.

This field is independent of `get_capabilities.projectConfig.remediation`, whose existing diagnostic contract is unchanged.

See the shipped [`references/error-codes.md`](../../references/error-codes.md) for the canonical catalog.
  - Parameters: `moduleNames` (array, optional), `moduleName` (string, optional — single-module shorthand), `force` (boolean, optional — applies to the whole batch), `timeoutMs` (number, optional)
* **`list_objects`**: List all forms, reports, modules, and macros.
  - Parameters: `filter` (string, optional), `timeoutMs` (number, optional)
* **`list_vba_modules`** (issue #807 Feature 1): Enumerate every VBA project component with a binary-vs-source cross-reference. The runner walks `VBProject.VBComponents` once and releases every COM reference in `finally { FinalReleaseComObject }`; the TS side walks the source tree once to pair each binary row with its on-disk counterpart. The result is `{modules: [{name, type, fileType, sourcePath, binaryPath, sourceExists, binaryExists, contentMatch?}], summary: {total, inBinaryOnly, inSourceOnly, inBoth}}`. Read-only. Filters: `typeFilter` (one of `standard`, `class`, `form`, `report`, `document`), `namePattern` (single `*` wildcard at either end — `Test_*` matches any prefix, `*Issue*` matches any substring).
  - Parameters: `typeFilter` (string, optional), `namePattern` (string, optional), `timeoutMs` (number, optional)
* **`list_access_operations`**: Alias for listing tracked Access operations and their current registry status.
  - Parameters: none
* **`cleanup_access_operation`**: Alias for safely reconciling or force-cleaning a tracked Access operation.
  - Parameters: `operationId` (string, required), `force` (boolean, optional), `accessPath`/`backendPath`/`projectRoot`/`destinationRoot` (optional)
* **`exists`**: Verify if an object or module exists.
  - Parameters: `name` (string, optional), `moduleName` (string, optional), `timeoutMs` (number, optional)
* **`run_vba`**: Alias for executing a public VBA procedure in an already compiled project.
  - Parameters: `procedureName` (string, required), `argsJson` (string, optional), `accessPath`/`backendPath`/`projectRoot`/`destinationRoot` (optional)
* **`vba_orphan_audit`**: Audit the VBA project for orphan/placeholder modules — modules with no on-disk source counterpart and modules whose names match the Access placeholder pattern (`Módulo1`, `Module1`, `Class1`, `Form1`, …). Each entry carries `isSuspicious` and `sourcePath` (or `null` for orphans). Read-only.
  - Parameters: none (uses the active project context)
* **`vba_inline_execution`**: Run a throwaway VBA procedure-body snippet in one call — writes a temporary module, imports it, executes its public entry point, and cleans up both the binary component and temp file. Return values are explicit: write `result = "OK"`; the adapter result contains `data.returnValue`, while MCP carries `{ "returnValue": "OK" }` in `content[0].text` as JSON. A final bare literal such as `"OK"` is not an implicit return (it is invalid VBA) and is rejected before any import. Write-gated.
  - Parameters: `code` (string, required), `timeoutMs` (number, optional)

### Semantic diff classification

`verify_code` compares exported VBA/Form source against the disk tree.

By default it runs in **semantic mode**: each differing module is classified so that non-functional noise does not drown out the changes that actually need action.

This avoids the common false-positive flood where dozens of modules report as "different" but only a handful require any work.

Each differing module is assigned one `classification`:

| Category | Meaning | Actionable |
| --- | --- | --- |
| `matched` | No functional difference | No |
| `whitespaceOnly` | Only line endings (CRLF/LF), trailing whitespace, trailing blank lines, or trivial indentation | No |
| `attributeOnly` | Only module/class header boilerplate differs — `Attribute VB_*` lines (in code modules and a form's embedded `CodeBehindForm`) or the `VERSION x.x CLASS` + `BEGIN…END` instancing block that an Access export may emit on one side only. `VB_Name` is functional whenever the two sides disagree — a real rename (both name it, values differ) OR one side omitting it entirely (a dropped-identity import defect, #646); non-functional only when both sides carry the same name or both omit it | No |
| `caseOnly` | Only identifier/keyword casing differs (`Me.Name` vs `Me.name`). VBA is case-insensitive and the VBE re-cases identifiers project-wide on import. String-literal and comment bodies are compared **case-sensitively**, so a runtime-visible text change is NOT absorbed here | No |
| `formSerializationOnly` | Only `.form.txt` serialization metadata differs (`Checksum`, `PrtDevMode*`, `PrtDevNames*`, `PrtMip`, `RecSrcDt`, `LayoutCached*`, `PublishOption`, `NoSaveCTIWhenDisabled`), **or** a toggle property uses an equivalent serialization (`Visible =0` ≡ `Visible = NotDefault`). Access only writes a property when it differs from its default, so a written toggle value is always the same non-default — only the `NotDefault`/`0`/`-1` representation varies. A real change shows up as a line being present vs absent, which stays functional | No |
| `encodingOnly` | Difference disappears after normalizing encoding/mojibake artifacts — a leading BOM or its mojibake remnant (`?Attribute VB_Name…`, U+FEFF, U+FFFD) on one side only, or lossy out-of-codepage glyphs that Access export replaced with `?` (e.g. `►` → `?`). Lossy/case normalization is applied **outside string literals only**, so a glyph or casing change inside a quoted string stays functional | No |
| `sourceNewer` | Functional lines unique to disk source | Yes → `import_to_binary` |
| `binaryNewer` | Functional lines unique to the Access binary | Yes → `export_to_src` |
| `bothChanged` | Both sides have unique functional lines | Yes → `manual_merge` |

A form's **code-behind is verified through its `forms/*.cls`, not its `.form.txt`.**

- The code lives canonically in the `.cls`: dysflow's export writes it from `CodeModule.Lines`, and import syncs it back into the document module.
- The same code is also serialized — via `SaveAsText` — into the `.form.txt` `CodeBehindForm` section.
- The classifier strips everything from the `CodeBehindForm` marker onward and compares a `.form.txt` for its **UI/layout only**.
- A real form change (control/property/layout) stays actionable, while code-behind churn in the `.form.txt` is non-actionable — the `.cls` owns it.
- Casing and encoding normalization never collapse a genuine content change: identifier casing is folded only outside string literals/comments, so any runtime-visible difference still surfaces as functional.

The result adds:

- A flat `summary` (count per category) and `summaryStructured` (nested actionable/non-actionable counts).
- `actionableDifferent` / `nonActionableDifferent` lists.
- `bulkImportable[]` and `bulkExportable[]` module-name lists.
- A `hasFunctionalDifferences` / `actionableOk` signal, so an automated consumer decides what to act on without re-exporting and diffing the binary by hand.
- `dysflowVersion` (the runtime package version that produced the result) and `classifierRules` (a fingerprint of the active rule set).

Agents build sync calls from the bulk lists (`bulkImportable` → `import_modules.moduleNames`, `bulkExportable` → `export_modules.moduleNames`) instead of parsing raw `different[]`.

Reserve `manual_merge` / `bothChanged` entries for human conflict resolution.

`dysflowVersion` and `classifierRules` tell a consumer *which* version classified a diff, separating "fix not loaded into the running MCP" from "fix loaded but does not cover this case".

When `diff: true`, each per-module entry in both `actionableDifferent[]` and `nonActionableDifferent[]` carries:

- `classification`, `reason`, and `isActionable`.
- `recommendedAction` (mirrors `recommendation`).
- The unique-line counts.

Pass `strict: true` to disable classification and fall back to byte/text-exact comparison.

### 2. SQL Maintenance
* **`query_sql`**: Legacy read-only SQL compatibility wrapper. New consumers use `query_execute({ mode: "read" })`; it remains callable throughout the v2.x line and cannot be removed without a documented deprecation window and migration release note.
  - Parameters: `sql` (string, optional), `query` (string, optional), `projectId`, `contextId`, `accessPath`, `databasePath`, `sourcePath`, `target` (`frontend | backend`)
  - Resolution priority: an explicit `accessPath` is executed as the query database; otherwise an explicit `databasePath`/`sourcePath` wins, then `target` resolves through project config, and calls without an override keep the configured default. Raw SQL is not parsed to infer a table or database. Successful responses include `resolvedAccessPath` so callers can audit the selected database.
  - For a conservative simple `SELECT` against one table, Dysflow verifies the resolved database schema and returns `TABLE_NOT_IN_DATABASE` or `COLUMN_NOT_IN_TABLE` with `resolvedAccessPath` in `error.details`. Joins, subqueries, expressions, wildcards, and other complex SQL retain the database engine's existing generic error classification rather than guessing.
* **`exec_sql`**: Legacy write SQL compatibility wrapper. New consumers use `query_execute({ mode: "write", apply: false | true })`; it remains callable throughout the v2.x line under the same documented deprecation policy.
  - Parameters: `sql` (string, optional), `query` (string, optional), `dryRun`, `apply`, `allowTables`/`denyTables` (array, optional), `accessPath`/`backendPath` (optional)
* **`run_script`**: Execute SQL statements from a disk script file.
  - Parameters: `scriptPath` (string, optional), `path` (string, optional), `dryRun`, `apply`, `allowTables`/`denyTables` (optional)
* **`create_table`**: Programmatically create a table in the database.
  - Parameters: `tableName` (string, optional), `definition` (string, optional), `dryRun`, `apply`
* **`drop_table`**: Drop a table.
  - Parameters: `tableName` (string, optional), `dryRun`, `apply`
* **`seed_fixture`**: Populates mock rows in a table.
  - Parameters: `tableName` (string, optional), `rows` (array of objects, optional), `dryRun`, `apply`
* **`teardown_fixture`**: Clears only fixture rows inside a validated numeric test-id range. Unbounded teardown is rejected before Access is opened for mutation, and every generated `DELETE` includes a `WHERE ... BETWEEN ... AND ...` clause.
  - Parameters: `tableName` (string, required; `table` alias), `predicate` (required object: `column`, inclusive integer `min`, inclusive integer `max`; both bounds must be at or above `TEST_ID_BASE` 900000), `allowTables`/`denyTables` (optional), `dryRun`, `apply`
  - Preview returns the exact bounded SQL under `sql` and the structured values under `plan`; apply repeats the same validation at the PowerShell runner boundary.

### 3. Database Schema & Links
* **`list_tables`**: List tables in one selected database. Use `projectId` plus `target="frontend"` or `target="backend"`; `auto` is intentionally invalid because the operation has no `tableName` to drive lookup.
  - Parameters: `accessPath`, `backendPath`, `databasePath`, `sourcePath`, `target` (optional) — see [`target`](#common-input-parameters) for the projectId-first path
* **`list_linked_tables`**: List only frontend linked tables. The role is explicitly frontend-only; omit `target` or pass `target="frontend"`.
  - Parameters: `accessPath`, `backendPath`, `target` (optional)
* **`get_schema`**: Retrieve column types, sizes, and properties for a table.
  - Parameters: `tableName` (string, optional), explicit path aliases, and `target="frontend" | "backend" | "auto"`. With `projectId`/`contextId`, `auto` probes backend then frontend by table identity and fails on ambiguity instead of guessing.
* **`count_rows`**: Get row count for a table or SQL query.
  - Parameters: `tableName` (string, optional), `sql`/`query` (string, optional), `accessPath` (optional), `target` (optional)
* **`distinct_values`**: List distinct values of a column.
  - Parameters: `tableName` (string, optional), `columnName` (string, optional), `sql`/`query` (string, optional), `accessPath` (optional), `target` (optional)
* **`compare_backends`**: Compare structural differences between two backends.
  - Parameters: `accessPath`, `backendPath`, `comparePath` (string, optional), `target` (optional)
* **`generate_erd`**: Generate an entity-relationship document for the database schema.
  - Parameters: `erdPath` (Markdown output file; `.md` is appended when omitted), `accessPath`/`backendPath`/`destinationRoot`/`projectRoot` (optional)
* **`get_relationships`**: List foreign keys and relation constraints.
  - Parameters: `accessPath` (optional), `target` (optional)
* **`list_access_files`**: Search for `.accdb` files recursively in a directory.
  - Parameters: `rootPath` (string, optional), `directory` (string, optional)
* **`list_links`**: Get target connections of all linked tables.
  - Parameters: `accessPath` (optional), `target` (optional)
* **`link_tables`**: Link tables to a backend file.
  - Parameters: `accessPath`, `backendPath` (optional), `dryRun`
* **`relink_tables`**: Rebind existing linked tables to a backend file.
  - Parameters: `accessPath`, `backendPath` (optional), `dryRun`
* **`localize_backend_links`**: Convert absolute linked paths to local relative links.
  - Parameters: `accessPath`, `backendPath` (optional), `dryRun`
* **`unlink_table`**: Delete a linked table definition.
  - Parameters: `tableName` (string, optional), `accessPath` (optional), `dryRun`
* **`export_queries`**: Export Access QueryDefs.
  - Parameters: `exportPath`/`path`/`queryDefinitions` (optional), `accessPath` (optional), `dryRun`
* **`import_queries`**: Bulk import Access QueryDefs.
  - Parameters: `queryDefinitions`/`queries` (optional), `accessPath` (optional), `dryRun`
* **`compact_repair`**: Execute compact and repair operations. `target` defaults to `frontend`; use `target: "backend"` for the configured backend. Explicit paths override the semantic target with deterministic precedence: `databasePath`, then its `sourcePath` alias, then `accessPath`.
  - Parameters: `accessPath`/`databasePath`/`sourcePath` (optional), `backupFirst` (boolean, optional), `dryRun`
* **`relink_directory`**: Bulk relink table references recursively under a directory root.
  - Parameters: `rootPath` (string, required), `dryRun`, `apply`, `backup` (boolean, optional), `recursive` (boolean, optional), `maps` (array, optional), `denyPrefixes` (array, optional), `strictLocal` (boolean, optional), `removeUnresolved` (boolean, optional), `timeoutMs` (number, optional), `accessPath`/`backendPath`/`destinationRoot`/`projectRoot` (optional overrides)

### 4. GUI & Forms
* **`validate_form_spec`**: Parse and lint a JSON specification for form generation.
  - Parameters: `specPath` (string, optional), `spec` (object, optional)
* **`generate_form`**: Write a `.form.json` stub from a form spec. Does not create or compile a live Access form.
  - Parameters: `specPath` (string, optional), `spec` (object, optional), `kind` (string, optional), `name` (string, optional), `replace` (boolean, optional), `dryRun`
* **`catalog_add_control`**: Insert controls into a UI catalog definition.
  - Parameters: `catalogPath` (string, optional), `controlName` (string, optional), `controlType` (string, optional)
* **`harvest_form_catalog`**: Index controls from existing forms into a catalog.
  - Parameters: `catalogPath` (string, optional), `filter` (string, optional)
* **`inspect_form`**: Parse a version-controlled `.form.txt` (SaveAsText format) and return its control tree and form-level events as structured JSON. Works offline — Access is not required. Read-only.
  - Parameters: `sourcePath` (string, path to the `.form.txt` file), `path` (string, alias for `sourcePath`)
* **`compare_form`**: Compare two version-controlled `.form.txt` files and return a structured drift report (added/removed controls, changed properties, layout-bound changes), each classified as actionable or noise against the FORM_NOISE_KEYS floor (Checksum, PrtDevMode*, PrtDevNames*, PrtMip, RecSrcDt, LayoutCached*, PublishOption, NoSaveCTIWhenDisabled, NameMap). Works offline — Access is not required. Read-only.
  - Parameters: `sourcePath`/`path` (string, left `.form.txt` file), `targetPath` (string, right `.form.txt` file). The legacy `target` path alias remains accepted for compatibility, but is deprecated; role-shaped values (`frontend`, `backend`, `auto`) are rejected with guidance to use `targetPath`.
* **`lint_form_code`**: Static-analyze a form/report `.cls` against its parsed `.form.txt` without opening Access.
  - Parameters: `formName` or `moduleNames` (optional), `rules` (array, optional), `strict` (boolean, optional), `destinationRoot`/`sourceRoot` (optional)
* **`form_add_control`**: Add one control to a version-controlled `.form.txt` through FormIR. Defaults to dry-run; `apply:true` writes the source and requires the `import_modules` LoadFromText gate to pass.
  - Parameters: `sourcePath`, `controlName`, `controlType`, `properties` (optional), `targetSectionName` (optional), `dryRun`, `apply`
* **`form_move_control`**: Move one existing control by updating `Left` and/or `Top` only. Defaults to dry-run; `apply:true` writes and validates through the import_modules/LoadFromText gate.
  - Parameters: `sourcePath`, `controlName`, `left` (optional), `top` (optional), `dryRun`, `apply`
* **`form_rename_control`**: Rename one existing control while preserving its type, properties, and opaque metadata. Controls with `[Event Procedure]` bindings are rejected rather than silently breaking Access event procedure names. Defaults to dry-run; `apply:true` writes and validates through the import_modules/LoadFromText gate.
  - Parameters: `sourcePath`, `controlName`, `newName`, `dryRun`, `apply`
* **`form_set_property`** (#813 phase 6): Set one named layout/property entry on a control in a version-controlled `.form.txt` through the FormIR `setProperty` primitive. Refuses to mutate protected/metadata keys (`Checksum`, `PrtDevMode*`, `Format`) and refuses to change a control's `Name` (identity changes belong to `form_rename_control`). When the existing entry for the target property is blob-kind (e.g. `PrtMip`, `PrtDevNamesW`, `FormatConditions`), the primitive refuses with `FORM_PROPERTY_NOT_SCALAR` rather than pushing a duplicate scalar entry. Defaults to dry-run; `apply:true` writes and validates through the import_modules/LoadFromText gate. Never touches code-behind (the sibling `.cls` owns code-behind). Write-gated.
  - Parameters: `sourcePath`, `controlName`, `property`, `value` (string|number|boolean), `dryRun`, `apply`
* **`form_delete_control`** (#813 phase 6): Delete one named control from a version-controlled `.form.txt` through the FormIR `deleteControl` primitive. Fail-closed when the control (or any descendant) has an `[Event Procedure]` binding (`FORM_CONTROL_HAS_EVENT_BINDING` — handlers live in the sibling `.cls`) or when it has named child controls (`FORM_CONTROL_HAS_CHILDREN` — delete children first). This primitive protects ONLY property-sheet-declared event bindings visible to FormIR — it does not detect code-only references such as `WithEvents` in the `.cls` or `Me!ControlName`. Defaults to dry-run; `apply:true` writes and validates through the import_modules/LoadFromText gate. Destructive — Write-gated.
  - Parameters: `sourcePath`, `controlName`, `dryRun`, `apply`
* **`form_align_controls`** (#816, Phase 3 — Ergonomic actions): Align N named controls in a version-controlled `.form.txt` to a common edge using the MEDIAN of the selection (preserves the spread of off-median outliers; not min/max). Edges: `left` | `right` | `top` | `bottom` | `center-horizontal` | `center-vertical`. Identity-preserving: only the moved axis property (`Left` for horizontal verbs; `Top` for vertical verbs) changes; Name, type, Width, Height, other layout properties, event bindings, and code-behind are preserved verbatim. Refuses unknown control names (`FORM_CONTROL_NOT_FOUND`) and missing geometry (`FORM_MUTATION_INVALID`). Routes through the `applyGuardedFormWrite` seam. Defaults to dry-run; `apply:true` writes and validates through the import_modules/LoadFromText gate. Write-gated.
  - Parameters: `sourcePath`/`path` (string, required), `controlNames` (string[] | comma-separated string, required), `edge` (enum, required), `dryRun`, `apply`, `outputMode`
* **`form_distribute_controls`** (#816, Phase 3 — Ergonomic actions): Distribute N named controls in a version-controlled `.form.txt` evenly along an axis. Without `spacing`, distributes across the bounding box of the selection (first control stays at start, last at end, middle ones spaced evenly). With `spacing` (twips) provided, uses the exact gap between consecutive control edges. Identity-preserving: only the moved axis property changes; everything else is preserved. Refuses `<2` controls (`FORM_MUTATION_INVALID` — issue acceptance criterion), unknown control names (`FORM_CONTROL_NOT_FOUND`), and missing geometry (`FORM_MUTATION_INVALID`). Routes through the `applyGuardedFormWrite` seam. Defaults to dry-run; `apply:true` writes and validates through the import_modules/LoadFromText gate. Write-gated.
  - Parameters: `sourcePath`/`path` (string, required), `controlNames` (string[] | comma-separated string, required), `axis` (`"horizontal"` | `"vertical"`, required), `spacing` (number, optional), `dryRun`, `apply`, `outputMode`
* **`form_serialize`** *(slice 3, #616)*: Read-only round-trip serializer. Parses a `.form.txt` at `sourcePath`, runs it through `parseFormTxt` → `serializeFormTxt`, and returns the serialized text with `byteEqual` + `metadataReport` (preservedKeys, byteDiff, opaqueCount). Use it to verify that a form has round-trip-safe serialization before any mutation or clone attempt. Access is never opened. `apply` is ignored — this tool is intentionally read-only.
  - Parameters: `sourcePath` (string, required), `formName` (string, optional; derived from filename when omitted), `dryRun`/`apply` (ignored)
* **`form_deserialize`** *(slice 3, #616)*: Write a `FormIR` to `sourcePath` after re-serializing it, then invoke the `import_modules` LoadFromText gate. Defaults to dry-run (no write, no import). `apply:true` writes the `.form.txt` and requires the LoadFromText gate to pass; if the gate fails the original source is restored best-effort. Write-gated.
  - Parameters: `sourcePath` (string, required), `ir` (object, required — the slice-1 FormIR), `formName` (string, optional), `dryRun`/`apply`
* **`create_form_from_template`** *(slice 5, #618)*: Clone a source `.form.txt` into a new target form by applying a `{{Token}}` token map (e.g. `{{FormName}}` → `Form_FormNuevaAuditoria`). Resolves `sourceForm`/`targetForm` via bench-cache first, then `projectRoot`. Defaults to dry-run — returns the post-replacement preview plus the applied/missing token summary; `apply:true` writes the target and routes through the `import_modules` LoadFromText gate, restoring the original target on gate failure. Use `overwrite:true` to replace an existing target. `missingTokenPolicy` accepts `warn-pass-through` (default) or `strict`. Write-gated.
  - Parameters: `sourceForm` (string, required — form name without `.form.txt`), `targetForm` (string, required — target form name), `tokenMap` (object, required — `{ Token: replacement }`), `missingTokenPolicy` (string, optional — `warn-pass-through` | `strict`), `strictMissingTokens` (boolean, optional), `overwrite` (boolean, optional — default `false`), `dryRun`/`apply`
* **`analyze_form_ui`**: Analyze a version-controlled `.form.txt` into an AI-oriented semantic UI report: controls, roles, captions, bindings, events, and warnings. Read-only; Access is not opened.
  - Parameters: `sourcePath`/`path` (string, `.form.txt` source), `outputMode` (optional)
* **`map_form_behavior`** *(#830)*: Merge `analyze_form_ui` output with CodeGraph-VBA evidence so agents can connect controls/events to handlers, call paths, and table effects. Read-only. Two equivalent paths:
  - **Explicit (default contract)**: pass `codegraphEvidence` (array) yourself. The legacy contract — every entry keyed by `handler` + `callPath` (optional `tables`/`effects`) is bucketed onto its matching control by `${controlName}_` prefix (case-insensitive); unmatched entries land in `unmappedEvidence`.
  - **Internal fetch (opt-in, issue #830)**: pass `autoFetchCodeGraph: true` to relax the no-MCP-to-MCP boundary one-way (dysflow → codegraph-vba). The adapter invokes codegraph-vba internally and merges the result with any caller-supplied `codegraphEvidence`. On any invoker failure (no `.codegraph/` index, codegraph-vba CLI missing, parse error), the adapter falls back to the `.form.txt`-declared events alone and appends a warning — never throws.
  - Parameters: `sourcePath`/`path` (string, required), `codegraphEvidence` (array, **optional** since #830), `autoFetchCodeGraph` (boolean, optional, default `false` — opt-in to the internal-fetch path), `outputMode` (optional)
* **`generate_form_design_plan`**: Generate a traceable form UI design plan from a behavior map and proposed operations/reference pattern. Read-only.
  - Parameters: `behaviorMap` (object, required), `plan` (object, optional), `outputMode` (optional)
* **`apply_form_design_plan`** (#813 phase 6): Apply or preview an AI form UI design plan against a version-controlled `.form.txt` through the `applyGuardedFormWrite` seam (single accumulated write, single `import_modules` LoadFromText gate, single rollback on import failure). Defaults to dry-run and returns the would-be-written source plus advisories without writing; `apply:true` writes the source and requires the LoadFromText gate to pass. Source path resolved out-of-band via `sourcePath`/`path` (mirrors `form_add_control`). `plan.formName` is non-empty-checked and matched case-insensitively against the parsed form name; mismatch returns `FORM_UI_PLAN_FORM_MISMATCH` with no write. `note` operations are counted as advisories, never silently dropped; unknown kinds fail closed with `FORM_UI_UNSUPPORTED_OPERATION`. Write-gated.
  - Parameters: `plan` (object, required), `sourcePath`/`path` (string, required for `apply:true`), `dryRun`, `apply`, `outputMode`
* **`copy_form_ui_pattern`**: Convert a reference form UI pattern into explicit design-plan intent without erasing target behavior. Read-only preview.
  - Parameters: `behaviorMap` (object, required), `referencePattern` (object, required), `outputMode` (optional)
* **`verify_form_ui`**: Verify an applied form UI contract against the source behavior map and return actionable drift findings. Read-only.
  - Parameters: `sourceContract` (object, required), `appliedContract` (object, required), `outputMode` (optional)
* **`render_form_preview`** (#814, Phase 2 — Perception): Compute a geometric layout from a `.form.txt` and emit a deterministic, byte-stable artifact — SVG (primary, browser-friendly) and an ASCII grid (terminal/agent fallback) — without opening Access. The output shape `{ svg, ascii, viewport, warnings }` is the single primitive the sibling `diff_form_preview` (#817) composes pairs of frames from. Honors role taxonomy (action/input/display/container) for color coding. Read-only and offline — pure renderer, no Access, no COM, no filesystem mutation.
  - Parameters: `sourcePath`/`path` (string, required), `output` (`"svg"` | `"ascii"` | `"both"`, default `"svg"`), `viewportScale` (number, default `0.05`), `outputMode` (optional)
* **`analyze_form_layout`** (#815, Phase 2 — Perception): Run a geometry lint over a single `.form.txt` and report overlap, alignment (visual rows), off-section, tab-order vs visual order, and missing-geometry smells. Pure read-class — parses the `.form.txt` through FormIR, builds a behavior map, and delegates to the pure `lintFormLayout` core service. No Access, no COM, no filesystem mutation. Returns `{ findings, controls, sections }` where every finding carries severity `warning` (informational; never gating). The default `alignmentThresholdTwips` is 50; pass a smaller value to tighten the alignment net. Supply `sectionBounds` + `controlSection` together to enable the off-section check.
  - Parameters: `sourcePath`/`path` (string, required), `alignmentThresholdTwips` (number, optional, default `50`), `sectionBounds` (object, optional), `controlSection` (object, optional), `outputMode` (optional)
* **`diff_form_preview`** (#817, Phase 2 — Perception cont.): Compose a before/after visual diff of two `.form.txt` files. Pure read-class — reads both files through the fileSystem port, parses both through FormIR, and delegates to the pure `diffFormPreview` core service. Returns `{ changes: { added, removed, moved, resized }, warnings, beforeForm, afterForm, svg?, ascii? }` where each `added`/`removed` entry carries a `box` BoundingBox and each `moved`/`resized` entry carries `before` + `after` BoundingBoxes. The SVG frame is the same `render_form_preview` artifact with `data-diff="added|removed|moved|resized|same"` on every control rect and a `<g data-section="removed">` group of dashed-stroke ghost rects for removed controls. The ASCII frame prepends a diff-marker legend (`+` added, `-` removed, `*` moved/resized) and annotates per-cell markers in the grid. `output` selects the payload (`"svg"` | `"ascii"` | `"both"`); the structured envelope is always returned. `epsilon` (twips) loosens the moved/resized classifier. Read-only and offline — no Access, no COM, no filesystem mutation.
* **`verify_form_bindings`** (#818, Phase 2 — Perception cont.): Validate every `ControlSource` + `RowSource` binding in a `.form.txt` against a caller-supplied database schema. Pure read-class — reads the file through the fileSystem port, parses to FormIR, and delegates to the pure `validateBindings` core service. Returns `{ formName, controls, findings[] }` where each finding carries a typed `code` (`FORM_BINDING_MISSING_TABLE` / `FORM_BINDING_MISSING_COLUMN` / `FORM_BINDING_EMPTY` / `FORM_BINDING_SQL_UNPARSEABLE` / `FORM_BINDING_TYPE_MISMATCH`), `severity:"warning"` (informational; never gating), `controlName`, and structured `data` (table, column, binding). The `schema` parameter accepts either a multi-table `Record<tableName, ColumnSchema[]>` aggregate (fan out one `get_schema` per table upstream) or a single-table `get_schema` payload `{schema:[{name,type,nullable}], tableName:"..."}` — the adapter normalizes both. The adapter itself never fetches the schema; the caller owns the upstream `get_schema` calls. Read-only and offline — no Access, no COM, no filesystem mutation, no schema fetch.
  - Parameters: `beforePath`/`before` (string, required unless `projectId`+`beforeName`), `afterPath`/`after` (string, required unless `projectId`+`afterName`), `output` (`"svg"` | `"ascii"` | `"both"`, default `"both"`), `viewportScale` (number, default `0.05`), `ascii` (object, default `{cellWidth:80, cellHeight:24}`), `epsilon` (number, default `0`), `outputMode` (optional)
* **`sync_binary`** (#809, workflow tool): Compose the three existing primitives `verify_code` + `import_modules` + `export_modules` into a single round-trip: `verify -> plan -> execute -> re-verify -> recommend`. `dryRun: true` (default) populates `plan.toImport` / `plan.toExport` / `plan.skipped` and skips execute; `apply: true` performs the chunked import / export and re-runs `verify_code`. `direction` is `"src-to-binary"` (import), `"binary-to-src"` (export), or `"both"` (default). `scope.actionableOnly: true` (default) excludes nonActionable noise; `scope.includeBothChanged: true` surfaces bothChanged in `plan.skipped` with `reason: "bothChanged_acknowledged"`. `batchSize` (default 10) slices `toImport` / `toExport` before each inner sub-call so a single chunk failure never aborts the whole sync; `onChunkError: "abort"` short-circuits on the first failed chunk. `moduleNames` / `directoryPath` narrow the verify scope (mirrors `import_modules` #807 semantics). Both `mutatesBinary: true` AND `mutatesFilesystem: true` so the dispatch write-gate fires for any direction; `apply: true` requires writes-enabled (MCP_WRITES_DISABLED on the standard write-gate path). The runtime does NOT compile — the human compiles in Access (Debug > Compile) before re-running tests, exactly like the three primitives it composes. Returns the full `SyncBinaryResult` envelope: `{ ok, dryRun, preSync, plan: { toImport, toExport, skipped, totalActionable }, execution: { startedAt, finishedAt, durationMs, importResult, exportResult, chunksExecuted } | null, postSync: <verify_summary> | null, recommendation: "no_action" | "import_to_binary" | "export_to_source" | "manual_merge" }`. `returnFullDiff: true` opts in to the full verify_code `diffs` array on `preSync` / `postSync`.
  - Parameters: `direction` (`"src-to-binary"` | `"binary-to-src"` | `"both"`, default `"both"`), `scope` (`{ actionableOnly: bool, includeBothChanged: bool }`, default `{ actionableOnly: true, includeBothChanged: false }`), `moduleNames` (array), `directoryPath` (string), `recursive` (boolean, default true), `includeTests` (boolean, default true), `includeForms` (boolean, default true), `dryRun` (boolean), `apply` (boolean), `batchSize` (1..200, default 10), `onChunkError` (`"continue"` | `"abort"`, default `"continue"`), `parallelChunks` (1..8, default 1), `returnFullDiff` (boolean), `timeoutMs` (number), plus all CTX_PROPS / ACCESS_OVERRIDE / STRICT_CTX surfaces (`projectId`, `contextId`, `accessPath`, `strictContext`, `expectedAccessPath`, etc.)
* **`form_set_properties`** (#872 F1 — Form UX frictions): Atomically write a map of properties (`{ Left: 100, Top: 200, Width: 4536, Height: 500, Caption: '"Tile 1"' }`) against one named control in a version-controlled `.form.txt`. Collapses N `form_set_property` calls into one IR mutation — the typical full-geometry case (Left+Top+Width+Height) drops from 4 round trips to 1. LayoutCached* keys are silently dropped (#872 F3 — Access IDE serialisation noise; never written, regenerated on next save). All other per-key guards carry over: `Name` is refused (use `form_rename_control`), protected/metadata keys (`Checksum`, `Format`, `PrtDevMode*`) throw `FORM_PROPERTY_PROTECTED`, blob-kind entries refuse scalar replacement with `FORM_PROPERTY_NOT_SCALAR`. The batch is atomic — any per-key throw aborts the whole operation before any IR mutation lands. Refuses unknown controls with `FORM_CONTROL_NOT_FOUND`. Routes through the `applyGuardedFormWrite` seam — defaults to dry-run; `apply:true` writes the source and validates through the `import_modules` LoadFromText gate. Write-gated.
  - Parameters: `sourcePath` (string, required), `controlName` (string, required), `properties` (object, required — `{ key: string|number|boolean, ... }`), `dryRun` (boolean), `apply` (boolean), `outputMode` (optional)
* **`form_duplicate_control`** (#872 F2 — Form UX frictions): Deep-clone an existing control under a new name in a version-controlled `.form.txt`. The source control's type, entries, children, event bindings (`[Event Procedure]`), tab order, GUID, and metadata are copied verbatim — a duplicated control is pre-wired with the source's behaviour. Caller can override any scalar on top via the `overrides` map (`Caption`, `Left`, `Top`, `Width`, `Height`, …). `Name` is always ignored in overrides (identity wins via `newName`); protected/metadata keys throw `FORM_PROPERTY_PROTECTED`; blob-kind entries refuse scalar replacement; LayoutCached* keys are silently dropped (#872 F3). Optional `targetSectionName` pushes the clone into a different section (mirrors `form_add_control`'s section resolution). Refuses unknown source controls (`FORM_DUPLICATE_SOURCE_MISSING`) and name collisions (`FORM_DUPLICATE_CONTROL`) — both before any IR mutation lands. Routes through the `applyGuardedFormWrite` seam — defaults to dry-run; `apply:true` writes the source and validates through the `import_modules` LoadFromText gate. Write-gated.
  - Parameters: `sourcePath` (string, required), `sourceControlName` (string, required), `newName` (string, required), `targetSectionName` (string, optional), `overrides` (object, optional — `{ key: string|number|boolean, ... }`), `dryRun` (boolean), `apply` (boolean), `outputMode` (optional)
* **`form_get_geometry`** (#872 F5 — Form UX frictions): Read-only geometry helper. Returns the `Left`/`Top`/`Width`/`Height` box (twips) of one named control in a version-controlled `.form.txt`, plus the `LayoutCached*` values for symmetry with the source artifact. Refuses unknown controls with `FORM_CONTROL_NOT_FOUND`; refuses missing `sourcePath` with `FORM_SPEC_MISSING`. Pure read-class — never opens Access, never writes to disk. Path resolution mirrors the Phase 2 Perception siblings (`sourcePath`/`path` or `projectId`+`formName`). Stops agents from parsing `.form.txt` by hand — this is the canonical "where is this control on the canvas?" verb.
  - Parameters: `sourcePath`/`path` (string, required unless `projectId`+`formName`), `controlName` (string, required), `formName`/`name` (string, optional, used with `projectId`), `projectId` (string, optional)
* **`form_list_controls`** (#872 F5 — Form UX frictions): Read-only inventory helper. Returns the flat list of every named control in a version-controlled `.form.txt` (optionally scoped to one section via `section`), with each control's name, type, geometry box, and `hasEventBinding` bit (reflects whether the control carries any `OnXxx = [Event Procedure]` entry verbatim). Pure read-class — never opens Access, never writes to disk. Path resolution mirrors the Phase 2 Perception siblings. Stops agents from parsing `.form.txt` by hand — this is the canonical "what controls does this form have?" verb.
  - Parameters: `sourcePath`/`path` (string, required unless `projectId`+`formName`), `section` (string, optional), `formName`/`name` (string, optional, used with `projectId`), `projectId` (string, optional)

## MCP protocol and maintenance

The MCP stdio adapter uses `@modelcontextprotocol/sdk` v1.29.0. Protocol version negotiation, framing, and spec compliance are handled by the SDK.

The server currently derives its default negotiated protocol version from the SDK (`2025-03-26` with this pinned SDK), and the SDK supports up to `2025-11-25`.

Custom behaviors layered on top of the SDK (preserved from the previous hand-rolled adapter):

- Tool handler exceptions are absorbed into `{ isError: true }` results — they never propagate as JSON-RPC `-32603` internal errors.
- Error messages have Windows/UNC/POSIX paths scrubbed before reaching the client.
- A 1 MiB per-line size guard (`SizeLimitTransform`) sits between `process.stdin` and the SDK transport.

---

[Next: HTTP API](./http-api.md)
