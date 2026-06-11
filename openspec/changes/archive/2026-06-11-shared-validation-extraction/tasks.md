# Tasks: Shared Validation Extraction

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 350–450 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Foundation (shared kernel + MCP re-exports) → PR 2: HTTP adapter migration |
| Delivery strategy | force-chained |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Create `src/shared/validation/` kernel + MCP adapter re-exports | PR 1 | Base: main; standalone deliverable; all tests pass |
| 2 | Migrate HTTP adapter to import from shared | PR 2 | Base: PR 1 branch; fixes arch violation; integration verify |

---

## Phase 1: Foundation — Shared Validation Kernel (PR 1)

- [x] 1.1 **RED** Create failing test for `src/shared/validation/validator.ts` — `validateInput()` behavior (schema validation, error shape)
- [x] 1.2 **GREEN** Create `src/shared/validation/validator.ts` with `validateInput()`, `coercePrimitive()`, `validateRequired()`, `formatValidationError()` moved verbatim from `src/adapters/mcp/validator.ts`
- [x] 1.3 **REFACTOR** Ensure `validator.ts` has zero adapter imports; exports only pure functions
- [x] 1.4 **RED** Create failing test for `src/shared/validation/schemas.ts` — `JsonObjectSchema`, `JsonSchemaProperty`, `JsonSchemaPrimitiveType` type guards
- [x] 1.5 **GREEN** Create `src/shared/validation/schemas.ts` with types moved verbatim from `src/adapters/mcp/schemas/dysflow-schemas.ts`
- [x] 1.6 **RED** Create failing test for `src/shared/validation/schema-props.ts` — `SCHEMA_PROPS`, `CTX_PROPS`, `ACCESS_OVERRIDE`, `STRICT_CTX` atom objects
- [x] 1.7 **GREEN** Create `src/shared/validation/schema-props.ts` with props moved verbatim from `src/adapters/mcp/schemas/dysflow-schemas.ts`
- [x] 1.8 **RED** Create failing test for `src/shared/validation/http-schemas.ts` — `CLEANUP_SCHEMA`, `HTTP_QUERY_SCHEMA`, `HTTP_WRITE_QUERY_SCHEMA`, `HTTP_VBA_EXECUTE_SCHEMA`
- [x] 1.9 **GREEN** Create `src/shared/validation/http-schemas.ts` with HTTP schemas moved verbatim from `src/adapters/mcp/schemas/dysflow-schemas.ts`
- [x] 1.10 Create `src/shared/validation/index.ts` barrel export re-exporting all public API
- [x] 1.11 **RED** Create failing test for `src/adapters/mcp/validator.ts` re-export — imports from `../../shared/validation`, exports same API
- [x] 1.12 **GREEN** Update `src/adapters/mcp/validator.ts` to re-export from `../../shared/validation`
- [x] 1.13 **RED** Create failing test for `src/adapters/mcp/schemas/dysflow-schemas.ts` re-export — imports shared types, re-exports same API
- [x] 1.14 **GREEN** Update `src/adapters/mcp/schemas/dysflow-schemas.ts` to re-export types from `../../shared/validation`
- [x] 1.15 Update `src/adapters/mcp/schemas/index.ts` to re-export shared types (`JsonObjectSchema`, etc.) from `../../shared/validation`
- [x] 1.16 Update `src/adapters/mcp/schemas/query-schemas.ts` to import `SCHEMA_PROPS`, `CTX_PROPS` from `../../shared/validation`
- [x] 1.17 Update `src/adapters/mcp/schemas/vba-sync-schemas.ts` to import `SCHEMA_PROPS`, `CTX_PROPS` from `../../shared/validation`
- [x] 1.18 Update `src/adapters/mcp/dispatch-common.ts` to import `validateInput` from `../../shared/validation`
- [x] 1.19 Run full test suite (`pnpm test`) — all MCP adapter tests must pass
- [x] 1.20 Run TypeScript build (`pnpm build`) — zero errors, no circular dep warnings

---

## Phase 2: HTTP Adapter Migration (PR 2)

- [x] 2.1 **RED** Create failing integration test for `src/adapters/http/server.ts` — validates request body against `HTTP_QUERY_SCHEMA` / `HTTP_WRITE_QUERY_SCHEMA` / `HTTP_VBA_EXECUTE_SCHEMA` / `CLEANUP_SCHEMA`
- [x] 2.2 **GREEN** Update `src/adapters/http/server.ts` to import schemas and `validateInput` from `../../shared/validation` (removes `../mcp/` import)
- [x] 2.3 Verify HTTP adapter compiles and all HTTP-related tests pass
- [x] 2.4 Run full test suite (`pnpm test`) — all tests pass
- [x] 2.5 Run TypeScript build (`pnpm build`) — zero errors
- [x] 2.6 Manual smoke test: `dysflow mcp` starts, tools respond; HTTP server starts, endpoints validate

---

## Phase 3: Verification & Cleanup

- [x] 3.1 Verify no `../mcp/` imports remain in `src/adapters/http/`
- [x] 3.2 Verify `src/shared/validation/` has zero imports from `src/adapters/`
- [x] 3.3 Add lint rule (or document convention) forbidding adapter→adapter imports
- [x] 3.4 Update any documentation referencing old import paths
- [x] 3.5 Final verification: `pnpm test && pnpm build` — all green

---

## Implementation Order Rationale

1. **Phase 1** creates the shared kernel first (no dependencies), then updates MCP adapter to re-export — this is backward-compatible and can be verified independently. All MCP tools continue working.
2. **Phase 2** migrates HTTP adapter — depends on Phase 1 shared kernel being published. This is the architectural fix.
3. **Phase 3** ensures no regressions and documents the new boundary.

Each task is TDD: RED (failing test) → GREEN (implementation) → REFACTOR (cleanup). Test files go alongside source (`*.test.ts`).

## Next Step

Ready for implementation (`sdd-apply`). Chained PRs will be created automatically per `force-chained` strategy: PR 1 (Phase 1) → PR 2 (Phase 2+3).
