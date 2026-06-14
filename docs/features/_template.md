# <feature_key> — <Short Description>

> Copy this template for each new feature. Replace all `<placeholders>`.
> Delete this instruction block after filling in values.

## Status

| Field | Value |
|-------|-------|
| **Current** | `active` / `passing` / `regressed` / `archived` |
| **Last verified** | `<ISO date>` |
| **Manifest drift** | `clean` / `drifted` / `unregistered` |

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
