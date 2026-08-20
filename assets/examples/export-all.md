# Export all with actionable verbose diagnostics

Pass `apply:true` to export and add `verbose:true` only when per-module evidence is needed:

```json
{
  "destinationRoot": "C:/project/src",
  "apply": true,
  "verbose": true
}
```

Each `verbose[]` entry contains binary-before and file-after `{ lines, bytes, sha256 }` snapshots plus the canonical VBA semantic verdict. The field is absent when omitted or false. Existing `prune:true` safety guards remain unchanged.
