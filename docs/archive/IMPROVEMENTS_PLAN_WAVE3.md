# Dysflow — Improvement Plan Wave 3

Generated after full codebase audit on 2026-05-29 (post-v1.0.0).
All Wave 1 (P1–P8) and Wave 2 (Q1–Q9) items are complete.

> **For any AI continuing this work**: read each section fully before touching any file.
> Never modify the production runtime at `%LOCALAPPDATA%\dysflow` or `C:\Users\adm1\.config\opencode\opencode.json`.
> Run tests after every change: `pnpm test`. Build: `pnpm build`.
> Strict TDD is active: RED test first, then implement, then GREEN.

---

## Master Checklist

| # | Item | Severity | Status |
|---|------|----------|--------|
| R1 | Complete MCP SDK migration: remove `JsonLineMcpStdioRuntime` + migrate legacy tests | HIGH | ⬜ |
| R2 | Fix 24 auto-fixable Biome lint/format errors + add `lint:fix` script | LOW | ⬜ |
| R3 | Split `tools.ts` (752 L → focused sub-files) | MEDIUM | ⬜ |
| R4 | Audit and reduce `vba-sync-adapter.ts` (509 L — target was ~120 L after P3) | MEDIUM | ⬜ |
| R5 | Split `access-runner.ts` (540 L) | LOW-MEDIUM | ⬜ |
| R6 | Add `test:e2e:sql` npm script + document E2E workflow | LOW | ⬜ |

---

## Build / Test Workflow

```powershell
# 1. Build
Set-Location 'C:\Proyectos\dysflow'
pnpm build

# 2. Unit tests
pnpm test

# 3. Install to isolated test-runtime (never the production path)
node dist/cli/index.js install --runtime-dir 'C:\Proyectos\dysflow\test-runtime' --no-tui

# 4. Targeted E2E (no fixture needed)
$env:DYSFLOW_E2E_COMMAND = 'C:\Proyectos\dysflow\test-runtime\bin\dysflow.cmd'
node 'C:\Proyectos\dysflow\E2E_testing\test-sql-guard.mjs'

# 5. Full MCP E2E (requires .accdb fixtures)
node 'C:\Proyectos\dysflow\E2E_testing\mcp-e2e.mjs'
```

---

## R1 — Complete MCP SDK migration: remove legacy runtime

### Problem

`src/adapters/mcp/stdio.ts` is 579 lines. The Q7 acceptance criterion was ≤ 100 lines.

The excess is `JsonLineMcpStdioRuntime` (the hand-rolled JSON-RPC runtime, ~240 lines) that was kept because two test files inject it:
- `test/adapters/mcp/stdio.test.ts` (966 lines) — injects `JsonLineMcpStdioRuntime` via the legacy path
- `test/adapters/mcp/progress.test.ts` — same

Phase 4 of Q7 added NEW SDK test files (`stdio-sdk.test.ts`, `progress-sdk.test.ts`) but left the legacy tests untouched. The migration is not complete until:
1. `stdio.test.ts` and `progress.test.ts` are migrated to use `InMemoryTransport` (or deleted if fully covered by the new SDK tests)
2. `JsonLineMcpStdioRuntime` and `McpStdioRuntime` are deleted from `stdio.ts`
3. `stdio.ts` reaches ≤ 100 lines

### Behavior coverage gap analysis

Before touching anything, map which behaviors are tested in `stdio.test.ts` / `progress.test.ts` but NOT yet in `stdio-sdk.test.ts` / `progress-sdk.test.ts`:

- `initialize` response shape + `protocolVersion` assertion → covered by legacy only
- Unknown method → `-32601` → covered by legacy only
- CRLF line handling → covered by `stdio-size-guard.test.ts` (sufficient)
- Chunked line accumulation → covered by `stdio-size-guard.test.ts` (sufficient)
- Oversized line → 32700 error → covered by `stdio-size-guard.test.ts` (sufficient)
- `id: null` treated as valid request id → legacy only
- Notifications (no `id`) ignored → legacy only

### Files to change

- `test/adapters/mcp/stdio.test.ts` — migrate remaining behaviors to `InMemoryTransport` harness (see `stdio-sdk.test.ts` for pattern), then delete
- `test/adapters/mcp/progress.test.ts` — migrate to `InMemoryTransport`, then delete
- `src/adapters/mcp/stdio.ts` — delete `JsonLineMcpStdioRuntime`, `McpStdioRuntime`, `isMcpStdioRuntime`, and the legacy overload of `startMcpStdioAdapter`

### Implementation steps

1. Read `test/adapters/mcp/stdio.test.ts` and `progress.test.ts` fully.
2. For each test that covers a behavior NOT yet in `stdio-sdk.test.ts`:
   - Add it to `stdio-sdk.test.ts` (or a new `stdio-sdk-protocol.test.ts`) using `InMemoryTransport`
   - Confirm it passes
3. Delete `stdio.test.ts` and `progress.test.ts`
4. Remove from `stdio.ts`:
   - `JsonLineMcpStdioRuntime` class
   - `McpStdioRuntime` type
   - `isMcpStdioRuntime` function
   - `JsonRpcMethodNotFound` class
   - `JsonRpcRequest` type
   - All legacy overloads of `startMcpStdioAdapter` (keep only the no-arg production call)
   - The `if (suppliedRuntime !== undefined)` branch
5. Run `pnpm build` + `pnpm test` — green.
6. Verify `stdio.ts` line count ≤ 100.

### Acceptance criteria

- `stdio.ts` is ≤ 100 lines.
- `JsonLineMcpStdioRuntime` is gone.
- `pnpm test` is green with no regressions.
- All five custom behaviors from Q7 remain tested via SDK harness.

### Risk

MEDIUM. Deleting 966-line test files is destructive — ensure coverage is transferred before deletion, not after.

---

## R2 — Fix 24 Biome lint/format errors + add `lint:fix` script

### Problem

`pnpm lint` reports 24 errors across 3 categories:
- **format** (13 files): `stdio.ts`, `tools.ts`, `vba-sync-adapter.ts`, `server.ts`, and 5 new test files added in Q7/Q5
- **organizeImports** (12 files): same files, unsorted import blocks
- **useTemplate** (8 occurrences in `stdio-size-guard.ts`): string concatenation should use template literals

All are auto-fixable. No logic changes.

Additionally, `package.json` has no `lint:fix` script — running `biome check --write` must be done manually.

### Files to change

- All files reported by `pnpm lint` (run to get full list)
- `package.json` — add `"lint:fix": "biome check src/ test/ --write"`

### Implementation steps

1. Add `lint:fix` script to `package.json`.
2. Run `pnpm lint:fix` — Biome auto-fixes format, import order, and template literal issues.
3. Run `pnpm build` — must stay green (pure formatting, no logic).
4. Run `pnpm test` — must stay green.
5. Run `pnpm lint` — must report zero errors.
6. Commit: `chore: fix biome lint/format violations, add lint:fix script`

### Acceptance criteria

- `pnpm lint` exits 0 with zero errors.
- `package.json` has a `lint:fix` script.

### Risk

LOW. Biome auto-fix is conservative — it only changes whitespace, import order, and trivial idiom fixes. TypeScript semantics are unchanged.

---

## R3 — Split `tools.ts` (752 L)

### Problem

`src/adapters/mcp/tools.ts` is 752 lines and handles three distinct concerns:
1. **Tool factory** (`createDysflowMcpTools`, write-guard logic, alias registration) — ~300 L
2. **MCP tool definitions** (inline handler implementations for `dysflow_*` tools) — ~200 L
3. **Alias handlers** (`run_vba`, `query_sql`, `list_access_operations`, etc.) — ~200 L
4. **Shared utilities** (`sanitizeMcpErrorMessage`, `DysflowMcpServices` type, tool types) — ~50 L

### Target state

```
src/adapters/mcp/
  tools.ts              ← factory only (~120 L): createDysflowMcpTools, write guard, service wiring
  tool-handlers.ts      ← NEW: handler implementations for the 5 dysflow_* tools
  tool-aliases.ts       ← NEW: alias tool registrations (run_vba, query_sql, etc.)
  tool-types.ts         ← NEW (or merge into types.ts): DysflowMcpServices, McpToolResult, sanitizeMcpErrorMessage
```

**NOTE**: `tools.ts` must NOT be modified per Q7 spec. That constraint was for the Q7 migration window. It no longer applies — Q7 is complete.

### Implementation steps

1. Identify the three logical sections by reading `tools.ts`.
2. Extract one section at a time. Run `pnpm build` + `pnpm test` after each extraction.
3. `tools.ts` becomes a re-export barrel if needed, or a pure factory.
4. Commit per extraction.

### Acceptance criteria

- `pnpm build` + `pnpm test` pass at every intermediate step.
- `tools.ts` ≤ 150 lines after split.
- No change to exported symbol names or signatures.

### Risk

HIGH. `tools.ts` is imported by `stdio.ts`, `mcp-tool-registry.ts`, and many test files. Move one section at a time. Do NOT attempt in a single pass.

---

## R4 — Audit `vba-sync-adapter.ts` (509 L)

### Problem

After P3 (Wave 1), `vba-sync-adapter.ts` was supposed to be ~120 L (thin orchestrator). It is currently 509 lines. Either:
- The split didn't shrink the orchestrator as expected, OR
- New logic was added back to the orchestrator after the split

### Investigation first

Before writing any code:
1. Read `src/adapters/vba-sync/vba-sync-adapter.ts` to understand current content.
2. Compare against the P3 target: "implements VbaSyncPort, delegates to 4 sub-adapters."
3. If the excess is logic that belongs in the sub-adapters, move it.
4. If it is genuinely orchestration logic, document why the ~120 L target was wrong.

### Sub-adapters that exist (from P3)

```
src/adapters/vba-sync/
  vba-operations-adapter.ts
  vba-modules-adapter.ts
  vba-execution-adapter.ts
  vba-forms-adapter.ts
```

### Acceptance criteria

- `vba-sync-adapter.ts` ≤ 200 lines (revised target — 120 may have been optimistic).
- `pnpm test` passes.
- No behavior change.

### Risk

MEDIUM. The existing sub-adapter test files are large (641 L, 351 L). Move logic only, never behavior.

---

## R5 — Split `access-runner.ts` (540 L)

### Problem

`src/core/runner/access-runner.ts` is 540 lines. It handles:
- PowerShell process spawning + timeout management
- Request routing (VBA, query, diagnostics)
- Operation registry locking + stale lock eviction
- Error normalization

### Target state

```
src/core/runner/
  access-runner.ts      ← public API entry point (~100 L)
  runner-process.ts     ← PowerShell spawn + timeout + kill (~150 L)
  runner-dispatch.ts    ← request routing per action type (~150 L)
  runner-lock.ts        ← operation registry lock lifecycle (~100 L)
```

### Risk

HIGH. This is the core execution path — every test that touches Access behavior goes through it. Do one section at a time, green tests after each.

---

## R6 — Add `test:e2e:sql` npm script + document E2E workflow

### Problem

`E2E_testing/test-sql-guard.mjs` has no npm script entry. Developers must know the raw path to run it. `mcp-e2e.mjs` has `test:e2e:mcp` but the SQL guard script is undiscoverable.

### Implementation

In `package.json`, add:
```json
"test:e2e:sql": "node E2E_testing/test-sql-guard.mjs"
```

Update `E2E_testing/README.md` to document both scripts with prerequisites.

### Risk

TRIVIAL.

---

## Suggested execution order

```
R2 → R1 → R3 → R4 → R5 → R6
```

Rationale:
- **R2 first**: zero-risk cleanup that removes noise from future diffs.
- **R1**: completes Q7 properly — stdio.ts must reach ≤ 100 L before it becomes a bigger debt.
- **R3**: largest file after R1 shrinks stdio.ts.
- **R4**: audit before spending effort — may be a documentation fix, not code.
- **R5**: high-risk split, do after the simpler items build confidence.
- **R6**: trivial, last.

---

## Version targets

| Item | Suggested release |
|------|------------------|
| R2, R6 | v1.0.1 |
| R1 | v1.1.0 |
| R3, R4 | v1.1.x |
| R5 | v1.2.0 |

---

## Current state snapshot (2026-05-29)

- **Branch**: `feat/mcp-sdk-migration` (pending merge to `main`)
- **Version**: `1.0.0` (tag `v1.0.0` pushed, release created)
- **Tests**: 717 passing, 3 skipped
- **Lint**: 24 auto-fixable Biome errors
- **Largest file**: `tools.ts` (752 L)
- **Remaining legacy debt in stdio.ts**: `JsonLineMcpStdioRuntime` (~240 L) — target: delete after R1
