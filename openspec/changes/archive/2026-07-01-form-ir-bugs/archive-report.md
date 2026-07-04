# Archive Report: 2026-07-01-form-ir-bugs

**Archived**: 2026-07-04
**Verified**: 2026-07-04
**Change**: 2026-07-01-form-ir-bugs
**Issue**: #622
**Artifact store**: filesystem

---

## Verification Verdict

**PASS** (docs-only OpenSpec archive)

| Metric | Result |
|--------|--------|
| Tasks | All planned task checkboxes complete |
| Tests | Not run; archival docs/spec merge only |
| Build | Not run; no source/package/config changes |
| OpenSpec structure | Live change folder moved under `openspec/changes/archive/` |
| CRITICAL issues | 0 |
| Warnings | 0 |

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| access-core-services | Updated | 4 ADDED Requirements merged (report prefix recognition, exact preserved-metadata predicate, truthful appliedTokens, corrupt catalog refusal) |

---

## Implementation Commit Traceability

| PR / Merge commit | Work unit | Archive note |
|-------------------|-----------|--------------|
| `#635` / `c7ef47f` | fix(component-resolver): accept rpt/rpt_ report prefixes (PR 1/3, form-ir-bugs, #622) | Original archive work unit |
| `#636` / `d3d251f` | fix(form-ir): exact-match preserved key + appliedTokens truth (PR 2/3, form-ir-bugs, #622) | Original archive work unit |
| `#637` / `c28cc54` | fix(vba-form-service): refuse corrupt catalog (PR 3/3, form-ir-bugs, #622) | Original archive work unit |

**Branch strategy**: stacked-to-main / merged to `origin/main` before archival.

---

## Archive Contents

- `proposal.md` ✅
- `design.md` ✅
- `tasks.md` ✅ (reconciled complete)
- `specs/access-core-services/spec.md` ✅ (delta merged into main)
- `archive-report.md` ✅ (this file)

---

## Source of Truth Updated

- `openspec/specs/access-core-services/spec.md`

`openspec/specs/access-core-services/spec.md` now includes the four form-IR bug requirements from this change.

---

*OpenSpec archival reconciliation complete for issue #622.*
