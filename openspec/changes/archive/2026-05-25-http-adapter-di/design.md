# Design: HTTP Adapter Dependency Injection

## Technical Approach

Extract the concrete-construction logic from `createCoreServices()` inside `server.ts` into a standalone
factory function exported from a new `src/adapters/http/http-services-factory.ts` module, then make
`serve.ts` (the composition root) call the factory and pass the result through `StartDysflowHttpServerOptions.services`.
The `DysflowHttpServices` interface that already exists in `server.ts` remains the boundary contract — no changes to its shape.

## Architecture Decisions

| Decision | Choice | Rejected alternatives | Rationale |
|----------|--------|-----------------------|-----------|
| Reuse `DysflowHttpServices` or introduce a new interface | Reuse existing `DysflowHttpServices` | Introduce a separate `HttpCoreServices` type; unify with `DysflowMcpServices` | The interface already exists and is already used by tests. MCP adds `onProgress` signatures — merging would widen the HTTP contract unnecessarily. |
| Where the factory lives | New file `src/adapters/http/http-services-factory.ts` | Inline inside `serve.ts`; keep inside `server.ts` | Keeps `serve.ts` thin (CLI concerns only). Keeps `server.ts` a pure request-routing module. Factory is independently testable. |
| Composition root | `src/cli/commands/serve.ts` | `src/adapters/http/server.ts` stays as root | `serve.ts` already has the `startHttpAdapter` injection hook, making it the natural CLI entry point. Pushing construction to the adapter would leave the adapter with infrastructure-creation responsibilities. |
| Second construction site in `routeRequest` (line 142) | Remove the inline `new AccessOperationCleanupService(...)` fallback from `routeRequest`; rely on the injected `cleanupService` | Keep fallback, add a warning | The fallback bypasses DI silently and creates untestable code paths. Removing it forces callers to always provide a complete `DysflowHttpServices`. The factory always wires cleanup, so production is unaffected. |
| Factory signature | `createHttpServices(env?, cwd?): Promise<DysflowHttpServices>` | `createHttpServices(config): DysflowHttpServices` (sync) | Config loading is already async (`loadDysflowConfigAsync`). Keeping async is consistent with existing `createCoreServices`. |

## Data Flow

```
serve.ts (composition root)
  │
  ├─► createHttpServices(env, cwd)       [http-services-factory.ts]
  │     └─► loadDysflowConfigAsync()
  │           ok  ──► new FileAccessOperationRegistry
  │                    new AccessPowerShellRunner
  │                    new AccessDiagnosticsService
  │                    new AccessQueryService
  │                    new AccessVbaService
  │                    new AccessOperationCleanupService
  │                        new WindowsMsAccessProcessInspector
  │                        new WindowsProcessKiller
  │           fail ──► createUnavailableHttpServices()
  │
  └─► startDysflowHttpServer({ services, ...opts })   [server.ts]
        └─► routeRequest(req, res, { services, ... })
              uses services.diagnosticsService
              uses services.queryService
              uses services.vbaService
              uses services.operationRegistry
              uses services.cleanupService     ← no inline fallback
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/adapters/http/http-services-factory.ts` | Create | Exports `createHttpServices(env?, cwd?)` and `createUnavailableHttpServices()`. Contains all concrete construction. |
| `src/adapters/http/server.ts` | Modify | Remove `createCoreServices` and `createUnavailableHttpServices`. Remove inline `new ...` fallback at cleanup route. Call factory via the `services ?? await createHttpServices(...)` pattern using the imported factory. |
| `src/cli/commands/serve.ts` | Modify | Import and call `createHttpServices` before calling `startDysflowHttpServer`, OR pass `env`/`cwd` and let `server.ts` delegate to factory (chosen: keep current delegation — serve.ts passes `env` and lets server use factory). |
| `test/adapters/http/http-services-factory.test.ts` | Create | Unit tests for `createUnavailableHttpServices` shape; integration smoke test for `createHttpServices` with a missing config directory. |
| `test/adapters/http/server.test.ts` | Modify | Add a test that verifies the cleanup route uses the injected `cleanupService` (covers the removed inline fallback). |

## Interfaces / Contracts

`DysflowHttpServices` (unchanged — already in `server.ts`):
```ts
export type DysflowHttpServices = {
  diagnosticsService: { run(request?: { includeEnvironment?: boolean }): Promise<OperationResult<AccessDiagnosticsResult>> };
  queryService: { execute(request: AccessQueryRequest): Promise<OperationResult<AccessQueryResult>> };
  vbaService: { execute(request: AccessVbaRequest): Promise<OperationResult<AccessVbaResult>> };
  operationRegistry?: AccessOperationRegistry;
  cleanupService?: { cleanup(request: { operationId: string; accessPath: string; force?: boolean }): Promise<OperationResult<AccessCleanupResult>> };
};
```

New factory export:
```ts
// src/adapters/http/http-services-factory.ts
export async function createHttpServices(
  env?: Record<string, string | undefined>,
  cwd?: string,
): Promise<DysflowHttpServices>

export function createUnavailableHttpServices(): DysflowHttpServices
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `createUnavailableHttpServices` returns services that resolve to SERVICE_UNAVAILABLE | Vitest: call each service method, assert error code |
| Integration | `createHttpServices` with no config (empty tempdir) falls back to unavailable services | Vitest: mkdtemp, call factory, assert diagnostics returns SERVICE_UNAVAILABLE |
| Integration | Cleanup route uses the injected `cleanupService` and does NOT construct its own | Vitest: inject a fake `cleanupService`, assert it is called; confirm no extra construction paths |
| Existing | All current `server.test.ts` tests continue to pass unchanged | `pnpm test` green |

## Migration / Rollout

No migration required. The change is purely internal to the adapter layer. The public API of `startDysflowHttpServer` and `DysflowHttpServices` are unchanged. `serve.ts` gains no new CLI flags. Tests pass the same injected services as before.

## Open Questions

- None. The design is self-contained.
