# mcp-stdio-adapter Specification

## Purpose

Expose core services as MCP stdio tools while preserving protocol safety.

## Requirements

### Requirement: MCP Adapter Over Core

The system MUST register MCP tools that translate requests to core contracts and never embed HTTP behavior.

#### Scenario: MCP tool invokes core
- GIVEN an MCP tool request
- WHEN the adapter receives it
- THEN it SHALL call the matching core service
- AND translate the result to MCP output

#### Scenario: Core error returned
- GIVEN core returns an error
- WHEN the adapter responds
- THEN it MUST preserve a safe error message
