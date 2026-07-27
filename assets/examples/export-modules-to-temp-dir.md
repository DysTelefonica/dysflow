# export_modules — destinationRoot override (temp-dir reconciliation)

## When to use

The `destinationRoot` override on `export_modules` (and every other
write-class tool — see "Companion tools" below) lets you redirect the
managed-source output to a temp directory without touching the
configured project root. This unlocks the canonical end-to-end
reconciliation loop:

1. **Export** the current binary state to a fresh temp dir.
2. **Diff** the temp tree against your tracked source on disk.
3. **Decide** which side wins per file (or reject the whole round-trip).
4. **Apply** the chosen direction with `import_modules` or
   `sync_binary`.

This is the safest path when an AI agent or a CI runner wants to
preview binary changes without polluting the worktree, and is the
recommended shape for any "what would the binary do?" question.

## Prerequisites

- The configured `destinationRoot` is preserved untouched. The
  override is call-local and never persisted.
- The override directory must be writable; dysflow will create
  `modules/`, `classes/`, and `forms/` subdirectories as needed.
- Access opens a disposable copy of the `.accdb` by default — the
  original binary is not mutated by bookkeeping side effects.

## Canonical call — export to a temp dir

```json
{
  "tool": "export_modules",
  "arguments": {
    "moduleNames": ["ModA", "ModB"],
    "destinationRoot": "C:/temp/dysflow-recon-2026-07-27",
    "apply": true
  }
}
```

The response now reports the EFFECTIVE destination root used and a
provenance tag so the caller can audit the resolution without
re-running `resolveExecutionTarget`:

```json
{
  "ok": true,
  "data": {
    "written": ["ModA.bas", "ModB.bas"],
    "skipped": [],
    "warnings": [],
    "binaryMutated": false,
    "resolvedDestinationRoot": "C:/temp/dysflow-recon-2026-07-27",
    "destinationRootSource": "override"
  }
}
```

`destinationRootSource` is one of `"override" | "config" |
"projectRoot" | "cwd" | "default"`. `"override"` means the caller
supplied `params.destinationRoot`; `"config"` means the resolved
value matched the configured `destinationRoot`; `"projectRoot"`
means the configured `projectRoot` won the precedence chain; the
other two are fallbacks.

## End-to-end reconciliation loop

### 1. Export to a fresh temp dir

```bash
# Linux/macOS
TMP=$(mktemp -d -t dysflow-recon-XXXXXX)

# Windows (PowerShell)
$TMP = Join-Path $env:TEMP ("dysflow-recon-" + [Guid]::NewGuid().ToString("N").Substring(0, 6))
```

```json
{
  "tool": "export_modules",
  "arguments": {
    "moduleNames": ["ModA", "ModB"],
    "destinationRoot": "<TMP>",
    "apply": true
  }
}
```

### 2. Diff the temp tree against your tracked source

```bash
# Use any diff tool you trust — git diff works fine because the
# override dir is OUTSIDE your worktree.
diff -ru <worktree>/src/modules <TMP>/modules
```

### 3. Decide per file

For each diverged file:

- **Binary wins** → `import_modules { moduleNames: [...], destinationRoot: <worktree>, apply: true }`
- **Source wins** → leave the binary alone (your tracked source is
  already canonical).
- **Reject the round-trip** → just `rm -rf <TMP>` and walk away.

### 4. Apply your chosen direction

```json
{
  "tool": "import_modules",
  "arguments": {
    "moduleNames": ["ModA"],
    "destinationRoot": "<worktree-root>",
    "apply": true
  }
}
```

The import response reports `destinationRootSource: "config"` when
no override is supplied and the resolved value matches the
configured root — a stable signal that the write landed in the
intended tree.

## Anti-patterns for this call

- Don't reuse a temp dir across calls without cleaning it first. The
  override is call-local; stale files from a prior export will be
  silently overwritten on the next run, which can hide drift if you
  diff after a partial reconciliation.
- Don't pass `destinationRoot` pointing inside the configured source
  tree (e.g. `<worktree>/src`). The export-source guard rejects this
  with `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` — pass
  `confirmOverwriteSource: true` only when you really mean to
  clobber.
- Don't rely on the override as a persistence mechanism. The override
  is per-call; the next call without an override reverts to the
  configured `destinationRoot`. Configure
  `.dysflow/project.json` for any persistent change.

## Companion tools that honor the same override

The same `destinationRoot` parameter is honored by every write-class
tool exposed by the MCP. The response shape — `resolvedDestinationRoot`
plus `destinationRootSource` — is uniform across all of them:

| Tool | Direction | Notes |
|------|-----------|-------|
| `export_modules` | binary → disk | This example |
| `export_all` | binary → disk | Whole-project snapshot |
| `import_modules` | disk → binary | Apply one or more modules |
| `import_all` | disk → binary | Apply full project |
| `sync_binary` | both | Composes verify + import/export |
| `form_serialize` | read-only | Parse-only FormIR round-trip |
| `form_deserialize` | disk → binary | Apply FormIR back to `.form.txt` |

## Cross-reference

- Tests covering the contract: `test/adapters/vba-sync/destination-root-override-1169.test.ts`
- Helper module: `src/adapters/vba-sync/destination-root-override.ts`
- Sibling example: `assets/examples/import-modules.md`
