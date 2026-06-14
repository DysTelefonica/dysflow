# Design: Feature Traceability Ledger

## Technical Approach

Create a first-class, stable feature catalog at `docs/features/` that serves as the canonical source of truth for every No Conformidades feature. OpenSpec changes reference this catalog; the catalog never lives inside transient SDD artifacts. `openspec/REGRESSION-ANCHOR.md` becomes a thin navigational index pointing into `docs/features/`, not the primary data store.

The design has three layers:
1. **Stable catalog** (`docs/features/`) — permanent, versioned, industrial-grade per-feature docs
2. **Thin index** (`openspec/REGRESSION-ANCHOR.md`) — summary table + close-gate checklist pointing to catalog
3. **SDD integration** — every phase reads/writes the catalog, not the index

## Architecture Decisions

### Decision: Catalog location outside OpenSpec

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `openspec/features/*/ledger.md` | Co-located with SDD; but `openspec/` is the SDD workspace — changes, specs, incidents are transient artifacts. Feature truth should outlive any SDD cycle. | **Rejected** |
| `docs/features/*/` at repo root | First-class, stable, visible to any contributor. Survives SDD workspace reorganization. Natural location for permanent project docs. | **Accepted** |
| `features/` at repo root | Too vague; no convention signal. Could be confused with feature flags or feature branches. | **Rejected** |

**Rationale**: The user's hard constraint is that feature docs must be the permanent source of truth alongside code, not ephemeral SDD artifacts. `docs/features/` is the standard convention for stable project documentation.

### Decision: Per-feature directory with canonical schema

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Single `features-catalog.md` file | Simple; doesn't scale past ~15 features. Hard to review per-feature diffs. | **Rejected** |
| `docs/features/<domain>/<feature-key>.md` | Scalable, reviewable per-feature. Domain grouping aids navigation. | **Accepted** |
| `docs/features/catalog.yaml` + `.md` files | Machine-readable + human-readable. Overkill for first slice; adds YAML maintenance burden. | **Deferred** |

**Rationale**: Per-feature files keep review diffs small (one feature per PR), enable independent verification, and scale to 50+ features without cognitive overload.

### Decision: REGRESSION-ANCHOR.md as thin index, not primary store

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Keep REGRESSION-ANCHOR.md as the full ledger | Already exists; familiar. But single-file grows unwieldy, and it's inside `openspec/` (SDD workspace). | **Rejected** |
| REGRESSION-ANCHOR.md becomes a pointer index | Summary table + close-gate checklist + links to `docs/features/`. Lightweight, stays in openspec as SDD navigation. | **Accepted** |

**Rationale**: REGRESSION-ANCHOR.md already has the close-gate checklist and one entry. Repurposing it as the index preserves existing process while moving the data to stable ground.

### Decision: UAT tag traceability in feature catalog

| Option | Tradeoff | Decision |
|--------|----------|----------|
| UAT tags tracked only in git | Tags exist in git history; no need to duplicate in docs. | **Rejected** — git tags don't carry per-feature attribution or evidence |
| UAT tags tracked in openspec SDD artifacts | Co-located with change lifecycle. But openspec is transient; UAT history must survive SDD workspace. | **Rejected** |
| UAT tags tracked in `docs/features/<key>.md` Release Tracking | Permanent, versioned, per-feature. Links UAT tags to production release and rollback. Survives SDD cycles. | **Accepted** |

**Rationale**: UAT tags are immutable release artifacts that must be traceable per-feature. The feature catalog is the permanent home for this data, with `uat_tag_history`, `approved_uat_tag`, `production_release_tag`, and `rollback_release_tag` fields. The close-gate enforces that no feature reaches production without a recorded approved final UAT tag.

## Data Flow

```
SDD Change Lifecycle:
                                                           
  sdd-tasks ──reads──→ docs/features/<key>.md              
       │                    ↑                               
       ↓                    │                               
  sdd-apply ──updates──→ docs/features/<key>.md            
       │                    ↑                               
       ↓                    │                               
  sdd-verify ──updates──→ docs/features/<key>.md           
       │                    ↑                               
       ↓                    │                               
  sdd-archive ──updates──→ docs/features/<key>.md          
                              │                             
                              ↓                             
                     REGRESSION-ANCHOR.md (index update)    
                              │                             
                              ↓                             
                     Engram sdd/<change>/design (copy)      
```

Backfill flow (read-only evidence gathering):
```
Archive reports ──extract──→ feature behavior, commits, sync evidence
Test manifests  ──extract──→ procedure names, counts, drift status
Source modules  ──extract──→ actual procedure lists, module names
Git history     ──extract──→ commit SHAs, ancestor verification
                              ↓
                     docs/features/<key>.md (backfilled entry)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `docs/features/README.md` | Create | Catalog index: purpose, schema summary, domain listing, how to add features |
| `docs/features/_template.md` | Create | Per-feature template with all REQUIRED fields, instructions, examples |
| `docs/features/cache-management/nc-proyecto-cache-invalidation.md` | Create | Backfilled: form-fncproyecto-cache-invalidation (from archive evidence) |
| `docs/features/project-listing/form-ncproyecto-helper-coverage.md` | Create | Backfilled: form-ncproyecto-helper-coverage (from REGRESSION-ANCHOR + archive) |
| `docs/features/project-listing/nc-proyecto-seguimiento-tareas-helper.md` | Create | Backfilled: ncproyecto-seguimiento-tareas-helper |
| `docs/features/audit/audit-backend-list-cache.md` | Create | Backfilled: audit-backend-list-cache |
| `docs/features/compliance/ce-fecha-obligatoria-postponement.md` | Create | Backfilled: ce-fecha-obligatoria-postponement |
| `docs/features/cache-management/trust-ncproyecto-cache-hits.md` | Create | Backfilled: trust-ncproyecto-cache-hits |
| `openspec/REGRESSION-ANCHOR.md` | Modify | Convert to thin index: summary table pointing to `docs/features/`, keep close-gate checklist |
| `openspec/changes/feature-traceability-ledger/design.md` | Create | This file |

## UAT Tag Traceability

The UAT tag policy is a first-class part of the feature catalog. Every feature file carries UAT tag fields in its Release Tracking section:

| Field | Purpose |
|-------|---------|
| `uat_tag` | The current/most recent UAT tag (e.g. `PRUEBAS-001`) |
| `uat_tag_history` | Ordered list of all UAT tags applied to this feature |
| `approved_uat_tag` | The final approved UAT tag — production gate |
| `production_release_tag` | Production release tag/record created when main is updated |
| `rollback_release_tag` | Previous production tag/commit to revert to |

**Workflow**: staging → create `PRUEBAS-001` → UAT finds issues → fix → create `PRUEBAS-002` → UAT approves → record `PRUEBAS-002` as `approved_uat_tag` → promote to production → create production release tag.

### Decision: Post-test documentation gate

| Option | Tradeoff | Decision |
|--------|----------|----------|
| No documentation gate; update ledger whenever | Flexible; but stale evidence means regressions go undetected — ledger shows old passing state while current code is broken | **Rejected** |
| Gate only at archive time | Late; regressions between apply and archive are invisible | **Rejected** |
| **Gate immediately after staging integration + passing tests** | Slightly more process; but ledger always reflects current state, regressions detectable within one commit cycle | **Accepted** |

**Rationale**: The user's hard constraint is that integration is not done until the docs are updated with passing evidence. This creates a tight feedback loop: if someone integrates to staging and tests pass, the ledger must reflect that *before* the work is declared complete. The `evidence_updated_at` field is the key invariant — if it's older than the latest integration commit, the evidence is stale and the feature is not verified.

**Fields added to Status section**:

| Field | Purpose |
|-------|---------|
| `last_verified_commit` | SHA of the commit whose test results are recorded |
| `last_verified_at` | ISO datetime of when verification was completed |
| `test_evidence` | Manifest path + pass/total, or test_vba run output reference |
| `staging_integration_commit` | SHA of the merge/recreate commit that landed this work in staging |
| `evidence_updated_at` | ISO datetime — last time the Status section was updated with fresh evidence |

## Interfaces / Contracts

### Feature File Schema (`docs/features/<domain>/<feature-key>.md`)

```markdown
# <Feature Key> — <Short Description>

## Status
- **Current**: active | passing | regressed | not-current | archived
- **Last verified**: <ISO date>
- **Manifest drift**: clean | drifted | unregistered
- **Staging reachability**: reachable | not-reachable — ALL integration_commits must be ancestors of staging
- **TDD evidence**: fresh | thin | none — fresh = manifest/test_vba run against current HEAD or verified staging commit; thin = commit-message-level only; none = no evidence

## Release Tracking
- **UAT status**: pending | approved | failed
- **UAT tag**: <immutable tag name, e.g. PRUEBAS-001>
- **UAT date**: <ISO date>
- **UAT evidence**: <who tested, what was verified>
- **UAT tag history**: <all UAT tags, e.g. PRUEBAS-001 → PRUEBAS-002>
- **Approved UAT tag**: <final approved tag — required for production promotion>
- **Production release tag**: <production tag/record>
- **Production release commit**: <main merge SHA>
- **Production date**: <ISO date>
- **Rollback release tag**: <tag/commit to revert to>

## Business Behavior
<What this feature does in business terms. Not implementation details.>

## Acceptance Criteria
- [ ] <Criterion 1>
- [ ] <Criterion 2>

## Required Tests
| Procedure | Manifest | Status |
|-----------|----------|--------|
| Test_X | tests/tests.vba.foo.json | PASS/FAIL/MISSING |

## Last Known Passing
- **Date**: <ISO>
- **Commit**: <SHA>
- **Manifest**: <path>
- **Result**: <pass>/<total>

## Integration Commits
| SHA | Message | Ancestor of staging |
|-----|---------|---------------------|
| <sha> | <subject> | Yes/No |

## Access Sync Status
- **Import method**: Dysflow import_modules / import_all
- **Manual compile**: confirmed <date>
- **verify_binary**: <result or N/A>

## Rollback Anchor
<Commit to revert to, or "no rollback needed">

## Business Rules
<Preserved functional capabilities — what must survive web migration>

## Legacy Not to Copy
<Access-specific anti-patterns the web migration must NOT replicate>

## Migration Notes
<Web migration considerations. Empty until migration begins.>

## Open Decisions
<Any unresolved questions>

## Evidence Sources
- <Link to archive report>
- <Link to promoted spec>
- <Link to test manifest>
```

### SDD Integration Contract

Every SDD phase must reference the feature catalog:

| Phase | Read | Write |
|-------|------|-------|
| `sdd-tasks` | Read affected feature files before planning | Note which fields will change |
| `sdd-apply` | Read current state | Update behavior, tests, sync status |
| `sdd-verify` | Read current state | Update `last_known_passing`, `manifest_drift_status` |
| `sdd-archive` | Read current state | Update `integration_commits`, `access_sync_status`, `status` |
| `sdd-propose` | Read existing features to avoid duplication | Create new feature file if introducing new capability |
| **Post-test gate** | Read current Status section | Update `last_verified_commit`, `last_verified_at`, `test_evidence`, `staging_integration_commit`, `evidence_updated_at` |
| UAT gate | Read `uat_tag`, `uat_tag_history` | Update `uat_tag`, `uat_tag_history`, `uat_status`, `uat_evidence` |
| Production gate | Read `approved_uat_tag` | Update `production_release_tag`, `production_release_commit`, `production_date`, `rollback_release_tag` |

### Close-Gate Checklist (updated)

Before declaring any feature closed:
1. Feature file exists at `docs/features/<domain>/<key>.md` with all REQUIRED sections populated
2. `required_tests` matches actual procedures in source modules
3. `last_known_passing` references test run against current HEAD
4. `manifest_drift_status` is `clean` or drift documented with resolution plan
5. `access_sync_status` records import and compile evidence
6. `integration_commits` lists SHAs with `is-ancestor` verification
7. **Staging reachability gate**: ALL `integration_commits` SHAs must be reachable from `staging`. If ANY commit is not reachable, feature status cannot be `passing` — it must be `not-current` or `regressed`.
8. **TDD evidence gate**: Fresh `test_vba` run evidence (manifest pass/total against current HEAD or verified staging commit) is required before the feature can be declared `passing` or ready for UAT/release. Commit-message-level evidence is not sufficient.
9. **Post-test documentation gate**: After staging integration and passing tests, the feature ledger Status section is updated with fresh evidence before declaring work complete. Required fields: `last_verified_commit`, `last_verified_at`, `test_evidence`, `staging_integration_commit`, `evidence_updated_at`. Integration is **not done** until this gate is satisfied.
10. `uat_status` is `approved` or N/A for features not yet in UAT
11. **UAT tag gate**: `approved_uat_tag` is recorded (or N/A) — no production promotion without an approved final UAT tag
12. `REGRESSION-ANCHOR.md` summary table links to the feature file
13. `docs/features/README.md` domain listing includes the feature

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Schema validation | All REQUIRED fields present in each feature file | Checklist in README; manual review during archive |
| Drift detection | Procedure count in manifest vs actual source module | Manual verification during backfill; future automation |
| Index consistency | Every feature file has a corresponding row in REGRESSION-ANCHOR.md | Archive phase enforces bidirectional link check |
| Ancestor verification | All integration commit SHAs reachable from staging | `git merge-base --is-ancestor` in close-gate |

## Migration / Rollout

### Phase 1: Foundation (first slice)
1. Create `docs/features/README.md` with catalog purpose, schema summary, domain structure
2. Create `docs/features/_template.md` with all fields and instructions
3. Backfill `form-ncproyecto-helper-coverage` as the reference entry (highest evidence density from REGRESSION-ANCHOR + archive)
4. Update `openspec/REGRESSION-ANCHOR.md` to become thin index pointing to `docs/features/`

### Phase 2: Backfill remaining archived features
For each of the 5 remaining archived changes:
1. Extract evidence from `archive-report.md`
2. Cross-reference with test manifests and source modules
3. Create feature file at `docs/features/<domain>/<key>.md`
4. Verify manifest drift status against current HEAD

Backfill order (by evidence quality):
1. `form-fncproyecto-cache-invalidation` (richest archive report)
2. `ncproyecto-seguimiento-tareas-helper` (full traceability)
3. `audit-backend-list-cache` (with spec promotion)
4. `ce-fecha-obligatoria-postponement` (full traceability)
5. `trust-ncproyecto-cache-hits` (thin evidence — flag gaps)

### Phase 3: Active features and index completion
1. Register all test manifests with feature mapping
2. Complete REGRESSION-ANCHOR.md summary table
3. Verify every feature file has bidirectional links

### Review Budget
- Phase 1: ~150 lines (README + template + 1 backfilled feature + index update) — fits single PR
- Phase 2: ~200 lines (5 backfilled features) — fits single PR or split to 2 chained
- Phase 3: ~50 lines (index completion) — trivial PR

## Close Gates and Regression Recovery

### Close Gate (per feature)
Feature cannot be declared closed until:
- All sections in `docs/features/<domain>/<key>.md` are populated
- `REGRESSION-ANCHOR.md` row is current
- `docs/features/README.md` listing is current
- At least 2 independent evidence sources confirm the entry

### Regression Recovery Workflow
1. Run tests against current HEAD
2. If previously passing test fails → update feature `status` to `regressed`
3. Add regression note: failed tests, suspected commit, impact, resolution path
4. Update `REGRESSION-ANCHOR.md` summary row to `regressed`
5. Fix regression → re-run tests → update `status` to `passing`
6. Preserve regression note for historical context (never delete)

## First Implementation Slice

Establish `docs/features/` structure and backfill one known feature:

### Deliverables
1. `docs/features/README.md` — catalog purpose, how to use, domain listing, schema overview
2. `docs/features/_template.md` — copy-paste template with all REQUIRED fields
3. `docs/features/project-listing/form-ncproyecto-helper-coverage.md` — first backfilled entry
4. `openspec/REGRESSION-ANCHOR.md` — convert to thin index with summary table

### Evidence for first backfill
- REGRESSION-ARCHOR.md existing entry (behavior, acceptance criteria, test lists)
- Archive report: `openspec/changes/archive/2026-06-06-form-ncproyecto-helper-coverage/archive-report.md`
- Manifest: `tests/tests.vba.form-helper.json` (9 tests, confirmed OK)
- Manifest drift: `tests/tests.vba.listado-helper.json` (3 tests listed, 0 in implied module — DRIFTED)
- Integration commits: `500d6d5`, `2ca4de7` (both verified ancestors of staging)
- Access sync: modules imported, user manually compiled, frontend restored from `a40e0b8`
- Status: `regressed` (manifest drift in listado-helper.json)

### What the first backfill proves
- Schema works for a feature with rich evidence
- Manifest drift detection works (listado-helper.json is documented)
- Regression status is captured and linked
- The template is viable for future backfills

## Open Questions

- [ ] Should `docs/features/README.md` list ALL test manifests with feature mapping, or only those tied to documented features? (Recommendation: only documented features; unmapped manifests are a separate concern.)
- [ ] Should the catalog include a `docs/features/catalog.yaml` machine-readable index in first slice? (Recommendation: defer to Phase 3 if needed for automation.)
- [ ] Domain grouping: should `form-ncproyecto-helper-coverage` and `nc-proyecto-seguimiento-tareas-helper` share a `project-listing/` domain, or use separate domains? (Recommendation: group by business domain, not SDD change name.)
