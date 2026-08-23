# Dysflow error codes

Use `error.code` for programmatic branching and show `error.remediation` as the next action. Preserve
the message and nested details as diagnostic evidence; do not parse localized Access text.

## VBA test execution gate

### `PROCEDURE_NOT_ALLOWED`

**Trigger:** `test_vba` was called with a procedure that is not in the configured `allowedProcedures` allowlist. Emitted by `VbaExecutionAdapter.ensureTestProceduresAllowed` (Issue #659 split + #1046 re-synced). The error envelope carries `error.allowedProcedures` (the active allowlist) and `error.remediation` (the next action). Issue #1046 confirmed this code as the canonical test_vba-gate code; the previous `MCP_PROCEDURE_NOT_ALLOWED` heading (canonical-handler gate for `run_vba`) is a separate, intentional code that survives on the `run_vba` path.

**Action:** Add the procedure to `allowedProcedures` in `.dysflow/project.json` (re-read per call — no restart needed) or pick a procedure that is already in the list. The allowlist gate does NOT fire on `dryRun:true` (Bug B fix #1046: dryRun short-circuits BEFORE the gate so plan-only callers see a plan-shaped success).

| Code | Meaning | Remediation |
| --- | --- | --- |
| `PROCEDURE_NOT_ALLOWED` | `test_vba` was called with a procedure that is not in the configured `allowedProcedures` allowlist. Emitted by `VbaExecutionAdapter.ensureTestProceduresAllowed` (Issue #659 split + #1046 re-synced). The error envelope carries `error.allowedProcedures` (the active allowlist) and `error.remediation` (the next action). Issue #1046 confirmed this code as the canonical test_vba-gate code; the previous `MCP_PROCEDURE_NOT_ALLOWED` heading (canonical-handler gate for `run_vba`) is a separate, intentional code that survives on the `run_vba` path. | Add the procedure to `allowedProcedures` in `.dysflow/project.json` (re-read per call — no restart needed) or pick a procedure that is already in the list. The allowlist gate does NOT fire on `dryRun:true` (Bug B fix #1046: dryRun short-circuits BEFORE the gate so plan-only callers see a plan-shaped success). |

## Form and import failures

| Code | Meaning | Remediation |
| --- | --- | --- |
| `FORM_CONTROL_NOT_FOUND` | The named control is absent from the resolved form source. | Run `dysflow.form_list_controls` and retry with an existing control name. |
| `FORM_IMPORT_GATE_FAILED` | A guarded form write reached `import_modules`, which failed — including a gate result whose payload carries per-module errors (#951). The source mutation is reverted on any gate failure; `details.rollback` reports the outcome and `details.rollbackApplied` mirrors `rollback.applied`. | Inspect `details.rollback` and `details.cause`; follow the typed nested code before retrying. |
| `FORM_NAME_RESOLUTION_FAILED` | A form/report module name resolves to an empty Access object name (e.g. a source named exactly `Form_.form.txt`), so `SaveAsText`/`LoadFromText` cannot address the document. No source mutation is performed. | Rename the source file so it carries a real form/report name, then retry. |
| `FORM_SOURCE_MALFORMED` | The pre-import quality gate (#958) found a structurally broken `.form.txt`/`.report.txt` — unbalanced Begin/End layout tree, truncated blob, or a file that is not a SaveAsText export. The runner is never spawned and the Access binary is never touched; `details.defects` lists each file with its parser message. Metadata-only legacy defects (missing `AutoResize` marker, stale `VB_Name`) do NOT trigger this code — the import self-heals them. | Repair the listed files or re-export them from a healthy binary (`export_modules`/`export_all`), then retry. |
| `FORM_VBNAME_PREFIX_MISMATCH` | Pre-import guard (#1040) rejected an Auto-mode `import_modules` on full-form source (`.cls` + `.form.txt` together) where the basename `ModuleName` lacks the `Form_`/`Report_` prefix AND the binary already carries a legacy `Form_<base>` / `Report_<base>` component from a prior `SaveAsText`. The import was NOT started, so no rollback is required and the binary is untouched. This is the regression guard for the #1020 round-3 fix — round-3 only covered `.cls`-only / `.form.txt`-only paths; the Auto path with both files together was unfixed because `LoadFromText` runs before `AddFromFile` and the pre-existing form would have been silently renamed to `Form_TempSccObjN`. | Rename the source files to use the prefixed form name (`Form_<base>` or `Report_<base>`) OR delete the legacy prefixed form from the binary before retrying. |
| `PROCEDURE_NOT_FOUND` | The requested VBA procedure is verifiably absent from the project's source tree — the `AccessVbaService` preflight (#1045) scanned every `.bas` / `.cls` under `modules/`, `classes/`, `forms/`, and `reports/` for a public declaration matching `procedureName` (case-insensitive) and found none. The PowerShell runner was NOT spawned, so no Access side-effect occurred and the existing `RUNNER_FAILED` taxonomy for genuine runner failures is preserved. When the source resolver cannot resolve any module (no `destinationRoot` configured, or the resolver returned `undefined`), the preflight is a non-fatal no-op and the runner proceeds — this matches the legacy behaviour for projects that have not wired a `destinationRoot`. `details.procedure` echoes the request; `details.moduleName` is present when the caller supplied one; `details.scannedModules` reports the number of modules walked. | Verify the procedure name and module, import the procedure into the binary before retrying, or pass an inline `source` so the preflight has bytes to scan. |
| `VBA_IMPORT_PHASE_FAILED` | Access rejected one module during the named import phase. | Validate the source and inspect the `phase`; see [form import-gate recovery](../docs/diagnostics/form-import-gate-failures.md). |

## Input, project, path, and schema failures

| Code | Meaning | Remediation |
| --- | --- | --- |
| `MCP_TOOL_NOT_FOUND` | The MCP client named a tool that is not advertised by this runtime. The error is a contract failure; telemetry retains the attempted tool name but never argument values. | Call `tools/list` or `describe_tool` and retry with an advertised name. Do not guess hidden or retired tool names. |
| `MCP_INPUT_INVALID` | The request does not match the tool schema. Structured envelopes may identify one omitted required field as `error.missingParam` and rejected flags as `error.rejectedFlag` / `error.rejectedFlags`; telemetry aggregates those names only, never argument values. Project recovery also uses this code for an invalid, expired, replayed, partial, mismatched, or fingerprint-stale recovery token. | Read the live tool schema and replace unsupported or missing fields. For project recovery, call `resolve_project` again, ask the human to choose one returned `availableProjects` entry, and retry with the exact `projectId` + `projectChoiceReason` + fresh `recoveryToken` trio. For `form_set_property`, use `property`, not `propertyName`. |
| `PROJECT_ID_COLLISION` | More than one visible project declares the selected project id. Recovery tokens preserve this failure instead of choosing the first match. | Give every worktree a unique id, call `resolve_project` for a fresh recovery envelope, and ask the human to choose again. |
| `FRONTEND_TARGET_AMBIGUOUS` | More than one project or frontend target is eligible and Dysflow will not guess. `resolve_project` surfaces `availableProjects`, `recoveryToken`, and `recoveryInstruction` when a project-level human choice can resolve the ambiguity. | Ask the human to choose one `availableProjects` entry and submit the exact recovery trio. If the ambiguity is multiple frontends inside one project, configure `frontendFile`; a project-id choice cannot safely choose a file. |
| `INVALID_READ_ONLY_QUERY` | `query_execute` received SQL that can mutate the database while `mode` was `"read"`. | Use read-only SQL, or explicitly select `mode:"write"` and follow the tool's write-intent contract. |
| `PROJECT_CONFIG_NOT_WRITE_READY` | The active project configuration cannot authorize a write. | Follow the top-level remediation; do not alter `projectConfig.remediation`. |
| `CONFLICTING_TARGET_ALIASES` | The request supplied more than one frontend Access alias (`accessPath` / `accessDbPath` / `databasePath` / `sourcePath`) and they did NOT normalize to the same Windows path. Equivalent aliases (differing only in `/` vs `\\`, case on Windows, `./..`, or trailing separators) pass this check via `resolve` + case-insensitive comparison. The `backendPath` alias is intentionally NOT in this set — passing `accessPath` and `backendPath` together is a legitimate split-DB request (#1044). True conflicts still fail closed; only equivalent aliases no longer false-fail. | Pass exactly one of `accessPath`, `accessDbPath`, `databasePath`, or `sourcePath` — OR align them to the same Windows path. For split-DB requests that legitimately name both the frontend and the backend, keep the `accessPath` override matching the configured frontend and the `backendPath` override matching the configured `backendPath`. |
| `PATH_MISMATCH` | Explicit and configured paths identify different targets. | Reconcile the requested path with `.dysflow/project.json`. |
| `OUTSIDE_PROJECT_ROOT` | A managed source path escapes the project root. | Move the source under the configured project root or select the correct project. |
| `SANDBOX_ONLY` | `run_script` or `vba_inline_execution` received an explicit Access target outside the active worktree resolved from the physical project configuration. | Copy the database into the current worktree sandbox or select the correct project before retrying. |
| `CONFIRMATION_REQUIRED` | A process-control or runtime-mutating operation needs explicit human confirmation before dispatch. This includes selecting an orphan PID and inline code such as `Application.Quit`. | Ask the human to confirm the exact operation, then retry with `confirmedRequiresConfirmation: true`. |
| `TABLE_NOT_IN_DATABASE` | The requested table is absent from the selected database. | Enumerate the live schema and retry with an existing table. |
| `COLUMN_NOT_IN_TABLE` | The requested column is absent from the selected table. | Enumerate the table columns and retry with an existing column. |

## CLI install and update channels

`dysflow install`, `dysflow update`, and `dysflow doctor` accept `--channel {stable|beta|main}`
(issue #1521). The channel is resolved as: explicit `--channel` -> `DYSFLOW_CHANNEL` -> the channel
persisted in `<runtimeDir>/.dysflow-install-state.json` -> `stable`. These codes are emitted on
stderr by the CLI, not inside an MCP envelope, so the code is the first token of the message.

| Code | Meaning | Remediation |
| --- | --- | --- |
| `DYSFLOW_UNKNOWN_CHANNEL` | The requested channel is not one of `stable`, `beta`, `main`. Raised for both `--channel <name>` and `DYSFLOW_CHANNEL`; the message names which one carried the bad value. No network request is made. | Re-run with one of the three channels, or unset `DYSFLOW_CHANNEL`. See [update trust model](../docs/security/update-trust-model.md). |
| `DYSFLOW_INSECURE_GATE_MISSING` | `beta` or `main` was requested without `DYSFLOW_ALLOW_INSECURE_UPDATE=1`. Neither channel is covered by the Ed25519 release trust anchor, so the gate is refused before any artifact is fetched — reachability of the artifact is irrelevant. | Set `DYSFLOW_ALLOW_INSECURE_UPDATE=1` to accept the risk explicitly, or stay on `--channel stable`. See [update trust model](../docs/security/update-trust-model.md). |
| `DYSFLOW_SKIP_CHECKSUM_REQUIRES_STABLE_CHANNEL` | `--skip-checksum` was combined with `--channel beta` or `--channel main`. The flag is a stable-channel escape hatch; the unsigned channels enforce their own verification policy, so the combination is a contradiction rather than a stronger bypass. | Drop `--skip-checksum`, or switch to `--channel stable`. See [update trust model](../docs/security/update-trust-model.md). |
| `DYSFLOW_CHANNEL_PIN_REQUIRES_FORCE` | `dysflow update --channel X` was run against a runtime whose install state records a different channel, without `--force`. A runtime does not change channel silently. Re-running `update` on the pinned channel is always allowed. | Re-run with `--force` to switch channels, or drop `--channel` to keep updating the pinned one. See [update trust model](../docs/security/update-trust-model.md). |
| `DYSFLOW_PRERELEASE_TAG_NOT_FOUND` | The `beta` channel listed the published releases and found no tag matching the Dysflow prerelease grammar `vX.Y.Z-{rc,beta,alpha,prerelease}.N`. | Use `--channel stable`, or wait until a prerelease is published. See [update trust model](../docs/security/update-trust-model.md). |

## Runner and Access binary failures

| Code | Meaning | Remediation |
| --- | --- | --- |
| `ACCESS_PASSWORD_INVALID` | Access rejected the password dysflow supplied for the target `.accdb` — DAO error 3031, raised by `OpenDatabase`. Before #1186 this surfaced as a generic `RUNNER_FAILED` carrying the raw, host-locale-dependent Access text (`"No es una contraseña válida."` on a Spanish Windows), so the reader had to parse a localized string to conclude the only broken thing was an environment variable. The runner now classifies the DAO 3031 signature (Spanish, English, and accent-mangled variants) into this code on both the probe and the locked-operation paths; the MCP dispatch seam remaps it to the canonical `BINARY_PASSWORD_INVALID`. `details.passwordEnv` names the env var actually consulted, `details.accessDbPath` the target, and `details.runnerOutput` preserves the original secret-sanitized Access diagnostic. | Set the correct database password in the env var named by `details.passwordEnv` (`ACCESS_VBA_PASSWORD` unless the project config declares another), then restart the process that spawns the runner so the child inherits the new value. The password itself is never echoed. |
| `RUNNER_FAILED` | The PowerShell runner exited non-zero for a reason with no typed classification. The message carries the secret-sanitized runner output as diagnostic evidence. | Read the embedded runner output; do not branch on its localized text. If the cause turns out to be a recurring, recognizable failure mode, it belongs in this table with its own code. |

## Recovery rule

Never kill `MSACCESS.EXE` by process name. Inspect `list_access_operations`, reconcile tracked stale
operations with `cleanup_access_operation`, then use `access_force_cleanup_orphaned` only after
verifying and confirming the exact orphan PID.
