# Apply Progress: Windows Process Adapters

## Status

Complete — all tasks 1.1 through 4.2 are implemented and checked in `tasks.md`. Post-verify correction resolved the Biome import-order/formatting failures, and the install-test full-suite timeout blocker is resolved.

## Completed tasks

- [x] 1.1 Added adapter-boundary coverage in `test/adapters/process/windows-processes.test.ts`.
- [x] 1.2 Added grep/read-based assertions rejecting `node:child_process` ownership in core helpers.
- [x] 2.1 Created `src/adapters/process/windows-processes.ts` with Windows process inspector, killer, scanner, PowerShell helper internals, and a Windows preflight cleanup factory.
- [x] 2.2 Reduced `src/core/operations/windows-processes.ts` to pure parser/normalizer helpers and `PROCESS_INSPECTOR_TIMEOUT_MS`.
- [x] 2.3 Preserved `normalizeProcessList` behavior for invalid JSON logging and `MainWindowHandle` normalization.
- [x] 3.1 Rewired CLI/HTTP/MCP composition roots to adapter-owned Windows process construction; `AccessPowerShellRunner` now accepts injected preflight cleanup and keeps a no-op fallback to preserve constructor compatibility without core importing adapters.
- [x] 3.2 Updated VBA-sync preflight dynamic import to `../process/windows-processes.js`.
- [x] 3.3 Moved the Windows process tests to `test/adapters/process/windows-processes.test.ts`.
- [x] 3.4 Preserved scan/inspect/kill fallback, timeout propagation, and non-Windows empty scanner behavior assertions.
- [x] 4.1 Ran focused adapter and core-boundary tests, plus full `pnpm test`.
- [x] 4.2 Deleted the old core test via file move and ran `pnpm build`.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1-1.2 | `test/adapters/process/windows-processes.test.ts` | Unit/boundary | ✅ `test/core/operations/windows-processes.test.ts` 35/35 | ✅ Adapter import failed before adapter existed; boundary check failed while core still imported `node:child_process` | ✅ Focused adapter tests 37/37 | ✅ Adapter ownership plus core rejection plus existing normalization cases | ✅ Core-boundary suite added as focused regression |
| 2.1-2.3 | `test/adapters/process/windows-processes.test.ts` | Unit | ✅ Covered by the red adapter test file | ✅ Missing adapter implementation / core ownership caused RED | ✅ Focused adapter tests 37/37 | ✅ Existing full, partial, invalid, single-object, array, and `MainWindowHandle` cases preserved | ✅ Pure parsing stayed in core; concrete PowerShell moved to adapter |
| 3.1-3.4 | `test/architecture/core-boundary.test.ts`, `test/adapters/process/windows-processes.test.ts` | Boundary/unit | ✅ Focused adapter tests 37/37 before wiring refinement | ✅ Full suite exposed `src/core/runner/access-runner.ts` importing adapter as a core-boundary violation | ✅ Focused adapter + core-boundary tests 40/40 | ✅ CLI/HTTP/MCP/VBA-sync composition roots and dynamic import covered by build/full test compilation | ✅ Introduced adapter preflight factory and no-op core fallback to keep core independent |
| 4.1-4.2 | Full suite/build | Regression | ✅ Focused tests green | ✅ `pnpm test` initially failed on core-boundary after direct runner import, then reproduced an install-test timeout in full-suite context | ✅ Boundary fixed; install test isolated its package root and marker paths; `pnpm lint`, `pnpm test`, and `pnpm build` pass | ✅ Full suite rerun passed after removing install-test dependency on repo/global runtime state | ✅ Biome import ordering/formatting and test fixture isolation applied without production behavior changes |

## Verification

| Command | Result | Notes |
|---|---|---|
| `pnpm vitest run test/core/operations/windows-processes.test.ts` | ✅ Passed | Baseline safety net: 35/35 before edits. |
| `pnpm vitest run test/adapters/process/windows-processes.test.ts` | ❌ RED | Failed before adapter module existed, as expected. |
| `pnpm vitest run test/adapters/process/windows-processes.test.ts` | ✅ Passed | 37/37 after module relocation. |
| `pnpm vitest run test/adapters/process/windows-processes.test.ts test/architecture/core-boundary.test.ts` | ✅ Passed | 40/40 after preserving core boundary. |
| `pnpm build` | ✅ Passed | TypeScript compile passed. |
| `pnpm test` | ✅ Passed | Blocker fix rerun: 94 files passed; 1231 tests passed; 3 skipped. |
| `pnpm vitest run test/cli/install.test.ts -t "installs runtime to requested path and configures selected agents"` | ✅ Passed | The timed-out test passed in isolation (1/1) after fixture isolation. |
| `pnpm vitest run test/cli/install.test.ts` | ✅ Passed | Full install test file passed: 70/70. |
| `pnpm lint` | ✅ Passed | Post-verify correction fixed Biome import-order/formatting errors in changed files. |

## Deviations from design

- `src/core/runner/access-runner.ts` does not import the adapter module directly. The delta spec and existing `test/architecture/core-boundary.test.ts` require core to remain adapter-independent, so adapter-owned preflight cleanup is injected from CLI/HTTP/MCP composition roots instead. A no-op core fallback preserves constructor compatibility when no preflight cleanup is injected.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| Not committed | Windows process adapter relocation | 1.1-4.2 | See Verification table | N/A — TypeScript-only change |
