# Skill Registry — No Conformidades

Registry contract: this file is an index only. `SKILL.md` files remain the source of truth. Delegators should pass exact `SKILL.md` paths to sub-agents instead of copying compact rules.

## Project Standards

| Skill | Scope | Skill root | File | Trigger / description |
|---|---|---|---|---|
| `access-vba-tdd` | user | `C:\Users\adm1\.config\opencode\skills\access-vba-tdd` | `C:\Users\adm1\.config\opencode\skills\access-vba-tdd\SKILL.md` | Mandatory for Access/VBA tests and reviews: strict TDD, schema-first fixtures, sandbox-safe data setup, JSON-returning test functions, Dysflow-friendly manifests. |

## Notes

- Registered on 2026-06-06 for the `00_NO_CONFORMIDADES_staging` workspace.
- Canonical registration source requested by the user: `C:\Users\adm1\.config\opencode\skills\access-vba-tdd`.
- Reinforced on 2026-06-11: sub-agents must load `access-vba-tdd` from the exact path `C:\Users\adm1\.config\opencode\skills\access-vba-tdd\SKILL.md` when Access/VBA tests or reviews are involved. If name-based skill lookup fails, read this exact file path directly before proceeding.
- As of 2026-06-07, `access-vba-tdd` is the only project-specific skill that delegators should inject for Access/VBA test quality. Do not inject `access-vba-sync` or `access-query` for this project registry: Dysflow MCP is the canonical runtime for import/export/test/query operations.
- `.atl/` is intentionally ignored by Git in this repo.
