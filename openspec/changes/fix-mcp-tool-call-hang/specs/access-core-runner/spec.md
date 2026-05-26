## ADDED Requirements

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
