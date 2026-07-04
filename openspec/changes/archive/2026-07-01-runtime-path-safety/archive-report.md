# Archive Report: 2026-07-01-runtime-path-safety

**Archived**: 2026-07-04
**Verified**: 2026-07-04
**Change**: 2026-07-01-runtime-path-safety
**Issue**: #619
**Artifact store**: filesystem

---

## Verification Verdict

**PASS** (docs-only OpenSpec archive)

| Metric | Result |
|--------|--------|
| Tasks | Already complete; archive evidence refreshed |
| Tests | Not run; archival docs/spec merge only |
| Build | Not run; no source/package/config changes |
| OpenSpec structure | Live change folder moved under `openspec/changes/archive/` |
| CRITICAL issues | 0 |
| Warnings | 0 |

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| core-configuration | Updated | 2 ADDED Requirements merged (ExecutionTarget override precedence, empty-string override normalization) |
| vba-manager-actions | Updated | 2 ADDED Requirements merged (runtime-safe export write, prune allow-list parity) |

---

## Implementation Commit Traceability

| PR / Merge commit | Work unit | Archive note |
|-------------------|-----------|--------------|
| `#625` / `4033d73` | fix(vba-sync): pre-write runtime guard for export_all/export_modules (PR 1/3, runtime-path-safety, #619) | Original archive work unit |
| `#626` / `dfa5f24` | fix(config): branch 2 backendPath + empty-string override normalization (PR 2/3, runtime-path-safety, #619) | Original archive work unit |
| `#627` / `58e82f5` | chore(vba-sync): drop .frm from managed extensions + document allow-list (PR 3/3, runtime-path-safety, #619) | Original archive work unit |
| `#647` / `2b41057` | fix(vba-modules): runtime guard trusts user exportPath over orchestrator destinationRoot (hotfix #644) | Follow-up evidence: post-campaign hotfix confirms runtime guard precedence after #644 |

**Branch strategy**: stacked-to-main / merged to `origin/main` before archival.

---

## Archive Contents

- `proposal.md` ✅
- `design.md` ✅
- `tasks.md` ✅ (already complete; evidence retained)
- `specs/core-configuration/spec.md` ✅ (delta merged into main)
- `specs/vba-manager-actions/spec.md` ✅ (delta merged into main)
- `archive-report.md` ✅ (this file)

---

## Source of Truth Updated

- `openspec/specs/core-configuration/spec.md`
- `openspec/specs/vba-manager-actions/spec.md`

Canonical specs now include the runtime path safety requirements; PR #647 is cited as follow-up evidence rather than original task scope.

---

*OpenSpec archival reconciliation complete for issue #619.*
