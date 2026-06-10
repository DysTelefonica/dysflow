# MCP Protocol Integration Strategy

## Current Architecture: Official MCP SDK over Stdio

Dysflow implements the Model Context Protocol (MCP) on top of the official
`@modelcontextprotocol/sdk` (`McpServer` + `StdioServerTransport`), wired in
`src/adapters/mcp/stdio.ts`. The SDK owns the `initialize` handshake,
protocol-version negotiation, and JSON-RPC framing.

- **Protocol Version Target**: derived from the SDK's
  `DEFAULT_NEGOTIATED_PROTOCOL_VERSION` and exported as `MCP_PROTOCOL_VERSION`
  (the SDK supports up to `MCP_PROTOCOL_VERSION_LATEST_SUPPORTED` /
  `LATEST_PROTOCOL_VERSION`). It is not hand-pinned, so it cannot drift from
  what the server actually negotiates. See
  [`docs/testing/mcp-protocol-maintenance.md`](./testing/mcp-protocol-maintenance.md).
- **Hand-written transport piece**: only `SizeLimitTransform`, a byte guard in
  front of stdin that rejects oversized request lines before they reach the SDK
  transport. Everything else (buffering, JSON-RPC, negotiation) is the SDK.
- **Tool surface**: the server exposes tools; unsupported capabilities are kept
  absent from `capabilities` until implemented.

> Historical note: an earlier product slice used a light hand-rolled
> JSON-RPC-over-stdio transport with a manually pinned protocol version
> (`2024-11-05`). That migration to the official SDK has already been completed;
> this document describes the current SDK-based runtime.

## Future work

As the MCP specification expands, candidate enhancements include:

- **Reference**: [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- Adopting newer protocol features such as `structuredContent` on tool results
  (structured query rows instead of text blobs), SSE / streamable-HTTP
  transports, or advanced client negotiation — each proposed and designed as its
  own change.
