# Delta for access-core-services

## ADDED Requirements

### Requirement: Per-call Timeout Overrides Project Timeout

`VbaSyncLegacyService` MUST use a positive numeric `timeoutMs` supplied on a tool call before falling back to project or service defaults.

#### Scenario: Explicit timeout wins

- GIVEN a repo config defines a default timeout
- WHEN a legacy VBA tool call includes `timeoutMs: 90000`
- THEN the runner request MUST use `90000` milliseconds
