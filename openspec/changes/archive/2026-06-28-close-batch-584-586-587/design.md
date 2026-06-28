# Design: close-batch-584-586-587

## Architecture Decisions

1. **CI evidence as a small parser/guard, not brittle log scraping.** The Windows smoke job should produce a simple machine-readable marker or summary that tests can verify without coupling to Vitest's full reporter output.
2. **Sandbox path planning before MCP calls.** `mcp-e2e.mjs` should calculate all mutable paths from a single sandbox object so reviewers can see the repository fixtures are read-only inputs.
3. **Contract metadata in adapter layer.** MCP safety/write metadata belongs in `src/adapters/mcp` because it describes public tool-surface behavior. It may derive from route metadata (`dispatch-routes.ts`) and explicit modern tool metadata (`tools.ts`) but must not leak adapter details into `src/core`.

## Test Strategy

- #584: Vitest quality/behavior tests for the smoke evidence parser or workflow guard, plus the workflow step wiring.
- #586: focused tests for sandbox path planning and a quality gate that mutable E2E paths are sandbox-contained.
- #587: port-level metadata tests comparing modern and legacy/generated tool surfaces.

## Rollback

Each issue is isolated in its own commit. Revert the issue commit to roll back the behavior, then revert the final traceability/archive commits if the batch must be reopened.
