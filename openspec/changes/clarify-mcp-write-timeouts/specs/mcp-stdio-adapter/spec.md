# MCP stdio adapter spec delta

## ADDED Requirements

### Requirement: Legacy writes MUST remain dry-run by default
Legacy write tools MUST keep `dryRun: true` unless the caller explicitly requests applying writes with `apply: true` or `dryRun: false`.

### Requirement: VBA manager timeout cancellation MUST have one owner
The legacy VBA sync service MUST coordinate timeout through a single service-level timer and pass cancellation to the executor.
