# Design: remove E2E MCP shadow copy

## Decision
`E2E_testing` may contain local binary fixtures and thin harness documentation, but it must not contain copied product TypeScript source. Any E2E helper code must either run the built/installed `dysflow mcp` command or import modules from `src/**` directly.

## Rationale
The production MCP adapter already has behavior tests for server version, schema exposure, config propagation, and JSON-RPC dispatch. A copied E2E adapter creates a second source of truth that can diverge without failing CI when hidden by `.gitignore`.

## Enforcement
A new architecture test checks three boundaries:

1. `.gitignore` must not blanket-ignore `E2E_testing/`.
2. `E2E_testing/src/adapters/mcp` must not exist as a source tree.
3. Any TypeScript helper under `E2E_testing` must not contain known shadow-copy divergence signatures such as hardcoded `version: "0.1.0"`, broad `additionalProperties: true`, or no-arg `startMcpStdioAdapter()` startup.

## Compatibility
Access binary fixtures remain ignored with targeted patterns: `.accdb`, `.mdb`, `.accde`, `.mde`, and `.laccdb`.
