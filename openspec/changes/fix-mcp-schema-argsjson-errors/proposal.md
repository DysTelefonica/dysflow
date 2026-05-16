# Proposal: Harden MCP schema validation and legacy argsJson errors

## Intent

Fix GitHub issue #93 by making MCP tool input validation fail safely and predictably, including malformed legacy `argsJson`, without allowing adapter exceptions to escape into JSON-RPC internal errors.

## Scope

### In Scope

- Strengthen `src/adapters/mcp/tools.ts` input validation so declared JSON schemas validate nested arrays/objects where schemas provide `items` or `properties`.
- Convert malformed legacy `run_vba.argsJson` from a raw `JSON.parse` throw into a normal MCP tool error with `isError: true` and an actionable `MCP_INPUT_INVALID` message.
- Preserve successful legacy behavior: missing/blank `argsJson` maps to `[]`, JSON arrays map to the array, and non-array JSON maps to a single argument.
- Add strict-TDD Vitest coverage for RED first, then implementation.
- Preserve dependency direction: MCP adapter depends on core contracts/services; core remains free of MCP/adapter imports.

### Out of Scope

- Changing core service contracts or adding MCP concepts to `src/core`.
- Changing legacy tool inventory, tool names, or service dispatch semantics.
- Modifying `C:\Proyectos\workflow\skills\dysflow` or any old workflow skill folder.
- Broad JSON Schema compliance beyond the schema shapes currently declared by Dysflow MCP tools.

## Capabilities

### Modified Capabilities

- `mcp-stdio-adapter`: stricter adapter-side validation and safe legacy argument parsing errors.

## Approach

Keep the fix inside the MCP adapter boundary. Add failing tests in `test/adapters/mcp/tools.test.ts` and, if needed, `test/adapters/mcp/stdio.test.ts` to prove malformed inputs return MCP-level invalid-input errors instead of throwing. Then implement a small recursive validator in `src/adapters/mcp/tools.ts` that supports the existing schema subset (`string`, `boolean`, `number`, `array`, `object`, `items`, `properties`, and `additionalProperties`). Wrap or refactor `parseLegacyArgsJson` so parse errors become validation errors before `services.vbaService.execute` is called.

## Affected Areas

| Area                                       | Impact               | Description                                                                                                                |
| ------------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `test/adapters/mcp/tools.test.ts`          | Modified             | RED tests for nested schema validation and invalid `argsJson`.                                                             |
| `test/adapters/mcp/stdio.test.ts`          | Possibly modified    | Optional regression proving JSON-RPC `tools/call` receives an MCP tool error result, not `-32603`, for invalid `argsJson`. |
| `src/adapters/mcp/tools.ts`                | Modified             | Recursive validation helper and safe legacy `argsJson` parsing.                                                            |
| `openspec/specs/mcp-stdio-adapter/spec.md` | Later archive target | Baseline spec receives the new requirement after verification/archive.                                                     |

## Risks

| Risk                                                       | Likelihood | Mitigation                                                                                                                                      |
| ---------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Validator becomes an overbroad JSON Schema implementation. | Medium     | Limit to the existing local `JsonSchemaProperty` type and scenarios specified here.                                                             |
| Error text becomes brittle.                                | Medium     | Assert stable prefix/code and one actionable phrase rather than full parser-specific messages where practical.                                  |
| Existing accepted payloads are rejected.                   | Low        | Preserve current behavior for unknown schema fields only when `additionalProperties` allows them; add regression tests for valid current calls. |
| Core/adapter dependency direction regresses.               | Low        | Keep all changes in `src/adapters/mcp/tools.ts`; rerun architecture tests through `pnpm test`.                                                  |

## Rollback Plan

Single PR for issue #93. Revert the PR to restore previous adapter validation behavior. No data migration or external runtime changes are involved.

## Success Criteria

- [ ] Malformed `run_vba.argsJson` returns `{ isError: true, content: [{ text: "MCP_INPUT_INVALID: ..." }] }` and does not call `vbaService.execute`.
- [ ] A `tools/call` for malformed legacy `argsJson` returns a normal JSON-RPC result containing the MCP tool error, not a JSON-RPC `-32603` internal error.
- [ ] Nested object/array schema violations are rejected before core services are called.
- [ ] Valid current calls continue to pass, including legacy `run_vba` arrays and non-array JSON values.
- [ ] `pnpm test` and `pnpm build` pass.
