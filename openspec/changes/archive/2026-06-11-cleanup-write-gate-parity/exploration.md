## Exploration: cleanup-write-gate-parity

### Current State
The core cleanup service already enforces ownership and safety checks, and it correctly allows the non-`force` recovery path. In MCP, `handleMcpAccessCleanup()` blocks only `force: true` behind the MCP write gate, so safe cleanup still works when writes are disabled. The HTTP `/access/cleanup` route, however, currently forwards directly to `cleanupService.cleanup()` after schema validation and does not check `writesEnabled`, so it can still execute `force: true` cleanup even when the HTTP server is running with writes disabled.

### Affected Areas
- `src/adapters/http/server.ts` — HTTP cleanup route currently bypasses the write gate.
- `src/adapters/mcp/canonical-handlers.ts` — MCP cleanup already has the desired force-only gate; this is the parity reference.
- `test/adapters/http/server.test.ts` — needs a write-gate parity assertion for `/access/cleanup`.
- `test/adapters/mcp/tools.test.ts` — existing MCP gate tests should remain the behavioral baseline.
- `README.md` / `docs/api/http-api.md` / `AGENTS.md` — contract docs must say non-force cleanup stays allowed and only `force:true` is gated.
- `openspec/specs/http-api-adapter/spec.md` — should document the HTTP cleanup gate parity if this becomes the formal contract.

### Approaches
1. **Centralize the cleanup gate in shared adapter logic** — extract a small helper used by both MCP and HTTP cleanup entry points so `force:true` is gated consistently and non-force cleanup remains open.
   - Pros: one contract, one test pattern, less drift risk.
   - Cons: small refactor across adapter code paths.
   - Effort: Medium

2. **Add a separate HTTP-only gate** — leave MCP as-is and add an `if (force && !writesEnabled)` check directly in `src/adapters/http/server.ts`.
   - Pros: smallest immediate code change.
   - Cons: duplicates contract logic, easier to diverge later, weaker long-term parity.
   - Effort: Low

### Recommendation
Use the shared-parity approach: keep the core cleanup rules in `AccessOperationCleanupService`, and make both adapters enforce the same `force:true` gate before calling it. That preserves the safe non-force recovery path while making the write-gate contract explicit and testable at both ports.

### Risks
- Accidentally gating non-force cleanup would break the safe recovery path that already works today.
- Updating HTTP behavior without adding a parity test would leave the regression undetected.
- Docs may continue to describe cleanup as “safety-gated” without explicitly stating the force-only write gate.

### Ready for Proposal
Yes — the next step should be a focused proposal/spec update for HTTP/MCP cleanup gate parity, with tests at both adapters before implementation.
