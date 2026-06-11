## Exploration: Extract shared HTTP/MCP validation (issue #512)

### Current State

The codebase has validation logic split between HTTP and MCP adapters with a **dependency inversion problem**:

- **`src/adapters/mcp/validator.ts`** — Core validation function `validateInput()` + imports types from `schemas.js`
- **`src/adapters/mcp/schemas/*.ts`** — All JSON schema definitions (`JsonObjectSchema`, `JsonSchemaProperty`, `SCHEMA_PROPS`, `CTX_PROPS`, tool-specific schemas)
- **`src/adapters/http/server.ts`** (lines 27-34) — **Imports from MCP**: `validateInput`, `JsonObjectSchema`, `CLEANUP_SCHEMA`, `HTTP_QUERY_SCHEMA`, `HTTP_WRITE_QUERY_SCHEMA`, `HTTP_VBA_EXECUTE_SCHEMA`
- **MCP dispatch files** (`dispatch-common.ts`, `canonical-handlers.ts`, `tools.ts`, `dispatch-factory.ts`) — All use `validateInput` from `./validator.js`

**Key observation**: HTTP adapter depends on MCP adapter for validation. This violates clean architecture (adapters should not depend on each other). The validation logic and schema types are generic — they have no MCP-specific code.

### Affected Areas

| File | Why Affected |
|------|--------------|
| `src/adapters/http/server.ts` | Imports validator + schemas from `../mcp/` — **must change import paths** |
| `src/adapters/mcp/validator.ts` | Source of `validateInput()` — **must move or re-export** |
| `src/adapters/mcp/schemas/dysflow-schemas.ts` | Defines `JsonObjectSchema`, `JsonSchemaProperty`, `SCHEMA_PROPS`, HTTP schemas — **must move or re-export** |
| `src/adapters/mcp/schemas/query-schemas.ts` | Imports from dysflow-schemas — **must update imports** |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | Imports from dysflow-schemas — **must update imports** |
| `src/adapters/mcp/schemas/index.ts` | Barrel export — **must update or remove** |
| `src/adapters/mcp/dispatch-common.ts` | Uses `validateInput`, `JsonObjectSchema`, `MCP_TOOL_SCHEMAS` — **must update imports** |
| `src/adapters/mcp/canonical-handlers.ts` | Uses `validateInput`, `JsonObjectSchema` — **must update imports** |
| `src/adapters/mcp/tools.ts` | Uses `validateInput`, imports schemas — **must update imports** |
| `src/adapters/mcp/dispatch-factory.ts` | Uses `validateInput`, `JsonObjectSchema`, `mcpSchemaFor` — **must update imports** |

### Approaches

#### Option A: Create `src/shared/validation/` (Recommended)

Move validator + schema types to a new shared folder. Both adapters import from there.

```
src/shared/validation/
├── validator.ts          # validateInput() — pure, no deps
├── types.ts              # JsonObjectSchema, JsonSchemaProperty
├── schema-props.ts       # SCHEMA_PROPS, CTX_PROPS, ACCESS_OVERRIDE, STRICT_CTX
├── http-schemas.ts       # HTTP_QUERY_SCHEMA, HTTP_WRITE_QUERY_SCHEMA, HTTP_VBA_EXECUTE_SCHEMA, CLEANUP_SCHEMA
└── index.ts              # barrel export
```

- **Pros**: Clean separation; adapters don't depend on each other; single source of truth; minimal refactor (just move files + update imports); follows hexagonal architecture (shared kernel)
- **Cons**: New folder to maintain; need to update ~10 import paths across MCP files
- **Effort**: Medium

#### Option B: Move to `src/core/validation/`

Place validation in core domain layer.

```
src/core/validation/
├── validator.ts
├── types.ts
├── schema-props.ts
├── http-schemas.ts
└── index.ts
```

- **Pros**: Validation as domain primitive; core already has contracts/utils
- **Cons**: Core should not know about HTTP-specific schemas (`HTTP_QUERY_SCHEMA` etc.); pollutes core with adapter concerns; MCP tool schemas (`QUERY_EXECUTE_SCHEMA`, `VBA_EXECUTE_SCHEMA`) are MCP-specific and don't belong in core
- **Effort**: Medium-High (requires splitting MCP-specific vs shared schemas)

#### Option C: Keep in MCP, add re-export barrel in `src/adapters/shared/`

Create a thin re-export layer that both adapters consume.

```
src/adapters/shared/
├── validation.ts    # re-exports from mcp/validator + mcp/schemas
└── index.ts
```

- **Pros**: Minimal file moves; HTTP imports from `../shared/validation` instead of `../mcp/`
- **Cons**: Still couples HTTP to MCP's internal structure (just via indirection); doesn't solve the architectural violation; MCP-specific schemas leak into shared
- **Effort**: Low (but technical debt remains)

#### Option D: Split schemas — shared types in core, HTTP schemas in shared, MCP schemas stay in MCP

- `src/core/validation/types.ts` — `JsonObjectSchema`, `JsonSchemaProperty`, `validateInput()`
- `src/shared/validation/http-schemas.ts` — HTTP-only schemas
- MCP keeps its own tool schemas (`QUERY_EXECUTE_SCHEMA`, `VBA_EXECUTE_SCHEMA`, etc.)

- **Pros**: Cleanest separation of concerns; core owns primitive types; HTTP owns HTTP schemas; MCP owns MCP schemas
- **Cons**: Most files to touch; `validateInput` in core but uses types from core — circular if not careful; over-engineering for current scope
- **Effort**: High

### Recommendation

**Option A** — Create `src/shared/validation/` with:
- `validator.ts` (moved from mcp)
- `types.ts` (JsonObjectSchema, JsonSchemaProperty — moved from dysflow-schemas)
- `schema-props.ts` (SCHEMA_PROPS, CTX_PROPS, ACCESS_OVERRIDE, STRICT_CTX — moved from dysflow-schemas)
- `http-schemas.ts` (HTTP_QUERY_SCHEMA, HTTP_WRITE_QUERY_SCHEMA, HTTP_VBA_EXECUTE_SCHEMA, CLEANUP_SCHEMA — moved from dysflow-schemas)
- `index.ts` (barrel export)

**Migration steps**:
1. Create `src/shared/validation/` with the 5 files above
2. Update `src/adapters/http/server.ts` imports → `../../shared/validation`
3. Update all MCP files to import from `../../shared/validation` (or `../shared/validation` from mcp/)
4. Delete `src/adapters/mcp/validator.ts`
5. Keep MCP-specific schemas (`QUERY_EXECUTE_SCHEMA`, `VBA_EXECUTE_SCHEMA`, `QUERY_TOOL_SCHEMAS`, `VBA_SYNC_TOOL_SCHEMAS`) in `src/adapters/mcp/schemas/` — they import shared types from `../../shared/validation`

**Why not Option D**: The HTTP schemas (`CLEANUP_SCHEMA`, `HTTP_QUERY_SCHEMA`, etc.) are already defined in `dysflow-schemas.ts` alongside MCP schemas. Moving just the types to core and leaving HTTP schemas in shared creates an awkward split. Option A keeps all *shared* validation concerns together.

### Risks

| Risk | Mitigation |
|------|------------|
| Import path breakage across 10+ files | Do it in one commit; use IDE refactor/find-replace; run `pnpm test` after |
| MCP tool schemas (`QUERY_TOOL_SCHEMAS`, `VBA_SYNC_TOOL_SCHEMAS`) still import from dysflow-schemas — must update to import shared types from new location | Update `query-schemas.ts` and `vba-sync-schemas.ts` to import `SCHEMA_PROPS`, `CTX_PROPS`, etc. from `../../shared/validation` |
| Circular dependency if `shared/validation` imports from `core` and `core` imports from `shared` | `shared/validation` has **zero dependencies** on core or adapters — it's pure types + pure function |
| HTTP schemas used by MCP cleanup handler (`CLEANUP_SCHEMA`) | `CLEANUP_SCHEMA` moves to shared; MCP imports from shared — no issue |

### Ready for Proposal

**Yes** — The analysis is complete. The recommended approach (Option A) is clear, low-risk, and follows clean architecture. The orchestrator should proceed to `sdd-propose` with this exploration as input.
