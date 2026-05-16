# Proposal: track-mcp-protocol-version

## Summary
Make the hand-written MCP runtime protocol target explicit and documented.

## Problem
The MCP protocol version was a literal in the initialize response. Since Dysflow owns a hand-written stdio runtime, protocol version changes need an obvious maintenance point and tests.

## Scope
- Export a named `MCP_PROTOCOL_VERSION` constant.
- Use it in initialize responses and tests.
- Document MCP protocol maintenance and JSON-RPC id behavior.
