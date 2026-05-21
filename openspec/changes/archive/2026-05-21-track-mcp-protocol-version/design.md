# Design: track MCP protocol version

The runtime remains hand-written for this slice. Protocol tracking is handled by a named constant plus tests around initialize and JSON-RPC request/notification behavior. `id: null` is intentionally covered as a request id that receives a response.
