# Project context resolution

This page states how a tool call finds its dysflow project and which parameters each tool still needs from the caller. It is the reference behind the `dysflow-usage` skill's context rules (#1867).

## Resolution order

Each call uses the first source that applies:

1. **Explicit parameters on the call**: `projectRoot`, `cwd`, then `projectId`.
2. **The project fixed by `resolve_project` for this MCP session**: set when `resolve_project` returns `outcome: "resolved"`, cleared by `resolve_project({ clearResolution: true })`. It applies only to calls with no `cwd`, `projectRoot` or `projectId`.
3. **The MCP startup cwd**: the fallback for everything else.

An explicit `projectId` never falls back to the session project.

## What the config already provides

For a resolved project, the config supplies `accessPath` (frontend), `backendPath`, `destinationRoot` (the source root for modules and forms), and `projectRoot`. Tools derive these; the caller does not repeat them.

## Form tools: `formName`

`formName` with `cwd` (or with `projectId`) resolves the source from the project's `destinationRoot` to `forms/<formName>.form.txt`. Implemented in #1867 for the form readers that go through `readFormContext` (`inspect_form`, `form_get_geometry`, and the layout, preview and binding readers). The unit test covers the shared path; each tool is not yet exercised end to end.

`formName` with neither a context nor `sourcePath` still fails with `FORM_SPEC_MISSING`.

## Matrix (status so far)

| Tool | Business parameter | Context from the config | Status |
| --- | --- | --- | --- |
| `form_list_controls` | `formName` | `destinationRoot` (via `cwd` or `projectId`) | Works with `cwd` + `formName` (#1867, shared path) |
| `inspect_form` | `formName` | `destinationRoot` | Works with `cwd` + `formName` (#1867, shared path) |
| `form_get_geometry` | `formName` | `destinationRoot` | Works with `cwd` + `formName` (#1867, shared path) |
| `lint_module` | `module` | `destinationRoot`, `accessPath` | Works after `resolve_project` without `cwd` (#1867, session seam; not yet run end to end) |
| `verify_code` | none | all | `cwd` only is enough |
| `import_modules` (plan) | `moduleNames` | all | `cwd` + `moduleNames` |

Rows for the other tools in the #1867 evidence table (`lint_form_code`, `analyze_form_ui`, `validate_manifest`, `export_modules`) are not yet verified against this contract; the full table is the open part of #1867.

## Errors

- `PROJECT_CONTEXT_MISSING` (planned, #1867): no `cwd`, no session project, and no `projectId`. Until it ships, the tools may still return `CONFIG_MISSING_ACCESS_PATH`, `MODULE_NOT_FOUND` or `FORM_SPEC_MISSING` for this cause.
- `PROJECT_ID_COLLISION`: two visible projects share the requested `projectId`; pass `cwd` to disambiguate.
