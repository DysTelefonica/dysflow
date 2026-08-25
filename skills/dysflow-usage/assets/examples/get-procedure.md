# `get_procedure`

## What it does

Returns one parsed VBA procedure from inline, managed-source, or Access-binary code.

## External binary call

```json
{
  "tool": "get_procedure",
  "arguments": {
    "module": "LegacyRules",
    "procedure": "Evaluate",
    "source": "binary",
    "accessPath": "C:/archives/legacy.accdb",
    "allowExternalAccessPath": true
  }
}
```

The `.accdb`/`.mdb` path and opt-in are both required. This read-only call does
not export source or authorize binary mutation.
