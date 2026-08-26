# `find_references`

## What it does

Finds concrete VBA references to one symbol across module, managed-source, binary, or combined
scope. Use pagination for common symbols instead of requesting an unbounded response.

## Call

```json
{
  "tool": "find_references",
  "arguments": {
    "symbol": "Evaluate",
    "scope": "source",
    "limit": 200,
    "offset": 0
  }
}
```

For an external binary, add `accessPath` and `allowExternalAccessPath:true`; the opt-in remains
read-only and does not authorize mutation.

## Result shape

Every scope returns `symbol`, `scope`, `references`, `totalCount`, `truncated`, and
`nextOffset`. A reference has `module`, `kind`, `line`, and `context`. `scope:"all"` also
returns `sourceReferences`, `binaryReferences`, `hasDifferences`, and the two directional
difference lists.

## Anti-patterns

- Do not stop after the first page when `truncated` is true.
- Do not treat an empty result as proof that runtime string dispatch is impossible.
- Do not collapse source/binary differences into one list when deciding which side is stale.

## Live verification

Call `bootstrap({phase:"sync"})`, inspect `schema({view:"index"})`, and refresh
`describe_tool({name:"find_references"})`. Follow `nextOffset` until null for a complete bounded
scan, then read the reported source lines before making a reachability claim.

## Cross-reference

See [`detect_dead_code`](./detect-dead-code.md) for candidate discovery and the
[VBA analysis family map](../../references/agent-friction-map.md#vba-reference-analysis).
