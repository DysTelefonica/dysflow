# Dysflow error codes

Use `error.code` for programmatic branching and show `error.remediation` as the next action. Preserve
the message and nested details as diagnostic evidence; do not parse localized Access text.

## Form and import failures

| Code | Meaning | Remediation |
| --- | --- | --- |
| `FORM_CONTROL_NOT_FOUND` | The named control is absent from the resolved form source. | Run `dysflow.form_list_controls` and retry with an existing control name. |
| `FORM_IMPORT_GATE_FAILED` | A guarded form write reached `import_modules`, which failed — including a gate result whose payload carries per-module errors (#951). The source mutation is reverted on any gate failure; `details.rollback` reports the outcome and `details.rollbackApplied` mirrors `rollback.applied`. | Inspect `details.rollback` and `details.cause`; follow the typed nested code before retrying. |
| `FORM_NAME_RESOLUTION_FAILED` | A form/report module name resolves to an empty Access object name (e.g. a source named exactly `Form_.form.txt`), so `SaveAsText`/`LoadFromText` cannot address the document. No source mutation is performed. | Rename the source file so it carries a real form/report name, then retry. |
| `FORM_SOURCE_MALFORMED` | The pre-import quality gate (#958) found a structurally broken `.form.txt`/`.report.txt` — unbalanced Begin/End layout tree, truncated blob, or a file that is not a SaveAsText export. The runner is never spawned and the Access binary is never touched; `details.defects` lists each file with its parser message. Metadata-only legacy defects (missing `AutoResize` marker, stale `VB_Name`) do NOT trigger this code — the import self-heals them. | Repair the listed files or re-export them from a healthy binary (`export_modules`/`export_all`), then retry. |
| `VBA_IMPORT_PHASE_FAILED` | Access rejected one module during the named import phase. | Validate the source and inspect the `phase`; see [form import-gate recovery](../docs/diagnostics/form-import-gate-failures.md). |

## Input, project, path, and schema failures

| Code | Meaning | Remediation |
| --- | --- | --- |
| `MCP_INPUT_INVALID` | The request does not match the tool schema. | Read the live tool schema and replace unsupported or missing fields. For `form_set_property`, use `property`, not `propertyName`. |
| `PROJECT_CONFIG_NOT_WRITE_READY` | The active project configuration cannot authorize a write. | Follow the top-level remediation; do not alter `projectConfig.remediation`. |
| `PATH_MISMATCH` | Explicit and configured paths identify different targets. | Reconcile the requested path with `.dysflow/project.json`. |
| `OUTSIDE_PROJECT_ROOT` | A managed source path escapes the project root. | Move the source under the configured project root or select the correct project. |
| `TABLE_NOT_IN_DATABASE` | The requested table is absent from the selected database. | Enumerate the live schema and retry with an existing table. |
| `COLUMN_NOT_IN_TABLE` | The requested column is absent from the selected table. | Enumerate the table columns and retry with an existing column. |

## Recovery rule

Never kill `MSACCESS.EXE` by process name. Inspect `list_access_operations`, reconcile tracked stale
operations with `cleanup_access_operation`, then use `access_force_cleanup_orphaned` only after
verifying and confirming the exact orphan PID.
