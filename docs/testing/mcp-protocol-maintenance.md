# MCP protocol maintenance

Dysflow's stdio MCP server is built on the official `@modelcontextprotocol/sdk`
(`McpServer` + `StdioServerTransport`), wired in `src/adapters/mcp/stdio.ts`.
The SDK owns the `initialize` handshake, protocol-version negotiation, and
JSON-RPC framing. The only hand-written transport piece is `SizeLimitTransform`,
a byte guard placed in front of stdin to reject oversized request lines.

> Historical note: an earlier slice used a hand-written JSON-RPC-over-stdio
> runtime. That migration to the SDK has already happened; this document
> describes the current SDK-based runtime.

## Target protocol

`src/adapters/mcp/stdio.ts` exposes `MCP_PROTOCOL_VERSION` as a maintenance
marker. It is **derived** from the SDK's `DEFAULT_NEGOTIATED_PROTOCOL_VERSION`
(and `MCP_PROTOCOL_VERSION_LATEST_SUPPORTED` mirrors the SDK's
`LATEST_PROTOCOL_VERSION`). Because the SDK performs negotiation, the marker is
not hand-set — deriving it guarantees it reflects what the server actually
negotiates and cannot silently drift.

The `MCP_PROTOCOL_VERSION_REVIEW` object records the date the upstream spec was
last cross-checked and the spec revision that justifies the current target.

When the SDK is upgraded (which may change the negotiated/latest versions):

1. read the upstream MCP protocol changelog for the new revision;
2. update `MCP_PROTOCOL_VERSION_REVIEW` (`reviewedAt`, `specRef`) in the same
   change — `version` tracks `MCP_PROTOCOL_VERSION` automatically;
3. add or adjust runtime tests for any changed initialize/tools behavior;
4. keep unsupported capabilities absent from `capabilities` until implemented.

## Cross-check log

The age gate in `test/adapters/mcp/stdio-protocol-review.test.ts` fails once
`reviewedAt` is older than 90 days. Record each cross-check here so the bump is
auditable rather than a blind date refresh.

| reviewedAt | SDK | Negotiated | SDK latest | Upstream current | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-09-28 | 1.29.0 | 2025-03-26 | 2025-11-25 | 2026-07-28 | target unchanged |

Notes for the 2026-09-28 cross-check:

- `MCP_PROTOCOL_VERSION` is derived from the SDK, so it cannot drift from what
  the server negotiates. No code change was required.
- `specRef` still cites `2025-03-26`, the revision that justifies the current
  negotiated target.
- Upstream has since published `2025-06-18`, `2025-11-25` and the current
  `2026-07-28`.
- `2026-07-28` replaces the initialize handshake with a per-request
  `io.modelcontextprotocol/protocolVersion` value and a `server/discover` RPC.
- That revision documents backward compatibility for the handshake-based
  revisions `2025-11-25` and earlier.
- Adopting a newer revision remains a separate, feature-level change, as
  **Future work** below already states.

## JSON-RPC compatibility guards

The SDK transport handles JSON-RPC framing, but runtime tests still assert the
observable contract:

- normal requests with numeric/string ids;
- notifications with no `id`, which produce no response;
- explicit `id: null`, which is treated as a request id and receives a response;
- unsupported methods returning JSON-RPC `-32601`.

## Future work

Adopting newer protocol features (for example `structuredContent` on tool
results) is a separate, feature-level change and should be proposed and
designed on its own.
