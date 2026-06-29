# Archive Report: Fix MCP Tool Call Hang

## Change Metadata

- **Change ID**: `fix-mcp-tool-call-hang`
- **GitHub Issue**: #362
- **Released in**: v0.9.12
- **Archived Date**: 2026-05-27
- **Mode**: hybrid SDD, strict TDD
- **Chain Strategy**: stacked-to-main

## Intent

After MCP startup succeeds from `E2E_testing`, Access-backed tool calls must not hang silently. This change bounds and diagnoses failures in the tool-call/core runner path so clients receive structured errors instead of pending JSON-RPC responses.

## Verification Status

**PASS** — All verification checks passed.

- E2E MCP probe: Initialize + `tools/call dysflow_doctor` — PASS
- Installed runtime probe: persistent stdin + `tools/call list_tables` — PASS
- Unit tests: 121 tests passed across 5 test files
- Full test suite: 603 tests passed (49 files), 3 skipped
- Build: PASS

## Specs Synced

| Domain | Action | Requirements Added |
|--------|--------|-------------------|
| `access-core-runner` | Updated | Bounded runner timeout and failure metadata |
| `mcp-stdio-adapter` | Updated | Bounded tool-call response semantics |

### Key Requirements Merged

**access-core-runner:**
- Timeout returns structured metadata
- Non-timeout subprocess failure returns diagnostics  
- E2E diagnostics path remains bounded

**mcp-stdio-adapter:**
- Successful call after startup
- Core timeout maps to terminal tool response
- E2E project context preserves request completion

## Archive Contents

- proposal.md — Intent, scope, approach, rollback plan
- design.md — Technical design for timeout/failure bounds
- specs/ — Delta specs for access-core-runner, mcp-stdio-adapter
- tasks.md — Breakdown of implementation tasks
- verify-report.md — Full verification evidence and compliance matrix
- exploration.md — Initial exploration and context

## Source of Truth Updated

The following specs now reflect the new behavior:
- `openspec/specs/access-core-runner/spec.md`
- `openspec/specs/mcp-stdio-adapter/spec.md`

## SDD Cycle Status

**COMPLETE** — Change has been fully planned, implemented, verified, and archived. Ready for the next change.

## Implementation Summary

- MCP stdio adapter now emits terminal JSON-RPC responses for bounded core/runner failures
- Runner subprocess execution diagnoses and returns structured timeout/failure metadata
- PowerShell execution timeouts are bounded and surface diagnostics instead of hanging
- Access-backed tool calls complete with structured error details instead of pending indefinitely

## Next Steps

This change is complete and closed. No further work is needed for this issue.
