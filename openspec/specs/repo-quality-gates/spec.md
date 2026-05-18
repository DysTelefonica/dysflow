# repo-quality-gates Specification

## Purpose

Enforce repository quality before hardening work expands.

## Requirements

### Requirement: CI Quality Gate
The system MUST run test, build, lint, and coverage checks for pull requests, with unavailable gates documented until enabled.

#### Scenario: Pull request gate
- GIVEN a pull request changes repository code
- WHEN CI runs
- THEN it MUST execute `pnpm test` and `pnpm build`
- AND it SHALL execute lint and coverage when configured

#### Scenario: Gate unavailable
- GIVEN lint or coverage is not configured
- WHEN the gate is evaluated
- THEN the repository MUST document the missing gate and follow-up owner

### Requirement: Review Budget
The delivery plan MUST protect the 400 changed-line review budget unless a maintainer records `size:exception`.

#### Scenario: Oversized forecast
- GIVEN planned work may exceed 400 changed lines
- WHEN tasks are created
- THEN they MUST recommend chained PR slices or require `size:exception`
