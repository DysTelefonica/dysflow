# MCP stdio adapter spec delta

## ADDED Requirements

### Requirement: Protocol version MUST be centrally declared
The MCP initialize protocol version MUST come from a named constant.

### Requirement: JSON-RPC null id MUST receive a response
A JSON-RPC request with `id: null` MUST be answered. Notifications are only requests where `id` is omitted.
