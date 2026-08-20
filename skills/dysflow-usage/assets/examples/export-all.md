# Export all modules with verbose snapshots

```json
{
  "destinationRoot": "C:/project/src",
  "apply": true,
  "verbose": true
}
```

`export_all` returns the same per-module `verbose[]` entries as `export_modules`: binary-before and file-after `{ lines, bytes, sha256 }` snapshots plus the canonical semantic actionability verdict. The field is absent unless explicitly requested.

`prune:true` keeps its existing guards: no pruning after warnings, no `filter` plus `prune`, and saved queries are never pruned.
