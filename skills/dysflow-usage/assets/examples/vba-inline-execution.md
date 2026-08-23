# vba_inline_execution — dysflow MCP

## When to use

Execute a short throwaway VBA snippet when no persistent module should remain. The runtime creates
a temporary module, executes it, and removes the temporary artifacts.

## Result assignment

Return a value through an explicit assignment:

```text
result = "ready"
```

A trailing bare string literal is not a VBA statement. The MCP envelope returns `MCP_INPUT_INVALID` with
`error.details.line` and remediation showing the required `result = ...` assignment. An
unterminated string literal also returns `MCP_INPUT_INVALID` with the offending line.

## Cleanup contract

Cleanup failures are never silent. Warnings are retained in the diagnostics collection. If the snippet executed
successfully but its temporary module or file could not be fully removed, the operation returns
`INLINE_CLEANUP_FAILED`; treat it as failed and inspect the diagnostics before retrying.

## Anti-patterns

- Do not use this tool for persistent code; import a version-controlled module instead.
- Do not treat a returned VBA value as success when the envelope reports cleanup failure.
- Do not manually kill Access or delete unknown temporary artifacts without dysflow ownership
  evidence.

## Cross-reference

See `references/error-codes.md#inline_cleanup_failed` and `assets/examples/access-force-cleanup-orphaned.md`.
