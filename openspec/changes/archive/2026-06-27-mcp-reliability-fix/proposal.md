# Proposal: MCP Reliability Fix (post-hardening residuals)

## Intent

Close residual MCP reliability gaps the archived `mcp-hardening` change
(2026-06-26, 1545 tests) did not finish, plus items a fresh audit missed:
write-gate wrapper, schema parity, alias type-safety, observability.

## Scope

### In Scope

- **ALTO #3** — `inputTargetsConfig` accepts empty `{}` as targeting startup
  config (`src/adapters/mcp/stdio.ts:511`). Require explicit `projectId` or
  `accessPath` first.
- **MEDIO #5 (stdio wrapper)** — `orphanCleanupService.listOrphans` in
  `src/adapters/mcp/stdio.ts:355-363` still throws raw `Error` even though
  `mcp-hardening` made the core service return `OperationResult`. Mirror the
  `cleanupOrphan` pattern in the same object.
- **MEDIO #6** — Structural `as { ... }` casts in
  `src/adapters/mcp/alias-tools.ts:82-153` with no runtime guard. Replace
  with field-typed mappers that read only declared fields.
- **MEDIO #7** — `generate_form` schema (`vba-sync-schemas.ts:188-202`)
  exposes `dryRun`/`apply`; `catalog_add_control` (`:203-216`) does not —
  both are `mutatesFilesystem:true` in `dispatch-routes.ts:44-45`. Add
  `dryRun`/`apply` to `catalog_add_control` and apply the
  `apply === true ? false : dryRun !== false` guard (mirrors
  `vba-form-service.ts:99`).
- **BAJO #8** — `sendProgress` fire-and-forget at
  `src/adapters/mcp/stdio.ts:162-174` drops notification errors. Catch and
  report.
- **BAJO #9** — FIFO eviction in `serviceCache` at
  `src/adapters/mcp/stdio.ts:310-313` → LRU (re-insert on access).
- **BAJO #10** — `query_sql` empty-string fallback at
  `src/adapters/mcp/alias-tools.ts:186` → reject with `MCP_INPUT_INVALID`.
- **BAJO #12** — Hard-coded `MCP_PROTOCOL_VERSION_REVIEW.reviewedAt` at
  `src/adapters/mcp/stdio.ts:74-78` → add Vitest assertion that age ≤
  SDK `LATEST_PROTOCOL_VERSION` ship window.
- **Doc fix** — Stale JSDoc at `src/adapters/mcp/stdio-size-guard.ts:7-21`
  ("does NOT close" while code at `:121` calls `this.destroy()`). Refresh.

### Out of Scope / Non-goals

- **ALTO #4** (accessPassword redaction in vba-sync) — **false positive**.
  `dispatch-factory.ts:96-103` documents that `AccessPowerShellRunner`
  owns and redacts `accessPassword` from every error message.
- **BAJO #11** (JSON.parse prototype pollution) — **false positive**.
  `parseMcpArgsJson` returns the parsed value as a data array
  (`dispatch-common.ts:52-60`); never merged into an object downstream.
- `form-ui-factory` slice plan (will rewrite `generate_form` — when it
  lands, MEDIO #7 for `generate_form` is moot; `catalog_add_control`
  parity remains).
- `split-dispatch-god-file` refactor (separate change).
- New MCP tools or Access-side changes.

## Capabilities

### New Capabilities
None.

### Modified Capabilities

- `mcp-stdio-adapter`: ambiguous empty input rejected;
  `orphanCleanupService.listOrphans` returns `OperationResult`, not throw.
- `vba-sync`: `catalog_add_control` schema and service path accept
  `dryRun`/`apply` with default-dryRun semantics matching `generate_form`.
- `mcp-stdio-adapter` (alias handlers): structural `as` casts replaced
  with field-typed mappers.

## Approach

Single change, four work units (see tasks). Each work unit: RED test
first, GREEN fix, REFACTOR. Behavior-preserving except where the fix
explicitly changes a contract (catalog_add_control dryRun parity,
empty-input rejection, empty-sql rejection).

## Affected Areas

| Area | Impact |
|------|--------|
| `src/adapters/mcp/stdio.ts` | Modified |
| `src/adapters/mcp/alias-tools.ts` | Modified |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | Modified |
| `src/core/services/vba-form-service.ts` | Modified |
| `src/adapters/mcp/stdio-size-guard.ts` | JSDoc refresh only |
| `test/adapters/mcp/stdio*.test.ts` | RED tests |
| `test/adapters/mcp/alias-tools.test.ts` | type-guard coverage |

## Risks

| Risk | Mitigation |
|------|------------|
| Empty-input rejection breaks no-input tools | `NO_INPUT_SCHEMA` allowlist (e.g. `list_access_operations`) |
| `catalog_add_control` dryRun default changes observable behavior | TDD; pre-existing callers become safe-by-default |
| LRU eviction shifts cache patterns | Cover hot/cold paths; preserve bounded entry count |
| `sendProgress` error logging adds noise | Debug-level, env-gated |

## Rollback Plan

Revert the commits. Each work unit is isolated to one adapter module;
partial rollback is safe.

## Dependencies

- Strict TDD; `pnpm test` (Vitest).
- `mcp-hardening` (archived) must stay applied — assumes the
  `OperationResult` shape on the core service.

## Success Criteria

- [ ] Empty `{}` input to a write tool does NOT silently target startup config.
- [ ] `orphanCleanupService.listOrphans` returns `OperationResult`; no raw `throw` reaches the SDK.
- [ ] `catalog_add_control` schema and service accept `dryRun`/`apply`; default is dryRun.
- [ ] `alias-tools.ts` request mappers use field-typed builders, not `as`.
- [ ] `query_sql` with no `sql`/`query` returns `MCP_INPUT_INVALID`.
- [ ] `sendProgress` reports notification failures (test asserts callback receives error).
- [ ] `serviceCache` evicts LRU, not FIFO.
- [ ] `MCP_PROTOCOL_VERSION_REVIEW.reviewedAt` age is asserted at CI.
- [ ] `SizeLimitTransform` JSDoc matches code.
- [ ] `pnpm test` and `pnpm build` green; RED-before-GREEN per work unit.
