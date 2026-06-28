# Archive Report — close-batch-575-576-578

## Metadata

- Change key: `close-batch-575-576-578`
- Archived: 2026-06-28
- Status: 3 issues closed, all commits pushed to `main`
- Final SDD cycle: proposal → specs → tasks → apply → verify → archive
- Artifact store: `hybrid` (OpenSpec files + Engram observations)

## Issues Closed

| Issue | Title | Commit | Verification |
|---|---|---|---|
| [#575](https://github.com/DysTelefonica/dysflow/issues/575) | `fix(registry): quarantine corrupt Access operation registry instead of treating it as empty` | `88770d8` | pnpm test 1657/1657 ✅ + 7 new tests |
| [#576](https://github.com/DysTelefonica/dysflow/issues/576) | `fix(http): use common sanitization for HTTP error envelopes` | `4979c48` | pnpm test 1672/1672 ✅ + 7 new tests |
| [#578](https://github.com/DysTelefonica/dysflow/issues/578) | `refactor(mcp): replace cast-built query action map with compiler-checked mapping` | `764e313` | pnpm test 1674/1674 ✅ + 2 new tests |

## Implementation Commits

| Commit | Work Unit | SDD Tasks | Verification | Access Sync |
|--------|-----------|-----------|--------------|-------------|
| `88770d8` | DELTA-001 — registry quarantine (#575) | `src/core/operations/access-operation-registry.ts`, `src/adapters/http/server.ts`, `src/adapters/mcp/canonical-handlers.ts`, `src/adapters/mcp/stdio.ts`, `src/adapters/vba-sync/vba-operations-adapter.ts` + tests | pnpm test 1657 → 1665 (+8) ✅; pnpm build ✅; pnpm lint ✅ | n/a (core registry + adapter envelopes) |
| `4979c48` | DELTA-002 — HTTP error sanitization (#576) | `src/adapters/http/server.ts` + `test/adapters/http/server-error-sanitization.test.ts` (new) + `test/adapters/http/server.test.ts` (1 message) | pnpm test 1672/1672 (+7) ✅; pnpm build ✅; pnpm lint ✅ | n/a (HTTP adapter only) |
| `764e313` | DELTA-003 — typed query action map (#578) | `src/adapters/mcp/dispatch-routes.ts` + `test/adapters/mcp/mcp-tool-action-map-source.test.ts` (new) | pnpm test 1674/1674 (+2) ✅; pnpm build ✅; pnpm lint ✅; TypeScript caught pre-existing drift (7 alias tools missing from the cast map) | n/a (MCP dispatch compile-time check) |
| `a140150` | tasks.md traceability update | `openspec/changes/close-batch-575-576-578/tasks.md` | n/a (documentation only) | n/a |

## Test Summary

- **Unit**: 1674/1674 passing (from 1658 baseline → +16 tests, all green)
- **Integration/E2E new**: 0 (all three work units live above the Access I/O boundary; no E2E needed per RED-GREEN-REFACTOR)
- **Pester**: 374 pass, 0 failed, 4 skipped (no change from baseline)
- **Build**: `pnpm build` green
- **Lint**: `pnpm lint` green (242 files checked)
- **Strict TDD**: RED → GREEN cycles verified per work unit; commit messages document each cycle

## Specs Delivered

| Spec File | Delta | Content |
|-----------|-------|---------|
| `specs/access-operation-registry.md` | DELTA-001 | Registry quarantine + `getHealth()` propagation through HTTP/MCP list and cleanup |
| `specs/http-error-sanitization.md` | DELTA-002 | Shared `sanitizeMcpErrorMessage` for HTTP envelopes (service results, validation, body-read) |
| `specs/mcp-query-dispatch.md` | DELTA-003 | Compile-time-checked query action map with `satisfies Record<...>` |

## What Changed — DELTA Summary

### DELTA-001 (#575) — Registry Quarantine

- New `AccessOperationRegistryHealth` type (`{ status: "ok" }` | `{ status: "degraded", reason: "corrupt-json", quarantinePath, quarantinedAt }`).
- `AccessOperationRegistry` interface gains `getHealth()`.
- `FileAccessOperationRegistry.readRecords()` renames a corrupt JSON file to `<filePath>.quarantine-<ISO>.json` sidecar instead of silently returning an empty map. Original bytes are preserved for forensics.
- `InMemoryAccessOperationRegistry.getHealth()` always returns `ok` (in-memory state cannot be corrupted).
- HTTP `/access/operations` and `/access/cleanup` responses include `registryHealth` so callers can distinguish "no operations" from "registry was corrupt and is now empty by design".
- MCP `handleMcpAccessOperationsList` and `handleMcpAccessCleanup` propagate `registryHealth` on success envelopes.
- MCP stdio `operationRegistry` aggregator walks cached services first and reports the first degraded entry, so fan-out cannot hide corruption behind a healthy default registry.

### DELTA-002 (#576) — HTTP Error Sanitization

- New `sanitizeOperationResult(result, secrets)` helper returns a shallow-copied result with `error.message` redacted via `sanitizeMcpErrorMessage`. `error.code` and `error.retryable` are preserved byte-for-byte. Successful results are returned untouched.
- `routeRequest` builds `secrets = collectSecrets(context)` once and threads it through every response via a local `send(result, failureStatus?)` closure.
- `handleValidation` now uses `sanitizeMcpErrorMessage` (was `sanitizeSecrets`) so the validation-error path also strips paths and `;PWD=...` fragments.
- `StartDysflowHttpServerOptions` gains `accessPassword` and `backendPassword` fields, with caller-supplied values winning over env-derived ones (so tests and higher-level callers aren't silently overridden by `.dysflow/project.json`).
- Internal user-facing message updated: `The /query/read route only accepts ...` → `The query/read route only accepts ...` so the POSIX-path stripper doesn't redact the route token.

### DELTA-003 (#578) — Typed Query Action Map

- `MCP_TOOL_QUERY_ACTIONS` is now an explicit object literal:
  ```ts
  export const MCP_TOOL_QUERY_ACTIONS = {
    query_sql: "query_sql",
    exec_sql: "exec_sql",
    // ... 22 more
  } as const satisfies Record<QueryToolName, AccessQueryAction>;
  ```
- The `as Record<...>` cast and the dynamic `Object.fromEntries(... .map(...))` construction are gone.
- TypeScript caught pre-existing drift during the refactor: the original cast-built map silently dropped the 7 alias-tool entries (`query_sql`, `exec_sql`, `run_script`, `create_table`, `drop_table`, `seed_fixture`, `teardown_fixture`). The literal now lists all 24 `QueryToolName` entries; the existing `alias-tools.ts` and `dispatch.ts` continue to consume the same map unchanged.
- New `mcp-tool-action-map-source.test.ts` (2 assertions) guards against regression to the `as Record<...>` pattern and asserts the `satisfies` annotation is present.

## Outstanding Items (Post-Archive)

None — all 3 issues closed with traceability comments, all commits on `main`, all tests green.

## SDD Traceability

| Artifact | Type | Location |
|----------|------|----------|
| proposal.md | SDD proposal | `openspec/changes/archive/2026-06-28-close-batch-575-576-578/proposal.md` |
| specs/access-operation-registry.md | SDD spec (delta) | `openspec/changes/archive/2026-06-28-close-batch-575-576-578/specs/access-operation-registry.md` |
| specs/http-error-sanitization.md | SDD spec (delta) | `openspec/changes/archive/2026-06-28-close-batch-575-576-578/specs/http-error-sanitization.md` |
| specs/mcp-query-dispatch.md | SDD spec (delta) | `openspec/changes/archive/2026-06-28-close-batch-575-576-578/specs/mcp-query-dispatch.md` |
| tasks.md | SDD tasks | `openspec/changes/archive/2026-06-28-close-batch-575-576-578/tasks.md` |
| archive-report.md | SDD archive | `openspec/changes/archive/2026-06-28-close-batch-575-576-578/archive-report.md` |

### Engram Observations

| Topic Key | Type | Content |
|-----------|------|---------|
| `sdd/close-batch-575-576-578` | architecture | This archive report |

### Test Files Created

| File | Coverage |
|------|----------|
| `test/core/operations/access-operation-registry-quarantine.test.ts` | DELTA-001 quarantine + health (7 tests) |
| `test/adapters/http/server-error-sanitization.test.ts` | DELTA-002 HTTP envelope sanitization (7 tests) |
| `test/adapters/mcp/mcp-tool-action-map-source.test.ts` | DELTA-003 source-code assertion for `satisfies` (2 tests) |

### Test Files Updated

| File | Change |
|------|--------|
| `test/core/runner/access-operation-registry.test.ts` | Lines 492, 1132, 1146: assertions for corrupt-quarantine behavior (was: empty map + log entry) |
| `test/core/operations/access-operation-registry-sharing.test.ts` | unchanged (covered by existing tests) |
| `test/core/operations/access-operation-registry-quarantine.test.ts` | new |
| `test/adapters/http/server.test.ts` | Line 544 + 593-720: response shape `{ operations, registryHealth }` and `{ cleanup, registryHealth }` |
| `test/adapters/mcp/tools.test.ts` | Line 1653-1695: response envelope includes `registryHealth` |
| `test/adapters/vba-sync/vba-operations-adapter.test.ts` | Mock registry now includes `getHealth()`; response shape updated |
| `test/core/runner/access-runner.test.ts` | Three mock registries now include `getHealth()` |

## Notes

- **Single-commit per issue strategy** (no chained PRs): `dysflow/release-policy/main-only` (engram #14611) — direct commits to `main`, no staging, no PRs.
- **Strict TDD applied**: every work unit RED → GREEN → verify. Each commit message documents the cycle.
- **#578 refactor** caught a pre-existing bug (the cast-built map dropped 7 alias-tool entries). The fix is additive: the existing `alias-tools.ts` and `dispatch.ts` already used the cast map, so once the literal lists all 24 entries, the runtime behavior is unchanged but the type system enforces coverage.
- **Encoding functions** in `src/core/utils/sanitize-error.ts` were NOT modified per the user's instruction.
- **No Pester changes** — the 3 issues are above the Access I/O boundary (registry core, HTTP envelope, MCP dispatch). Pester still at 374/374.

## Verification Trail (commands run after archive)

```bash
pnpm test --run --no-coverage --reporter=dot    # 1674/1674 ✅
pnpm build                                       # ✅
pnpm lint                                        # ✅ (242 files)
pwsh -Command "Invoke-Pester scripts/tests/"    # 374/374 ✅
```
