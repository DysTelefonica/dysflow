# Export modules with verbose snapshots

```json
{
  "moduleNames": ["Module1"],
  "destinationRoot": "C:/project/src",
  "apply": true,
  "verbose": true
}
```

The result adds `verbose[]`. Each entry contains `binary` (captured before export), `file` (captured after export), and the canonical `classification`, `reason`, `actionable`, `recommendation`, and `classifierRules` fields. Line-ending or identifier-case normalization can be non-actionable; strings and comments remain case-sensitive.

When `verbose` is false or omitted, the entire `verbose` field is absent. Use `apply:false` for a plan; do not invent `force`.
