# Apply Progress: PowerShell Executor Port

## Status

- Change: `powershell-executor-port`
- Mode: Strict TDD
- Scope completed: full port extraction, adapter relocation, composition-root wiring, E2E fixture call-site migration, and verification
- Partial: No
- Remaining tasks: None

## Completed Tasks

- [x] 1.1 Export formal PowerShell executor contract types from `src/core/contracts/index.ts`.
- [x] 1.2 Move default PowerShell process implementation to `src/adapters/powershell/default-executor.ts`.
- [x] 2.1 Refactor `AccessPowerShellRunner` to require an injected executor and remove the core concrete executor import.
- [x] 2.2 Point VBA sync adapter PowerShell spawning at the adapter-owned implementation.
- [x] 3.1 Wire `createDefaultPowerShellExecutor()` from CLI, MCP, and HTTP composition roots.
- [x] 3.2 Update remaining no-arg runner call sites to inject an executor, including the six E2E fixture construction sites caught by verification.
- [x] 4.1 Add RED boundary coverage for the formal port and forbidden core concrete imports.
- [x] 4.2 Move default executor tests to the adapter test path while preserving spawn/env/timeout/tree-kill coverage.
- [x] 4.3 Verify `pnpm lint`, `pnpm test`, and `pnpm build` are green.
- [x] 5.1 Delete `src/core/runner/powershell-executor.ts` after imports were removed.
- [x] Post-verify correction: add an architecture migration guard that scans all `src/**/*.ts` and `test/**/*.ts` `AccessPowerShellRunner` construction sites for explicit executor injection.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1, 2.1 | `test/architecture/powershell-executor-port.test.ts` | Architecture/unit | ✅ 54/54 focused baseline | ✅ Boundary test failed on `./powershell-executor.js` import | ✅ Focused suite passed | ✅ Contract export + boundary assertions | ✅ Core types re-exported for compatibility |
| 1.2, 4.2, 5.1 | `test/adapters/powershell/default-executor.test.ts` | Unit | ✅ 16/16 existing executor tests | ✅ Adapter path initially absent before move | ✅ 16/16 adapter executor tests passed | ✅ Existing env/timeout/tree-kill cases preserved | ✅ Concrete implementation moved out of core |
| 3.1, 3.2, 4.3 | Full suite | Integration/unit | ✅ Focused suites green | ✅ Build/test exposed missing injection in real diagnostics test | ✅ `pnpm test` and `pnpm build` passed | ✅ Production and test no-arg call sites were updated | ✅ Composition roots own default executor wiring |
| 3.2, 4.3 follow-up | `test/architecture/powershell-executor-port.test.ts` | Architecture/unit | ✅ Verification report identified `pnpm lint` TS2345 failures | ✅ New migration guard failed on the six E2E fixture call sites | ✅ Guard passed after default executor injection | ✅ Guard scans all `src` and `test` TypeScript construction sites | ✅ Shared E2E fixture runner removes duplicate no-executor setup |

## Tests Run

- `pnpm test test/core/runner/access-runner.test.ts test/core/runner/powershell-executor.test.ts` — baseline, 54 passed.
- `pnpm test test/architecture/powershell-executor-port.test.ts` — RED, 1 failed as expected on forbidden core concrete import.
- `pnpm test test/architecture/powershell-executor-port.test.ts test/adapters/powershell/default-executor.test.ts test/core/runner/access-runner.test.ts` — GREEN, 56 passed.
- `pnpm test` — 94 files passed, 1228 tests passed, 3 skipped.
- `pnpm build` — passed.
- `pnpm test test/architecture/powershell-executor-port.test.ts` — RED after adding migration guard, failed on the six `test/e2e/access-fixture.e2e.test.ts` call sites missing `executor`.
- `pnpm test test/architecture/powershell-executor-port.test.ts` — GREEN after E2E fixture call-site migration, 3 passed.
- `pnpm lint` — passed (`tsconfig.json`, `tsconfig.test.json`, and Biome checks).
- `pnpm test` — passed, 94 files, 1229 tests, 3 skipped.
- `pnpm build` — passed.

## Implementation Commits

No commits created in this apply batch per instruction.
