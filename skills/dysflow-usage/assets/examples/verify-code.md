# verify_code — dysflow MCP

## When to use

Detect drift between the on-disk source tree and the Access binary. Read-only. Safe to run with writes disabled.

## Prerequisites

None. Read-only.

## Call — whole project

```json
{
  "tool": "verify_code",
  "arguments": {}
}
```

## Call — specific modules

```json
{
  "tool": "verify_code",
  "arguments": {
    "moduleNames": ["ModA"]
  }
}
```

## Call — strict (byte-exact)

```json
{
  "tool": "verify_code",
  "arguments": {
    "strict": true,
    "diagnostic": true
  }
}
```

## Call — full diagnostic evidence

```json
{
  "tool": "verify_code",
  "arguments": {
    "diagnostic": true
  }
}
```

Use diagnostic mode only when you need raw matched/missing/different arrays,
per-entry classifications, or inline diff snippets. It implies snippet
generation; `diff` remains a compatibility input and is not the response-detail
switch.

## Anti-patterns for this call

- Don't request diagnostic mode merely to plan a sync. Use the compact `recommendedAction`, `bulkImportable[]`, and `bulkExportable[]`; raw `different[]` entries include non-functional Access export noise.
- Don't pass `moduleNames` for "all" — omit it. A module-name filter that matches nothing returns `MODULE_NOT_FOUND`.
- Don't trust `verify_code` results without re-checking the `dysflowVersion` field. If absent, the MCP server is on an old cached build; restart it before relying on anything.

## Result shape (what the agent reads back)

- `ok` — raw source/binary parity. It can remain `false` for non-actionable serialization noise; use `actionableOk` and `recommendedAction` for the sync decision.
- `recommendedAction` — one of `no_action | import_to_binary | export_to_src | manual_merge`. The whole-comparison machine key.
- `summaryStructured` — compact counts: `matched`, `actionableTotal`, and `nonActionableTotal`.
- `summaryByCategory` — actionable `sourceNewer`, `binaryNewer`, and `bothChanged` counts.
- `bulkImportable[]` — module names ready for `import_modules.moduleNames` when disk/source is newer.
- `bulkExportable[]` — module names ready for `export_modules.moduleNames` when the Access binary is newer.
- `moduleCounts` and `summaryUnits` — diagnostic-only unit breakdowns.
- `actionableDifferent[]` and `nonActionableDifferent[]` — diagnostic-only classified evidence. `bothChanged` means conflict/manual merge; non-actionable entries explain noise and must not trigger a sync.
- `dysflowVersion` — runtime version. Cross-check via `get_capabilities`.

## Live verification

```bash
get_capabilities  # confirm dysflowVersion agrees with adapterVersion
```

## Cross-reference

- Anti-patterns: `assets/anti-patterns.md#11-warning-dont-act-on-verify_code-raw-diff-entries` (parse noise vs actionable)
- Error codes: `references/error-codes.md#MODULE_NOT_FOUND`
- Companion: `assets/examples/import-modules.md`, `assets/examples/export-all.md` (apply the recommended action).
