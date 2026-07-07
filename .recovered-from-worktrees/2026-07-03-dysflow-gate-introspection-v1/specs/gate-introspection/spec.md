# Gate Introspection Specification

## Purpose

Consuming agents currently discover a tool's gate posture only by firing a write call and reading the failure envelope back. This capability adds `dysflow_get_capabilities`, a single read-only MCP tool that returns the effective per-call policy for any registered Dysflow MCP tool BEFORE the call is made.

## Requirements

### Requirement: `dysflow_get_capabilities` returns the effective per-call policy as a single read-only tool

The Dysflow MCP server SHALL expose `dysflow_get_capabilities` as a registered, read-only tool that returns a structured `McpCapabilityDescriptor` for any tool name in `DYSFLOW_MCP_TOOL_NAMES`. The descriptor SHALL project the static `McpToolContract` against the resolved `DysflowConfig` and MUST include the fields `access`, `writeGate`, `requiresAllowlist`, `requiresDryRunEscape`, `gateSource`, `gateEffective`, `dryRunDefault`, and `summary`. The tool MUST NOT mutate any state and MUST NOT open Access or PowerShell.

#### Scenario: Default-deny allowlist gate for VBA execution

- GIVEN a project config with `allowedProcedures: []` (empty) and `allowWrites: true`
- WHEN the caller invokes `dysflow_get_capabilities` with `toolName: "run_vba"`
- THEN the response `ok` is `true`
- AND `data.gateEffective` equals `"dryrun-only"`
- AND `data.requiresAllowlist` equals `true`
- AND `data.requiresDryRunEscape` equals `true`
- AND `data.gateSource` equals `"allowlist"`
- AND `data.summary` references the `dryRun:true` escape hatch from `src/adapters/mcp/mcp-tool-contracts.ts:74-77`

#### Scenario: Active allowlist gate for VBA execution

- GIVEN a project config with `allowedProcedures: ["Test_A"]` and `allowWrites: true`
- WHEN the caller invokes `dysflow_get_capabilities` with `toolName: "run_vba"`
- THEN `data.gateEffective` equals `"allowlist-gated"`
- AND `data.requiresAllowlist` equals `true`
- AND `data.requiresDryRunEscape` equals `false`
- AND `data.gateSource` equals `"allowlist"`

#### Scenario: Read-only SQL with no gates

- GIVEN any project config
- WHEN the caller invokes `dysflow_get_capabilities` with `toolName: "query_sql"`
- THEN `data.gateEffective` equals `"open"`
- AND `data.writeGate` equals `"none"`
- AND `data.access` equals `"read-only"`
- AND `data.gateSource` equals `"schema-only"`

#### Scenario: Write-gated SQL with writes disabled

- GIVEN a project config with `allowWrites: false` and no `writeAccessResolver`
- WHEN the caller invokes `dysflow_get_capabilities` with `toolName: "exec_sql"`
- THEN `data.gateEffective` equals `"always-blocked"`
- AND `data.writeGate` equals `"conditional"`
- AND `data.gateSource` equals `"writes-disabled"`
- AND `data.dryRunDefault` equals `true`

#### Scenario: Unknown tool name is rejected explicitly

- GIVEN any project config
- WHEN the caller invokes `dysflow_get_capabilities` with a `toolName` not in `DYSFLOW_MCP_TOOL_NAMES`
- THEN the response `ok` is `false`
- AND `error.code` equals `"MCP_TOOL_UNKNOWN"`
- AND no Access process is opened and no PowerShell command is spawned

## Linked source

- `src/adapters/mcp/mcp-tool-registry.ts:61` — `DYSFLOW_MCP_TOOL_NAMES` union source.
- `src/adapters/mcp/mcp-tool-contracts.ts:9-14` — `McpToolContract` static descriptor (extended by #656).
- `src/adapters/mcp/mcp-tool-contracts.ts:153-157` — `MCP_TOOL_CONTRACTS` registry.
- `src/adapters/mcp/mcp-tool-contracts.ts:165-167` — `getMcpToolContract` (the existing consumer helper this capability builds on).
- `src/adapters/mcp/mcp-tool-contracts.ts:74-77` — `run_vba` contract summary text quoted in the default-deny scenario.
- `src/core/config/dysflow-config.ts:51-69` — `DysflowConfig` shape carrying `allowWrites` / `allowedProcedures`.
- `src/adapters/mcp/stdio.ts:231-241` — `resolveMcpWriteAccessForInput` (precedent for per-input config resolution).
- `src/adapters/mcp/stdio.ts:575-590` — `inputTargetsConfig` (per-input config match the new resolver MUST reuse).
- `src/adapters/mcp/stdio.ts:181-193` — `tools/list` handler (the consumer #657 enriches with `_meta.capabilities`).
- `src/adapters/mcp/canonical-handlers.ts:38-65` — `ensureProcedureAllowed` (the runtime truth the descriptor projects).
- `src/adapters/mcp/dispatch-common.ts:13-25` — `writesDisabled` envelope (the gate `dysflow_get_capabilities` replaces for preflight).
- `src/core/contracts/index.ts:11-16` — `DysflowError` shape (the `error.code` field the unknown-tool scenario reuses).