# `compact_repair`

## When to use

Preview a compact/repair of an explicit Access database after its backup policy is agreed.

```json
{"tool":"compact_repair","arguments":{"databasePath":"C:\\workspace\\frontend.accdb","backupFirst":true,"apply":false}}
```

## Result shape

The plan reports `dryRun`, `sourcePath`, `targetPath`, `backupFirst`, `wouldReplaceSource`, and `backupPath`; apply adds `compacted`.

## Safety

Use `apply:false` first. `apply:true` is the canonical commit flag and all write gates still apply.

## Live verification

Confirm this call shape with `describe_tool({name:'compact_repair'})` before using it against a real project.
