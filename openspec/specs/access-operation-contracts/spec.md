# access-operation-contracts Specification

## Purpose

Define protocol-neutral Access/VBA/query request and result contracts.

## Requirements

### Requirement: Protocol-Neutral Results

The system MUST represent operations with typed success, error, diagnostics, and duration fields without MCP or HTTP concepts.

#### Scenario: Successful operation
- GIVEN a completed Access operation
- WHEN the result is created
- THEN it SHALL include success data and diagnostics

#### Scenario: Failed operation
- GIVEN a runner failure
- WHEN the result is created
- THEN it MUST include a typed error and safe message
