# `find_references`

## What it does

Finds concrete VBA symbol references across module source.

## External binary call

```json
{
  "tool": "find_references",
  "arguments": {
    "symbol": "Evaluate",
    "scope": "binary",
    "accessPath": "C:/archives/legacy.accdb",
    "allowExternalAccessPath": true
  }
}
```

Use `scope:"all"` only when comparing managed source with binary results. The
external-path opt-in never authorizes mutation.
