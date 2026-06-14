# trust-ncproyecto-cache-hits — Cache-first for ACs/ARs/Riesgos

> Backfilled from archive report `2026-06-06-trust-ncproyecto-cache-hits/archive-report.md`. Sources: archive report, git history, spec promotion.

## Status

| Field | Value |
|-------|-------|
| **Current** | `passing` (commit-message-level evidence only; thin TDD evidence) — **B2 blocker: TDD evidence insufficient for UAT/release** |
| **Last verified** | 2026-06-06 (per archive evidence; **not against current `staging` HEAD**) |
| **Manifest drift** | `unregistered` — no dedicated manifest entry; procedures expected to live in a cache-trust manifest that has not been located |
| **Staging reachability** | `reachable` — commit `23af345` is ancestor of `staging` |
| **TDD evidence** | `thin` — commit-message-level evidence only; **no fresh `test_vba` run** has been recorded; manifest location unknown |
| **Last verified commit** | `23af345` (commit-message-level only) |
| **Last verified at** | 2026-06-06 |
| **Test evidence** | `3/3 cache-trust diagnostics green` (commit body, not a manifest result) |
| **Staging integration commit** | `23af345` |
| **Evidence updated at** | 2026-06-06 (stale — needs fresh `test_vba` run) |

## Business Behavior

Trust cache-first reads for ACs (Acciones Correctivas), ARs (Acciones de Resolución), and Riesgos in the NCProyecto listing. The change ensures:
- Cache-first reads for AC/AR/Riesgo data
- Fallback to backend when cache is empty or stale
- Cache-trust diagnostics for troubleshooting

## Acceptance Criteria

- [ ] AC data is read from cache first
- [ ] AR data is read from cache first
- [ ] Riesgo data is read from cache first
- [ ] Fallback to backend occurs when cache is empty
- [ ] Cache-trust diagnostics report hit/miss status

## Required Tests

| Procedure | Manifest | Status |
|-----------|----------|--------|
| (expected 3 cache-trust diagnostics) | TBD — no dedicated manifest located | UNKNOWN |

**Note**: This SDD was retroactive — implementation landed before formal SDD artifacts. The 3 cache-trust diagnostics procedures are expected to be registered in a cache-trust manifest that has not been located. No fresh `test_vba` execution has been run against current HEAD; evidence relies on commit message (`3/3 cache-trust diagnostics green`) and source review.

## Last Known Passing

| Field | Value |
|-------|-------|
| **Date** | 2026-06-06 |
| **Commit** | `23af345` |
| **Manifest** | (none located) |
| **Result** | 3/3 (commit-message-level only) |

## Integration Commits

| SHA | Message | Ancestor of staging |
|-----|---------|---------------------|
| `23af345` | `fix(cache): NCProyecto cache-first for ACs/ARs/Riesgos (closes #39)` | Yes — verified 2026-06-14 |

## Access Sync Status

- **Import method**: Unknown / not recorded in archive apply-progress
- **Manual compile**: Unknown — project rule requires user compile after any import
- **verify_binary**: not run

## Rollback Anchor

Revert to commit before `23af345` to restore non-cache-first behavior.

## Business Rules

- ACs, ARs, and Riesgos must be read from cache first
- Fallback to backend must occur when cache is empty
- Cache-trust diagnostics must report hit/miss status

## Legacy Not to Copy

- UI list/selection cache-first reads were deferred (per verify-report)
- Direct backend reads bypassing cache layer

## Migration Notes

_Web migration considerations — to be populated when migration work begins._

## Open Decisions

1. **B2 — Missing TDD evidence**: no fresh `test_vba` run against current HEAD; commit-message-level evidence only. Required before production promotion.
2. **B2 — Manifest location unknown**: Cache-trust diagnostics procedures expected to be in a manifest file that has not been located. Candidate: `tests/tests.vba.cache-e2e.json` (not yet confirmed). Required before fresh `test_vba` can be run.
3. **Retroactive SDD**: Implementation landed before formal SDD artifacts. The spec was promoted to `openspec/specs/cache-trust/spec.md`.
4. **UI list/selection deferred**: Cache-first reads for UI list/selection were deferred per verify-report.
5. **Access sync unknown**: Import method and manual compile status not recorded in archive.

## Evidence Sources

- [Archive report](../../../openspec/changes/archive/2026-06-06-trust-ncproyecto-cache-hits/archive-report.md)
- [Spec](../../../openspec/specs/cache-trust/spec.md)

## Post-Test Documentation Gate

> **Rule**: Integration is not done until this section is updated. After staging integration and passing tests, update the Status section fields before declaring the work complete.

| Step | Action | Done |
|------|--------|------|
| 1 | Tests pass against current `staging` HEAD | [ ] (B2: no fresh `test_vba` run; manifest location unknown) |
| 2 | `last_verified_commit` updated with current SHA | [ ] |
| 3 | `last_verified_at` updated with current ISO datetime | [ ] |
| 4 | `test_evidence` updated with manifest + pass/total | [ ] |
| 5 | `staging_integration_commit` updated with merge SHA | [x] (`23af345` — ancestor verified) |
| 6 | `evidence_updated_at` updated with current datetime | [ ] |
| 7 | Feature status reflects current state | [ ] (`passing` per archive, but TDD evidence gate not met) |
