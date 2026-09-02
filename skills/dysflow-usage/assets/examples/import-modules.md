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

A successful committed import returns its PowerShell payload as an object, never
as a bare top-level array.

Inside the public result data, read the nested `modules[]` member from the
payload stored under `result`:

```json
{
  "result": {
    "ok": true,
    "modules": [
      {
        "module": "Module1",
        "status": "ok"
      }
    ]
  }
}
```

Do not branch on a top-level array: the `{ "ok": true, "modules": [...] }`
transport envelope preserves multi-module batches across MCP hosts.

Every module entry must report `status:"ok"`; a failed entry makes the import
fail even if the outer transport marker says `ok:true`.

Verbose module entries also include source/destination snapshots, `truncated`,
`mismatchReason`, `classification`, `actionable`, and `recommendation`.
`IMPORT_TRUNCATED` is fatal and rolls back.

## Common errors

| Code | Description | Fix |
|---|---|---|
| `LIVE_PROCESS_HOLDS_LACCDB` | A verified live process owns the lock. | Use Dysflow-owned operation discovery and cleanup only. |

## Cross-reference

- `../../references/error-codes.md`

## TODO before production use

After commit, stop and wait for the human to compile in Access before tests.
## Choosing the right tool

This is a specialized tool. When its write-capable path is covered by a preferred workflow tool, Dysflow keeps the call successful and appends an informational `PREFERRED_TOOL_AVAILABLE` item to `warnings[]`. Follow the warning's `preferred`, `rationale`, and `docsAnchor` fields on the next iteration. Pass `forceSpecialized:true` only when granular control is intentional; the dispatcher consumes the flag before invoking this tool. Read-only specialized calls are not warned, and legacy calls use the escalated `LEGACY_TOOL_AVAILABLE` code.
