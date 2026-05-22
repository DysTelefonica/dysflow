# Verification Report: MCP Progress Notifications

**Change**: mcp-progress-notifications
**Mode**: Strict TDD
**Date**: 2026-05-21
**Verdict**: PASS WITH WARNINGS

---

## Build / Test Evidence

| Command | Result |
|---------|--------|
| `pnpm test` | 353/353 tests passing, 33 test files, 0 failures |
| `pnpm tsc --noEmit` | 0 errors |

---

## Task Completeness

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1 — Types | 1.1, 1.2 | COMPLETE |
| Phase 2 — Runner | 2.1 (RED), 2.2 (GREEN) | COMPLETE |
| Phase 3 — Services | 3.1–3.4 | COMPLETE |
| Phase 4 — stdio.ts | 4.1 (RED), 4.2 (GREEN) | COMPLETE |
| Phase 5 — tools.ts | 5.1 (RED), 5.2 (GREEN) | COMPLETE |
| Phase 6 — PowerShell | 6.1 | COMPLETE |
| Phase 7 — Final validation | 7.1, 7.2 | COMPLETE |

**14/14 tasks complete.**

---

## Spec Compliance Matrix

### access-core-runner/spec.md

| Requirement | Scenario | Status | Evidence |
|-------------|----------|--------|----------|
| Runner Execution Boundary | Successful run | PASS | Pre-existing tests, 353 green |
| Runner Execution Boundary | Non-zero exit code | PASS | Pre-existing tests |
| Progress Callback Option | Runner receives valid DYSFLOW_PROGRESS | PASS | `access-runner-progress.test.ts` test 1 |
| Progress Callback Option | Malformed progress line swallowed | PASS | `access-runner-progress.test.ts` test 1 (no call recorded) |
| Progress Callback Option | onProgress absent — normal completion | PASS | `access-runner-progress.test.ts` test 2 |
| PS Progress Format | DYSFLOW_PROGRESS <json> on stderr | PASS | `Write-DysflowProgress` in runner.ps1 |
| PS Progress Format | No progress in stdout | PASS | stderr-only channel, stdout untouched |

### access-core-services/spec.md

| Requirement | Scenario | Status | Evidence |
|-------------|----------|--------|----------|
| Progress Callback Forwarding | vba-service forwards same reference | PASS | `vba-service-progress.test.ts` test 1 |
| Progress Callback Forwarding | query-service forwards same reference | PASS | `query-service-progress.test.ts` test 1 |
| Progress Callback Forwarding | Service called without onProgress | PASS | both -progress.test.ts test 2 |

### mcp-stdio-adapter/spec.md

| Requirement | Scenario | Status | Evidence |
|-------------|----------|--------|----------|
| Progress Token Extraction | Request carries progressToken | PASS | `progress.test.ts` test 1 |
| Progress Token Extraction | No progressToken → sendProgress undefined | PASS | `progress.test.ts` test 2 |
| Progress Notification Frame Format | sendProgress with all fields | PASS | `progress.test.ts` test 1 |
| Progress Notification Frame Format | sendProgress with progress only (no total/message) | PASS | `progress.test.ts` test 3 |
| Progress Notification Frame Format | No `id` field on notification | PASS | `progress.test.ts` test 1 assertion |
| MCP Adapter Over Core | Tool handler receives context with token | PASS | `tools.test.ts` context-wiring tests |
| MCP Adapter Over Core | Legacy handler with context does not throw | PASS | `tools.test.ts` legacy test |

---

## Hexagonal Boundary Check

| Check | Result |
|-------|--------|
| No `McpToolContext` import in `src/core/` | PASS — confirmed via grep; only comment reference in registry.ts |
| `AccessRunnerProgressCallback` is primitive (no MCP types) | PASS — `(percent, total?, message?) => void` |
| `PowerShellExecutorOptions.onProgress` is primitive | PASS |

---

## Design Coherence

| Decision | Implementation | Match |
|----------|---------------|-------|
| `McpToolContext` in `src/adapters/mcp/types.ts` | Created there | YES |
| Single extraction point in `callTool` | `callTool` extracts `progressToken` | YES |
| Token absent → sendProgress behavior | `undefined` (see deviation below) | DEVIATION |
| No `id` on notification frame | `writeNotification` omits id | YES |
| `else if` for PROGRESS_MARKER after ACCESS_PROCESS_MARKER | Correct ordering | YES |
| Parse failure silently swallowed | `catch {}` swallows | YES |
| PS milestones 10/40/90 | 10 after OpenCurrentDatabase, 40 before op, 90 before JSON | YES |
| No emission inside row loops | Confirmed by code inspection | YES |

---

## Issues

### WARNING W1: `sendProgress` declared as required in interface but assigned `undefined` at runtime

**Location**: `src/adapters/mcp/types.ts` line 11, `src/adapters/mcp/stdio.ts` line 187–200

**Detail**: The spec (`mcp-stdio-adapter/spec.md`) defines `sendProgress?` as optional on the interface. The implementation declares it non-optional (`sendProgress(...)` without `?`). When `progressToken` is absent, `sendProgress` is set to `undefined` and force-cast with `as McpToolContext["sendProgress"]`, creating a type lie that TypeScript cannot catch. 
- At runtime, all call sites use `context?.sendProgress?.(...)` with double optional chaining, so there is no crash risk.
- However, the TypeScript interface contract advertises `sendProgress` as always callable, which is false when no token is present.

**Recommendation**: Declare `sendProgress?` as optional on `McpToolContext` to match the spec and make the type contract honest.

### WARNING W2: `createUnavailableServices` ignores `onProgress` on the dynamic fallback path

**Location**: `src/adapters/mcp/stdio.ts` lines 282–296

**Detail**: The `vbaService.execute` and `queryService.execute` lambdas in `createUnavailableServices` only accept `(request)` and silently drop the `onProgress` argument. Progress notifications are never fired on the unavailable-services path.

**Recommendation**: Update the stubs to accept and forward `onProgress` to the dynamically resolved service.

---

## Final Verdict

**PASS WITH WARNINGS** — 0 CRITICAL, 2 WARNINGS
