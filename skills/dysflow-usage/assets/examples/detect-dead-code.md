# `detect_dead_code`

## What it does

Finds unreferenced VBA procedures and module-level declarations.

## External binary call

```json
{
  "tool": "detect_dead_code",
  "arguments": {
    "scope": "binary",
    "accessPath": "C:/archives/legacy.accdb",
    "allowExternalAccessPath": true
  }
}
```

The adapter reads actual module bytes through `list_vba_modules`; it never
claims binary coverage from schema alone. An inline `modules` map remains the
cheapest process-free path.
