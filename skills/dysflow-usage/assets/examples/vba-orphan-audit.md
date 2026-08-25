# `vba_orphan_audit`

## What it does

Reports VBA components present in the binary but absent from managed source.

## External binary call

```json
{
  "tool": "vba_orphan_audit",
  "arguments": {
    "accessPath": "C:/archives/legacy.accdb",
    "allowExternalAccessPath": true
  }
}
```

The opt-in permits read-only inspection of an explicit `.accdb`/`.mdb`; it
does not relax destination or write guards.
