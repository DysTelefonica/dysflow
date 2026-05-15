# core-configuration Specification

## Purpose

Resolve project, Access, secret-redaction, and timeout settings for core services.

## Requirements

### Requirement: Safe Configuration Resolution

The system MUST resolve configuration from explicit inputs and environment without exposing secrets in logs or results.

#### Scenario: Access path resolved
- GIVEN a configured Access database path
- WHEN configuration is loaded
- THEN the resolved config SHALL include the database path
- AND redact configured passwords

#### Scenario: Missing required path
- GIVEN no Access database path
- WHEN configuration is validated
- THEN the system MUST return a typed configuration error
