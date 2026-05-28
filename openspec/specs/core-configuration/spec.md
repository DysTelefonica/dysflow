# core-configuration Specification

## Purpose

Resolve project, Access, secret-redaction, and timeout settings for core services.

## Requirements

### Requirement: Safe Configuration Resolution

The system MUST resolve configuration from explicit inputs and environment without exposing secrets in logs or results.
(Previously: The system resolved database path and redacted passwords, but did not support httpToken config or its redaction.)

#### Scenario: Access path resolved
- GIVEN a configured Access database path
- WHEN configuration is loaded
- THEN the resolved config SHALL include the database path
- AND redact configured passwords

#### Scenario: Missing required path
- GIVEN no Access database path
- WHEN configuration is validated
- THEN the system MUST return a typed configuration error

#### Scenario: HTTP token resolved and redacted
- GIVEN an HTTP token configured in environment `DYSFLOW_HTTP_TOKEN` or explicit inputs
- WHEN configuration is resolved
- THEN it SHALL resolve the token in `httpToken`
- AND the system MUST redact the `httpToken` value in config log outputs

### Requirement: Single-Implementation Config Loading

Core routing logic for configuration loading MUST reside in exactly one function. The synchronous variant MUST be a thin wrapper that adapts the async implementation (or vice versa). No routing logic SHALL be duplicated between sync and async paths.
(Previously: `loadDysflowConfig` and `loadDysflowConfigAsync` each contained independent routing logic.)

#### Scenario: Sync result matches async result
- GIVEN identical inputs
- WHEN both `loadDysflowConfig` and `loadDysflowConfigAsync` are called
- THEN both MUST return the same resolved configuration

#### Scenario: No routing duplication
- GIVEN the source module `dysflow-config.ts`
- WHEN a routing condition is updated
- THEN exactly one code site requires the change

