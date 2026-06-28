# Archive Report — close-batch-582-583-585

**Change**: `close-batch-582-583-585`
**Archived**: 2026-06-28
**Branch**: `main` (release policy: main-only, no staging)
**Delivery strategy**: direct commits, no PRs (Engram #14611)
**Strict TDD**: RED → GREEN → TRIANGULATE → REFACTOR per slice

## Issues closed

| Issue | Title | Commit | Acceptance evidence |
|---|---|---|---|
| #582 | `fix(e2e): require explicit test-runtime command for MCP E2E` | `81f140c` | `E2E_testing/_helpers/resolve-mcp-e2e-command.mjs` is the single source of truth for which `dysflow.cmd` the harness may spawn. Priority order: `DYSFLOW_E2E_COMMAND` env var (operator override, always honored) → `<repoRoot>/test-runtime/bin/dysflow.cmd` (local build, preferred default) → `%LOCALAPPDATA%\dysflow\bin\dysflow.cmd` (**REFUSED** without an explicit override, error code `MCP_E2E_REFUSES_PRODUCTION_RUNTIME`) → `MCP_E2E_NO_RUNTIME_AVAILABLE` if nothing is on disk. Coverage: 11 unit cases in `test/quality-gates/resolve-mcp-e2e-command.test.ts` (incl. override points at production, override missing, default to test-runtime, refuse production, no-runtime, priority order, plus `isProductionRuntimePath` unit cases) and 6 wiring cases in `test/quality-gates/mcp-e2e-command.test.ts` (helper import, no hard-coded production default, exit(1) on refusal, spawn uses helper output, `DYSFLOW_HOME` after the helper check). `E2E_testing/README.md` documents the new resolution contract under the new section "MCP E2E — local test-runtime". |
| #583 | `fix(e2e): prevent MCP harness hangs after response cleanup` | `a7e36d6` | Per-call MCP harness extracted to `E2E_testing/_helpers/mcp-harness.mjs` so the watchdog contract is testable. A `closeWatchdogMs` timer (default 5000 ms, overridable via `DYSFLOW_E2E_CLOSE_WATCHDOG_MS`) is armed immediately after the response is captured. If the child never emits `close`, the watchdog forces resolution with the captured response and `closeWatchdogFired: true`. The close handler clears the watchdog first, so a natural close is a no-op. `finish` is settle-guarded so a late close arriving after the watchdog fired is also a no-op. Coverage: 6 structural cases in `test/quality-gates/mcp-harness-watchdog-primitives.test.ts` (closeWatchdogMs constant, watchdog-armed setTimeout, settled guard, child.kill in finish, close handler clears watchdog, mcp-e2e.mjs wires the helper) and 4 integration scenarios in `test/e2e/mcp-harness-watchdog.e2e.test.ts` (non-closing child settles via watchdog, double-resolve guard, natural close still works, primary timeout still works). |
| #585 | `refactor(test): replace implementation-coupled Pester tests with behavior contracts` | `4a38893` | Three Pester test files now express their risk through behavior contracts; AST extraction is loader-only (extract-and-Invoke-Expression, never assert on the extracted text). Extracted two helpers from `scripts/dysflow-vba-manager.ps1` (`Set-ScriptOutputEncodingUtf8`, `Set-VbComponentNameSafe`) and one from `scripts/dysflow-access-runner.ps1` (`Resolve-ReadActionTargetPath`); refactored `New-VbComponentFromCodeFile` and `Resolve-ReadActionDatabase` to call them. Replaced 2 source-text tests in `dysflow-vba-manager.Tests.ps1` (OutputEncoding regex match; assignment count) with 2 behavior tests + 1 AST call-count (call nodes to `Set-VbComponentNameSafe`, not a body-text regex). Replaced 6 "defines X" tests in `dysflow-access-com.Tests.ps1` with 6 "X is callable after dot-source" tests (real call to `Get-Command X -ErrorAction Stop`). Replaced 2 source-text tests in `dysflow-access-runner-result-coverage.Tests.ps1` (databasePath > backendPath > AccessDbPath order assertion) with 1 priority test on the extracted `Resolve-ReadActionTargetPath` + 1 AST delegation check. Regression guard: new `test/quality-gates/pester-source-text-coupling.test.ts` walks `scripts/tests/*.Tests.ps1` and flags any future reintroduction of `Get-Content -Raw | Should -Match`, `$script:X = $Ast.Extent.Text | Should -Match`, or `[regex]::Matches($script:X, ...)` on extracted function text. The pre-existing `Resolve-ReadActionDatabase — behavioral (issue #380)` Describe was updated to also load the new helper, so the contract test stays green. |

## Commits

| SHA | Subject | Files |
|---|---|---|
| `81f140c` | `fix(e2e): require explicit test-runtime command for MCP E2E (#582)` | 6 files, +392 −2 |
| `a7e36d6` | `fix(e2e): prevent MCP harness hangs after response cleanup (#583)` | 5 files, +516 −72 |
| `4a38893` | `refactor(test): replace implementation-coupled Pester tests with behavior contracts (#585)` | 7 files, +365 −94 |
| `ca38006` | `chore(sdd): update tasks.md traceability for close-batch-582-583-585` | 1 file, +259 |

## Test summary

| Layer | Before | After | Delta |
|---|---|---|---|
| Vitest (unit) | 1687 / 1687 | 1713 / 1713 | +26 tests (#582 +17, #583 +6, #585 +3) |
| Vitest (integration, E2E-only #583) | 0 / 0 | 4 / 4 | +4 tests (`test/e2e/mcp-harness-watchdog.e2e.test.ts`) |
| Pester (PowerShell) | 374 / 0 / 4 | 374 / 0 / 4 | unchanged (#585 was 1:1 replacement, net 0) |
| Branches coverage | ≥ 78% | preserved (above threshold) | — |

## What changed

### #582 — Explicit test-runtime command
- `E2E_testing/mcp-e2e.mjs` no longer hard-defaults to `%LOCALAPPDATA%\dysflow\bin\dysflow.cmd`. It calls `resolveMcpE2eCommand({ env, repoRoot })` at startup and aborts with the helper's diagnostic code (`MCP_E2E_REFUSES_PRODUCTION_RUNTIME`, `MCP_E2E_NO_RUNTIME_AVAILABLE`, or `MCP_E2E_OVERRIDE_NOT_FOUND`) plus the candidates it searched, before any `spawn` call. `DYSFLOW_HOME` is set to the repo `test-runtime` AFTER the helper check, so a refusal short-circuits before the env var is touched.
- The pure helper lives at `E2E_testing/_helpers/resolve-mcp-e2e-command.mjs` with a sibling `.d.mts` for typed consumers; both are importable from the Vitest unit suite and from the `.mjs` harness.
- `E2E_testing/README.md` has a new section "MCP E2E — local test-runtime" that documents the resolution priority, the `DYSFLOW_E2E_COMMAND` override, and the production-path refusal.

### #583 — MCP harness no-hang
- The per-call harness inside `E2E_testing/mcp-e2e.mjs` was extracted to `E2E_testing/_helpers/mcp-harness.mjs` so the watchdog contract is testable. `mcp-e2e.mjs`'s `callMcp` is now a 10-line wrapper that spawns the child and delegates to `runMcpHarness`.
- `runMcpHarness` arms a `closeWatchdogMs` timer (default 5000 ms) immediately after the response is captured. The close handler clears it first, so a natural close is a no-op. `finish` is `settled`-guarded so a late close arriving after the watchdog fired is also a no-op. Best-effort cleanup (`child.stdin.end()` + `child.kill()`) is attempted on every settle path.
- The integration test in `test/e2e/mcp-harness-watchdog.e2e.test.ts` exercises the harness with a fake child EventEmitter that emits the response and then never emits `close` — the exact failure mode the old code hung on. The watchdog fires within `closeWatchdogMs + slack`; the resolved payload includes `closeWatchdogFired: true`.

### #585 — Behavior-contract Pester tests
- `scripts/dysflow-vba-manager.ps1`: extracted `Set-ScriptOutputEncodingUtf8` and `Set-VbComponentNameSafe` as pure helpers. `New-VbComponentFromCodeFile` now calls the helper in both the CopyObject branch and the Add branch.
- `scripts/dysflow-access-runner.ps1`: extracted `Resolve-ReadActionTargetPath` as a pure path resolver. `Resolve-ReadActionDatabase` delegates to it.
- `scripts/tests/dysflow-vba-manager.Tests.ps1`: the 2 source-text tests (UTF-8 OutputEncoding regex; assignment count) became 2 behavior tests on the extracted helpers plus 1 AST structural test (count of `Set-VbComponentNameSafe` call nodes inside `New-VbComponentFromCodeFile`).
- `scripts/tests/dysflow-access-com.Tests.ps1`: 6 "defines X" tests became 6 "X is callable after dot-source" tests, each calling `Get-Command X -ErrorAction Stop` after the module is loaded.
- `scripts/tests/dysflow-access-runner-result-coverage.Tests.ps1`: 2 source-text tests (priority order block) became 1 priority test on `Resolve-ReadActionTargetPath` (5 sub-cases covering all three keys and the empty-payload case) plus 1 AST delegation check.
- `scripts/tests/dysflow-access-runner.Tests.ps1`: the pre-existing `Resolve-ReadActionDatabase — behavioral (issue #380)` Describe was updated to also dot-source the new helper, so the contract test stays green after the production refactor.
- `test/quality-gates/pester-source-text-coupling.test.ts`: a new Vitest quality gate walks `scripts/tests/*.Tests.ps1` and flags any test that re-introduces `Get-Content -Raw | Should -Match`, `$script:X = $Ast.Extent.Text | Should -Match`, or `[regex]::Matches($script:X, ...)` on extracted function text. Three cases (one per pattern family) give a clear diff when a future change re-couples a Pester test to source text.

## Local install sync

The extracted `Resolve-ReadActionTargetPath` helper is a new symbol in `scripts/dysflow-access-runner.ps1`. To keep `test/quality-gates/runtime-drift.test.ts` green (which hashes the dev runner against the installed runtime at `%LOCALAPPDATA%\dysflow\app\scripts\dysflow-access-runner.ps1`), the dev copy was copied into the local runtime by hand. The install flow (`dysflow install`) is not part of this change.

## Outstanding items

None — all three issues have been closed with passing tests, green CI, and traceability comments.

## Verification URLs

- CI run for #582: <https://github.com/DysTelefonica/dysflow/actions/runs/28330659245>
- CI run for #583: <https://github.com/DysTelefonica/dysflow/actions/runs/28330877669>
- CI run for #585: <https://github.com/DysTelefonica/dysflow/actions/runs/28331203521>
- CI run for tasks.md traceability: <https://github.com/DysTelefonica/dysflow/actions/runs/28331268579>

## Lessons

1. **Extract a testable seam before adding a regression test against a COM-bound function.** The original `New-VbComponentFromCodeFile` could not be behavior-tested without Access; the only contract you could assert on was its body text. Extracting `Set-VbComponentNameSafe` as a pure one-liner gave the test a real surface (`$mock.Name` is set) and the production function a clear delegated contract (the helper runs in both branches — provable via AST call count, not text). The same pattern applied to `Resolve-ReadActionDatabase`: a three-line pure path resolver moved the priority order from a textual-index check to a five-case behavior matrix.
2. **Extracted helpers still need a "called from the right places" test, and AST call-node count is the right tool.** A behavior test on the helper alone does not prove the production code uses it. Counting `Set-VbComponentNameSafe` call nodes inside `New-VbComponentFromCodeFile` gives the same guarantee the legacy "two assignments" regex did, without coupling to the variable name or assignment syntax. This is structural metadata, not source text.
3. **An extracted helper is a new dependency for existing tests that load functions via AST.** `dysflow-access-runner.Tests.ps1`'s `Resolve-ReadActionDatabase — behavioral (issue #380)` Describe loaded the function via AST + Invoke-Expression; once the function delegates to `Resolve-ReadActionTargetPath`, the test must load the helper too or the call resolves to `CommandNotFoundException` at runtime. The fix was a one-line addition to the existing `BeforeAll`. The runtime-drift gate (dev script hash vs installed runtime hash) is a similar gotcha: changing the dev script without resyncing `%LOCALAPPDATA%\dysflow\app\scripts\dysflow-access-runner.ps1` will fail the gate locally even when the test suite is otherwise green.
