# Design: Configurable HTTP Bearer Token Authentication

## Technical Approach

Introduce a configurable `httpToken` parameter across the configuration loading pipeline, CLI serve options, and HTTP server middleware. When `httpToken` is configured, the server will intercept all incoming HTTP requests (except `/health`) and validate that they contain a matching Bearer token in the `Authorization` header, rejecting unauthorized requests with a `401 Unauthorized` HTTP status and a standard `HTTP_UNAUTHORIZED` error envelope.

## Architecture Decisions

| Decision | Choice | Rejected alternatives | Rationale |
|----------|--------|-----------------------|-----------|
| **Token Validation Hook** | Implement token verification as an early interceptor in `routeRequest` within `server.ts` (exempting `/health`). | Implement a separate middleware chain; validate at the route level in each controller. | The http adapter is currently a single routing function (`routeRequest`). Adding an early check preserves simplicity and ensures all future routes are protected by default without manual registration. |
| **Exempting `/health`** | Exempt `/health` from bearer authentication. | Require authorization for `/health` as well. | Health check endpoints must remain public so that container runtime probes, load balancers, and external status checkers can perform liveness/readiness checks without accessing secrets. |
| **Configuration Loading** | Resolve `httpToken` (and `httpTokenEnv`) through the standard config loading pipeline (`dysflow-config.ts`), and let `startDysflowHttpServer` automatically resolve it if not explicitly passed. | Load env variables or files directly inside `server.ts` or `serve.ts`. | Consolidates all configuration, defaults, and environment resolving logic inside the core config module, keeping adapters clean and allowing testing with easy programmatic overrides. |
| **Authentication Error Format** | Return a standard `OperationResult<never>` with `ok: false`, error code `HTTP_UNAUTHORIZED`, and status `401`. | Send plain text "Unauthorized" or return HTTP 403. | Maintains consistency with other HTTP adapter error envelopes (like `HTTP_WRITES_DISABLED`, `HTTP_NOT_FOUND`). 401 is the correct HTTP status for missing/invalid credentials, whereas 403 is for forbidden actions. |

## Data Flow

```
HTTP Client ──► Request (e.g. POST /query/read)
                 │
                 ▼
          [server.ts: routeRequest]
                 │
      Is path "/health"?
        ├── Yes ──► Send 200 OK (Public)
        └── No
             │
             ▼
      Is `httpToken` configured?
        ├── No  ──► Proceed to core handlers
        └── Yes
             │
             ▼
      Extract & match `Authorization` header
        ├── Missing/Invalid ──► Return 401 (HTTP_UNAUTHORIZED)
        └── Matches token   ──► Proceed to core handlers
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/config/dysflow-config.ts` | Modify | Add `httpToken` and `httpTokenEnv` to `DysflowConfig`, `DysflowProjectConfig`, `DysflowConfigInput`, and `RedactedDysflowConfig`. Resolve these properties in `buildProjectConfig` and `buildExplicitConfig`. Update `redactDysflowConfig` to mask `httpToken` using `REDACTED_SECRET`. |
| `src/adapters/http/server.ts` | Modify | Add `httpToken?: string` to `StartDysflowHttpServerOptions`. In `startDysflowHttpServer`, resolve `httpToken` using `loadDysflowConfigAsync` if not passed. In `routeRequest`, check the `Authorization` header against the token and reject with 401 `HTTP_UNAUTHORIZED` on mismatch. |
| `src/cli/commands/serve.ts` | Modify | Add `--token <token>` parameter to CLI options. Map it to `httpToken` inside `ServeOptions` and update the `SERVE_USAGE` string. Pass the token to the server options. |
| `test/core/config/dysflow-config.test.ts` | Modify | Add tests to verify `httpToken` loading from environment variables (`DYSFLOW_HTTP_TOKEN`), explicit config inputs, and custom env var overrides, as well as verification of its redaction. |
| `test/adapters/http/server.test.ts` | Modify | Add test scenarios to verify access checks when `httpToken` is configured: (1) request succeeds with valid Bearer token, (2) request fails with 401 when token is missing/invalid, (3) `/health` remains accessible without token. |
| `test/cli/commands/serve.test.ts` | Modify | Add unit tests to verify `--token` argument parsing, missing token value validation, and propagation of the token option to the HTTP server start call. |

## Interfaces / Contracts

### Config Updates (`src/core/config/dysflow-config.ts`)

```typescript
export type DysflowProjectConfig = {
  // ...
  httpToken?: string;
  httpTokenEnv?: string;
};

export type DysflowConfig = {
  // ...
  httpToken?: string;
  httpTokenEnv?: string;
};

export type DysflowConfigInput = {
  // ...
  httpToken?: string;
};
```

### Server Updates (`src/adapters/http/server.ts`)

```typescript
export type StartDysflowHttpServerOptions = {
  // ...
  httpToken?: string;
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| **Unit (Config)** | `httpToken` resolution & redaction | Assert `loadDysflowConfig` extracts `httpToken` from explicit inputs, `DYSFLOW_HTTP_TOKEN` env, or custom config envs. Validate `redactDysflowConfig` returns `"[REDACTED]"`. |
| **Unit (CLI)** | `--token` parsing | Pass `--token <token>` and assert it parses correctly. Verify `--token` with no value returns an error. |
| **Integration (HTTP)** | Bearer validation middleware | Start test server with `httpToken`. Request `/health` (expect 200). Request `/query/read` without header or with wrong token (expect 401 `HTTP_UNAUTHORIZED`). Request `/query/read` with `Authorization: Bearer <valid>` (expect 200). |

## Migration / Rollout

This is a fully backward-compatible, opt-in security improvement.
- If no `httpToken` is configured (default), the API remains completely open locally, preserving existing behavior.
- Rollout is achieved by setting `DYSFLOW_HTTP_TOKEN` in the server environment or passing `--token <value>` to `dysflow serve`.

## Open Questions

- None. The design is complete and utilizes the standard error structures and configuration loading pipelines of the project.
