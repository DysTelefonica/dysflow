# Archive Report: Fix MCP Backend DDL Targeting

## Change Metadata

- **Change ID**: `fix-mcp-backend-ddl-targeting`
- **GitHub Issue**: #347
- **Released in**: v0.9.12
- **Archived Date**: 2026-05-27
- **Mode**: hybrid SDD, strict TDD, chained PR
- **Chain Strategy**: stacked-to-main

## Intent

Fix legacy MCP write tools so explicit `backendPath` DDL/write requests target the backend database, not the Access frontend. This unblocks No Conformidades cache/config table creation in `NoConformidades_Datos.accdb` while preserving frontend-local tables such as `TbConfiguracionBackends`.

## Verification Status

**PASS** — Implementation is complete and verified.

- Chained PR scope: PR1 (RED tests), PR2 (GREEN production fix), PR3 (docs/artifact tightening)
- Unit tests (legacy MCP & runner): 24 passed
- PowerShell script tests: 94 passed, 4 skipped
- Full test suite: All issue #347 focused tests remained green
- Build: PASS
- Type check: PASS

## Specs Synced

| Domain | Action | Requirements Added |
|--------|--------|-------------------|
| `access-core-runner` | Updated | Explicit Legacy Write Database Target |
| `mcp-stdio-adapter` | Updated | Legacy MCP Write Target Mapping |

### Key Requirements Merged

**access-core-runner:**
- Explicit backend target receives DDL
- No explicit write target preserves compatibility
- Protected backend password source and diagnostics
- Owned cleanup after write failure

**mcp-stdio-adapter:**
- Legacy tool forwards explicit backend target
- Legacy tool without backend target remains compatible
- No Conformidades Issue 18 table classification
- Unsafe secret or cleanup input is rejected safely

## Archive Contents

- proposal.md — Intent, scope, approach, rollback plan
- design.md — Technical design for backend DDL targeting
- specs/ — Delta specs for access-core-runner, mcp-stdio-adapter
- tasks.md — Implementation tasks and TDD coverage matrix
- apply-progress.md — Complete TDD cycle evidence and test results
- Chained PR artifacts demonstrating RED/GREEN/REFACTOR phases

## Source of Truth Updated

The following specs now reflect the new behavior:
- `openspec/specs/access-core-runner/spec.md`
- `openspec/specs/mcp-stdio-adapter/spec.md`

## SDD Cycle Status

**COMPLETE** — Change has been fully planned, implemented (across 3 PR slices), verified, and archived. Ready for the next change.

## Implementation Summary

**PR1 (RED):** Regression tests proving legacy write/DDL targeting must preserve explicit backend/database targets and must not always use the frontend.

**PR2 (GREEN):**
- Legacy write schemas now accept `databasePath`/`sourcePath` for write operations
- `AccessPowerShellRunner` falls back to `config.backendPath` only when neither `backendPath` nor `databasePath` is present
- PowerShell runner dispatches write actions through `Resolve-WriteActionDatabase` helper
- Database selection precedence: `databasePath/sourcePath` > `backendPath` > `CurrentDb`
- Safe cleanup uses Dysflow operation ownership, not generic process kills

**PR3 (Docs/Artifacts):**
- Reconstructed missing OpenSpec tasks and verification artifacts
- Documented No Conformidades Issue #18 safe backend DDL usage
- Table classification guide: backend/global tables vs frontend/local tables

## Next Steps

This change is complete and closed. No further work is needed for this issue.
