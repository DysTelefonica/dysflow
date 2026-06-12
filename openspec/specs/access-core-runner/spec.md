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

### Requirement: Empty Stdout Rejection

The system MUST reject empty stdout from the runner process as invalid JSON and throw a `SyntaxError` to distinguish empty output from a valid empty-object payload.

#### Scenario: Empty stdout
- GIVEN empty or whitespace stdout from the runner process
- WHEN the runner parses the output
- THEN it MUST throw a `SyntaxError`
- AND the caller MUST receive a typed `RUNNER_INVALID_JSON` error instead of an empty object

### Requirement: Process List Normalization

The process scanner and inspector MUST type-safely parse and normalize process list payloads. They MUST handle single process objects, process arrays, empty strings, and invalid process structures without throwing exceptions, always returning a validated array of processes.

#### Scenario: Single process object
- GIVEN a process list containing a single process object
- WHEN parsed and normalized
- THEN it MUST return an array containing that process object

#### Scenario: Process array
- GIVEN a process list containing an array of process objects
- WHEN parsed and normalized
- THEN it MUST return a validated array of those processes

#### Scenario: Invalid process structure or empty input
- GIVEN an empty string, invalid JSON, or non-object process info payload
- WHEN parsed and normalized
- THEN it MUST return an empty array `[]`
- AND filter out any processes missing required properties (such as process ID or name) or containing incorrect types

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

### Requirement: Formal PowerShell Executor Port

The system MUST expose a formal `PowerShellExecutor` port from core contracts and the Access core runner MUST execute PowerShell only through that port. Core runner behavior MUST remain protocol-neutral and MUST NOT depend on a concrete PowerShell process implementation.

#### Scenario: Runner uses injected executor
- GIVEN an Access runner constructed with a `PowerShellExecutor`
- WHEN a runner operation is executed
- THEN the runner MUST invoke the supplied executor port
- AND it MUST collect stdout, stderr progress, exit, timeout, and failure signals through the port contract.

#### Scenario: Missing custom executor uses adapter default
- GIVEN a composition root creates an Access runner without a custom executor
- WHEN the runner is wired for CLI, MCP, HTTP, or VBA-sync usage
- THEN the adapter or composition root MUST provide the default PowerShell executor
- AND core MUST NOT create or import that concrete default directly.

### Requirement: Core Dependency Direction

Core modules MUST depend only on core contracts and domain/use-case code. Concrete PowerShell executable resolution, process spawning, Windows process scan/inspect/kill implementations, and adapter runtime wiring MUST be owned outside core.

#### Scenario: Core has no concrete spawn dependency
- GIVEN the core source tree is inspected
- WHEN dependency-boundary tests search runner imports
- THEN core runner code MUST NOT import adapter modules, `powershell.exe` constants, or concrete spawn helpers
- AND adapters MAY import core contracts to satisfy the port.

#### Scenario: Adapter imports remain directional
- GIVEN an adapter needs to execute PowerShell
- WHEN it wires the default executor
- THEN it MUST depend on the core `PowerShellExecutor` contract
- AND core MUST remain independent of adapter implementation paths.

### Requirement: Adapter-Owned Windows Process Implementations

Windows-specific process scan, inspect, kill, and PowerShell process helper implementations MUST be owned by adapters, not core. Core MAY define contracts and normalization expectations only.

#### Scenario: Composition roots wire process adapters
- GIVEN CLI, MCP, HTTP, or VBA-sync composition creates cleanup services
- WHEN Windows process capabilities are required
- THEN the concrete implementation MUST come from an adapter module
- AND callers MUST observe the same public cleanup contracts.

#### Scenario: Core contains no child process implementation
- GIVEN the core source tree is inspected
- WHEN imports are checked for Windows process implementation ownership
- THEN core MUST NOT import `node:child_process` for process scan, inspect, or kill behavior.

### Requirement: Process Port Preservation

Existing process-related ports and caller contracts MUST remain stable. The relocation MUST NOT rename or remove cleanup ports, request/response shapes, CLI flags, MCP tools, or HTTP behavior.

#### Scenario: Existing callers compile unchanged
- GIVEN callers depend on existing cleanup/process ports
- WHEN process implementations move to adapters
- THEN caller-facing contracts MUST remain compatible
- AND no new public process API MUST be required.

#### Scenario: Adapter satisfies core port
- GIVEN core cleanup logic requires process scan, inspect, or kill behavior
- WHEN the adapter is injected through the existing port
- THEN core MUST consume only the port contract
- AND the adapter MAY own OS-specific execution details.

### Requirement: Windows Process Behavior Preservation

The adapter-owned implementation MUST preserve existing MSACCESS scan, inspect, kill, parsing, fallback, redaction, and error normalization behavior.

#### Scenario: Process payload normalization is unchanged
- GIVEN single-object, array, empty, invalid, or partially invalid process payloads
- WHEN the adapter normalizes process data
- THEN it MUST return the same validated process arrays as before relocation.

#### Scenario: Fallback and errors remain unchanged
- GIVEN PowerShell process discovery, inspection, or termination fails
- WHEN the adapter handles the failure
- THEN fallback behavior and structured diagnostics MUST match prior observable behavior.

### Requirement: Process Adapter Test Coverage

Focused tests MUST prove adapter ownership, core dependency direction, port compatibility, and behavior preservation before implementation is trusted.

#### Scenario: Boundary tests reject core implementation drift
- GIVEN the implementation is complete
- WHEN focused tests inspect process implementation imports
- THEN tests MUST fail if core owns `node:child_process` process logic again.

#### Scenario: Regression commands pass
- GIVEN the relocation is complete
- WHEN `pnpm test` and `pnpm build` run
- THEN both commands MUST pass
- AND process behavior assertions MUST NOT be weakened.

### Requirement: No Observable Runner Behavior Drift

The port extraction MUST preserve existing runner semantics for executable resolution, arguments, environment propagation, timeout handling, stderr progress parsing, stdout JSON parsing, and structured error normalization.

#### Scenario: Successful operation remains unchanged
- GIVEN an operation that succeeded before the port extraction
- WHEN executed through the injected executor
- THEN stdout MUST still be parsed as the final JSON result
- AND progress side-channel handling MUST remain unchanged.

#### Scenario: Failure and timeout remain unchanged
- GIVEN a non-zero exit, invalid JSON, empty stdout, malformed progress, or timeout
- WHEN executed through the injected executor
- THEN the runner MUST return or throw the same observable error classification as before
- AND diagnostics MUST preserve existing redaction and metadata behavior.

### Requirement: Boundary and Behavior Test Coverage

The test suite MUST cover the new port boundary and prove behavior preservation before implementation is trusted.

#### Scenario: Port boundary is tested
- GIVEN the implementation is complete
- WHEN focused runner and adapter tests execute
- THEN tests MUST prove core consumes the `PowerShellExecutor` contract by injection
- AND no core test MUST rely on concrete PowerShell spawning.

#### Scenario: Existing regression suite remains green
- GIVEN the port extraction is complete
- WHEN `pnpm test` and `pnpm build` run
- THEN both commands MUST pass
- AND existing runner behavior tests MUST remain valid without weakening assertions.
