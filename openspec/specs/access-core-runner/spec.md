# access-core-runner Specification

## Purpose

Execute PowerShell-hosted Access operations in a bounded subprocess and surface
real-time progress events to callers without corrupting the structured result
payload.

## Requirements

### Requirement: Runner Execution Boundary

The system MUST spawn the PowerShell runner script in a child process, collect
its stdout as a single JSON payload, and return a typed result to the caller.
The stdout stream MUST NOT be used for any intermediate signaling.

#### Scenario: Successful run
- GIVEN a valid Access operation configuration
- WHEN the runner executes the PowerShell script
- THEN stdout MUST be collected in full and parsed as a single JSON result
- AND the parsed result MUST be returned to the caller

#### Scenario: Non-zero exit code
- GIVEN the PowerShell process exits with a non-zero code
- WHEN the runner handles process termination
- THEN it MUST return a structured error and MUST NOT throw an unhandled exception

### Requirement: Progress Callback Option

The runner MUST accept an optional `onProgress` callback in its options:
```ts
onProgress?(percent: number, total?: number, message?: string): void
```

When provided, the runner MUST invoke `onProgress` each time a valid
`DYSFLOW_PROGRESS` line is received on stderr. When absent, progress lines
MUST be silently discarded without affecting runner behavior.

#### Scenario: Runner receives valid progress line
- GIVEN the runner is executing and `onProgress` is provided in options
- WHEN stderr emits a line starting with `DYSFLOW_PROGRESS ` followed by valid JSON
- THEN the runner MUST parse `percent`, `total`, and `message` from the JSON
- AND MUST call `onProgress(percent, total, message)` immediately

#### Scenario: Runner receives malformed progress line
- GIVEN the runner is executing
- WHEN stderr emits a line starting with `DYSFLOW_PROGRESS ` followed by invalid JSON
- THEN the runner MUST silently discard the line
- AND MUST NOT throw, reject, or cause any runner failure

#### Scenario: onProgress absent
- GIVEN the runner is executing without `onProgress` in options
- WHEN stderr emits any number of `DYSFLOW_PROGRESS` lines
- THEN the runner MUST continue normally with no callback invocation
- AND the final result MUST be unaffected

### Requirement: PowerShell Progress Side-Channel Format

The PowerShell runner script MUST emit progress updates exclusively to stderr
using the prefix `DYSFLOW_PROGRESS ` followed by a compact JSON object:
```json
{"percent": <number>, "total": <number>, "message": "<string>"}
```

Fields `total` and `message` are OPTIONAL. The `percent` field is REQUIRED and
MUST be a numeric value between 0 and 100 inclusive.

#### Scenario: Progress emitted during long operation
- GIVEN the PowerShell script is executing a multi-step operation
- WHEN a step completes
- THEN the script MUST write one `DYSFLOW_PROGRESS` line to stderr
- AND the line MUST contain at minimum `{"percent": <n>}`

#### Scenario: Progress does not appear in stdout
- GIVEN the PowerShell script emits progress
- WHEN the Node runner collects stdout
- THEN stdout MUST contain only the final JSON result
- AND MUST NOT contain any `DYSFLOW_PROGRESS` content

### Requirement: Bounded runner timeout and failure metadata

The Access core runner MUST terminate runner execution within configured `timeoutMs` bounds and return a structured failure result when PowerShell or Access execution does not complete. Structured failure metadata MUST include a stable error code, timeout or failure classification, and operation identity suitable for diagnostics.

#### Scenario: Timeout returns structured metadata

- **Given** a runner operation started with timeout `T`
- **When** PowerShell or Access execution does not complete within `T`
- **Then** the runner MUST return a timeout-classified failure result
- **And** the result MUST include operation identity and timeout metadata
- **And** the call MUST complete without hanging the caller.

#### Scenario: Non-timeout subprocess failure returns diagnostics

- **Given** a runner subprocess exits early with a failure
- **When** the runner normalizes the outcome
- **Then** it MUST return a structured failure result with stable classification
- **And** it SHOULD include diagnostic context sufficient to distinguish PowerShell startup from the Access execution boundary.

#### Scenario: E2E diagnostics path remains bounded

- **Given** `dysflow_doctor` or `list_tables` executes from an `E2E_testing` project context
- **When** the runner crosses the PowerShell-to-Access boundary
- **Then** the runner SHALL produce a terminal success or structured failure within configured bounds
- **And** it MUST NOT rely on indefinite waits.

### Requirement: Explicit Write Database Target

Write and DDL operations MUST execute against an explicit write database target when supplied. The frontend MAY remain the Access automation context, but the write database MUST be selected from `backendPath` or `databasePath` before executing SQL, scripts, DDL, fixtures, or teardown. When no explicit write target is supplied, existing frontend/current-database behavior MUST remain compatible.

#### Scenario: Explicit backend target receives DDL

- GIVEN a frontend database and a distinct backend database
- WHEN `create_table` or `drop_table` runs with an explicit `backendPath` or `databasePath`
- THEN the DDL MUST execute only against that backend database
- AND the frontend MUST NOT contain the created or dropped test table

#### Scenario: No explicit write target preserves compatibility

- GIVEN a write or DDL request without `backendPath` or `databasePath`
- WHEN the runner executes the request
- THEN it MUST use the existing frontend/current database target behavior
- AND dry-run and allow/deny guard behavior MUST remain unchanged

#### Scenario: Protected backend password source and diagnostics

- GIVEN the explicit backend requires a password
- WHEN the runner opens the write database
- THEN it MUST obtain the password only from project configuration or environment variables
- AND diagnostics MUST redact passwords, connection strings, and sensitive paths

#### Scenario: Owned cleanup after write failure

- GIVEN a targeted backend write fails after the runner creates an Access operation record
- WHEN cleanup is required
- THEN cleanup MUST use Dysflow operation ownership and cleanup by operation id
- AND the system MUST NOT use generic Access process kills
