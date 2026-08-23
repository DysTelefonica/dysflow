# `import_modules`

## What it does

Imports selected UTF-8 disk modules into the Access binary with rollback-safe diagnostics.

## When to use

Use after editing a focused source slice. The human compile gate follows every committed import.

## Required flags

Pass explicit `apply:false` to preview and `apply:true` to commit. Never pass `compile:true` or an unsupported `force` flag.

## All input properties

Derive them from the live full schema. Use `verbose:true` for source/destination evidence.

## Pre-flight checks

destinationRoot must exist before `apply:true`. If `git rm -r src/` removed the
directory itself, recreate it before the call; Dysflow fails closed rather than
silently choosing another destination.

## Call shape

```json
{
  "tool": "import_modules",
  "arguments": {
    "moduleNames": ["Module1"],
    "destinationRoot": "src",
    "apply": false,
    "verbose": true
  }
}
```

## Result shape

Verbose entries include source/destination snapshots, `truncated`, `mismatchReason`, `classification`, `actionable`, and `recommendation`. `IMPORT_TRUNCATED` is fatal and rolls back.

## Common errors

| Code | Description | Fix |
|---|---|---|
| `LIVE_PROCESS_HOLDS_LACCDB` | A verified live process owns the lock. | Use Dysflow-owned operation discovery and cleanup only. |

## Cross-reference

- `../../references/error-codes.md`

## TODO before production use

After commit, stop and wait for the human to compile in Access before tests.
