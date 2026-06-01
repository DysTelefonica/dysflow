# Coverage #372 Progress

Goal: raise branch coverage from 78.28% (1774/2266) to ≥ 82% (~+84 branches).

## Final Result

**Branch coverage: 82.08% (1860/2266) — GOAL MET.**

All thresholds pass:
- Statements: 88.62% ≥ 82%
- Branches: 82.08% ≥ 82%
- Functions: 88.38% ≥ 85%
- Lines: 90.17% ≥ 84%

`vitest.config.ts` threshold updated: `branches: 77` → `branches: 82`.
`docs/testing/repo-quality-gates.md` updated to reflect new floors.

## Status Table

| File | Uncovered Before | Covered After | Tests Added | Status |
|------|-----------------|---------------|-------------|--------|
| src/core/services/vba-form-service.ts | 30/82 | ~10 remaining | ~24 tests | Done |
| src/core/services/vba-source-comparison.ts | 27/71 | ~7 remaining | ~15 tests | Done |
| src/core/operations/access-operation-registry.ts | 29/107 | ~22 remaining | ~12 tests | Done |
| src/adapters/vba-sync/vba-execution-adapter.ts | 18/78 | ~10 remaining | ~6 tests | Done |
| src/adapters/vba-sync/vba-sync-adapter.ts | 34/123 | ~20 remaining | ~12 tests | Done |
| src/cli/commands/install/downloader.ts | 19/43 | ~4 remaining | ~15 tests | Done |
| src/cli/commands/tui.ts | 39/82 | unchanged | 0 | Skipped (see below) |
| src/adapters/mcp/tools.ts | 50/214 | unchanged | 0 | Skipped (see below) |
| src/adapters/mcp/stdio.ts | 41/84 | unchanged | 0 | Skipped (see below) |

## What was intentionally skipped

### src/cli/commands/tui.ts (39 uncovered branches)
The TUI interactive loop uses `readTuiKey` and frame rendering with process.stdout. Covering its
branches would require deep coupling to the interactive loop internals or a complex event-based
test harness. The 82% target was met without this file. If coverage is needed here, use the
existing `test/cli/commands/tui.test.ts` as a starting point and inject key sequences via
the seams already in place.

### src/adapters/mcp/tools.ts (50 uncovered branches)
The MCP tool surface has many branches tied to edge cases in specific tool handler paths. The
existing `test/adapters/mcp/` coverage was not increased because the 82% target was met with
other files. Future work: drive tool handlers via fake services to cover error/dry-run paths.

### src/adapters/mcp/stdio.ts (41 uncovered branches)
Transport wiring — hard to test without coupling to the stdio transport protocol. Skipped.

### Internal lock-contention branches in access-operation-registry.ts
Lines 194-199 (acquireRegistryMutationLock): `writeFile` with `flag: "wx"` error paths other than
ENOENT/EEXIST. These require injecting specific OS-level errors at the right moment which would
couple to the file-lock internals. Skipped per testing philosophy.

## Running Branch % History

- Baseline: 78.28% (1774/2266)
- After all batches: 82.08% (1860/2266) → **+86 branches covered**

## How to Continue (if more coverage is needed)

1. Run `pnpm coverage` to get fresh baseline.
2. Run the branch analysis script to find remaining uncovered branches:
   ```
   node -e "const fs=require('fs');const cov=JSON.parse(fs.readFileSync('coverage/coverage-final.json','utf8'));..." 
   ```
3. Next highest-ROI targets:
   - `src/cli/commands/tui.ts` — 39 uncovered (hard, requires TUI test harness)
   - `src/adapters/mcp/tools.ts` — 50 uncovered (drive via fake services)
   - `src/adapters/mcp/stdio.ts` — 41 uncovered (transport wiring, skip unless necessary)
   - `src/adapters/http/server.ts` — 20 uncovered
4. When branches improve: update `vitest.config.ts` thresholds.branches and this doc.
