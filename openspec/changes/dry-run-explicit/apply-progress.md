# Apply Progress: dry-run-explicit

**Change**: `dry-run-explicit`  
**Issue**: #351  
**Mode**: Strict TDD  
**Status**: COMPLETE — ready for verify

## Summary

Implemented visible MCP warning content for legacy write-capable tools when `apply` and `dryRun` are both omitted and the tool therefore defaults to dry-run. The primary response content remains at `content[0]`; `DRY_RUN_DEFAULT:` is appended as an additional text item.

Explicit user intent does not warn:
- `apply:true` executes/write-gates as before.
- `dryRun:false` executes/write-gates as before.
- `dryRun:true` is explicit dry-run and does not warn.
- `apply:false` is explicit non-apply intent and does not warn.

## TDD Evidence

| Phase | Evidence | Result |
|------|----------|--------|
| RED | Added failing expectations in `test/adapters/mcp/tools.dry-run.test.ts` for omitted flags warning, preserved `content[0]`, no warning for explicit flags. | Initial focused run failed because production did not emit the warning. |
| GREEN | Added adapter-local dry-run state and `DRY_RUN_DEFAULT:` content append in `src/adapters/mcp/tools.ts`. | Focused dry-run suite passed. |
| Regression fix | `legacy-parity.test.ts` exposed that `apply:false` was being treated as omission and that a maintenance dispatch test omitted explicit dry-run intent. | Fixed resolver to distinguish property presence from truthiness; made the parity test explicitly pass `dryRun:true`. |

## Verification Commands

| Command | Result |
|---------|--------|
| `pnpm vitest run test/adapters/mcp/tools.dry-run.test.ts --pool=threads --reporter verbose` | PASS — 1 file, 12 tests passed |
| `pnpm exec tsc -p tsconfig.json --noEmit && pnpm exec tsc -p tsconfig.test.json --noEmit` | PASS |
| `pnpm vitest run test/adapters/mcp/tools.test.ts test/adapters/mcp/legacy-parity.test.ts --pool=threads --reporter verbose` | PASS — 2 files, 44 tests passed |
| `pnpm test -- --pool=threads` | PASS — 49 files, 595 passed, 3 skipped |

## Files Changed

- `src/adapters/mcp/tools.ts` — dry-run state helper plus warning append logic.
- `test/adapters/mcp/tools.dry-run.test.ts` — strict TDD coverage for warning and explicit intent boundaries.
- `test/adapters/mcp/legacy-parity.test.ts` — explicit dry-run intent in maintenance dispatch regression.

## Notes

- No real Access E2E was run for this change.
- No commits, PRs, or issue closures were performed.
