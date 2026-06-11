# Design: Cleanup Write-Gate Parity

## Technical Approach

Add a force-only write gate to the HTTP `/access/cleanup` route, mirroring the existing MCP behavior in `handleMcpAccessCleanup`. The gate sits at the adapter layer — before core cleanup execution — so the ownership and eligibility logic in `AccessOperationCleanupService` remains untouched.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Shared gate helper | Lowest drift risk; one contract to test | Rejected for this change — over 400-line budget |
| Inline gate in HTTP route | Matches existing HTTP pattern (`/query/write`, `/vba/execute`); smallest diff | **Chosen** |
| Gate in core service | Breaks hexagonal boundary; mixes adapter config with domain logic | Rejected |

**Decision: Inline force-only gate in HTTP route handler**

**Choice**: Add `if (body.data.force === true && !context.writesEnabled)` before calling `cleanupService.cleanup()`.

**Alternatives considered**: Extracting a shared `isForceCleanupAllowed()` helper used by both MCP and HTTP. This would reduce long-term drift but adds a second file change outside the 400-line review budget.

**Rationale**: The MCP gate logic is 4 lines (canonical-handlers.ts:122-127). Duplicating that pattern in the HTTP route is trivial and readable. A follow-up can extract the shared helper if drift becomes a concern.

## Data Flow

```
HTTP POST /access/cleanup
  │
  ├─ readJsonBody / CLEANUP_SCHEMA validation
  │
  ├─ NEW: if force && !writesEnabled → sendWritesDisabled (403)
  │
  └─ cleanupService.cleanup(request)  ← only reached when gate passes

MCP dysflow_access_cleanup (baseline, unchanged)
  │
  ├─ validateInput / schema check
  │
  ├─ if force && !isWriteAllowed → writesDisabled()
  │
  └─ cleanupService.cleanup(request)
```

Both adapters now enforce the identical contract: non-force cleanup of terminal/failed Dysflow-owned operations proceeds regardless of write mode; `force: true` requires writes enabled.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/adapters/http/server.ts` | Modify | Insert force-only write gate in `/access/cleanup` handler (~4 lines) |
| `test/adapters/http/server.test.ts` | Modify | Add two test cases: force-blocked-when-disabled, non-force-allowed-when-disabled |
| `openspec/specs/http-api-adapter/spec.md` | Already exists | Delta spec already written; no change needed |
| `README.md` / `docs/api/http-api.md` | Modify | Clarify force-only cleanup write-gate wording |

## Interfaces / Contracts

No new interfaces. The HTTP cleanup request schema (`CLEANUP_SCHEMA`) already accepts `force: boolean`. The gate reuses the existing `sendWritesDisabled()` helper which returns:

```json
{
  "ok": false,
  "error": {
    "code": "HTTP_WRITES_DISABLED",
    "message": "Write routes are disabled. Start dysflow serve with --enable-writes to allow them."
  }
}
```

Status code: `403 Forbidden` — consistent with `/query/write` and `/vba/execute`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Force blocked, non-force allowed | HTTP server tests with mock cleanupService, writesEnabled toggled |
| Integration | MCP parity maintained | Existing `tools.test.ts` force-gate tests remain baseline |
| E2E | Real HTTP + Access | Manual `dysflow serve` + `curl` with `--enable-writes` on/off |

## Migration / Rollout

No migration required. This is a behavioral tightening — previously-allowed `force: true` requests when writes are disabled will now be rejected. No data or config changes.

## Open Questions

None. The contract decision is settled: only `force: true` is gated, non-force cleanup stays open.
