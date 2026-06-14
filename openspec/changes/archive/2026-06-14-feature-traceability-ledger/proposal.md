# Proposal: Feature Traceability Ledger

## Intent

No Conformidades features are documented in fragmented artifacts (archive reports, test manifests, REGRESSION-ANCHOR.md, promoted specs) with no unified view of what a feature *is*, whether it works today, or how to recover from regression. Manifest drift is already confirmed (`listado-helper.json` references deleted procedures). The project needs a single source of truth that serves both regression safety and future legacy-to-web migration.

## Scope

### In Scope
- Define a per-feature ledger schema: behavior, acceptance criteria, required tests/manifests, passing evidence, integration commits, Access sync status, rollback anchor, migration notes, legacy notes not to copy, open decisions
- Expand `openspec/REGRESSION-ANCHOR.md` as the navigational index with a summary table and close-gate checklist
- Create `openspec/features/<feature-key>/ledger.md` files for full per-feature detail
- Establish close-gate rule: ledger update required before any feature/change is declared done
- Establish change workflow: SDD changes reference existing feature records, then update them post-verification
- Backfill `form-ncproyecto-helper-coverage` as first ledger entry (from existing archive evidence)
- Backfill `listado-helper` evidence and document manifest drift resolution

### Out of Scope
- Automated drift detection tooling (future enhancement)
- Web migration feature-by-feature documentation (ledger structure enables it; content is later work)
- Test manifest restructuring or manifest count fixes (tracked separately)
- Access form UI/visual design documentation

## Capabilities

### New Capabilities
- `feature-ledger`: Per-feature traceability records with acceptance criteria, test manifests, passing evidence, integration commits, Access sync status, rollback anchors, and migration notes

### Modified Capabilities
- None — this creates new process/structure, does not change existing spec behavior

## Approach

**Hybrid index + per-feature files** (Approach 3 from exploration):

1. `openspec/REGRESSION-ANCHOR.md` becomes the index — summary table of all features with status, last-known passing, and links to detail files
2. Each feature gets `openspec/features/<feature-key>/ledger.md` with full record
3. Close-gate checklist in REGRESSION-ANCHOR.md is the enforcement point
4. Change workflow: `sdd-tasks` and `sdd-apply` reference the feature ledger; `sdd-verify` and `sdd-archive` update it

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/REGRESSION-ANCHOR.md` | Modified | Expand as index with summary table and process definition |
| `openspec/features/*/ledger.md` | New | Per-feature ledger files (first: `form-ncproyecto-helper-coverage`) |
| `openspec/changes/feature-traceability-ledger/` | New | This SDD change |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Ledger drifts from reality if not updated with each change | High | Close-gate checklist blocks feature closure until ledger is current |
| Per-feature files multiply without index discipline | Medium | Index auto-links; archive phase requires index check |
| Manifest drift continues undetected | High | Ledger entry requires manifest count vs source count verification |
| Migration notes remain empty until web migration begins | Low | Structure exists; content fills when migration work starts |

## Rollback Plan

Delete `openspec/features/` directory and revert `openspec/REGRESSION-ANCHOR.md` to pre-change state. No code or Access objects are affected.

## Dependencies

- None — pure documentation/process artifact

## Success Criteria

- [ ] `openspec/REGRESSION-ANCHOR.md` has summary table linking to all feature ledger files
- [ ] `form-ncproyecto-helper-coverage` ledger entry exists with full fields populated from archive evidence
- [ ] `listado-helper` manifest drift documented with resolution path
- [ ] Close-gate checklist enforced in REGRESSION-ANCHOR.md
- [ ] Change workflow documented (how SDD changes reference and update feature records)
