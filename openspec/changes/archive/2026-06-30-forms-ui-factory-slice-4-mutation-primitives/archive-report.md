# Archive Report: forms-ui-factory-slice-4-mutation-primitives

**Archived**: 2026-07-01 (backfilled — verify-report PASS recorded 2026-06-30; folder moved to `archive/` by commit `a803c9c` on 2026-06-30 14:38+02:00).
**Verified**: 2026-06-30
**Change**: forms-ui-factory-slice-4-mutation-primitives
**Issue**: #617
**Release**: v1.12.0 (2026-06-30)
**Artifact store**: hybrid (filesystem + Engram)

> **Bookkeeping note (2026-07-01):** This `archive-report.md` was backfilled under issue #623 (`doc-bookkeeping`) because the folder was moved to `archive/` by commit `a803c9c` on the day the verify verdict landed, but no archive-report.md was produced at the time. All values below are sourced from the folder's existing `verify-report.md` + `apply-progress.md` + the two relevant commits; no data was invented.

---

## Verification Verdict

**PASS WITH REMEDIATION** (0 CRITICAL at archive time)

| Metric | Result |
|--------|--------|
| Tasks | 12/12 complete (Phase 1: 3, Phase 2: 3, Phase 3: 3, Phase 4: 3) |
| Tests | 1849/1849 green (154 files) |
| New tests written | 15 across 4 new test files (`form-ir-mutation.test.ts`, `form-ir-mutation-preservation.test.ts`, `form-mutation-tools.test.ts`, `vba-forms-adapter-mutation.test.ts`) |
| Build | `pnpm build` clean |
| Lint | `pnpm lint` clean |
| Live canonical MCP gate | PASS — `dysflow_form_add_control`, `_move_control`, `_rename_control` all returned `importGate:"passed"` against `Gestion_Riesgos.accdb` (temp copy) |
| CRITICAL issues | 0 |
| P1 issues found post-review | 4 (path safety, rename/event semantics, overstated LoadFromText evidence, schema `left`/`top` floor) — all remediated in the same change before release |

### Post-review remediation (closed before release)

Fresh-context review surfaced 4 P1 issues; all resolved inside the change before `v1.12.0` was tagged:

1. **Path safety** — mutation `apply` now validates canonical managed source: `.form.txt` / `.report.txt` only, inside resolved `destinationRoot`/`projectRoot`, outside the Dysflow production runtime.
2. **Write-gate semantics** — all three mutation tools marked `mutatesBinary:true` and `mutatesFilesystem:true`; `dryRun` allowed without writes, `apply:true` write-gated.
3. **Event-bound rename safety** — `renameControl` rejects controls with `[Event Procedure]` bindings instead of claiming safe event-procedure renaming.
4. **Coordinate-schema floor** — `left` and `top` accept `0` as a valid value.
5. **Evidence accuracy** — documentation and apply evidence now distinguish mocked `import_modules` gate coverage from live Access LoadFromText coverage.

`git diff --check`, `pnpm test`, `pnpm build`, and `pnpm lint` re-confirmed green after remediation (per `apply-progress.md` § Post-Review Remediation).

### Caveats carried into archive

- The canonical `ardelperal/VBA_TOOLKIT_BENCH/Gestion_Riesgos.accdb` fixture was not present in the apply workspace; text-preservation fell back to the available `E2E_testing/src/forms/Form_frmSplash.form.txt` fixture. Source-serialization preservation is proven on real text; live Access LoadFromText was separately proven on a temp copy of the canonical bench.
- `pnpm test:integration` exceeded the 244 s command timeout in the apply environment; focused text-preservation passed (`vitest.integration.config.ts`), and the adapter apply gate is covered with mocked `import_modules` success/failure. Full live integration is unproven in this run.
- `.atl/skill-registry.md` had pre-existing unrelated modifications and was intentionally not touched.

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `access-core-services` | Delta spec retained | `openspec/changes/archive/2026-06-30-forms-ui-factory-slice-4-mutation-primitives/specs/access-core-services/spec.md` — pure FormIR mutation primitives with metadata preservation + `FORM_METADATA_LOSS` typed errors. **Not merged into canonical `openspec/specs/access-core-services/spec.md`** at archive time — same drift pattern that slice-3 and other prior slices left behind. Honest record: the change folder carries the canonical spec for this slice; the canonical `openspec/specs/` was not touched by this change. |
| `access-form-mutation` | Delta spec retained | `openspec/changes/archive/2026-06-30-forms-ui-factory-slice-4-mutation-primitives/specs/access-form-mutation/spec.md` — new capability spec (mutation primitives contract). The capability name does NOT exist as a directory in canonical `openspec/specs/` — the folder is the source of truth for this capability. |
| `mcp-stdio-adapter` | Delta spec retained | `openspec/changes/archive/2026-06-30-forms-ui-factory-slice-4-mutation-primitives/specs/mcp-stdio-adapter/spec.md` — three new public MCP tools with write-gate semantics, `mutatesBinary` / `mutatesFilesystem` flags, and `apply`/`dryRun` defaults. Not merged into canonical `openspec/specs/mcp-stdio-adapter/spec.md` at archive time. |

---

## Implementation Commit Traceability

| Commit | Work unit | SDD tasks | PR slice |
|--------|-----------|-----------|----------|
| `3d311d5` | feat(forms): add MCP form mutation primitives (full slice-4 implementation) | 1.1–4.3 + remediation | PR 1 (single) |
| `a803c9c` | chore(openspec): archive forms-ui-factory-slice-4-mutation-primitives | — (move to archive/) | (post-merge) |

**Branch strategy**: single PR (`size-exception`, maintainer-approved) — implementation landed at ~1084 changed lines (`git diff --stat 3d311d5^..3d311d5`), exceeding the 400-line review budget by design.

---

## Engram Observation IDs (cross-session traceability)

| Artifact | topic_key | Observation ID |
|----------|-----------|---------------|
| proposal | `sdd/forms-ui-factory-slice-4-mutation-primitives/proposal` | (retrieve from Engram) |
| design | `sdd/forms-ui-factory-slice-4-mutation-primitives/design` | (retrieve from Engram) |
| tasks | `sdd/forms-ui-factory-slice-4-mutation-primitives/tasks` | (retrieve from Engram) |
| apply-progress | `sdd/forms-ui-factory-slice-4-mutation-primitives/apply-progress` | (retrieve from Engram) |
| verify-report | `sdd/forms-ui-factory-slice-4-mutation-primitives/verify-report` | (retrieve from Engram) |
| archive-report | `sdd/forms-ui-factory-slice-4-mutation-primitives/archive-report` | (this artifact) |

---

## Out-of-Scope Follow-ups (potential future issues)

1. **Canonical spec merge** — promote `specs/{access-core-services,access-form-mutation,mcp-stdio-adapter}/spec.md` from this archive folder into `openspec/specs/` so the change's requirements live next to the rest of the source of truth. This was the pattern slice-5 used for its two domain merges (per `archive/2026-07-01-forms-ui-factory-slice-5-create-from-template/archive-report.md` § Source of Truth Updated).
2. **`access-form-mutation` capability name as a canonical spec directory** — slice-4 introduced the capability name but the directory was never created at `openspec/specs/access-form-mutation/`. Either create it from this archive's spec, or fold the new requirements into `access-core-services` if the capability split is undesired.

---

## Archive Contents

- `proposal.md` ✅
- `specs/access-core-services/spec.md` ✅ (delta — folder retains it; not merged into canonical)
- `specs/access-form-mutation/spec.md` ✅ (delta — folder retains it; no canonical directory of this name)
- `specs/mcp-stdio-adapter/spec.md` ✅ (delta — folder retains it; not merged into canonical)
- `design.md` ✅
- `tasks.md` ✅ (12/12 complete)
- `apply-progress.md` ✅
- `verify-report.md` ✅
- `archive-report.md` ✅ (this file — backfilled 2026-07-01 under #623)

---

## Source of Truth Updated

- `openspec/changes/archive/2026-06-30-forms-ui-factory-slice-4-mutation-primitives/specs/{access-core-services,access-form-mutation,mcp-stdio-adapter}/spec.md` — the change folder remains the canonical home of the slice-4 requirements.

The canonical `openspec/specs/` was NOT modified by this change. See "Out-of-Scope Follow-ups" for the gap this leaves.

---

*SDD cycle complete. This change is fully planned, implemented, verified, and archived (with the spec-merge gap noted above for future cleanup).*
