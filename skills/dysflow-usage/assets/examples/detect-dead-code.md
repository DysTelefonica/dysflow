# `detect_dead_code`

## What it does

Finds unreferenced VBA procedures and module-level declarations. Inline `modules` analysis is
process-free; binary scope may inspect an explicit Access file read-only.

## Call

```json
{
  "tool": "detect_dead_code",
  "arguments": {
    "scope": "source"
  }
}
```

Use `scope:"binary"`, `accessPath`, and `allowExternalAccessPath:true` only when the chosen
binary is outside the active worktree and that read-only boundary is intentional.

## Result shape

The report returns `scope`, optional `module`, `scannedModules`, `scannedAt`, `findings`,
and `summary`. Each finding carries `symbol`, `module`, `kind`, `line`, evidence with the
definition snippet and reference count, plus a `Low`, `Med`, or `High` risk tier.

## Anti-patterns

- Do not delete a symbol because it appears in `findings`; dynamic dispatch can hide references.
- Do not claim binary coverage from source files or schema metadata.
- Do not narrow to one module and treat the result as whole-project proof.

## Live verification

Call `bootstrap({phase:"sync"})`, inspect `schema({view:"index"})`, then refresh
`describe_tool({name:"detect_dead_code"})`. Read every candidate definition and run
`find_references` at the broadest safe scope before proposing deletion.

## Cross-reference

See [`find_references`](./find-references.md) for call-site evidence and the
[VBA analysis family map](../../references/agent-friction-map.md#vba-reference-analysis).
