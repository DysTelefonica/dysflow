# Gate Error Codes Specification

## Purpose

The MCP write-gate envelope (`writesDisabled`) and the per-call allowlist envelope (`ensureProcedureAllowed`) currently emit failure envelopes whose only structured signal is `content[0].text` — a human-readable string with the code as a prefix. Consumers must regex-match `MCP_INPUT_INVALID` versus `MCP_WRITES_DISABLED` to distinguish them. This capability unifies the four gate envelopes so consumers branch on a structured `error.code` field, with an `error.remediation` hint and, when applicable, the `error.allowedProcedures` array that was active at the time of the rejection.

## Requirements

### Requirement: Every blocked-by-gate response carries `error.code`, `error.message`, `error.remediation`, and, when applicable, `error.allowedProcedures`

When the MCP server returns a blocked-by-gate response (write gate, allowlist gate, allowlist-not-configured gate, or schema rejection), the response MUST expose an `error` object with `error.code`, `error.message`, `error.remediation`, and — when the rejection is an allowlist rejection — `error.allowedProcedures` carrying the array that was active at the time of the call. The existing `content[0].text` body MUST remain prefixed with the same `"<CODE>: <message>"` string so legacy regex consumers continue to parse. The four gate envelopes — `writesDisabled` (`src/adapters/mcp/dispatch-common.ts:13-25`), `invalidInput` (`src/adapters/mcp/dispatch-common.ts:27-33`), `isWriteAllowed` (`src/adapters/mcp/dispatch-common.ts:35-43`), and `ensureProcedureAllowed` (`src/adapters/mcp/canonical-handlers.ts:38-65`) — MUST each emit exactly one of the five error codes: `MCP_WRITES_DISABLED`, `MCP_INPUT_INVALID`, `MCP_PROCEDURE_NOT_ALLOWED`, `MCP_REQUIRES_DRY_RUN`, or `MCP_ALLOWLIST_NOT_CONFIGURED`.

#### Scenario: Write gate blocked — `MCP_WRITES_DISABLED`

- GIVEN the MCP server started with `writesEnabled: false` and no `writeAccessResolver`
- WHEN the caller invokes a write-class tool (e.g. `exec_sql`) with `mode: "write"` and `apply: true`
- THEN the response `ok` is `false`
- AND `error.code` equals `"MCP_WRITES_DISABLED"`
- AND `error.message` describes the disabled state and names the attempted tool
- AND `error.remediation` lists both escape paths: set `"allowWrites": true` in `.dysflow/project.json` OR launch with `dysflow mcp --enable-writes`
- AND `content[0].text` begins with `"MCP_WRITES_DISABLED: "` (legacy regex compatibility)

#### Scenario: Allowlist gate blocked — `MCP_PROCEDURE_NOT_ALLOWED`

- GIVEN a project config with `allowedProcedures: ["Test_A"]`
- WHEN the caller invokes `run_vba` with `procedureName: "Test_X"`
- THEN the response `ok` is `false`
- AND `error.code` equals `"MCP_PROCEDURE_NOT_ALLOWED"`
- AND `error.message` names the rejected procedure
- AND `error.allowedProcedures` equals `["Test_A"]` (the array active at the time of the call)
- AND `error.remediation` instructs the caller to add the procedure to `allowedProcedures` in `.dysflow/project.json`
- AND `content[0].text` begins with `"MCP_PROCEDURE_NOT_ALLOWED: "`

#### Scenario: Allowlist not configured — `MCP_ALLOWLIST_NOT_CONFIGURED`

- GIVEN a project config with `allowedProcedures` omitted or `[]`
- WHEN the caller invokes `run_vba` with `procedureName: "Test_X"` and `dryRun` not set to `true`
- THEN the response `ok` is `false`
- AND `error.code` equals `"MCP_ALLOWLIST_NOT_CONFIGURED"`
- AND `error.message` describes the default-deny posture
- AND `error.remediation` lists both escape paths: declare `allowedProcedures` in `.dysflow/project.json` OR pass `dryRun: true` in the request body
- AND `content[0].text` begins with `"MCP_ALLOWLIST_NOT_CONFIGURED: "` while the legacy `"MCP_INPUT_INVALID:"` prefix remains as an alias for at least one minor version

#### Scenario: Dry-run escape hatch hint — `MCP_REQUIRES_DRY_RUN`

- GIVEN a project config with `allowedProcedures: []`
- WHEN the caller invokes `run_vba` with `procedureName: "Test_X"` and `dryRun: false`
- THEN the response `ok` is `false`
- AND `error.code` equals `"MCP_REQUIRES_DRY_RUN"`
- AND `error.message` names the procedure and the dry-run requirement
- AND `error.remediation` instructs the caller to either pass `dryRun: true` for a plan-only run OR add the procedure to `allowedProcedures`
- AND `error.allowedProcedures` is absent (the rejection is about the absence of an allowlist, not a non-membership)

#### Scenario: Schema rejection retains `MCP_INPUT_INVALID`

- GIVEN any project config
- WHEN the caller invokes any tool with a payload that fails the input schema (`validateInput` returns a non-empty string)
- THEN the response `ok` is `false`
- AND `error.code` equals `"MCP_INPUT_INVALID"`
- AND `error.remediation` is absent or `null` (schema errors are self-describing)
- AND `error.allowedProcedures` is absent or `null` (the allowlist was not consulted)
- AND `content[0].text` begins with `"MCP_INPUT_INVALID: "` exactly as today at `src/adapters/mcp/dispatch-common.ts:27-33`

## Linked source

- `src/adapters/mcp/dispatch-common.ts:13-25` — `writesDisabled` envelope to be enriched with structured `error` fields.
- `src/adapters/mcp/dispatch-common.ts:27-33` — `invalidInput` envelope to be enriched with structured `error` fields.
- `src/adapters/mcp/dispatch-common.ts:35-43` — `isWriteAllowed` predicate (runtime truth, unchanged at runtime).
- `src/adapters/mcp/dispatch-common.ts:67-79` — `handleValidatedMcpWrite` (consumer of the new envelopes).
- `src/adapters/mcp/canonical-handlers.ts:38-65` — `ensureProcedureAllowed` (no-allowlist branch lines 47-56; procedure-not-in-list branch lines 59-63).
- `src/adapters/mcp/canonical-handlers.ts:81-86` — `handleMcpVbaExecute` consumer of `ensureProcedureAllowed`.
- `src/adapters/mcp/canonical-handlers.ts:149-160` — `handleMcpAccessCleanup` inline error string (text-compatible; optionally enriched).
- `src/adapters/mcp/canonical-handlers.ts:207-218` — `handleMcpAccessOrphanCleanup` inline error string (text-compatible; optionally enriched).
- `src/core/contracts/index.ts:11-16` — `DysflowError` shape (base for the new envelope `error` object).
- `src/core/utils/sanitize-error.ts:40-53` — bilingual remediation precedent (English + Castellano de España block).
- `src/adapters/mcp/result-translation.ts:106-128` — `translateCoreResultToMcpContent` (today flattens `error.code` and `error.message` into `content[0].text`).
- `src/adapters/mcp/tool-parity-registry.ts:97-100` — backward-compat aliasing discipline (one minor version for the new codes).