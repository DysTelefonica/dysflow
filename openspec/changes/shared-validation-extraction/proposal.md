# Proposal: Shared Validation Extraction

## Intent

Extract the shared validation logic (`validateInput`, JSON schema types, and HTTP schemas) from the MCP adapter into a shared location so both MCP and HTTP adapters can depend on it without violating hexagonal architecture. Currently `src/adapters/http/server.ts` imports from `../mcp/` which is an adapter-to-adapter dependency forbidden by clean architecture.

## Scope

### In Scope
- Move `validateInput()` + helpers from `src/adapters/mcp/validator.ts` → `src/shared/validation/validator.ts`
- Move schema types (`JsonObjectSchema`, `JsonSchemaProperty`, `JsonSchemaPrimitiveType`) from `src/adapters/mcp/schemas/dysflow-schemas.ts` → `src/shared/validation/schemas.ts`
- Move HTTP-specific schemas (`CLEANUP_SCHEMA`, `HTTP_QUERY_SCHEMA`, `HTTP_WRITE_QUERY_SCHEMA`, `HTTP_VBA_EXECUTE_SCHEMA`) → `src/shared/validation/http-schemas.ts`
- Move shared property atoms (`SCHEMA_PROPS`, `CTX_PROPS`, `ACCESS_OVERRIDE`, `STRICT_CTX`) → `src/shared/validation/schema-props.ts`
- Update `src/adapters/mcp/validator.ts` to re-export from shared location
- Update `src/adapters/mcp/schemas/dysflow-schemas.ts` to re-export from shared location
- Update `src/adapters/http/server.ts` to import from `src/shared/validation/`
- Update `src/adapters/mcp/dispatch-common.ts` to import validator from shared location
- Update `src/adapters/mcp/schemas/index.ts` to re-export shared types
- Update `src/adapters/mcp/schemas/query-schemas.ts` to import shared props from shared location
- Update `src/adapters/mcp/schemas/vba-sync-schemas.ts` to import shared props from shared location
- Create `src/shared/validation/index.ts` barrel export

### Out of Scope
- MCP tool schemas (`MCP_TOOL_SCHEMAS`, `QUERY_TOOL_SCHEMAS`, `VBA_SYNC_TOOL_SCHEMAS`) — stay in `src/adapters/mcp/schemas/`
- Core domain contracts (`OperationResult`, `AccessQueryRequest`, etc.) — stay in `src/core/contracts/`
- HTTP routing logic, request/response handling — stays in `src/adapters/http/server.ts`
- MCP dispatch logic — stays in `src/adapters/mcp/dispatch*.ts`

## Capabilities

### New Capabilities
- `shared-validation`: Core validation engine (validateInput + JSON schema type system) usable by any adapter

### Modified Capabilities
- None — this is infrastructure extraction, no domain behavior changes

## Approach

Create `src/shared/validation/` as a new shared kernel (not core domain) containing pure validation logic with zero dependencies on adapters or external services. Both adapters depend on shared, eliminating the adapter→adapter violation.

File structure:
```
src/shared/validation/
├── index.ts              # barrel export
├── validator.ts          # validateInput + helpers (moved from mcp/validator.ts)
├── schemas.ts            # JsonObjectSchema, JsonSchemaProperty, JsonSchemaPrimitiveType
├── schema-props.ts       # SCHEMA_PROPS, CTX_PROPS, ACCESS_OVERRIDE, STRICT_CTX
└── http-schemas.ts       # CLEANUP_SCHEMA, HTTP_QUERY_SCHEMA, HTTP_WRITE_QUERY_SCHEMA, HTTP_VBA_EXECUTE_SCHEMA
```

Migration strategy:
1. Create new files in `src/shared/validation/` with moved code
2. Update MCP adapter files to re-export from shared (backward compatible)
3. Update HTTP adapter to import from shared
4. Verify no circular deps; run tests

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/shared/validation/` | New | New shared validation kernel |
| `src/adapters/mcp/validator.ts` | Modified | Re-export from shared |
| `src/adapters/mcp/schemas/dysflow-schemas.ts` | Modified | Re-export from shared |
| `src/adapters/mcp/schemas/index.ts` | Modified | Re-export shared types |
| `src/adapters/mcp/schemas/query-schemas.ts` | Modified | Import shared props |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | Modified | Import shared props |
| `src/adapters/mcp/dispatch-common.ts` | Modified | Import validator from shared |
| `src/adapters/http/server.ts` | Modified | Import from shared (fixes arch violation) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Circular dependency if shared imports back from adapters | Low | Shared has zero imports from adapters; enforce via lint rule |
| Breaking existing MCP tool schemas | Low | MCP adapter re-exports maintain same public API |
| Type mismatches between old/new locations | Low | Move code verbatim; TypeScript catches drift |

## Rollback Plan

Revert the 9 modified files + delete `src/shared/validation/` directory. No database/schema changes.

## Dependencies

- None (pure TypeScript, no external deps)

## Success Criteria

- [ ] `src/adapters/http/server.ts` no longer imports from `../mcp/`
- [ ] All existing tests pass (`pnpm test`)
- [ ] TypeScript compiles with no errors (`pnpm build`)
- [ ] No circular dependency warnings
- [ ] MCP tools still work (manual smoke test via `dysflow mcp`)

## Ready for Spec

Yes