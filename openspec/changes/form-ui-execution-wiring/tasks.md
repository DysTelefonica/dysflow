# Tasks: Form UI Execution Wiring

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | Docs PR: 579 additions; runtime total: ~1,190–1,570, sliced to ~180–360 each |
| 400-line budget risk | High overall; accepted only for docs PR 1 |
| Chained PRs recommended | Yes, for runtime work |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 |
| Delivery strategy | exception-ok for docs PR 1; auto-chain for runtime |
| Chain strategy | size-exception for PR 1; stacked-to-main for PRs 2–6 |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

**Approved exception:** the maintainer authorized `size:exception` for the ONE 579-addition, artifact-only PR 1 containing all four approved OpenSpec files. This is the sole exception; no runtime code, generated code, or unrelated file may hide in it.

**Runtime hard gate:** PRs 2–6 target ≤360 and MUST remain below 400 additions + deletions; re-slice before commit or review.

## Workspace, Continuity, and Chain

PR 1 uses docs-only branch `docs/811-sdd-artifacts`, worktree `C:\Proyectos\dysflow-811`, base SHA `505ff8bc8f9501684ba7916ddaaea1de23a6bc87`, PR base `main`, linked to #811. Never copy or stage root `.atl/skill-registry.md`.

PR 1 MUST preserve `proposal.md`, `design.md`, `specs/ai-form-ui-builder/spec.md`, and `tasks.md` losslessly; only this approved tasks update may differ. Do not compact any artifact. Before archive, prove the artifact commit reaches merged `main` and all four files remain available to `sdd-archive`.

| PR | Deliverable (each based on merged predecessor) | Verify | Estimate |
|---|---|---|---|
| 1 | Four OpenSpec artifacts only (#811) | exact scope + continuity | 579 additions, exception |
| 2 | Pure FormIR primitives | focused/core tests | 250–330 |
| 3 | Pure vocabulary/dispatcher | core tests/build | 220–300 |
| 4 | Unreachable guarded-write helper | mutation regression | 180–240 |
| 5 | Unregistered execution internals | adapter-port tests | 260–340 |
| 6 | Atomic MCP exposure/policy | policy suites/test/build | 280–360 |

## Phase 1: PR 1 — Docs-Only Artifact Continuity (#811)

- [x] 1.1 On `docs/811-sdd-artifacts`, include exactly the four lossless artifacts; verify the 579-addition `size:exception`, #811 link, no code, and `.atl/skill-registry.md` exclusion.

## Phase 2: PR 2 — Pure Primitives (#812)

- [x] 2.1 After PR 1 merges, create fresh branch `feat/812-form-ir-primitives` from merged `main`; include no #813 wiring.
- [x] 2.2 **RED:** Extend `test/core/services/form-ir-mutation.test.ts` for set/delete success, blob/protected/name refusals, recursive events, children, and unchanged IR/`codeBehind`.
- [x] 2.3 **GREEN/REFACTOR:** Update `src/core/models/form-ir.ts` and `src/core/services/form-ir-service.ts`; run focused tests and `pnpm test`.

## Phase 3: PR 3 — Pure Planning (#813)

- [x] 3.1 **RED/GREEN:** Update builder, plan, pattern tests/services and `E2E_testing/mcp-e2e.mjs` for six kinds, notes, and unknown-kind failure; run `pnpm test`/`pnpm build`.

## Phase 4: PR 4 — Internal Guarded Seam

- [x] 4.1 Baseline regression; create `src/adapters/vba-sync/vba-forms-guarded-write.ts` and refactor existing mutation code without registering or exposing new writes; run `pnpm test`.

## Phase 5: PR 5 — Unregistered Execution

- [ ] 5.1 **RED/GREEN:** Build directly tested, unreachable execution internals for path/identity guards, dry-run, one-write/import/rollback atomicity, failure, and advisories; do not wire registered routes/tools.

## Phase 6: PR 6 — Atomic Exposure and Policy

- [ ] 6.1 **RED:** Lock three-tool routes, parity, risks, capabilities, preview/apply defaults, and `MCP_WRITES_DISABLED` in MCP policy suites.
- [ ] 6.2 **GREEN:** In ONE commit wire standalone dispatch plus schemas, registry, parity, routes, both factory lists, adapter entry points, and `POLICY_EXEMPT_TOOLS`; remove `targetPath`; run `pnpm test`, `pnpm build`, CI, and reindex.

## Phase 7: Merge, Release, Recovery, Closure

- [ ] 7.1 Merge docs PR 1, then create each runtime branch fresh from predecessor-merged `main`; enforce sub-400 runtime diffs/green CI and record every PR/merge SHA and release tag.
- [ ] 7.2 If post-merge/release validation fails, retain all branches/tags/SHAs; revert merge SHAs in reverse dependency order or publish a corrective release, then rerun `pnpm test`/`pnpm build`. Preserve release tar.gz + SHA-256 updating only.
- [ ] 7.3 After validated release (title exactly tag), close #811/#812/#813 with SHAs/test evidence; verify artifact continuity, run `sdd-archive`, then delete recovery refs/worktree.
