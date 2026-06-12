# Tasks: Windows Process Adapters

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 240-360 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 move module + wiring; PR 2 move tests + boundary checks + verification |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Move Windows process implementation and update runtime imports | PR 1 | Base on main; includes adapter module, core trim, and composition-root rewires |
| 2 | Relocate tests and prove ownership/behavior | PR 2 | Base on PR 1 or its branch; includes boundary grep and regression verification |

## Phase 1: Strict TDD Guards

- [x] 1.1 Add failing adapter-boundary coverage in `test/adapters/process/windows-processes.test.ts` for adapter ownership, core `node:child_process` rejection, and unchanged normalization behavior.
- [x] 1.2 Add a grep-based boundary check that flags any `node:child_process` import left in `src/core/operations/windows-processes.ts`.

## Phase 2: Module Move

- [x] 2.1 Create `src/adapters/process/windows-processes.ts` with `WindowsMsAccessProcessInspector`, `WindowsProcessKiller`, `WindowsMsAccessProcessScanner`, and the PowerShell helper internals.
- [x] 2.2 Reduce `src/core/operations/windows-processes.ts` to `parseCimDateTimeToIso`, `normalizeProcessList`, `PROCESS_INSPECTOR_TIMEOUT_MS`, and shared types only.
- [x] 2.3 Keep `normalizeProcessList` behavior identical, including swallowed-IO logging and `MainWindowHandle` normalization.

## Phase 3: Wiring and Test Relocation

- [x] 3.1 Repoint runtime wiring to adapter-owned Windows process construction while keeping `src/core/runner/access-runner.ts` adapter-independent through injected preflight cleanup.
- [x] 3.2 Update `src/adapters/vba-sync/vba-operations-adapter.ts` dynamic import to `../process/windows-processes.js`.
- [x] 3.3 Move `test/core/operations/windows-processes.test.ts` to `test/adapters/process/windows-processes.test.ts` and switch imports to the adapter path.
- [x] 3.4 Preserve the spec scenarios for scan/inspect/kill fallback, timeout propagation, and empty/non-Windows behavior.

## Phase 4: Verification and Cleanup

- [x] 4.1 Run the focused windows-process test file, then `pnpm test`, and confirm no core dependency-boundary regressions.
- [x] 4.2 Delete `test/core/operations/windows-processes.test.ts` after the adapter copy passes, then run `pnpm build`.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `7e538bd` | Stabilize install fixture | 4.1-4.2 | `pnpm vitest run test/cli/install.test.ts -t "installs runtime to requested path and configures selected agents"`; `pnpm vitest run test/cli/install.test.ts`; `pnpm test`; `pnpm lint` | N/A — TypeScript-only change |
| `0e3917f` | Windows process adapter relocation | 1.1-4.2 | `pnpm vitest run test/adapters/process/windows-processes.test.ts`; `pnpm vitest run test/adapters/process/windows-processes.test.ts test/architecture/core-boundary.test.ts`; `pnpm lint`; `pnpm test` (94 files, 1231 tests passed, 3 skipped); `pnpm build` | N/A — TypeScript-only change |
