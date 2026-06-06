# Proposal: Sanitize PID/progress marker payloads before registry storage (#417)

## Problem

`spawnPowerShell` parses `DYSFLOW_ACCESS_PROCESS` markers from raw stderr and immediately calls
`onAccessProcessCaptured` with the parsed payload. The `commandLine` field (and any other
free-text string) is stored in the operation registry verbatim, before `sanitizeSecrets` runs on
the accumulated output buffers. A secret appearing in a marker's `commandLine` survives into the
registry and is returned to callers of `list_access_operations`, bypassing redaction.

The TS↔PowerShell marker contract (expected field names, types, optionality) is entirely implicit,
making the parse seam fragile to maintain.

## Proposed fix

**B5 — Sanitize before store**: Compute `secrets` (from `config.accessPassword` and the resolved
`backendPassword`) BEFORE the executor call so the values are in closure scope for
`onAccessProcessCaptured`. Apply `sanitizeSecrets(process.commandLine, secrets)` before storing
`commandLine` in the registry update.

**D3 — Document + type the marker contract**: Add narrow typed interfaces (`AccessProcessMarker`,
`ProgressMarker`) with type guards (`isAccessProcessMarker`, `isProgressMarker`) at the parse seam.
Add JSDoc comments describing the exact JSON shape the PowerShell child must emit for each marker.
Replace the unsafe `as` casts with validated type guards.

## Constraints

- `src/core` must NOT import from `src/adapters` (hexagonal boundary).
- Tests assert behavior at ports; mock only I/O adapters (the `PowerShellExecutor` port).
- No `any`, no non-null assertions (Biome strict).
