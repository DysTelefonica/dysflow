# Verification Report: Fix MCP Tool-Call Hang

## Verdict

PASS

## Change

- Change: `fix-mcp-tool-call-hang`
- Issue: #362
- Mode: hybrid SDD, strict TDD
- Chain strategy: `stacked-to-main`

## Evidence

| Command | Result |
|---|---|
| `pnpm vitest run test/core/runner/powershell-executor.test.ts test/core/runner/access-runner.test.ts test/core/config/dysflow-config.test.ts test/adapters/mcp/stdio.test.ts test/adapters/mcp/tools.test.ts` | PASS — 5 files passed, 121 tests passed |
| `pnpm test` | PASS — 49 files passed, 603 tests passed, 3 skipped |
| `pnpm build` | PASS |
| Short E2E MCP probe from `E2E_testing`: `initialize` + one `tools/call dysflow_doctor` | PASS — exit 0, no stderr, terminal response `isError:false`, checks `access-db-path: configured` and `access-open: opened` |
| Installed runtime probe from `E2E_testing`: persistent stdin + one `tools/call list_tables` | PASS — exit 0, no stderr, terminal response `isError:false`, returned table list |

## Diff Reviewed

Included for #362:

- `src/adapters/mcp/stdio.ts`
- `src/adapters/mcp/tools.ts`
- `src/core/runner/access-runner.ts`
- `src/core/runner/powershell-executor.ts`
- `test/adapters/mcp/stdio.test.ts`
- `test/adapters/mcp/tools.test.ts`
- `test/core/config/dysflow-config.test.ts`
- `test/core/runner/access-runner.test.ts`
- `test/core/runner/powershell-executor.test.ts`
- `openspec/changes/fix-mcp-tool-call-hang/*`

Excluded from this verdict:

- `.atl/skill-registry.md` — unrelated registry refresh diff.
- `README.md`, `src/cli/commands/install.ts`, `test/cli/install.test.ts`, `openspec/changes/fix-mcp-runtime-startup/*` — #361 startup/config slice.

## Spec Compliance Matrix

| Spec Scenario | Evidence | Status |
|---|---|---|
| MCP successful call after startup emits one terminal response | Focused MCP adapter/tool tests pass; E2E `dysflow_doctor` returned terminal `isError:false`. | PASS |
| Core timeout/failure maps to terminal tool response | Focused MCP tests pass for bounded core failure and thrown handler failure with safe content. | PASS |
| E2E project context preserves request completion | Short `E2E_testing` MCP probes returned terminal responses for `dysflow_doctor` and installed-runtime `list_tables`. | PASS |
| Runner timeout returns structured metadata | Focused runner tests pass; timeout operation status is `timed_out`. | PASS |
| Non-timeout subprocess failure returns diagnostics | Focused executor/runner tests pass. | PASS |
| E2E diagnostics path remains bounded | Short probe completed before the 20s timeout. | PASS |

## Findings

### CRITICAL

None.

### WARNING

None.

### SUGGESTION

- Keep #361 and #362 as separate review slices or commits; the working tree currently contains both changes.

## Ready State

Ready for commit/PR preparation after separating #361 and #362 work units according to the chained PR plan.
