# trust-ncproyecto-cache-hits — Cache-first for ACs/ARs/Riesgos

> Backfilled from archive report `2026-06-06-trust-ncproyecto-cache-hits/archive-report.md`. Sources: archive report, git history, spec promotion.

## Status

| Field | Value |
|-------|-------|
| **Current** | `passing` (B2 RESOLVED 2026-06-14) |
| **Last verified** | 2026-06-14 (full manifest run 7/7 against staging HEAD `20b71f64`, including 3 cache-trust diagnostics) |
| **Manifest drift** | `clean` — 3 cache-trust diagnostic procedures found in `tests/tests.vba.cache-e2e.json` (discovered 2026-06-14) |
| **Staging reachability** | `reachable` — commit `23af345` is ancestor of `staging` |
| **TDD evidence** | `fresh` — full manifest `test_vba` run 7/7 PASSED against staging HEAD `20b71f64` 2026-06-14 |
| **Last verified commit** | `20b71f64` (staging HEAD, fresh run) |
| **Last verified at** | 2026-06-14 |
| **Test evidence** | `tests/tests.vba.cache-e2e.json` 7/7 (fresh run 2026-06-14; includes the 3 cache-trust diagnostics) |
| **Staging integration commit** | `23af345` (ancestor verified) |
| **Evidence updated at** | 2026-06-14 |

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

1. **✅ RESOLVED (2026-06-14) — B2 Missing TDD evidence**: full manifest `test_vba` run 7/7 PASSED against staging HEAD `20b71f64`. Includes the 3 cache-trust diagnostics (`Test_CacheTrust_LoadedEmptyARs_NoFallback_Atomic`, `Test_CacheTrust_LoadedEmptyRiesgos_NoFallback_Atomic`, `Test_CacheTrust_ARParentLink_NoFallback_Atomic`).
2. **✅ RESOLVED (2026-06-14) — B2 Manifest location**: cache-trust diagnostics procedures located in `tests/tests.vba.cache-e2e.json`. No new manifest needed.
3. **Retroactive SDD**: Implementation landed before formal SDD artifacts. The spec was promoted to `openspec/specs/cache-trust/spec.md`.
4. **UI list/selection deferred**: Cache-first reads for UI list/selection were deferred per verify-report.
5. **Access sync**: modules (`CacheTrustDiagnostics`, `Test_CacheTrustDiagnostics`) are present in Access binary; import needed after any source changes.

## Evidence Sources

- [Archive report](../../../openspec/changes/archive/2026-06-06-trust-ncproyecto-cache-hits/archive-report.md)
- [Spec](../../../openspec/specs/cache-trust/spec.md)

## Post-Test Documentation Gate

> **Rule**: Integration is not done until this section is updated. After staging integration and passing tests, update the Status section fields before declaring the work complete.

| Step | Action | Done |
|------|--------|------|
| 1 | Tests pass against current `staging` HEAD | [x] (7/7 PASSED, manifest `cache-e2e.json`, staging HEAD `20b71f64` 2026-06-14) |
| 2 | `last_verified_commit` updated with current SHA | [x] (`20b71f64`) |
| 3 | `last_verified_at` updated with current ISO datetime | [x] (2026-06-14) |
| 4 | `test_evidence` updated with manifest + pass/total | [x] (`tests/tests.vba.cache-e2e.json` 7/7, including 3 cache-trust diagnostics) |
| 5 | `staging_integration_commit` updated with merge SHA | [x] (`23af345` — ancestor verified) |
| 6 | `evidence_updated_at` updated with current datetime | [x] (2026-06-14) |
| 7 | Feature status reflects current state | [x] (`passing` after B2 resolution) |
