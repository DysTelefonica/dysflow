# MCP protocol maintenance

Dysflow uses a small hand-written JSON-RPC-over-stdio MCP runtime instead of the official MCP SDK. This is intentional for the current product slice: the server only exposes tools, keeps the adapter thin, and avoids SDK version churn while the core services stabilize.

## Target protocol

The targeted MCP protocol version is declared in `src/adapters/mcp/stdio.ts` as `MCP_PROTOCOL_VERSION`.

When changing it:

1. read the upstream MCP protocol changelog;
2. update `MCP_PROTOCOL_VERSION`;
3. add or adjust runtime tests for any changed initialize/tools behavior;
4. keep unsupported capabilities absent from `capabilities` until implemented.

## JSON-RPC compatibility guards

Runtime tests must cover:

- normal requests with numeric/string ids;
- notifications with no `id`, which produce no response;
- explicit `id: null`, which is treated as a request id and receives a response;
- unsupported methods returning JSON-RPC `-32601`.

## Non-goal

This note does not require migrating to the MCP SDK. A future migration should be a separate approved design change.
