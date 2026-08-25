# `list_procedures`

## What it does

Lists parsed procedures in one VBA module.

## External binary call

```json
{
  "tool": "list_procedures",
  "arguments": {
    "module": "LegacyRules",
    "source": "binary",
    "accessPath": "C:/archives/legacy.accdb",
    "allowExternalAccessPath": true
  }
}
```

The opt-in is scoped to this inspection. Omitting it fails before Access or
PowerShell is invoked.
