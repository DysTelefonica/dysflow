# Archive Report: close-batch-584-586-587

## Summary

Archived SDD change `close-batch-584-586-587` after implementing and verifying issues #584, #586, and #587 on `main` with strict TDD and direct main-only commits.

## Implementation Commits

| Commit | Issue | Work unit | Verification | CI |
|---|---:|---|---|---|
| `5a891c2` | #584 | Windows Access smoke evidence summary and workflow wiring | RED helper-missing test; GREEN focused 3/3; `pnpm test` 1716/1716; `pnpm build`; `pnpm lint` | `28331939189` success |
| `9ad8987` | #586 | MCP E2E temp fixture copies and sandbox docs | RED helper-missing test; GREEN sandbox focused 2/2, related quality gates 14/14; `pnpm test` 1718/1718; `pnpm build`; `pnpm lint` | `28332128649` success |
| `f7ea0b3` | #587 | Shared MCP tool contract metadata and modern description guards | RED missing metadata module; GREEN focused 3/3, MCP focused 22/22; `pnpm test` 1721/1721; `pnpm build`; `pnpm lint`; Pester 374/0/4 | `28332370495` success |
| `e4b475a` | #584/#586/#587 | SDD traceability artifacts | `pnpm test` 1721/1721; `pnpm build`; `pnpm lint`; Pester 374/0/4 | `28332466372` success |
| `15383a3` | #584/#586/#587 | Fresh review blocker follow-up: generated-child E2E sandbox cleanup, release-mode Access evidence gate, and table-driven modern MCP contract metadata descriptions | RED focused blockers; GREEN focused 11/11; `pnpm test` 1724/1724; `pnpm build`; `pnpm lint`; Pester 374/0/4 | pending |

## Final Local Verification

- `pnpm test` — 1721 passed / 0 failed.
- Follow-up `pnpm test` — 1724 passed / 0 failed.
- `pnpm build` — passed.
- `pnpm lint` — passed.
- `pwsh -Command "Invoke-Pester scripts/tests/"` — 374 passed / 0 failed / 4 skipped.

## Fresh Review Blockers Resolved

- **BLOCKER A**: `DYSFLOW_E2E_SANDBOX_ROOT` is now a validated parent only; cleanup targets only a generated `dysflow-mcp-e2e-*` child and rejects repo, fixture, drive-root, home, and production-runtime parents.
- **BLOCKER B**: Access smoke evidence separates Access-dependent suites from fake/non-Access executions; release mode fails when required Access suites are skipped.
- **WARNING C**: modern MCP contract metadata is asserted table-wise, and every modern advertised tool description includes the shared contract summary.

## Notes

- No Access binary import/export was required; this batch touched TypeScript, CI workflow, E2E harness JavaScript, README, and SDD artifacts only.
- `.atl/skill-registry.md` and `.codegraph/` were intentionally left untouched because they were unrelated local changes.
