# Archive Report: Fix MCP Runtime Startup

## Change Metadata

- **Change ID**: `fix-mcp-runtime-startup`
- **GitHub Issue**: #361
- **Released in**: v0.9.12
- **Archived Date**: 2026-05-27
- **Mode**: hybrid SDD, strict TDD
- **Chain Strategy**: stacked-to-main

## Intent

Fix Windows OpenCode MCP startup failures where generated config launches `dysflow.cmd mcp` and OpenCode/Node can raise `spawn EINVAL`. The installer generates an OpenCode-safe command while preserving Dysflow runtime resolution.

## Verification Status

**PASS** — All verification checks passed.

- OpenCode MCP protocol probe: 48 tools available, exit 0, no stderr
- Installed runtime probe: initialize + `tools/list` — PASS
- Tool call probe: `dysflow_access_operations_list` returned successful result with `isError:false`
- Configured Access tool probe: Verified Windows-safe entrypoint avoids direct `.cmd` spawn
- Unit tests: 54 tests passed for install module
- Full test suite: 595 tests passed (49 files), 3 skipped
- Build: PASS

## Specs Synced

| Domain | Action | Requirements Added |
|--------|--------|-------------------|
| `product-cli` | Updated | OpenCode MCP config uses Windows-safe runtime entrypoint |

### Key Requirements Merged

**product-cli:**
- Install writes a non-cmd OpenCode MCP command
- Integration refresh preserves the safe OpenCode command
- Wrapper fallback still avoids direct cmd spawn
- Runtime entrypoint cannot be resolved — fail with actionable error
- Non-OpenCode agent launchers remain unchanged

## Archive Contents

- proposal.md — Intent, scope, approach, rollback plan
- design.md — Technical design for Windows-safe MCP startup
- specs/ — Delta spec for product-cli
- tasks.md — Breakdown of implementation tasks
- verify-report.md — Full verification evidence and compliance matrix
- exploration.md — Initial exploration of OpenCode startup mechanism

## Source of Truth Updated

The following spec now reflects the new behavior:
- `openspec/specs/product-cli/spec.md`

## SDD Cycle Status

**COMPLETE** — Change has been fully planned, implemented, verified, and archived. Ready for the next change.

## Implementation Summary

- Dysflow installer now generates OpenCode MCP config using Node runtime entrypoint instead of `.cmd` launcher
- Avoids Windows `spawn EINVAL` errors on OpenCode startup
- Preserves runtime path resolution for installed Dysflow app
- Integration refresh maintains Windows-safe command shape
- Non-OpenCode agent integrations remain unaffected
- Clear error reporting when runtime entrypoint cannot be resolved

## Next Steps

This change is complete and closed. No further work is needed for this issue.
