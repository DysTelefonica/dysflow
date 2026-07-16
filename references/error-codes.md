# Dysflow error codes

Use `error.code` for programmatic branching and show `error.remediation` as the next action. Preserve
the message and nested details as diagnostic evidence; do not parse localized Access text.

## Form and import failures

| Code | Meaning | Remediation |
| --- | --- | --- |
| `FORM_CONTROL_NOT_FOUND` | The named control is absent from the resolved form source. | Run `dysflow.form_list_controls` and retry with an existing control name. |
| `FORM_IMPORT_GATE_FAILED` | A guarded form write reached `import_modules`, which failed. Disk rollback and the nested import cause are reported separately. | Inspect `details.rollback` and `details.cause`; follow the typed nested code before retrying. |
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
