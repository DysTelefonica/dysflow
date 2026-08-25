# `export_modules`

## What it does

Exports selected modules from the Access binary to managed disk source.

## When to use

Use for the smallest focused binary-to-source synchronization slice.

## Required flags

Pass explicit `apply:false` to preview and `apply:true` to commit.

## All input properties

Derive them from the live full schema. `destinationRoot` may be worktree-relative.

## Pre-flight checks

destinationRoot must exist before `apply:true`. If `git rm -r src/` removed the
directory itself, recreate it before the call; Dysflow fails closed rather than
silently choosing another destination.

## Call shape

```json
{
  "tool": "export_modules",
  "arguments": {
    "moduleNames": ["Module1"],
    "destinationRoot": "src",
    "apply": false,
    "verbose": true
  }
}
```

An external destination is allowed only for a preview. Keep the source and
destination opt-ins separate and pass explicit `apply:false`:

```json
{
  "tool": "export_modules",
  "arguments": {
    "moduleNames": ["LegacyRules"],
    "accessPath": "C:/archives/legacy.accdb",
    "allowExternalAccessPath": true,
    "destinationRoot": "C:/exports/review",
    "allowExternalDestinationRoot": true,
    "apply": false
  }
}
```

`allowExternalDestinationRoot` with `apply:true` is rejected. Symlink or
reparse-point destinations that canonicalize elsewhere also fail closed.

## Result shape

Read `resolvedDestinationRoot`. With `verbose:true`, each entry includes binary/file snapshots and the semantic actionability verdict.

## Common errors

| Code | Description | Fix |
|---|---|---|
| `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` | Destination overlaps managed source. | Review the typed confirmation contract; never invent `force`. |

## Cross-reference

- `../write-flags-matrix.md`

## TODO before production use

Confirm the resolved destination and module list before committing.
