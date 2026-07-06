# Delta for `mcp-query-tools`

## ADDED Requirements

### Requirement: Semantic Target Resolution for Read-Only Schema/Query Tools

Read-only MCP tools that already expose `accessPath` / `backendPath` /
`databasePath` / `sourcePath` MUST additionally accept a semantic
`target: "frontend" | "backend"` and resolve it against the configured
`accessPath` / `backendPath` from `.dysflow/project.json` when no explicit
path is provided. This applies to `get_schema`, `count_rows`,
`distinct_values`, `list_tables`, `list_linked_tables`, and any other
read-only schema/query tool that shares the `READ_TARGET_OVERRIDE` input
block. Explicit paths continue to win over `target`.

#### Scenario: target='frontend' resolves to configured accessPath

- **Given** a project config declares `accessPath`
- **And** the request supplies `projectId` and `target: "frontend"`
- **And** the request supplies neither `databasePath` nor `backendPath`
- **When** the MCP adapter forwards the request to the runner
- **Then** the runner MUST materialize `databasePath` from
  `config.accessPath`
- **And** the resolved request MUST carry no `target` field once it
  reaches the PowerShell payload (the semantic role is replaced by the
  concrete path).

#### Scenario: target='backend' resolves to configured backendPath

- **Given** a project config declares `backendPath`
- **And** the request supplies `projectId` and `target: "backend"`
- **And** the request supplies neither `databasePath` nor `backendPath`
- **When** the MCP adapter forwards the request to the runner
- **Then** the runner MUST materialize `backendPath` from
  `config.backendPath`
- **And** the resolved request MUST carry no `target` field once it
  reaches the PowerShell payload.

#### Scenario: explicit path wins over target

- **Given** a request supplies both `target` and an explicit `databasePath`
- **When** the MCP adapter forwards the request
- **Then** the explicit `databasePath` MUST be preserved verbatim
- **And** `target` MUST remain in the payload exactly as supplied so
  downstream observers can read the caller's intent.

#### Scenario: target='backend' with no configured backendPath

- **Given** a project config does not declare `backendPath`
- **And** the request supplies `target: "backend"` and no explicit path
- **When** the runner attempts to resolve the target
- **Then** the runner MUST return a typed `CONFIG_MISSING_TARGET_PATH`
  error
- **And** the error message MUST mention which role could not be
  resolved (`backend` in this case)
- **And** the runner MUST NOT spawn the PowerShell executor.

#### Scenario: invalid target value

- **Given** a request supplies `target` with a value other than
  `"frontend"` or `"backend"` (e.g. `"auto"`, `"FRONTEND"`, `123`,
  `null`)
- **When** the MCP adapter validates the input
- **Then** the Zod schema MUST reject the request at the boundary
- **And** a downstream helper that defensively re-validates the value
  MUST treat it as "no target" so subsequent branches do not misfire.

## MODIFIED Requirements

None. The contract for callers who never set `target` is unchanged:
explicit `accessPath` / `backendPath` / `databasePath` / `sourcePath`
keep their previous precedence and the runner's default-fallback path
behaves exactly as it did before.

## REMOVED Requirements

None.

## Out of scope (acknowledged gaps)

- **`auto` mode** (Option B in #716). The acceptance criterion
  `Auto mode, if implemented, reports the resolved database role/path`
  is satisfied vacuously by not implementing auto in this slice; the
  issue hedges it with **"if implemented"**. A separate SDD change can
  add `auto` once cross-database lookup primitives exist.
- **Cross-DB ambiguity detection** (`Ambiguous tables produce a typed
  error`). No current read tool queries more than one database at a
  time; adding a true ambiguity detector requires a new lookup
  primitive and is a separate SDD change.
