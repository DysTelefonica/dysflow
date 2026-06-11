# Design: Shared Validation Extraction

## Technical Approach

Extract validation logic and JSON schema types from the MCP adapter into a protocol-neutral shared kernel at `src/shared/validation/`. Both MCP and HTTP adapters import from this kernel, eliminating the forbidden adapter-to-adapter dependency (`src/adapters/http/server.ts` → `src/adapters/mcp/`).

The shared kernel is a **shared kernel** (DDD term) — not a core domain module, not an adapter. It owns pure validation functions and schema type contracts with zero dependencies on adapters or external services. Core domain utilities (`isRecord`) are the only core dependency.

**Current state**: The shared kernel already exists. MCP adapter re-exports are complete. The HTTP adapter still imports from `../mcp/` — that's the remaining violation to fix in PR 2.

## Architecture Decisions

### Decision: Shared kernel location

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `src/core/validation/` | Violates hexagonal rules — validation is not domain logic | Rejected |
| `src/shared/validation/` | Clean separation; adapters depend inward, shared has no adapter deps | **Chosen** |
| Inline in each adapter | Duplicates code; drift risk | Rejected |

**Rationale**: Validation is protocol-agnostic infrastructure. Placing it in `src/shared/` follows the hexagonal convention: shared kernel sits between core and adapters, depending on nothing outside itself.

### Decision: Re-export shims for MCP backward compatibility

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Move + break MCP imports | Forces all MCP consumers to update paths | Rejected |
| Move + re-export from old paths | Zero churn for MCP consumers; identity-preserving | **Chosen** |
| Copy code to shared, delete from MCP | Duplication; two sources of truth | Rejected |

**Rationale**: `export { validateInput } from "../../shared/validation/validator.js"` is an identity re-export — same runtime value, same TypeScript type. MCP tool schemas, dispatch, and tests continue resolving without path changes.

### Decision: HTTP schemas live in shared kernel

| Option | Tradeoff | Decision |
|--------|----------|----------|
| HTTP schemas in `src/adapters/http/` | HTTP adapter owns its schemas; but MCP also references some | Rejected |
| HTTP schemas in `src/shared/validation/` | Both adapters can reference; schemas are protocol-neutral | **Chosen** |

**Rationale**: `CLEANUP_SCHEMA`, `HTTP_QUERY_SCHEMA`, etc. are pure data (JSON schema objects). They have no HTTP runtime dependency. Placing them in shared avoids future cross-adapter imports.

## Data Flow

```
HTTP request → src/adapters/http/server.ts
                    │
                    ├── validateInput()     ← src/shared/validation/validator.ts
                    ├── HTTP_QUERY_SCHEMA   ← src/shared/validation/http-schemas.ts
                    └── SCHEMA_PROPS        ← src/shared/validation/schema-props.ts

MCP tool call → src/adapters/mcp/dispatch-common.ts
                    │
                    ├── validateInput()     ← src/shared/validation/validator.ts
                    └── MCP_TOOL_SCHEMAS    ← src/adapters/mcp/schemas/index.ts
                            └── re-exports ← src/shared/validation/index.ts
```

Both adapters reach inward to the shared kernel. Neither reaches laterally to the other.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/adapters/http/server.ts` | **Modify** | Replace 3 imports from `../mcp/` with imports from `../../shared/validation/` |
| `test/architecture/adapter-boundary.test.ts` | **Create** | Lint-style test: scan `src/adapters/http/` for `../mcp/` imports; fail if found |
| (no other files) | — | Shared kernel, MCP re-exports, and tests already exist |

## Interfaces / Contracts

```typescript
// src/shared/validation/validator.ts — already exists, unchanged
export function validateInput(input: unknown, schema: JsonObjectSchema): string | undefined;

// HTTP adapter import change (before → after):
// BEFORE: import { validateInput } from "../mcp/validator.js";
// AFTER:  import { validateInput } from "../../shared/validation/validator.js";

// BEFORE: import type { JsonObjectSchema } from "../mcp/schemas/dysflow-schemas.js";
// AFTER:  import type { JsonObjectSchema } from "../../shared/validation/schemas.js";

// BEFORE: import { CLEANUP_SCHEMA, ... } from "../mcp/schemas.js";
// AFTER:  import { CLEANUP_SCHEMA, ... } from "../../shared/validation/index.js";
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `validateInput` schema validation, error shape | 4 test files in `test/shared/validation/` (already exist) |
| Architecture | No `../mcp/` imports in HTTP adapter | New `adapter-boundary.test.ts` — scan source files with regex, same pattern as `core-boundary.test.ts` |
| Integration | HTTP endpoints validate request bodies | Existing HTTP adapter tests (unchanged) |
| E2E | MCP tools still work; HTTP server starts | `pnpm test` + manual smoke |

## Migration / Rollout

**PR 1** (already complete): Shared kernel + MCP re-exports. All tests pass. No behavior change.

**PR 2** (this change):
1. Update 3 import lines in `src/adapters/http/server.ts`
2. Add `adapter-boundary.test.ts`
3. Run `pnpm test && pnpm build` — zero errors
4. Manual smoke: `dysflow mcp` tools respond; HTTP server validates

No database migration. No feature flags. No runtime behavior change — pure import path rewiring.

## Open Questions

- [ ] Should the adapter boundary test also scan `src/adapters/mcp/` for `../http/` imports? (currently only checks HTTP → MCP direction)
- [ ] Consider adding an ESLint rule (`no-restricted-imports`) to enforce boundaries at lint time, not just test time
