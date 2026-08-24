# verify_code — dysflow MCP

## When to use

Detect drift between the on-disk source tree and the Access binary. Read-only. Safe to run with writes disabled.

## Prerequisites

None. Read-only.

## Call — whole project

```json
{
  "tool": "verify_code",
  "arguments": {
    "diff": true
  }
}
```

## Call — specific modules

```json
{
  "tool": "verify_code",
  "arguments": {
    "moduleNames": ["ModA"],
    "diff": true
  }
}
```

## Call — strict (byte-exact)

```json
{
  "tool": "verify_code",
  "arguments": {
    "strict": true
  }
}
```

## Anti-patterns for this call

- Don't parse raw `different[]` entries to build sync module lists. Most are non-functional Access export noise (whitespace, attribute headers, encoding folds, case-only diffs). Use `recommendedAction`, `bulkImportable[]`, `bulkExportable[]`, and `actionableDifferent[]`.
- Don't pass `moduleNames` for "all" — omit it. A module-name filter that matches nothing returns `MODULE_NOT_FOUND`.
- Don't trust `verify_code` results without re-checking the `dysflowVersion` field. If absent, the MCP server is on an old cached build; restart it before relying on anything.

## Result shape (what the agent reads back)

- `ok` — `true` when source and binary are in sync.
- `recommendedAction` — one of `no_action | import_to_binary | export_to_src | manual_merge`. The whole-comparison machine key.
- `summaryStructured` — nested counts split by actionable and non-actionable classifications. Use it for reports instead of counting arrays by hand.
- `bulkImportable[]` — module names ready for `import_modules.moduleNames` when disk/source is newer.
- `bulkExportable[]` — module names ready for `export_modules.moduleNames` when the Access binary is newer.
- `moduleCounts` — module-level presence/drift counts; use these for module totals.
- `summaryUnits.<category>.modulesCount` / `.linesCount` — explicit units; never compare a line count with a module count or infer parity from the old top-level labels.
- `actionableDifferent[]` — semantic diff categories that actually matter: `sourceNewer`, `binaryNewer`, `bothChanged`. Each entry carries `classification` and `reason`; `bothChanged` means conflict/manual merge.
- `nonActionableDifferent[]` — semantic noise such as `whitespaceOnly`, `attributeOnly`, `caseOnly`, `formSerializationOnly`, or `encodingOnly`. Each entry carries `classification` and `reason`; explain it, do not sync it. Clean modules are counted in `summaryStructured`, not listed here as drift.
- `dysflowVersion` — runtime version. Cross-check via `get_capabilities`.

## Live verification

```bash
get_capabilities  # confirm dysflowVersion agrees with adapterVersion
```

## Cross-reference

- Anti-patterns: `assets/anti-patterns.md#11-warning-dont-act-on-verify_code-raw-diff-entries` (parse noise vs actionable)
- Error codes: `references/error-codes.md#MODULE_NOT_FOUND`
- Companion: `assets/examples/import-modules.md`, `assets/examples/export-all.md` (apply the recommended action).
