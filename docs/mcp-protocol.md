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

## Tool behavior and workflow metadata

Every `tools/list` entry exposes the five interoperable behavior hints defined
by MCP 2025-06-18 `ToolAnnotations`: `title`, `readOnlyHint`,
`destructiveHint`, `idempotentHint`, and `openWorldHint`. Dysflow derives these
from its canonical tool contracts. Write-capable tools conservatively advertise
`destructiveHint: true` because apply mode may overwrite Access objects, data,
or project files even when the default call is a non-mutating plan.

Workflow phase and usage guidance are Dysflow product metadata, not standard
MCP annotations. They live under the Tool `_meta` extension point:

```json
{
  "annotations": {
    "title": "Resolve Project",
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  },
  "_meta": {
    "dysflow/workflow": {
      "phases": ["bootstrap", "recovery"],
      "preferredFor": ["Resolve and verify the selected worktree project after bootstrap."],
      "status": "preferred"
    }
  }
}
```

The mapping is total: every advertised tool has at least one of `bootstrap`,
`sync`, `tests`, `sql`, `forms`, or `recovery`; multi-phase tools retain every
phase. The same `annotations` and `_meta` values are mirrored by compact/full
`schema`, `describe_tool`, and `get_capabilities.tools`.

MCP 2025-06-18 does not define `annotations.category` or
`annotations.preferredFor`. Dysflow therefore does not emit those nonstandard
keys and does not claim that generic MCP clients group tools automatically.
Clients that understand `_meta["dysflow/workflow"]` can group, filter, or sort;
other clients safely ignore it. See the official
[ToolAnnotations schema](https://modelcontextprotocol.io/specification/2025-06-18/schema#toolannotations).

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
