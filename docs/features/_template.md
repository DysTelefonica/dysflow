# <feature_key> — <Short Description>

> Copy this template for each new feature. Replace all `<placeholders>`.
> Delete this instruction block after filling in values.

## Status

| Field | Value |
|-------|-------|
| **Current** | `active` / `passing` / `regressed` / `not-current` / `archived` |
| **Last verified** | `<ISO date>` |
| **Manifest drift** | `clean` / `drifted` / `unregistered` |
| **Staging reachability** | `reachable` / `not-reachable` — ALL integration_commits must be ancestors of `staging` |
| **TDD evidence** | `fresh` / `thin` / `none` — fresh = manifest/test_vba run against current HEAD or verified staging commit; thin = commit-message-level only; none = no evidence |
| **Last verified commit** | `<SHA of the commit whose test results are recorded above>` |
| **Last verified at** | `<ISO datetime when verification was completed>` |
| **Test evidence** | `<manifest path + pass/total, or test_vba run output reference>` |
| **Staging integration commit** | `<SHA of the merge/recreate commit that landed this work in staging>` |
| **Evidence updated at** | `<ISO datetime — last time this Status section was updated with fresh evidence>` |

## Release Tracking

| Field | Value |
|-------|-------|
| **UAT status** | `pending` / `approved` / `failed` |
| **UAT tag** | `<immutable tag name, e.g. PRUEBAS-001 — set when staging enters UAT>` |
| **UAT date** | `<ISO date or empty>` |
| **UAT evidence** | `<who tested, what was verified — or empty>` |
| **UAT tag history** | `<all UAT tags applied, e.g. PRUEBAS-001 → PRUEBAS-002>` |
| **Approved UAT tag** | `<final approved tag — required for production promotion>` |
| **Production release tag** | `<production release tag/record — or empty if not yet released>` |
| **Production release commit** | `<main merge SHA — or empty if not yet released>` |
| **Production date** | `<ISO date — or empty if not yet released>` |
| **Rollback release tag** | `<tag/commit to revert to if rollback needed>` |

## Business Behavior

<What this feature does in business terms. Not implementation details.>

## Acceptance Criteria

- [ ] <Criterion 1 — define "done" in business terms>
- [ ] <Criterion 2>

## Required Tests

| Procedure | Manifest | Status |
|-----------|----------|--------|
| `Test_X` | `tests/tests.vba.<name>.json` | PASS / FAIL / MISSING |

## Last Known Passing

| Field | Value |
|-------|-------|
| **Date** | `<ISO date>` |
| **Commit** | `<SHA>` |
| **Manifest** | `tests/tests.vba.<name>.json` |
| **Result** | `<pass>/<total>` |

## Integration Commits

| SHA | Message | Ancestor of staging |
|-----|---------|---------------------|
| `<sha>` | `<subject>` | Yes / No |

## Access Sync Status

- **Import method**: Dysflow `import_modules` / `import_all` / N/A
- **Manual compile**: confirmed `<date>` / N/A
- **verify_binary**: `<result>` / N/A

## Rollback Anchor

<Commit to revert to, or "no rollback needed">

## Business Rules

<Preserved functional capabilities — what must survive web migration>

## Legacy Not to Copy

<Access-specific anti-patterns the web migration must NOT replicate>
Examples: `Screen.ActiveForm` coupling, `Debug.Print` as UI feedback, tempvar-based state

## Migration Notes

<Web migration considerations. Empty string allowed until migration begins.>

## Open Decisions

<Unresolved design or process questions. Leave empty if none.>

## Evidence Sources

- <Link to archive report or SDD change>
- <Link to test manifest>
- <Link to promoted spec or git history>

## Post-Test Documentation Gate

> **Rule**: Integration is not done until this section is updated. After staging integration and passing tests, update the Status section fields (`last_verified_commit`, `last_verified_at`, `test_evidence`, `staging_integration_commit`, `evidence_updated_at`) before declaring the work complete.

| Step | Action | Done |
|------|--------|------|
| 1 | Tests pass against staging HEAD | [ ] |
| 2 | `last_verified_commit` updated with SHA | [ ] |
| 3 | `last_verified_at` updated with ISO datetime | [ ] |
| 4 | `test_evidence` updated with manifest + pass/total | [ ] |
| 5 | `staging_integration_commit` updated with merge SHA | [ ] |
| 6 | `evidence_updated_at` updated with current datetime | [ ] |
| 7 | Feature status reflects current state | [ ] |
