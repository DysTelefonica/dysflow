# Delta for mcp-stdio-adapter

## ADDED Requirements

### Requirement: Stdio Process-Wide Write Default Is Enabled

The stdio adapter's process-wide write default MUST be ENABLED when `startMcpStdioAdapter()` receives no explicit `writesEnabled` option. A caller MUST pass an explicit disable signal (`writesEnabled: false`) to run the adapter read-only. This process-wide default is a coarse gate only; it does NOT replace or alter per-request per-repo `allowWrites` resolution.

#### Scenario: No writesEnabled option defaults to enabled
- GIVEN `startMcpStdioAdapter(config)` is called with no `options` argument (or `options.writesEnabled` is `undefined`)
- WHEN the adapter resolves its process-wide write default
- THEN it MUST resolve to `true` (writes enabled)

#### Scenario: Explicit writesEnabled: false stays read-only
- GIVEN `startMcpStdioAdapter(config, { writesEnabled: false })` is called
- WHEN the adapter resolves its process-wide write default
- THEN it MUST resolve to `false` (writes disabled)

#### Scenario: Explicit writesEnabled: true is unaffected
- GIVEN `startMcpStdioAdapter(config, { writesEnabled: true })` is called
- WHEN the adapter resolves its process-wide write default
- THEN it MUST resolve to `true`

## Non-Goals (invariants — explicitly unchanged)

### Requirement: Per-Repo Write Access Resolution Is Unchanged

Per-request per-repo `allowWrites` resolution performed by `resolveMcpWriteAccessForInput` (in `dispatch-common.ts`) MUST NOT be altered by the stdio process-wide default change. The process-wide `writesEnabled` flag remains a coarse upstream gate; `resolveMcpWriteAccessForInput` and the `dispatch-common.ts` precedence order MUST continue to apply on top of it, unmodified.

#### Scenario: Per-repo allowWrites still gates writes when process-wide default is enabled
- GIVEN the stdio adapter starts with the new default (writes enabled process-wide)
- AND a request targets a repo whose config sets `allowWrites: false`
- WHEN `resolveMcpWriteAccessForInput` evaluates that request
- THEN it MUST still resolve write access as disallowed for that repo
- AND the resolution logic and precedence order MUST be identical to before this change

#### Scenario: HTTP/serve default remains explicitly out of scope
- GIVEN the HTTP adapter (`dysflow serve`) write-default behavior
- WHEN the stdio process-wide default flips to enabled
- THEN the HTTP adapter's own write-disabled-by-default posture MUST remain unchanged
- AND no HTTP adapter code path MUST be modified as part of this requirement
