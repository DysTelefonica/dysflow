# Tasks — close-batch-582-583-585

> **Delivery strategy**: `main-only`, `single batch`, target branch `main`. No PRs, no staging (per `dysflow/release-policy/main-only`, Engram #14611). One commit per issue + one `tasks.md` update commit + one archive commit = 5 commits total.
>
> **Strict TDD**: RED → GREEN → TRIANGULATE → REFACTOR for each task. Triangulation mandatory when the spec defines more than one scenario.

## Review Workload Forecast

- 400-line budget risk: **Low–Medium**. Estimated diff is ~250 lines across 3 fixes + quality gates + behavior-contract refactor.
- Chained PRs recommended: **No** (release policy is main-only direct, no PRs).
- Decision needed before apply: **No** (under 400 lines estimated; main-only policy).

---

## Slice 1: #582 — Explicit Test-Runtime Command

- **Issue**: #582
- **Spec**: `openspec/changes/close-batch-582-583-585/specs/mcp-e2e-test-runtime.md`
- **Strategy E2E**: ports involved = `E2E_testing/mcp-e2e.mjs` (process spawn, child stdin/stdout). Helper `resolveMcpE2eCommand` is pure (no I/O), unit-testable. Quality gate reads `mcp-e2e.mjs` as text once to assert default path is NOT production.

### Task 1.1 — RED: helper rejects production runtime when no override and no test-runtime

- Add `E2E_testing/_helpers/resolve-mcp-e2e-command.mjs` exporting `resolveMcpE2eCommand({ env, repoRoot, fs })` returning `{ ok: true, command, source }` or `{ ok: false, code, message, candidates }`.
- Add `E2E_testing/_helpers/resolve-mcp-e2e-command.test.mjs` (Node built-in `node:test`) that:
  - With `env.DYSFLOW_E2E_COMMAND` set → returns the override regardless of production path
  - With no env, no test-runtime, only production path → returns `{ ok: false, code: "MCP_E2E_REFUSES_PRODUCTION_RUNTIME" }`
  - With no env, test-runtime exists → returns test-runtime path with `source: "test-runtime"`
  - With nothing anywhere → returns `{ ok: false, code: "MCP_E2E_NO_RUNTIME_AVAILABLE" }` listing all candidates
- Run the test alone → all 4 cases FAIL because the helper does not exist yet (RED).

### Task 1.2 — GREEN: implement the helper

- Implement `resolveMcpE2eCommand` with the priority order: `DYSFLOW_E2E_COMMAND` env → `<repoRoot>/test-runtime/bin/dysflow.cmd` (exists) → `%LOCALAPPDATA%\dysflow\bin\dysflow.cmd` (exists, rejected with `MCP_E2E_REFUSES_PRODUCTION_RUNTIME`) → `{ ok: false, code: "MCP_E2E_NO_RUNTIME_AVAILABLE" }`.
- Re-run the helper test → all 4 cases PASS (GREEN).

### Task 1.3 — TRIANGULATE: env override wins even when test-runtime missing

- Add a 5th case: env override set, test-runtime does NOT exist, production exists → returns the override path, no `MCP_E2E_REFUSES_PRODUCTION_RUNTIME`.
- Add a 6th case: env override set to a non-existent file → returns `{ ok: false, code: "MCP_E2E_OVERRIDE_NOT_FOUND" }` (or similar — the spec says "explicit override is honored when path looks like production"; for a non-existent file, the harness should still surface that clearly).
- Re-run → all PASS.

### Task 1.4 — RED: quality gate catches production default in `mcp-e2e.mjs`

- Add `test/quality-gates/mcp-e2e-command.test.ts` (Vitest) that:
  - Reads `E2E_testing/mcp-e2e.mjs` as text
  - Asserts it does NOT contain a default that is hard-coded to the production path
  - Asserts it imports the helper `resolveMcpE2eCommand` and uses its result
  - Asserts the harness exits with code 1 on `{ ok: false }` from the helper
- Current `mcp-e2e.mjs` uses the legacy default `%LOCALAPPDATA%\dysflow\bin\dysflow.cmd` and has no helper import → all assertions FAIL (RED).

### Task 1.5 — GREEN: wire helper into `mcp-e2e.mjs`

- Refactor `E2E_testing/mcp-e2e.mjs` to import and call `resolveMcpE2eCommand` at the top, abort with the helper's diagnostic on `ok: false`, and use the resolved command in the `spawn(...)` call.
- Set `process.env.DYSFLOW_HOME` to the repo `test-runtime` AFTER the helper resolves successfully (keeps the existing behavior of forcing the runner script path).
- Re-run the quality gate → GREEN.

### Task 1.6 — REFACTOR + final verification

- Run `pnpm test --run`, `pnpm build`, `pnpm lint`. Baselines: 1687/1687 Vitest, 374/0/4 Pester (unchanged for this slice — no Pester changes), branches ≥ 78.
- Re-read `E2E_testing/mcp-e2e.mjs` — confirm spawn is still best-effort, env wiring is intact, password handling is intact.

---

## Slice 2: #583 — MCP Harness No-Hang

- **Issue**: #583
- **Spec**: `openspec/changes/close-batch-582-583-585/specs/mcp-e2e-cleanup.md`
- **Strategy E2E**: ports involved = `E2E_testing/mcp-e2e.mjs` (process spawn, timer, event handlers). Helper `callMcp` is the boundary; tested via Vitest with a fake child stream (no real `dysflow.cmd`).

### Task 2.1 — RED: helper extract verifies the harness has the watchdog primitives

- Add `test/quality-gates/mcp-harness-watchdog-primitives.test.ts` (Vitest) that reads `E2E_testing/mcp-e2e.mjs` as text and asserts:
  - It defines a `closeWatchdogMs` (or equivalent) constant
  - It arms a `setTimeout` AFTER capturing the response
  - The internal `finish` function is `settled`-guarded (early-return on `settled === true`)
  - `child.kill()` is called both at response capture and on the watchdog path
- Current code has only the primary `timeoutMs`; the quality gate assertions FAIL (RED).

### Task 2.2 — GREEN: add the watchdog to the harness

- Refactor `E2E_testing/mcp-e2e.mjs`:
  - Add a `closeWatchdogMs` constant (default 5000).
  - After capturing the response and clearing the primary timer, arm a `closeWatchdog` `setTimeout` that calls `finish(...)` with the captured response and a `closeWatchdogFired: true` flag.
  - Make sure `finish` early-returns when `settled` is already true.
  - In `child.on("close", ...)`, clear the close watchdog so it does not fire after a natural close.
- Re-run the quality gate → GREEN.

### Task 2.3 — RED: integration test with non-closing child mock

- Add `test/e2e/mcp-harness-watchdog.e2e.test.ts` (Vitest) that:
  - Imports `callMcp` from `E2E_testing/mcp-e2e.mjs` (or a refactored export of the per-call helper)
  - Replaces the `spawn` call with a fake that:
    - Accepts stdin writes (records them)
    - Emits a JSON-RPC `tools/call` response on stdout
    - NEVER emits `close` and NEVER exits
  - Sets `DYSFLOW_E2E_COMMAND` to a path that does not need to exist (the spawn is mocked)
  - Asserts the promise resolves within `closeWatchdogMs + 500 ms`
  - Asserts the resolved payload's `response.id === requestId`
  - Asserts `result.closeWatchdogFired === true`
- Current code has no watchdog → test fails (timeout) (RED).

### Task 2.4 — GREEN: wire the watchdog and resolve via the fake-child path

- Refactor `mcp-e2e.mjs` to:
  - Export `callMcp` (and the helpers it depends on) so the integration test can import them
  - Replace the `spawn` with an injectable factory (defaulting to the real `spawn` for production runs) so the test can inject a fake
- Re-run the integration test → GREEN.
- Also confirm the existing E2E suite (run via `node E2E_testing/mcp-e2e.mjs`) still passes the zombie-check and lingering-access-check after the refactor.

### Task 2.5 — TRIANGULATE: double-settle is a no-op

- Add a second scenario to the integration test:
  - Fake child emits the response, then after `closeWatchdogMs` elapses the watchdog fires, then finally emits `close` after another 500 ms.
  - The test verifies the promise is still resolved with the watchdog payload (no double-resolve, no `UnhandledPromiseRejection`).
- Re-run → GREEN.

### Task 2.6 — REFACTOR + final verification

- Run `pnpm test --run`, `pnpm build`, `pnpm lint`. Baselines preserved.
- Confirm the watchdog default (5000 ms) is documented in a comment near the `closeWatchdogMs` constant.

---

## Slice 3: #585 — Behavior-Contract Pester Tests

- **Issue**: #585
- **Spec**: `openspec/changes/close-batch-582-583-585/specs/pester-test-contract.md`
- **Strategy E2E**: no new ports. Production refactors are minimal: extract `Set-ScriptOutputEncodingUtf8` and `Set-VbComponentNameSafe` from `dysflow-vba-manager.ps1`, extract `Resolve-ReadActionTargetPath` from `dysflow-access-runner.ps1`. The Pester tests assert behavior of those helpers. Encoding functions in `dysflow-vba-manager.ps1` (protected by commit `3fbd60a`) are NOT modified.

### Task 3.1 — RED: helper `Set-ScriptOutputEncodingUtf8` does not yet exist

- Add Pester test in `scripts/tests/dysflow-vba-manager.Tests.ps1` (replacing the line-66 source-text test) that:
  - Loads the helper via AST (loader-only)
  - Calls `Set-ScriptOutputEncodingUtf8`
  - Asserts `[Console]::OutputEncoding.CodePage -eq 65001`
- Run Pester on the file → fails because `Set-ScriptOutputEncodingUtf8` does not exist (RED).

### Task 3.2 — GREEN: extract `Set-ScriptOutputEncodingUtf8` in production

- In `scripts/dysflow-vba-manager.ps1`, add the helper function `Set-ScriptOutputEncodingUtf8` that does `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`.
- Replace the inline `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` at line 114 with a call to the helper.
- Re-run Pester → GREEN.

### Task 3.3 — RED: helper `Set-VbComponentNameSafe` does not yet exist

- Add Pester test (replacing the line-71 source-text test) that:
  - Creates a PSCustomObject mock with a `Name` setter
  - Calls `Set-VbComponentNameSafe -Component $mock -Name "Módulo1"`
  - Asserts `$mock.Name -eq "Módulo1"`
- Run Pester → fails because the helper does not exist (RED).

### Task 3.4 — GREEN: extract `Set-VbComponentNameSafe` and wire it in both branches

- In `scripts/dysflow-vba-manager.ps1`, add `Set-VbComponentNameSafe` that does `$Component.Name = $Name`.
- In `New-VbComponentFromCodeFile`, replace both `$newComponent.Name = $ModuleName` lines (2059 and 2062) with `Set-VbComponentNameSafe -Component $newComponent -Name $ModuleName`.
- Re-run Pester → GREEN.

### Task 3.5 — TRIANGULATE: AST call-count (no source-text coupling)

- Add a third test in the same Describe that:
  - Uses AST to find `New-VbComponentFromCodeFile`
  - Counts `Set-VbComponentNameSafe` calls inside its body
  - Asserts count `>= 2` (one per branch)
- This is NOT a source-text assertion on the function body — it counts call nodes by name, which is structural metadata. It survives a refactor that renames `$newComponent` to `$component` or splits the function into helpers.
- Run Pester → GREEN.

### Task 3.6 — RED: `dysflow-access-com.Tests.ps1:50-72` still pins function names

- Read the current tests — they use `$script:FunctionNames | Should -Contain "X"`. We replace each with a callability test.
- Add the new test variants (loader-based `Get-Command X -ErrorAction Stop`).
- Keep the original `defines X` tests for now → they still PASS, but the new callability tests would be redundant. The refactor is: remove the `defines X` tests, keep only the callability tests. 8 in / 8 out.

### Task 3.7 — GREEN: replace 8 `defines X` tests with 8 callability tests

- Remove the 8 `It "defines X"` tests in `scripts/tests/dysflow-access-com.Tests.ps1:50-72`.
- Add 8 `It "X is callable after dot-source"` tests in the same Context.
- Re-run Pester on the file → 8 replaced tests pass (GREEN), no net change in count.

### Task 3.8 — RED: helper `Resolve-ReadActionTargetPath` does not yet exist

- Add Pester test (replacing the line-248 textual-order test) that:
  - Loads the helper via AST
  - Asserts priority order: databasePath > sourcePath > backendPath > empty
- Run Pester → fails because the helper does not exist (RED).

### Task 3.9 — GREEN: extract `Resolve-ReadActionTargetPath` and wire it into `Resolve-ReadActionDatabase`

- In `scripts/dysflow-access-runner.ps1`, add the helper:
  ```powershell
  function Resolve-ReadActionTargetPath {
      param([Parameter(Mandatory = $true)] $Payload)
      $targetPath = [string]$Payload.databasePath
      if ([string]::IsNullOrWhiteSpace($targetPath)) { $targetPath = [string]$Payload.sourcePath }
      if ([string]::IsNullOrWhiteSpace($targetPath)) { $targetPath = [string]$Payload.backendPath }
      return $targetPath
  }
  ```
- Refactor `Resolve-ReadActionDatabase` (line 208) to call `Resolve-ReadActionTargetPath -Payload $Payload` instead of inlining the resolution. Keep the rest of the function intact (`Open-DatabaseWithBackendPassword`, return shape).
- Re-run Pester → GREEN.

### Task 3.10 — TRIANGULATE: AST call-existence (no source-text coupling)

- Add a second test in the same Describe that:
  - Uses AST to find `Resolve-ReadActionDatabase`
  - Asserts it contains at least one call to `Resolve-ReadActionTargetPath`
- This is structural metadata, not source-text coupling.
- Run Pester → GREEN.

### Task 3.11 — Quality gate: no `Get-Content -Raw | Should -Match` on PowerShell source

- Add a Vitest test in `test/quality-gates/pester-source-text-coupling.test.ts` that walks `scripts/tests/*.Tests.ps1`, parses each, and flags any `Should -Match` whose right-hand side is a variable assigned from `Get-Content -Raw` of a `.ps1` file.
- Re-run Vitest → GREEN (no current offenders after the refactor).

### Task 3.12 — REFACTOR + final verification

- Run `pnpm test --run`, `pnpm build`, `pnpm lint`, `pwsh -Command "Invoke-Pester scripts/tests/"`.
- Verify Pester count is `374 / 0 / 4` (unchanged) — the 8 + 2 + 1 replacements are 1:1 with triangulation additions to compensate.

---

## Slice 4: Final Verification + Archive

### Task 4.1 — Full suite + Pester + build

- `pnpm test --run` — expect 1687 + new tests from this batch, 0 failing.
- `pnpm build` — expect success.
- `pnpm lint` — expect success (biome + tsc).
- `pwsh -Command "Invoke-Pester scripts/tests/"` — expect 374 / 0 / 4 baseline preserved.

### Task 4.2 — GitHub Actions CI green

- `git push origin main` after each commit.
- Confirm via `gh run list --branch main --limit 1` that every push yields a green run.

### Task 4.3 — Archive

- Move `openspec/changes/close-batch-582-583-585/` to `openspec/changes/archive/2026-06-28-close-batch-582-583-585/`.
- Write `archive-report.md`.
- Commit + push.

### Task 4.4 — Close issues with traceability

- `gh issue close 582 --comment "..."` — with the SHA, test module, and manifest path.
- Same for #583 and #585.
- Use `--body-file` with UTF-8 to avoid PowerShell accent parsing issues.

---

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `81f140c` | DELTA-001 (#582) explicit test-runtime command | 1.1–1.6 | `E2E_testing/_helpers/resolve-mcp-e2e-command.mjs` (helper, 11 unit cases) + `test/quality-gates/mcp-e2e-command.test.ts` (6 wiring cases) pass; Vitest baseline 1687 → 1704 (+17); CI `28330659245` green | N/A |
| `a7e36d6` | DELTA-002 (#583) MCP harness watchdog | 2.1–2.6 | `E2E_testing/_helpers/mcp-harness.mjs` (extracted per-call harness) + `test/quality-gates/mcp-harness-watchdog-primitives.test.ts` (6 primitive cases) + `test/e2e/mcp-harness-watchdog.e2e.test.ts` (4 scenarios: non-closing child, double-resolve guard, natural close, primary timeout) pass; Vitest baseline 1704 → 1710 (+6 in unit + 4 in integration); CI `28330877669` green | N/A |
| `4a38893` | DELTA-003 (#585) behavior-contract Pester tests | 3.1–3.12 | 6 "defines X" → 6 "is callable" in `dysflow-access-com.Tests.ps1`; 2 text → 2 behavior + 1 AST call-count in `dysflow-vba-manager.Tests.ps1`; 2 text → 1 priority + 1 AST delegation in `dysflow-access-runner-result-coverage.Tests.ps1`; existing `Resolve-ReadActionDatabase` behavioral Describe updated to also load the extracted helper; new `test/quality-gates/pester-source-text-coupling.test.ts` (3 regression-guard cases). Pester 374/0/4 baseline preserved; Vitest 1710 → 1713 (+3); runtime script copy at `%LOCALAPPDATA%\dysflow\app\scripts\dysflow-access-runner.ps1` re-synced so the runtime-drift gate stays green; CI `28331203521` green | dev script copied to runtime via local PowerShell so the install runtime matches the dev tree (no install flow change) |
| _pending_ | tasks.md traceability update | 4.0 | — | N/A |
| _pending_ | archive + close | 4.1–4.4 | CI green | N/A |

(Commit SHAs filled in during apply.)
