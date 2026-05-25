# Tasks: HTTP Adapter Dependency Injection

**Change**: http-adapter-di
**Delivery**: 2 PRs (stacked to main)
**Review workload forecast**: Low — each PR targets ~60-90 changed lines
**Decision needed before apply**: No
**Chained PRs recommended**: Yes (logical separation, not size)
**400-line budget risk**: Low

---

## PR1: Define service factory + remove inline construction from server.ts

**Branch**: `feat/http-adapter-di-factory`
**Target**: `main`
**Estimated diff**: ~80 lines added, ~40 removed

### Task 1.1 — Write failing tests for the new factory

**File**: `test/adapters/http/http-services-factory.test.ts` (Create)

Steps (strict TDD — tests first):
1. Write a test: `createUnavailableHttpServices()` returns an object where each service method resolves to `{ ok: false, error: { code: "SERVICE_UNAVAILABLE" } }`.
2. Write a test: `createUnavailableHttpServices()` returns a non-null `operationRegistry`.
3. Write a test: `createHttpServices()` with `cwd` pointing to a temp directory with no `.dysflow/` config falls back gracefully (returns services, does not throw).
4. Run `pnpm test` — all new tests MUST FAIL (factory file does not exist yet).

### Task 1.2 — Create the factory module

**File**: `src/adapters/http/http-services-factory.ts` (Create)

Steps:
1. Move `createCoreServices()` from `server.ts` into this file. Rename to `createHttpServices`. Export it.
2. Move `createUnavailableHttpServices()` from `server.ts` into this file. Export it.
3. Keep all imports that belong to construction logic (e.g., `AccessPowerShellRunner`, `FileAccessOperationRegistry`, `WindowsMsAccessProcessInspector`, `WindowsProcessKiller`, `AccessOperationCleanupService`).
4. Run `pnpm test` — factory tests MUST NOW PASS. `server.test.ts` may have compile errors (addressed next).

### Task 1.3 — Update server.ts to use the factory

**File**: `src/adapters/http/server.ts` (Modify)

Steps:
1. Remove `createCoreServices` and `createUnavailableHttpServices` from this file.
2. Remove the construction-specific imports (runners, registries, process classes).
3. Add `import { createHttpServices } from "./http-services-factory.js"`.
4. On line 58 (was `options.services ?? await createCoreServices(options.env, options.cwd)`), change to `options.services ?? await createHttpServices(options.env, options.cwd)`.
5. Remove the inline `new AccessOperationCleanupService(...)` fallback inside the `/access/cleanup` route handler (was line 142). The handler should now read:
   ```ts
   const cleanupService = context.services.cleanupService;
   if (cleanupService === undefined) {
     sendOperationResult(response, failureResult(createDysflowError("SERVICE_UNAVAILABLE", "Cleanup service is not configured.")));
     return;
   }
   sendOperationResult(response, await cleanupService.cleanup({ ... }));
   ```
6. Run `pnpm test` — all tests including `server.test.ts` MUST PASS.
7. Run `pnpm build` — no TypeScript errors.

### Task 1.4 — Verify and commit

1. `pnpm test` — green.
2. `pnpm build` — clean.
3. Commit: `refactor(http): extract http-services-factory and remove inline construction`

---

## PR2: Add cleanup-route injection test + wire serve.ts as explicit composition root

**Branch**: `feat/http-adapter-di-serve`
**Target**: `main` (after PR1 merged)
**Estimated diff**: ~40 lines added, ~5 removed

### Task 2.1 — Write failing test for cleanup route DI coverage

**File**: `test/adapters/http/server.test.ts` (Modify)

Steps (strict TDD — tests first):
1. Add a test: POST `/access/cleanup` with an injected `cleanupService` fake calls the fake's `cleanup` method with the correct `operationId` and `accessPath`.
2. Add a test: POST `/access/cleanup` when `cleanupService` is absent (not in injected services) returns `SERVICE_UNAVAILABLE` 500.
3. Run `pnpm test` — the second test (missing service case) MUST FAIL until Task 1.3 step 5 is applied (or if already applied in PR1, both pass immediately — that is fine; verify the case is covered).

### Task 2.2 — Document serve.ts as the composition root (no-op if already correct)

**File**: `src/cli/commands/serve.ts` (Modify — add a JSDoc comment only if no code change needed)

Steps:
1. Review `handleServeCommand`: confirm it passes `env` and `cwd` to `startDysflowHttpServer` which delegates to the factory. If this is already working correctly, add a single JSDoc comment above `handleServeCommand`:
   ```ts
   /**
    * Composition root for the HTTP adapter.
    * Concrete service construction is delegated to createHttpServices() via startDysflowHttpServer.
    */
   ```
2. No functional change needed in `serve.ts` unless the code review of step 1 reveals a gap.

### Task 2.3 — Final verification

1. `pnpm test` — all tests green.
2. `pnpm build` — clean.
3. Review the complete diff: confirm no `new AccessPowerShellRunner`, `new WindowsMsAccessProcessInspector`, `new WindowsProcessKiller`, or `new FileAccessOperationRegistry` remain in `server.ts`.
4. Commit: `test(http): cover cleanup-route DI and document serve.ts as composition root`

---

## Checklist

- [ ] PR1: `http-services-factory.ts` created and exports `createHttpServices` + `createUnavailableHttpServices`
- [ ] PR1: `server.ts` has no concrete construction (no `new Runner`, `new Registry`, `new Inspector`, `new Killer`)
- [ ] PR1: inline cleanup fallback removed from `routeRequest`
- [ ] PR1: all existing `server.test.ts` tests pass
- [ ] PR2: cleanup route DI test covers both the happy path and the missing-service case
- [ ] PR2: `pnpm test` and `pnpm build` both green
