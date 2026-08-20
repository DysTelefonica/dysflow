# Import modules with actionable verbose diagnostics

Use `verbose:true` when the consumer needs post-write evidence. Source comparison evidence comes from the original UTF-8 file before ANSI serialization, so lossy glyph changes inside strings remain actionable. The human still compiles manually after a successful import.

```json
{
  "moduleNames": ["Module1"],
  "destinationRoot": "C:/project/src",
  "apply": true,
  "verbose": true
}
```

Each successful module entry includes `source` and `destination` snapshots plus the canonical semantic verdict:

```json
{
  "verbose": {
    "source": { "lines": 12, "bytes": 240, "sha256": "..." },
    "destination": { "lines": 12, "bytes": 252, "sha256": "..." },
    "truncated": false,
    "mismatchReason": "content_hash",
    "classification": "whitespaceOnly",
    "actionable": false,
    "recommendation": "no_action",
    "classifierRules": "..."
  }
}
```

Branch on `actionable` and `recommendation`, not on the hashes alone. String-literal and procedure-body changes remain actionable. `IMPORT_TRUNCATED` is a fatal typed error and rolls back; never add `compile:true` or an unsupported `force` flag.
