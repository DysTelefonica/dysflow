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
| `Test_CacheTrust_LoadedEmptyARs_NoFallback_Atomic` | `tests/tests.vba.cache-e2e.json` | PASS — 7/7 manifest run 2026-06-14 |
| `Test_CacheTrust_LoadedEmptyRiesgos_NoFallback_Atomic` | `tests/tests.vba.cache-e2e.json` | PASS — 7/7 manifest run 2026-06-14 |
| `Test_CacheTrust_ARParentLink_NoFallback_Atomic` | `tests/tests.vba.cache-e2e.json` | PASS — 7/7 manifest run 2026-06-14 |
| `Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic` | `tests/tests.vba.cache-e2e.json` | PASS — adjacent cache E2E evidence |
| `Test_E2E_Cache_Invalidate_NoStaleListado_Atomic` | `tests/tests.vba.cache-e2e.json` | PASS — adjacent stale-listing regression evidence |
| `Test_CacheListado_Reconstruir_RegeneraStale_Atomic` | `tests/tests.vba.cache-e2e.json` | PASS — adjacent rebuild evidence |
| `Test_CacheListado_Reconstruir_UpsertFaltante_Atomic` | `tests/tests.vba.cache-e2e.json` | PASS — adjacent rebuild/upsert evidence |

**Note**: This SDD was retroactive — implementation landed before formal SDD artifacts. The 3 cache-trust diagnostics are now located in `tests/tests.vba.cache-e2e.json`; no separate cache-trust manifest is required.

## Last Known Passing

| Field | Value |
|-------|-------|
| **Date** | 2026-06-14 |
| **Commit** | `20b71f64` (staging HEAD fresh run); integration commit `23af345` |
| **Manifest** | `tests/tests.vba.cache-e2e.json` |
| **Result** | 7/7, including 3/3 cache-trust diagnostics |

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

For a future web implementation, preserve the cache-trust contract rather than the Access mechanics:

- Treat AC, AR, and Riesgo data as cache-first read models when the cache is known loaded.
- Distinguish loaded-empty results from cache-miss results. An empty but loaded cache is a valid business result and must not silently fall back to live DAO/backend reads.
- Expose diagnostics or observability for hit/miss/no-fallback paths so support can prove whether the web service trusted cache or queried source tables.
- Keep fallback behavior explicit and testable: fallback is acceptable when cache is absent/stale, not when cache is loaded and legitimately empty.
- Preserve parent-link behavior for AR -> AC -> NC relationships so detail views and invalidation scopes remain correct.

## Open Decisions

1. **✅ RESOLVED (2026-06-14) — B2 Missing TDD evidence**: full manifest `test_vba` run 7/7 PASSED against staging HEAD `20b71f64`. Includes the 3 cache-trust diagnostics (`Test_CacheTrust_LoadedEmptyARs_NoFallback_Atomic`, `Test_CacheTrust_LoadedEmptyRiesgos_NoFallback_Atomic`, `Test_CacheTrust_ARParentLink_NoFallback_Atomic`).
2. **✅ RESOLVED (2026-06-14) — B2 Manifest location**: cache-trust diagnostics procedures located in `tests/tests.vba.cache-e2e.json`. No new manifest needed.
3. **Retroactive SDD**: Implementation landed before formal SDD artifacts. The spec was promoted to `openspec/specs/cache-trust/spec.md`.
4. **UI list/selection deferred**: Cache-first reads for UI list/selection were deferred per verify-report.
5. **Access sync**: modules (`CacheTrustDiagnostics`, `Test_CacheTrustDiagnostics`) are present in Access binary; import needed after any source changes.

## Evidence Sources

- [Archive report](../../../openspec/changes/archive/2026-06-06-trust-ncproyecto-cache-hits/archive-report.md)
- [Spec](../../../openspec/specs/cache-trust/spec.md)
- [Test manifest: cache-e2e](../../../tests/tests.vba.cache-e2e.json)

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
