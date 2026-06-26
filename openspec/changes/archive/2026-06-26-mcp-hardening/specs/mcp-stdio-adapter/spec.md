# Delta for mcp-stdio-adapter

## ADDED Requirements

### Requirement: Stdio Size Limit Connection Closure

The stdio size guard (`SizeLimitTransform`) MUST enforce a 1 MiB line/payload limit. When a payload size violation occurs, the system MUST push a JSON-RPC error frame with `id: null` to the stream and immediately destroy/close the stdio connection to prevent the client from hanging.

#### Scenario: Payload size limit exceeded
- GIVEN an incoming payload exceeding 1 MiB
- WHEN the payload is processed by the stdio size guard
- THEN the size guard MUST push a JSON-RPC error frame with `id: null`
- AND it MUST immediately destroy/close the stdio connection

### Requirement: Orphan Cleanup Service Error Mapping

The `listOrphans` operation handler in the MCP stdio adapter MUST NOT throw raw Error exceptions. It MUST map the core `AccessOrphanCleanupService.listOrphans` result (which returns a standard `OperationResult`) and safely propagate error codes using standard MCP JSON-RPC protocol error structures.

#### Scenario: orphanCleanupService returns failure OperationResult
- GIVEN the orphan cleanup service returns a failure OperationResult
- WHEN the MCP adapter processes the request
- THEN it MUST return a valid MCP error response
- AND it MUST NOT throw a raw Error exception
