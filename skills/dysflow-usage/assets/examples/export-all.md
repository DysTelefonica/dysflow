# `export_all`

## What it does

Exports every managed Access source object and can return semantic verbose evidence.

## When to use

Use for a complete binary-to-source refresh. Prefer `export_modules` for a focused slice.

## Required flags

Pass explicit `apply:false` to preview and `apply:true` to commit. `prune:true` is destructive and keeps its clean-export guards.

## All input properties

Read the live full schema; do not combine `prune` with `filter`.

## Call shape

```json
{
  "tool": "export_all",
  "arguments": {
    "destinationRoot": "src",
    "apply": false,
    "verbose": true
  }
}
```

## Result shape

Verbose entries include binary/file snapshots plus `classification`, `reason`, `actionable`, `recommendation`, and `classifierRules`.

## Common errors

| Code | Description | Fix |
|---|---|---|
| `MCP_INPUT_INVALID` | Invalid flag or incompatible prune/filter intent. | Re-read the full schema and retry the plan. |

## Cross-reference

- `../write-flags-matrix.md`

## TODO before production use

Review the plan and resolved destination before changing `apply` to `true`.
## Choosing the right tool

This is a specialized tool. When its write-capable path is covered by a preferred workflow tool, Dysflow keeps the call successful and appends an informational `PREFERRED_TOOL_AVAILABLE` item to `warnings[]`. Follow the warning's `preferred`, `rationale`, and `docsAnchor` fields on the next iteration. Pass `forceSpecialized:true` only when granular control is intentional; the dispatcher consumes the flag before invoking this tool. Read-only specialized calls are not warned, and legacy calls use the escalated `LEGACY_TOOL_AVAILABLE` code.
