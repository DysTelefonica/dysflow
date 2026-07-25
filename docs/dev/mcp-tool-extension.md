# Extending the MCP Tool Surface

Keep each concern explicit; do not add a universal registry or generator.

When adding a tool:

1. Add its canonical name to `mcp-tool-registry.ts`.
2. Add its route in `dispatch-routes.ts`, or an explicit alias/handler when it bypasses generated dispatch.
3. Define its input schema and result contract in the existing schema/contract modules.
4. Add its consumer-facing description to `TOOL_DESCRIPTIONS`.
5. Implement the owning adapter or handler.
6. Add focused behavior tests, then run parity, schema, risk, and capability gates.

Parity status is derived from canonical advertised names. Under the zero-hidden-tools policy, a name
must not be advertised until its route, schema, description, implementation, and tests are ready.
