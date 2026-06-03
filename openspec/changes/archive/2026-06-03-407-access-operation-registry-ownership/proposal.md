# Proposal — #407 AccessOperationRegistry ownership

## Summary

Remove the process-global `AccessOperationRegistry` singleton (`defaultRegistry` /
`getDefaultAccessOperationRegistry()`) from `src/core/runner/access-runner.ts` and make every
consumer construct and inject a registry explicitly from its composition root. The shared-state
coupling between the MCP and HTTP adapters becomes explicit and intentional, and the hidden
module-level mutable global is eliminated.

## Problem

A process-global singleton lives in the core domain:

```ts
// src/core/runner/access-runner.ts
const defaultRegistry = new InMemoryAccessOperationRegistry();           // ~line 118
export function getDefaultAccessOperationRegistry() { return defaultRegistry; } // ~line 121
```

It is reached on `?? fallback` paths in BOTH adapters and in two CLI commands:

- `src/adapters/mcp/tools.ts:211` and `:308` — `services.operationRegistry ?? getDefaultAccessOperationRegistry()`
- `src/adapters/http/server.ts:148` — same fallback on `GET /access/operations`
- `src/adapters/http/http-services-factory.ts:64` — `createUnavailableHttpServices()` degraded mode
- `src/core/runner/access-runner.ts:137` — `AccessPowerShellRunner` constructor default
- `src/cli/commands/access.ts:41` and `src/cli/commands/doctor.ts:43` — `new AccessPowerShellRunner()` with no registry

This is hidden coupling via module-level mutable state. In a process that runs both adapters,
any path that falls through to the global shares operation-tracking state with no explicit
coordination — invisible at the call sites.

### Critical clarification of current behavior (verified in code)

The MCP and HTTP adapters do **NOT** actually share the in-memory global in normal operation.
Both composition roots construct their OWN `FileAccessOperationRegistry` pointing at the SAME
file path `<projectRoot>/.dysflow/runtime/operations.json`:

- MCP: `createConfiguredServices` (`stdio.ts:166`) → `createProjectOperationRegistry(config)`
- HTTP: `createHttpServices` (`http-services-factory.ts:34`) → `new FileAccessOperationRegistry({ filePath: resolveProjectOperationRegistryPath(config) })`

So the real cross-adapter sharing happens through the **file path**, made safe by the registry's
`withFileLock`. The in-memory global `defaultRegistry` is only reached on the fallback paths
listed above (HTTP degraded mode, CLI runners, and tests). It is a fallback safety net, not the
sharing mechanism. This was the intended outcome of the earlier #176 work
(see `openspec/changes/archive/2026-05-21-product-quality-fixes/design.md`), which left the
global "as a test-only fallback" — #407 finishes that job by removing it.

## Goals

- Eliminate the module-global `defaultRegistry` and `getDefaultAccessOperationRegistry()` from core.
- Every composition root (MCP, HTTP, CLI) constructs and injects its registry explicitly.
- The runner no longer falls back to a hidden global; `operationRegistry` becomes required, or the
  runner falls back to a fresh local `InMemoryAccessOperationRegistry` it owns (decided in design).
- Preserve the observable cross-adapter sharing behavior (shared file path), and pin it with a test.

## Non-goals

- No change to the `AccessOperationRegistry` port shape or its two implementations.
- No change to the `.dysflow/runtime/operations.json` file format or location.
- No change to HTTP/MCP endpoint contracts or tool names.

## Design decision (preview — full rationale in design.md)

**Option (a) — explicit injection, behavior-preserving — CHOSEN.**

Remove the global. The genuine cross-adapter sharing is the shared file path, which both
composition roots already establish; that stays intact. The in-memory global was never the
sharing channel, so removing it does not change the cross-adapter observable behavior.

We do NOT adopt option (b) "intentional shared in-memory singleton" because the production
sharing is already file-based and explicit; keeping an in-memory global would re-introduce the
exact hidden coupling we are removing.

## Impact

- `src/core/runner/access-runner.ts` — delete global + getter; make runner registry injection
  explicit (see design for the precise constructor contract).
- `src/adapters/mcp/tools.ts` — drop the `?? getDefaultAccessOperationRegistry()` fallback;
  `services.operationRegistry` is supplied by the composition root.
- `src/adapters/http/server.ts` and `http-services-factory.ts` — same; degraded mode constructs
  an explicit `InMemoryAccessOperationRegistry`.
- `src/cli/commands/access.ts`, `src/cli/commands/doctor.ts` — construct an explicit registry.
- Tests that build a bare `new AccessPowerShellRunner()` relying on the global — updated per the
  chosen runner contract.

## Spec delta

A spec delta IS needed only if observable behavior changes. With option (a) the cross-adapter
sharing behavior is preserved, so no behavioral spec delta is required. The change is captured as
an architecture/composition-root invariant (documented in design.md, pinned by a port-level test).

## Risks

- A consumer that silently relied on the global (CLI, degraded mode) loses its registry if a
  composition root is missed → mitigated by making the runner contract explicit and by tsc/biome.
- Test scaffolding that constructed bare runners must supply a registry → mechanical, covered by
  TDD task ordering.
