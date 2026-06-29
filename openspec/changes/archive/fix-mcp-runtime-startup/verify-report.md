# Verification Report: Fix MCP Runtime Startup

## Verdict

PASS

## Change

- Change: `fix-mcp-runtime-startup`
- Issue: #361
- Mode: hybrid SDD, strict TDD
- Chain strategy: `stacked-to-main`

## Evidence

| Command | Result |
|---|---|
| `pnpm vitest run test/cli/install.test.ts` | PASS — 54 tests passed |
| `pnpm test` | PASS — 49 files passed, 595 tests passed, 3 skipped |
| `pnpm build` | PASS |
| `node dist/cli/index.js mcp` protocol probe | PASS — initialize + `tools/list`, 48 tools, exit 0, no stderr |
| `node C:/Users/adm1/AppData/Local/dysflow/app/dist/cli/index.js mcp` protocol probe | PASS — installed runtime 0.9.6 initializes + `tools/list`, 48 tools, exit 0, no stderr |
| `node dist/cli/index.js mcp` tool call probe | PASS — `dysflow_access_operations_list` returned `[]` with `isError:false` |
| `node dist/cli/index.js mcp` configured Access tool probe | WARNING — `dysflow_doctor` and `list_access_files` returned `CONFIG_MISSING_ACCESS_PATH` because this worktree has no `.dysflow/project.json` |

## Diff Reviewed

Included: `README.md`, `src/cli/commands/install.ts`, `test/cli/install.test.ts`, and `openspec/changes/fix-mcp-runtime-startup/*`.
Excluded: `.atl/skill-registry.md` because it is an unrelated registry refresh diff.

## Spec Compliance Matrix

| Spec Scenario | Evidence | Status |
|---|---|---|
| Install writes a non-cmd OpenCode MCP command | `test/cli/install.test.ts` asserts OpenCode command equals `node`, `<runtimeDir>/app/dist/cli/index.js`, `mcp` and contains no `dysflow.cmd`; focused suite passed. | PASS |
| Integration refresh preserves the safe OpenCode command | `applyIntegrationSelection` test asserts refreshed OpenCode config uses the safe Node entrypoint and no direct `.cmd`; focused suite passed. | PASS |
| Wrapper fallback still avoids direct cmd spawn | No wrapper was required by the implementation; the generated command avoids direct `.cmd` spawning. | PASS |
| Runtime entrypoint cannot be resolved | Added error-path test asserts actionable `Cannot configure OpenCode MCP` failure with missing entrypoint path; focused suite passed. | PASS |
| Other agent configs keep their existing launcher | Existing install assertions still verify non-OpenCode configs use `dysflow.cmd`; focused suite passed. | PASS |

## Findings

- CRITICAL: none.
- WARNING: Access-backed MCP tools were not part of #361; that execution path is covered by #362.
- SUGGESTION: mention in the PR that OpenCode must have `node` discoverable.

## Risks

- Real OpenCode environments without `node` on PATH may still need the documented fallback path from the design (`cmd.exe /c` wrapper), but the current implementation matches the verified workaround and spec.

## Ready State

Ready for commit/PR after excluding or separately handling the unrelated `.atl/skill-registry.md` diff.
