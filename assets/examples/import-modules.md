# Import Modules — Verify Functional Control Properties

## Problem

Access `SaveAsText` may omit functional ComboBox and ListBox properties when they hold their default value. A successful `import_modules` response therefore does not by itself prove that a control-property change is present in the binary. After an import that adds or changes a property, use `verify_code` and inspect `actionableDifferent` before treating the sync as complete.

## Verify control properties after import

```json
{
  "projectId": "my-project",
  "moduleNames": ["Form_Customer"],
  "importMode": "auto"
}
```

Then run the read-only verification:

```json
{
  "projectId": "my-project",
  "moduleNames": ["Form_Customer"]
}
```

A dropped property is reported in `actionableDifferent` with `category: "control-property-mismatch"`, the control and property names, and the source/binary values:

```json
{
  "category": "control-property-mismatch",
  "controlName": "cmbStatus",
  "propertyName": "BoundColumn",
  "sourceValue": "1",
  "binaryValue": null
}
```

Do not add `compile:true`. The human must compile the Access project manually in the VBE after a successful import and before running VBA tests.

## Large import transport

`import_modules` automatically keeps orchestration payloads up to 8192 Base64 characters on the
legacy argv bridge and sends larger payloads through the Node process's stdin. This avoids Windows
error 206 for long worktree paths or multi-module evidence without changing the module batch,
retry, save, or rollback policy. The payload is never written to a repository or temporary file.

`sync_binary.batchSize` remains useful for bounding Access/COM work per chunk; it is not required
solely to work around command-line length. Direct callers of the internal orchestration CLI that
pass more than 8192 characters with `--payload-base64` receive
`PAYLOAD_TOO_LARGE_FOR_ARGV` before decision evaluation. Use `--payload-stdin` instead.

## Actionable verbose diagnostics

Pass `verbose:true` to receive source/destination `{ lines, bytes, sha256 }` snapshots and the canonical VBA semantic verdict on each successful module. Source evidence comes from the original UTF-8 file before ANSI import serialization, so lossy changes inside strings remain actionable. Consumers branch on `actionable` and `recommendation`; `mismatchReason:"content_hash"` alone does not distinguish harmless VBE normalization from a functional change. `IMPORT_TRUNCATED` remains fatal and rolls back.

## Curated default-value allow-list

For ComboBox and ListBox exports, Dysflow preserves these functional properties even when Access serializes their default value:

- `BoundColumn`
- `ColumnCount`
- `ColumnHeads`
- `RowSource`
- `ColumnWidths`
- `Format`
- `StatusBarText`
- `ListRows`
- `ListWidth`

Other control types and properties retain the existing SaveAsText behavior. Serialization noise such as `Checksum` remains non-actionable.
