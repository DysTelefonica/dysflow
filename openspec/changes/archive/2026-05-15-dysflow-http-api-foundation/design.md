# Design: Dysflow HTTP API Foundation

## Technical Approach

Build Dysflow inside-out as a TypeScript CLI product. The first implementation slice establishes `pnpm test` and the package/TypeScript skeleton because Strict TDD is active and this repo currently has no runner. Core configuration, operation contracts, and Access services come before adapters. `dysflow mcp` wraps the core through MCP stdio; `dysflow serve` is deliberately the final HTTP adapter over the same services, not a shortcut around them.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Test foundation first | Create Node 20+/TypeScript/pnpm skeleton with Vitest and `pnpm test` before production modules. | Reuse old `node --test` CommonJS setup. | New product is TypeScript-first; Strict TDD needs one stable runner before any core code. |
| Core dependency direction | `src/core/**` has no MCP/HTTP imports; adapters depend inward. | Direct HTTP/MCP calls to PowerShell wrappers. | Prevents protocol leakage and keeps HTTP as a final adapter. |
| Legacy compatibility | Treat `C:\Proyectos\workflow\skills\dysflow` as a reference and fallback target, never modify it in this change. | In-place migration of old MCP skill. | Existing production MCP remains safe while the product adapter is proven. |
| Runner boundary | Wrap PowerShell/Access behavior behind `AccessRunner` and service interfaces. | Import sibling skill handlers directly into HTTP routes. | Centralizes timeout, redaction, diagnostics, and fake-runner tests. |
| HTTP server | Add a small local-first server adapter late, binding `127.0.0.1` by default with writes disabled. | Public network API by default. | Production scripts need stability, but Access writes must be explicit and guarded. |

## Data Flow

```text
CLI command
  -> command handler
  -> core config + core service
  -> AccessRunner boundary
  -> PowerShell/Access process
  -> protocol-neutral OperationResult
  -> MCP adapter OR HTTP adapter response
```

HTTP never calls PowerShell directly. MCP preserves stdio safety from the old implementation, including stdout silence.

## File Changes

| File | Action | Description |
|---|---|---|
| `C:\Proyectos\dysflow\package.json` | Create | Package metadata, `bin.dysflow`, `pnpm test`, `pnpm build`. |
| `C:\Proyectos\dysflow\tsconfig.json` | Create | Strict TypeScript build config. |
| `C:\Proyectos\dysflow\vitest.config.ts` | Create | Test runner config; first slice target. |
| `C:\Proyectos\dysflow\src/cli/index.ts` | Create | CLI entrypoint and command dispatch. |
| `C:\Proyectos\dysflow\src/cli/commands/*.ts` | Create | `mcp`, `setup`, `doctor`, `tui`, `serve` handlers; `serve` initially planned/not operational. |
| `C:\Proyectos\dysflow\src/core/config/dysflow-config.ts` | Create | Resolve paths, passwords, timeouts, redacted config. |
| `C:\Proyectos\dysflow\src/core/contracts/*.ts` | Create | Protocol-neutral request/result/error contracts. |
| `C:\Proyectos\dysflow\src/core/runner/access-runner.ts` | Create | Bounded PowerShell runner interface and implementation. |
| `C:\Proyectos\dysflow\src/core/services/*.ts` | Create | VBA, query, diagnostics services over runner. |
| `C:\Proyectos\dysflow\src/adapters/mcp/*` | Create | MCP tool registration and stdio bootstrap over core. |
| `C:\Proyectos\dysflow\src/adapters/http/*` | Create late | Local HTTP routes/contracts over core services. |
| `C:\Proyectos\dysflow\test/**` | Create | Unit/adapter tests using fake runners; no production Access files. |
| `C:\Proyectos\dysflow\docs/architecture/dysflow-core-and-adapters.md` | Create | Dependency direction and compatibility notes. |
| `C:\Proyectos\dysflow\docs/api/http-api.md` | Create late | HTTP policy, schemas, script examples. |

## Interfaces / Contracts

Core result shape:

```ts
type OperationResult<T> =
  | { ok: true; data: T; diagnostics: Diagnostic[]; durationMs: number }
  | { ok: false; error: DysflowError; diagnostics: Diagnostic[]; durationMs: number };
```

Core service ports: `ConfigurationService`, `DiagnosticsService`, `AccessVbaService`, `AccessQueryService`, and `AccessRunner`. Adapters translate only at the boundary: MCP content blocks or HTTP status/JSON.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Foundation | `pnpm test` exists and runs failing/passing tests. | First slice creates Vitest config and a CLI help test. |
| Unit | Config resolution, redaction, result contracts, timeout mapping. | Pure tests with fake env and fake runner. |
| Integration | MCP registration, CLI handlers, HTTP routes. | In-process adapters with fake services; assert no stdout pollution for MCP. |
| E2E | Real Access/PowerShell smoke behavior. | Later opt-in smoke tests only against controlled fixtures, never production files. |

## Migration / Rollout

No data migration required. Roll out as reviewable slices: test foundation, CLI/config/contracts, core services, MCP adapter, setup/doctor docs, then HTTP. Keep `C:\Proyectos\workflow\skills\dysflow` untouched until replacement confidence is proven.

## Open Questions

- [ ] Which HTTP server library is approved for the final adapter: Node built-in server, Fastify, or Hono?
