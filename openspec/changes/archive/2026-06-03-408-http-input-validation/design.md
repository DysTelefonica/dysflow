# Design: HTTP Request Input Validation and Secret Sanitization

## Technical Approach

Introduce schema validation for POST request bodies on the HTTP adapter boundary (`/access/cleanup`, `/query/read`, `/query/write`, `/vba/execute`). We import `validateInput` from the MCP validator module and check all incoming POST payloads. If validation fails, we return `400 Bad Request` with an operation failure envelope (`HTTP_INVALID_INPUT`), ensuring any configured secrets are redacted from the validation message via `sanitizeSecrets` before returning to the client.

To perform sanitization, the HTTP server's internal routing context will retrieve active secrets (`httpToken`, `accessPassword`, `backendPassword`) during startup via `loadDysflowConfigAsync`.

## Architecture Decisions

| Decision | Choice | Rejected alternatives | Rationale |
|---|---|---|---|
| **Reuse MCP Validator** | Import and reuse `validateInput` from `src/adapters/mcp/validator.ts` directly. | Rewrite validator or use third-party library. | Promotes DRY, keeps the codebase small, and guarantees parity with existing MCP schemas. |
| **Schema Location** | Define HTTP-specific schemas in `src/adapters/mcp/schemas/dysflow-schemas.ts`. | Define inline in `server.ts` or in a new HTTP schema file. | Centralizes schema definition alongside all core dysflow validation structures. |
| **Validation Error Handling** | Reject with `400 Bad Request` and error code `HTTP_INVALID_INPUT`. | Return generic 500 or throw raw errors. | Standardizes client API contracts and ensures clear failure attribution. |
| **Secret Sanitization** | Pass resolved passwords to the routing context and apply `sanitizeSecrets`. | Sanitize only at the client or log levels. | Guards against accidental exposure of critical database/Bearer credentials. |

## Data Flow

```
HTTP Client ──► Request Body ──► [validateInput]
                                    │
                                    ├── [Valid] ──► Execute Core Service ──► Response
                                    │
                                    └── [Invalid] ──► [sanitizeSecrets] ──► 400 Bad Request
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/adapters/mcp/schemas/dysflow-schemas.ts` | Modify | Define `HTTP_QUERY_SCHEMA` and `HTTP_VBA_EXECUTE_SCHEMA`. Add `minLength: 1` to `operationId` in `CLEANUP_SCHEMA`. |
| `src/adapters/http/server.ts` | Modify | Import schemas, `validateInput`, and `sanitizeSecrets`. Retrieve `accessPassword` and `backendPassword` in `startDysflowHttpServer` via `loadDysflowConfigAsync` and include them in the routing context. Perform validation and sanitization for POST routes. |
| `test/adapters/http/server.test.ts` | Modify | Add tests for missing/invalid properties on POST routes, additional properties, and redaction verification of `httpToken`, `accessPassword`, and `backendPassword` inside error messages. |

## Interfaces / Contracts

### New schemas in `src/adapters/mcp/schemas/dysflow-schemas.ts`

```typescript
export const HTTP_QUERY_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["sql"],
  additionalProperties: false,
  properties: { sql: { type: "string", minLength: 1 } },
};

export const HTTP_VBA_EXECUTE_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["moduleName", "procedureName"],
  additionalProperties: false,
  properties: {
    moduleName: { type: "string", minLength: 1 },
    procedureName: { type: "string", minLength: 1 },
    arguments: { type: "array", items: {} },
  },
};
```

### Route Context updates in `src/adapters/http/server.ts`

```typescript
type RouteContext = {
  services: DysflowHttpServices;
  writesEnabled: boolean;
  maxBodyBytes: number;
  httpToken?: string;
  allowedProcedures?: readonly string[];
  accessPassword?: string;
  backendPassword?: string;
};
```

## Testing Strategy

- **Invalid payloads**: Send missing required fields, incorrect parameter types, and extra properties to POST endpoints. Assert response is `400 Bad Request` with `HTTP_INVALID_INPUT`.
- **Secret Redaction**: Configure the server with active secrets. Send requests containing secret values in invalid property names (e.g. `{ "my-secret-token": 1 }`). Assert the output error message redacts the secret to `[REDACTED]`.

## Migration / Rollout

No rollout impact; this change is backward-compatible for all clients conforming to the existing documented HTTP endpoints.

## Open Questions

None.
