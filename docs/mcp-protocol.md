# MCP Protocol Integration Strategy

## Current Architecture: Hand-Rolled Stdio Protocol Handler

Dysflow implements the Model Context Protocol (MCP) using a light, hand-rolled JSON-RPC over Stdio transport layer located in `src/adapters/mcp/stdio.ts`.

- **Protocol Version Target**: `2024-11-05` (pinned as `MCP_PROTOCOL_VERSION` constant).
- **Rationale for Hand-Rolling**:
  - Keep runtime overhead and build size minimal.
  - Zero external dependencies required at runtime, preventing potential version conflicts or dependency bloat in air-gapped environments where Dysflow is often installed.
  - Full control over JSON-RPC message buffering, maximum payload limits, and PowerShell execution constraints.

## Long-term Strategy: Official SDK Migration

As the MCP specification expands (e.g. supporting more complex routing, authentication, multi-transport channels), we will evaluate migrating to the official SDK package:

- **Reference Link**: [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- **Migration Trigger**: When Dysflow needs capabilities like SSE (Server-Sent Events), federated sub-servers, or advanced client negotiation features that are cumbersome to implement by hand.
