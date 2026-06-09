# Archive: form-ncproyecto-helper-coverage

## Archive Summary

**Change**: form-ncproyecto-helper-coverage
**Archived to**: `openspec/changes/archive/2026-06-06-form-ncproyecto-helper-coverage/`
**Archived on**: 2026-06-06

## Verdict

**INTENTIONAL ARCHIVE — INCOMPLETE PLACEHOLDER**

This change folder was a zombie artifact. It contained only an exported ERD of
`NoConformidades_Datos.accdb` and no proposal, design, spec, tasks, or scope
documentation. There is no closing commit, no `closes #N` reference, and no
GitHub issue bound to this folder.

## Why archived instead of deleted

- `openspec/` is local-only (gitignored), so deleting the folder would only
  remove it from this working tree without affecting any other worktree.
- The contained ERD (`erd-backend.md/NoConformidades_Datos.md`, generated
  2026-06-03) is preserved as a snapshot in case it is useful for the helper
  coverage work that any future `#54`, `#55`, or related issue might need.
- Archiving with this README keeps the audit trail honest: future agents
  looking at the archive will not mistake this folder for a real, completed
  SDD.

## Contents

- `erd-backend.md/NoConformidades_Datos.md` — exported ERD snapshot (44 tables).

## Source of Truth

There is no `openspec/specs/form-ncproyecto-helper-coverage/` because there was
no delta spec. No spec is being created during this archival.

## Recommendation

If at a later date a real SDD is opened for project-form helper coverage, create
a fresh `openspec/changes/<new-key>/` folder and pull whatever content is
relevant from this archived ERD. Do NOT resurrect this folder.
