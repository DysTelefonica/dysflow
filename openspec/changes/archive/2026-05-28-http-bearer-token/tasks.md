# Tasks: HTTP Bearer Token Authentication

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 250-300 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-chain |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Implement configuration, CLI, and server-side HTTP bearer token auth | PR 1 | Base branch; tests included |

## Phase 1: Core Configuration

- [x] 1.1 Update `src/core/config/dysflow-config.ts` interfaces (`DysflowProjectConfig`, `DysflowConfig`, `RedactedDysflowConfig`, and `DysflowConfigInput`) to include optional `httpToken` and `httpTokenEnv` fields.
- [x] 1.2 Update `buildProjectConfig` and `buildExplicitConfig` in `src/core/config/dysflow-config.ts` to resolve `httpToken` and `httpTokenEnv` (resolving environment variables like `DYSFLOW_HTTP_TOKEN` or custom config environment overrides).
- [x] 1.3 Update `redactDysflowConfig` in `src/core/config/dysflow-config.ts` to replace `httpToken` value with `REDACTED_SECRET`.
- [x] 1.4 Write tests in `test/core/config/dysflow-config.test.ts` to assert `httpToken` resolves correctly from explicit input, standard environment variables, custom environment overrides, and check that it is redacted.

## Phase 2: HTTP Server Authentication

- [x] 2.1 Update `StartDysflowHttpServerOptions` in `src/adapters/http/server.ts` to include optional `httpToken`.
- [x] 2.2 In `startDysflowHttpServer` within `src/adapters/http/server.ts`, resolve `httpToken` using `loadDysflowConfigAsync` when the option is not explicitly passed.
- [x] 2.3 Update `routeRequest` in `src/adapters/http/server.ts` to validate the client `Authorization` header containing `Bearer <token>` against the resolved token. Allow `/health` path without validation.
- [x] 2.4 Return a 401 `HTTP_UNAUTHORIZED` error envelope in `routeRequest` if token is missing or incorrect.
- [x] 2.5 Write tests in `test/adapters/http/server.test.ts` to verify authorization checks: successful queries with valid token, 401 with missing/invalid token, and token-free health checks.

## Phase 3: CLI Commands

- [x] 3.1 Update `ServeOptions` and `SERVE_USAGE` in `src/cli/commands/serve.ts` to include optional `--token <token>`.
- [x] 3.2 Update `parseServeOptions` in `src/cli/commands/serve.ts` to parse `--token` and return error if token value is missing.
- [x] 3.3 Pass parsed `httpToken` to server options inside `handleServeCommand` in `src/cli/commands/serve.ts`.
- [x] 3.4 Write tests in `test/cli/commands/serve.test.ts` verifying argument parsing, missing token validation, and correct option propagation to the server.

## Phase 4: Verification & Cleanup

- [x] 4.1 Run full suite of configuration, CLI serve, and server tests via `vitest`.
- [x] 4.2 Validate formatting and code style using Biome tools.
