# Design: clarify MCP write and timeout semantics

## Write semantics
Legacy write tools remain safe by default: `dryRun` is true unless the caller explicitly sets `apply: true` or `dryRun: false`.

## Timeout lifecycle
`VbaSyncLegacyService.executeWithTimeout` owns timeout timing and exposes cancellation through `AbortSignal`. `spawnVbaManager` no longer starts its own timer; it only reacts to the signal by killing the child and reporting `timedOut`.
