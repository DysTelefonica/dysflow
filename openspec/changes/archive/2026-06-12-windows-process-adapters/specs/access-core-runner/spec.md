# Delta for access-core-runner

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Core Dependency Direction

Core modules MUST depend only on core contracts and domain/use-case code. Concrete PowerShell executable resolution, process spawning, Windows process scan/inspect/kill implementations, and adapter runtime wiring MUST be owned outside core.
(Previously: core dependency direction covered concrete PowerShell executable resolution, process spawning, and adapter runtime wiring, but did not explicitly cover Windows process scan/inspect/kill ownership.)

#### Scenario: Core has no concrete spawn dependency
- GIVEN the core source tree is inspected
- WHEN dependency-boundary tests search runner and process imports
- THEN core runner and process code MUST NOT import adapter modules, `node:child_process`, `powershell.exe` constants, or concrete spawn helpers
- AND adapters MAY import core contracts to satisfy the port.

#### Scenario: Adapter imports remain directional
- GIVEN an adapter needs to execute PowerShell or perform Windows process cleanup
- WHEN it wires the default implementation
- THEN it MUST depend on core contracts
- AND core MUST remain independent of adapter implementation paths.
