# Tasks — #407 AccessOperationRegistry ownership

Ordered, TDD-aware. STRICT TDD: write/adjust the failing test FIRST, then make it pass. Each code
task ends green under `pnpm test`, `tsc --noEmit`, `biome check` (no `any`, no non-null assertions).
Test at the ports; do not assert internal call order or private collaborators.

## 1. Pin the sharing semantics (behavior, at the port)

- [x] 1.1 Add a port-level test (e.g. `test/core/operations/access-operation-registry-sharing.test.ts`)
  that constructs TWO `FileAccessOperationRegistry` instances over the SAME temp file path,
  `create()`s an operation via instance A, and asserts instance B's `listRecent()` returns it.
  This pins the cross-adapter shared-file-path contract independent of the global. (Should pass
  before any code change — it documents the real sharing channel.)

## 2. Remove the global from core (runner)

- [x] 2.1 Add/adjust a test asserting that `new AccessPowerShellRunner()` (no `operationRegistry`)
  records operations into its OWN registry and that two such runners do NOT share state (each gets
  a fresh `InMemoryAccessOperationRegistry`). Drive via the existing executor-injection pattern in
  `test/core/runner/access-runner.test.ts`.
- [x] 2.2 In `src/core/runner/access-runner.ts`: replace `options.operationRegistry ?? defaultRegistry`
  with `options.operationRegistry ?? new InMemoryAccessOperationRegistry()`; DELETE the
  `defaultRegistry` const and the `getDefaultAccessOperationRegistry()` export.
- [x] 2.3 Run `pnpm test` for runner specs + `tsc --noEmit`; fix fallout from the removed export.

## 3. MCP adapter — explicit injection

- [x] 3.1 Adjust/confirm an MCP tools test that `list_access_operations` /
  `dysflow_access_operations_list` returns records from the injected `services.operationRegistry`
  (no global). Use a fake/in-memory registry in the test.
- [x] 3.2 In `src/adapters/mcp/tools.ts`: remove the `?? getDefaultAccessOperationRegistry()`
  fallback at both `:211` and `:308`; remove the now-unused import.
- [x] 3.3 Resolve `DysflowMcpServices.operationRegistry`: read the live type and
  `createUnavailableServices`. If it can be made required, make it required and ensure all
  constructions supply it; otherwise keep optional and construct an explicit local
  `InMemoryAccessOperationRegistry` at the call site (NOT a shared global).
- [x] 3.4 Run `pnpm test` for MCP specs + `tsc --noEmit`.

## 4. HTTP adapter — explicit injection

- [x] 4.1 Confirm/extend the HTTP test (`test/adapters/http/server.test.ts`) that
  `GET /access/operations` returns records created via the injected `FileAccessOperationRegistry`
  over the project file path (covers the same-instance/same-file contract).
- [x] 4.2 In `src/adapters/http/server.ts:148`: remove the `?? getDefaultAccessOperationRegistry()`
  fallback; rely on `context.services.operationRegistry`.
- [x] 4.3 In `src/adapters/http/http-services-factory.ts`: in `createUnavailableHttpServices`,
  replace `getDefaultAccessOperationRegistry()` with `new InMemoryAccessOperationRegistry()`;
  update imports (add core `InMemoryAccessOperationRegistry`, drop the runner global import).
- [x] 4.4 Confirm `test/adapters/http/http-services-factory.test.ts` ("returns a non-null
  operationRegistry") still passes against the explicit instance.
- [x] 4.5 Run `pnpm test` for HTTP specs + `tsc --noEmit`.

## 5. CLI + remaining bare-runner sites

- [x] 5.1 Confirm `src/cli/commands/access.ts:41` and `src/cli/commands/doctor.ts:43` still compile
  with `new AccessPowerShellRunner()` under the private-fallback shape; no behavior change expected
  (these do not expose operation listings). Adjust only if tsc/tests require it.
- [x] 5.2 Grep `getDefaultAccessOperationRegistry` across `src/` and `test/`; ensure ZERO remaining
  references. Update any bare-runner test imports.

## 6. Gates + architecture boundary

- [x] 6.1 Run full `pnpm test`.
- [x] 6.2 Run `tsc --noEmit` and `biome check` — must be clean (no `any`, no `!`).
- [x] 6.3 Confirm `test/architecture/core-boundary.test.ts` passes (core still imports no adapters).
- [x] 6.4 Update `docs/tech-debt/TRACKING.md` #407 entry to DONE with outcome summary.

## Notes

- No behavioral spec delta required (sharing semantics preserved — see design.md).
- Task 1.1 + 2.1 are the pinning tests for the chosen semantics: shared file path stays shared;
  the in-memory fallback is per-runner and never global.
