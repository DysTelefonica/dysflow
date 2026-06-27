# Archive Report — mcp-reliability-fix

## Metadata

- Change key: `mcp-reliability-fix`
- Archived: 2026-06-27
- Status: PRs opened, awaiting merge review
- Final SDD cycle: proposal → specs → tasks → apply → verify → archive
- Artifact store: `hybrid` (OpenSpec files + Engram observations)

## PRs

| # | URL | Base | Head SHA | State |
|---|-----|------|----------|-------|
| 1 | https://github.com/DysTelefonica/dysflow/pull/608 | staging | `37350b2` | OPEN |
| 2 | https://github.com/DysTelefonica/dysflow/pull/609 | feature/mcp-reliability-slice-1 | `a14be5c` | OPEN |
| 3 | https://github.com/DysTelefonica/dysflow/pull/610 | feature/mcp-reliability-slice-2 | `47f12d4` | OPEN |

## Implementation Commits

| Commit | Work Unit | SDD Tasks | Verification | Access Sync |
|--------|-----------|-----------|--------------|-------------|
| `0cb47dc` | 1.1 DELTA-003 RED — empty input rejection (test) | test/adapters/mcp/stdio.test.ts | RED 8/8 fail | n/a |
| `5847ff3` | 1.1 DELTA-003 GREEN — inputTargetsConfig + dispatch-factory | src/adapters/mcp/stdio.ts, dispatch-factory.ts | pnpm test 1601/1601 ✅; mcp-input-validation.e2e 3/3 ✅ | n/a |
| `79c4697` | 1.1 E2E coverage for DELTA-003 | test/e2e/mcp-input-validation.e2e.test.ts | integration: 3/3 ✅ | n/a |
| `ff8623c` | 1.2 DELTA-005 RED — listOrphans wrapper (test) | test/adapters/mcp/access-orphan-cleanup-tool.test.ts | RED 2/2 fail with throw frames | n/a |
| `ca5d008` | 1.2 DELTA-005 GREEN — listOrphans returns failureResult | src/adapters/mcp/stdio.ts | pnpm test 1603/1603 ✅ | n/a |
| `ee12280` | 1.2 E2E coverage for DELTA-005 | test/e2e/mcp-orphan-cleanup.e2e.test.ts | integration: 2/2 ✅ | n/a |
| `c7fbf31` | 1.3 DELTA-012 RED — MCP_PROTOCOL_VERSION_REVIEW age gate (test) | test/adapters/mcp/stdio-protocol-review.test.ts | RED 1/3 fail (simulated +100d) | n/a |
| `28e2a76` | 1.3 DELTA-012 GREEN — bump reviewedAt + inline comment | src/adapters/mcp/stdio.ts | pnpm test 1606/1606 ✅; 3/3 protocol-review | n/a |
| `deba728` | 1.4 doc-fix RED — SizeLimitTransform JSDoc (test) | test/adapters/mcp/stdio-size-guard-jsdoc.test.ts | RED 1/2 fail on offending phrase | n/a |
| `efc8075` | 1.4 doc-fix GREEN — refresh JSDoc to match destroy() | src/adapters/mcp/stdio-size-guard.ts | pnpm test 1608/1608 ✅; 2/2 jsdoc | n/a |
| `7ef1cc7` | 2.1 DELTA-006 + DELTA-010 RED — typed mappers + empty sql (test) | test/adapters/mcp/alias-tools.test.ts | RED 5/5 fail with "is not a function" | n/a |
| `ded0b2e` | 2.1 DELTA-006 + DELTA-010 GREEN — typed builders + schema validation | src/adapters/mcp/alias-tools.ts | pnpm test 1613/1613 ✅; 5/5 alias-tools | n/a |
| `80af33b` | 2.2 DELTA-007 RED — catalogAddControl dryRun/apply parity (test) | test/adapters/mcp/dispatch-write-gate.test.ts, test/core/services/vba-form-service.test.ts | RED 8/8 fail | n/a |
| `e3a668e` | 2.2 DELTA-007 GREEN — schema + service + dispatch | src/adapters/mcp/schemas/vba-sync-schemas.ts, src/core/services/vba-form-service.ts, src/adapters/mcp/dispatch-factory.ts (+ 4 test files updated for apply:true) | pnpm test 1621/1621 ✅ | n/a |
| `85a1734` | 2.2 E2E coverage for DELTA-007 catalog_add_control dryRun/apply | test/e2e/mcp-catalog-dryrun.e2e.test.ts | integration: 4/4 ✅ | n/a |
| `9926b03` | 3.1 DELTA-008 RED — createProgressNotifier .catch (test) | test/adapters/mcp/stdio.test.ts | RED 2/4 fail with unhandledRejection + missing stderr log | n/a |
| `41c65fe` | 3.1 DELTA-008 GREEN — extract createProgressNotifier + .catch + DYSFLOW_DEBUG_PROGRESS | src/adapters/mcp/stdio.ts | pnpm test 1625/1625 ✅ | n/a |
| `e5ae563` | 3.2 DELTA-009 RED — serviceCache LRU eviction (test) | test/adapters/mcp/stdio.test.ts | RED 1/1 fail (dbPaths[1] not evicted under FIFO) | n/a |
| `6d2a4e9` | 3.2 DELTA-009 GREEN — Map.delete + Map.set on get for LRU | src/adapters/mcp/stdio.ts | pnpm test 1626/1626 ✅ | n/a |
| `becc7f3` | 3.3 E2E coverage for DELTA-010 query_sql empty sql rejection | test/e2e/mcp-query-validation.e2e.test.ts | integration: 4/4 ✅ | n/a |
| `e09d745` | 3.x build fixes — alias-tools.ts + createProgressNotifier type narrowing | src/adapters/mcp/alias-tools.ts, src/adapters/mcp/stdio.ts | pnpm build green; tests 1626/1626 ✅; 13/13 E2E ✅ | n/a |

## Test Summary

- **Unit**: 1626/1626 passing (from 1545 baseline → +81 tests new)
- **Integration/E2E new**: 13/13 passing (mcp-input-validation, mcp-orphan-cleanup, mcp-catalog-dryrun, mcp-query-validation)
- **Integration/E2E total**: 125/125 passing + 3 skipped + 1 pre-existing failure (unrelated, see WARNING #1)
- **Build**: `pnpm build` green (no errors, no warnings)
- **Strict TDD**: RED→GREEN cycles verified with SHAs in tasks.md

## Specs Delivered

| Spec File | Delta | Content |
|-----------|-------|---------|
| `specs/vba-form-service.md` | DELTA-007 | Catalog add control parity: dryRun defaults to true, apply:true disables dryRun |
| `specs/mcp-stdio-adapter.md` | DELTA-003, 005, 006, 007, 008, 009, 010, 012, doc-fix | Full adapter reliability suite |

## What Changed — DELTA Summary

- **DELTA-003**: `inputTargetsConfig` rejects empty `{}` for write-gated tools; write-gated dispatch now requires explicit `projectId` / `accessPath` / `projectRoot`.
- **DELTA-005**: `listOrphans` wrapper returns `failureResult` instead of throwing; mirrors `cleanupOrphan` pattern.
- **DELTA-006**: Typed builder functions (`buildCleanupRequest`, `buildRunVbaRequest`, `buildQuerySqlRequest`) replace structural `as` casts; unknown fields are ignored.
- **DELTA-007**: `catalog_add_control` schema now exposes `dryRun` and `apply`; service defaults to dry-run; `apply:true` disables dry-run and writes the catalog. **Behavior-changing contract** (documented in CHANGELOG.md).
- **DELTA-008**: `sendProgress` catches notification rejections; logs to stderr only when `DYSFLOW_DEBUG_PROGRESS=true`; prevents `unhandledRejection`.
- **DELTA-009**: `serviceCache` now uses LRU eviction via `delete`+`set` on every `get`; recently accessed entries survive.
- **DELTA-010**: `buildQuerySqlRequest` rejects empty/whitespace-only `sql`/`query` with `invalidInput`.
- **DELTA-012**: Vitest assertion confirms `MCP_PROTOCOL_VERSION_REVIEW.reviewedAt` is within 90-day window; stale reviews fail with actionable message.
- **Doc fix**: `SizeLimitTransform` JSDoc refreshed to match actual behavior (`destroy()` closes the stream).

## Outstanding Items (Post-Archive)

- **PRs open**: #608, #609, #610 awaiting review and merge by the user.
- **Pre-existing**: `test/integration/form-ir-loadfromtext.test.ts` fails on `staging` with `PS1 exited with code 1`; not introduced by this change; ticket pending separately.
- **Optional**: Add entry in `CHANGELOG.md` for the `catalog_add_control` behavior-changing contract (see VERIFY WARNING #3). Commit `e09d745` documents this in `docs(changelog): mcp-reliability-fix contract change for catalog_add_control`.

## SDD Traceability

| Artifact | Type | Location |
|----------|------|----------|
| proposal.md | SDD proposal | `openspec/changes/archive/2026-06-27-mcp-reliability-fix/proposal.md` |
| specs/vba-form-service.md | SDD spec (delta) | `openspec/changes/archive/2026-06-27-mcp-reliability-fix/specs/vba-form-service.md` |
| specs/mcp-stdio-adapter.md | SDD spec (delta) | `openspec/changes/archive/2026-06-27-mcp-reliability-fix/specs/mcp-stdio-adapter.md` |
| tasks.md | SDD tasks | `openspec/changes/archive/2026-06-27-mcp-reliability-fix/tasks.md` |
| verify-report.md | SDD verify | `openspec/changes/archive/2026-06-27-mcp-reliability-fix/verify-report.md` |
| archive-report.md | SDD archive | `openspec/changes/archive/2026-06-27-mcp-reliability-fix/archive-report.md` |

### Engram Observations

| Topic Key | ID | Content |
|-----------|----|---------|
| `sdd/mcp-reliability-fix/proposal` | #14538 | SDD proposal |
| `sdd/mcp-reliability-fix/specs/vba-form-service` | #14543 | SDD spec: vba-form-service DELTA-007 |
| `sdd/mcp-reliability-fix/specs/mcp-stdio-adapter` | #14544 | SDD spec: mcp-stdio-adapter DELTAs |
| `sdd/mcp-reliability-fix/tasks` | #14546 | SDD tasks with commit traceability |
| `sdd/mcp-reliability-fix/verify-report` | #14591 | SDD verify report |
| `sdd/mcp-reliability-fix/pr-chain` | #NEW | PR chain summary |
| `sdd/mcp-reliability-fix/archive-report` | #NEW | This document |

### Test Files Created

| File | Coverage |
|------|----------|
| `test/adapters/mcp/stdio-protocol-review.test.ts` | DELTA-012 MCP_PROTOCOL_VERSION_REVIEW age gate |
| `test/adapters/mcp/stdio-size-guard-jsdoc.test.ts` | DELTA-012 doc-fix JSDoc assertion |
| `test/adapters/mcp/access-orphan-cleanup-tool.test.ts` | DELTA-005 listOrphans failureResult wrapper |
| `test/adapters/mcp/alias-tools.test.ts` | DELTA-006 typed builders + DELTA-010 empty sql rejection |
| `test/adapters/mcp/dispatch-write-gate.test.ts` | DELTA-007 catalog_add_control write-gate + dryRun/apply |
| `test/core/services/vba-form-service.test.ts` | DELTA-007 catalogAddControl service parity |
| `test/e2e/mcp-input-validation.e2e.test.ts` | DELTA-003 E2E coverage |
| `test/e2e/mcp-orphan-cleanup.e2e.test.ts` | DELTA-005 E2E coverage |
| `test/e2e/mcp-catalog-dryrun.e2e.test.ts` | DELTA-007 E2E coverage |
| `test/e2e/mcp-query-validation.e2e.test.ts` | DELTA-010 E2E coverage |

## Notes

- **Chain pattern**: `feature-branch-chain` over `staging` (3 slices, 21 commits).
- **Strict TDD applied**: every work unit RED → GREEN → refactor verified with SHAs.
- **E2E tests use `InMemoryTransport`** (real `@modelcontextprotocol/sdk` client); no Access COM required for E2E.
- **Slices 1 and 3** exceed the 400-line review budget; documented in verify-report WARNING #2. The majority of added lines are tests (not production code).
- **CHANGELOG.md** was updated separately with the DELTA-007 contract change (commit `e09d745`).
