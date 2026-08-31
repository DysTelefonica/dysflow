# `vba_orphan_audit`

## What it does

Compares the binary component inventory with managed source and reports candidates that exist on
only one side. It is an audit: no source or binary component is deleted.

## Call

```json
{
  "tool": "vba_orphan_audit",
  "arguments": {}
}
```

For a binary outside the active worktree, supply `accessPath` with
`allowExternalAccessPath:true`. That acknowledgment permits inspection only.

## Result shape

The structured payload contains `orphans`. Each entry reports `moduleName`, `isOrphan`,
`isSuspicious`, and nullable `sourcePath`. Entries with `isOrphan:false` are matched inventory;
`isSuspicious` is naming evidence, not a second orphan verdict.

## Anti-patterns

- Do not delete every entry with `isOrphan:true`; first determine which side is authoritative.
- Do not treat `isSuspicious:true` as proof that a component is unused.
- Do not compare document modules by filename heuristics outside the audit's form/report aliases.

## Live verification

Call `bootstrap({phase:"sync"})`, inspect `schema({view:"index"})`, and refresh
`describe_tool({name:"vba_orphan_audit"})`. Verify candidates with `list_vba_modules`, disk
readback, and `find_references` before requesting any destructive action.

## Cross-reference

See [`list_vba_modules`](./list-vba-modules.md) for binary evidence and the
[source/binary family map](../../references/agent-friction-map.md#source-and-binary-investigation).
