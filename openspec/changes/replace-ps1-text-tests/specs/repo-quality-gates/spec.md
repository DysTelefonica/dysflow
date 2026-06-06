# Delta for repo-quality-gates

## ADDED Requirements

### Requirement: PowerShell Tests Assert Behavior

PowerShell-related tests MUST assert observable behavior through a port-level Vitest contract or a Pester behavior contract. Tests MUST NOT pass or fail only because `scripts/dysflow-access-runner.ps1`, `scripts/dysflow-vba-manager.ps1`, or shared PowerShell modules contain specific internal variable names, dispatcher snippets, function-body text, or source layout.

#### Scenario: Source-text assertion is replaced

- GIVEN an issue-scoped test currently reads a `.ps1` file and asserts internal text
- WHEN the test is rewritten
- THEN it MUST assert command/result/error/cleanup behavior at the TS runner port or PowerShell behavior through Pester
- AND it MUST NOT assert internal source snippets or variable names.

#### Scenario: Variable rename remains safe

- GIVEN a `.ps1` internal variable or helper name changes without changing observable behavior
- WHEN `pnpm test` and relevant `pnpm test:ps1` checks run
- THEN tests for the replaced coverage MUST remain green.

### Requirement: Safety Coverage Is Preserved

Removing source-text tests MUST preserve the safety contracts they protected: database routing, SQL read/write selection, password/path safety, bounded Access process cleanup, marker emission, return/error handling, and VBA action dispatch outcomes.

#### Scenario: Protected contract keeps coverage

- GIVEN a source-text assertion is removed
- WHEN its replacement test is added
- THEN the replacement MUST prove the same externally visible safety contract
- AND the old text assertion MAY be deleted only after the behavior-level check fails for the matching regression.

#### Scenario: Pester is used for PowerShell-local behavior

- GIVEN the protected behavior lives inside PowerShell helper/action logic
- WHEN coverage is added
- THEN the behavior SHOULD be tested in `scripts/tests/*.Tests.ps1` with mocked I/O seams
- AND `pnpm test:ps1` MUST be considered or run for that change.

## MODIFIED Requirements

### Requirement: CI Quality Gate

The system MUST run test, build, lint, and coverage checks for pull requests, with unavailable gates documented until enabled. For PowerShell runner contracts, the test gate MUST prefer behavior-level Vitest or Pester checks over implementation-coupled source-text assertions.
(Previously: CI required standard repository checks but did not reject brittle `.ps1` source-text tests.)

#### Scenario: Pull request gate

- GIVEN a pull request changes repository code
- WHEN CI runs
- THEN it MUST execute `pnpm test` and `pnpm build`
- AND it SHALL execute lint and coverage when configured.

#### Scenario: Gate unavailable

- GIVEN lint or coverage is not configured
- WHEN the gate is evaluated
- THEN the repository MUST document the missing gate and follow-up owner.

#### Scenario: PowerShell behavior gate

- GIVEN a pull request changes PowerShell runner behavior or its tests
- WHEN verification is planned
- THEN `pnpm test:ps1` SHOULD be run when Pester coverage is affected
- AND skipped Pester execution MUST be called out with the reason.
