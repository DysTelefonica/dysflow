# Spec: Windows Access Smoke Evidence (#584)

## ADDED Requirements

### Requirement: Explicit Windows Access smoke evidence

The Windows CI smoke job MUST make Access-dependent test evidence explicit. It MUST distinguish between tests that executed and tests that were skipped due to missing Access COM, missing fixture databases, or missing passwords.

#### Scenario: Access tests execute on a capable runner

- **Given** a Windows runner with Access COM, fixture databases, and required passwords
- **When** the Windows integration smoke job runs Access-dependent Vitest files
- **Then** the job MUST publish or print a summary showing those Access E2E suites executed
- **And** the summary MUST NOT imply they were skipped.

#### Scenario: Access tests are skipped on an incapable runner

- **Given** a Windows runner without Access COM or fixture databases
- **When** Access-dependent Vitest files are skipped by `describe.skipIf`
- **Then** the job MUST print a clear skip summary naming the missing prerequisite category
- **And** the job MUST NOT present the skipped suites as release-grade Access coverage.

#### Scenario: all Access smoke files skip silently

- **Given** the Windows smoke workflow includes Access-dependent test files
- **When** every Access-dependent file is skipped
- **Then** a dedicated evidence gate MUST fail or mark the result as explicitly skipped instead of silently succeeding as if coverage executed.

### Acceptance Criteria

- CI logs or summary clearly report executed vs skipped Access E2E status.
- A separate release-grade Access gate is identified in workflow or docs.
- Tests guard against future workflow changes that imply Access evidence when all Access tests skipped.
