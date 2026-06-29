# Design: Replace PowerShell Source-Text Tests

## Technical Approach

Replace issue-scoped tests that read `.ps1` source and assert snippets with behavior tests at the nearest stable port. PowerShell helper/action contracts move to Pester in `scripts/tests/` using AST extraction only to load callable functions from production scripts; assertions must target return values, emitted JSON/status, thrown errors, and mocked I/O calls. TypeScript tests remain in Vitest only for the `AccessPowerShellRunner` port: command arguments, payload shaping, stdout/stderr parsing, diagnostics, marker handling, result JSON, operation metadata, and cleanup/lock outcomes.

No runtime behavior or production runtime installation changes are planned.

## Architecture Decisions

| Decision | Options | Choice / Rationale |
|---|---|---|
| Test boundary | Source-text checks, Pester behavior, Vitest runner-port | Use Pester for `.ps1` helper/action behavior and Vitest for TS↔PowerShell runner contracts. This follows repo testing rules: observable behavior at ports, mock only I/O. |
| AST usage | Ban AST entirely, use AST to extract functions, parse source for snippets | Allow AST only as a loading seam for callable functions from `scripts/dysflow-access-runner.ps1`, `scripts/dysflow-vba-manager.ps1`, and `scripts/lib/dysflow-access-com.ps1`. Do not assert function bodies or variable names. |
| Coverage preservation | Delete brittle tests, replace one-for-one, broad E2E | Replace each text assertion with an equivalent behavior contract before deleting it. Avoid broad Access COM E2E unless the behavior cannot be isolated with fake DB/session objects. |
| Delivery | Single PR, forced chained slices | Use forced chained slices under the 400-line budget: access-runner first, vba-manager second, optional quality-gate cleanup last. |

## Data Flow

```text
Vitest runner-port tests ──fake PowerShellExecutor──> AccessPowerShellRunner
        │                                      └── asserts args/env/json/diagnostics
        │
Pester behavior tests ──AST extract function──> callable PS function
        └── fake DB/session/filesystem/process seams ──> assert outputs/effects/errors
```

## File Changes

| File | Action | Description |
|---|---|---|
| `test/core/runner/access-runner.test.ts` | Modify | Remove `.ps1` source-text wiring/exit checks; keep/add runner-port tests for payload routing, JSON parsing, stderr marker filtering, timeout/failure diagnostics, operation metadata, and cleanup evidence. |
| `test/scripts-access-runner.test.ts` | Modify/Delete | Delete source-snippet assertions once equivalent Pester contracts exist for SQL literal formatting, statement splitting, password/open behavior, sandboxed paths, read/write database routing, ISO start-time formatting, and cleanup invariants. |
| `test/scripts-vba-manager.test.ts` | Modify/Delete | Delete dispatcher-arm/body checks once Pester behavior covers extracted action functions and observable import/export/list/exists/delete/compile/run-test/run-procedure/fix-encoding outcomes. |
| `scripts/tests/dysflow-access-runner.Tests.ps1` | Modify | Add missing behavior tests for access-runner contracts formerly protected by text assertions; keep AST extraction as a function-loading seam only. |
| `scripts/tests/dysflow-vba-manager.Tests.ps1` | Modify | Add missing behavior tests for vba-manager dispatcher/action contracts with fake sessions and mocked file/process/COM seams. |
| `docs/testing/repo-quality-gates.md` | Modify if needed | Document/guard that issue-scoped `.ps1` internals must not be tested with source-text assertions. |

## Interfaces / Contracts

- Pester tests may parse production scripts to extract a named function, then invoke it with fake dependencies defined in test scope.
- Pester assertions must target observable values: returned objects/JSON, captured `Write-Status`/`Write-Host`, thrown messages, fake DB/session calls, no-kill invariants, and path/output parameters.
- Vitest assertions must target `AccessPowerShellRunner` public `run()` results and injected `PowerShellExecutor` calls; no `.ps1` body reads.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Vitest | TS runner command/result/error/marker contracts | `pnpm test`; injected executor and registry/preflight fakes. |
| Pester | PowerShell helper/action behavior | `pnpm test:ps1`; AST-load functions, mock COM/filesystem/process seams. |
| Acceptance | Variable rename resilience | Temporarily perform or simulate behavior-preserving local variable renames in `.ps1`; behavior tests must still pass because they never assert variable names. |

## Migration / Rollout

Slice 1 replaces access-runner source-text checks with Pester/Vitest behavior coverage. Slice 2 replaces vba-manager dispatcher/body checks. Slice 3 removes any remaining issue-scoped text-over-`.ps1` assertions and updates quality-gate docs if needed. Rollback is test-only commit revert.

## Open Questions

- None.
