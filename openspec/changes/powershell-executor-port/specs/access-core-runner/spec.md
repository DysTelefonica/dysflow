# Delta for access-core-runner

## ADDED Requirements

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

Core modules MUST depend only on core contracts and domain/use-case code. Concrete PowerShell executable resolution, process spawning, and adapter runtime wiring MUST be owned outside core.

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
