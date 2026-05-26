# Proposal: Fix MCP Runtime Startup

## Intent

Fix Windows OpenCode MCP startup failures where generated config launches `dysflow.cmd mcp` and OpenCode/Node can raise `spawn EINVAL`. The installer should generate an OpenCode-safe command while preserving Dysflow runtime resolution.

## Scope

### In Scope
- Update the OpenCode MCP config contract for Windows-safe startup.
- Preserve runtime path resolution for installed Dysflow app entrypoint.
- Add strict TDD coverage before implementation in `test/cli/install.test.ts`.
- Update README/OpenSpec guidance tied to GitHub issue #361.

### Out of Scope
- Changing MCP config shapes for Claude, Codex, Gemini, Cursor, Windsurf, or Pi.
- Reworking the runtime installer or launcher scripts globally.
- Implementing HTTP adapter or unrelated MCP protocol changes.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `product-cli`: Installer integration requirements must specify that OpenCode MCP config avoids direct `.cmd` startup on Windows while resolving the installed runtime entrypoint.

## Approach

Use a narrow product-cli hotfix. Specify and test the desired OpenCode command shape first, then update `configureOpencode()` to emit a direct runtime entrypoint command, preferably `node <runtimeDir>/app/dist/cli/index.js mcp`. Fall back to a `cmd.exe /c` wrapper only if implementation proves `DYSFLOW_HOME`/PATH setup is required.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/cli/commands/install.ts` | Modified | OpenCode config writer emits Windows-safe runtime startup. |
| `test/cli/install.test.ts` | Modified | Pins generated OpenCode MCP command under strict TDD. |
| `README.md` | Modified | Documents OpenCode config without stale `.cmd` startup. |
| `openspec/specs/product-cli/spec.md` | Modified | Source capability receives delta requirement/scenarios. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Direct `node` is not discoverable to OpenCode | Med | Document prerequisite and verify current runtime expectations. |
| Runtime env from `dysflow.cmd` is still required | Med | Test entrypoint resolution; use `cmd.exe /c` wrapper only if needed. |
| Broader agent regression | Low | Limit change to OpenCode writer and keep existing agents unchanged. |

## Rollback Plan

Revert the OpenCode writer, tests, README, and product-cli delta/spec changes for issue #361. Users can manually restore `mcp.dysflow.command` to the previous `bin/dysflow.cmd mcp` shape if needed.

## Dependencies

- GitHub issue #361.
- Strict TDD: `pnpm test` / Vitest.
- Existing installer runtime layout: `<runtimeDir>/app/dist/cli/index.js`.

## Success Criteria

- [ ] OpenCode config no longer launches `dysflow.cmd` directly for MCP startup on Windows.
- [ ] Runtime entrypoint resolution remains deterministic for installed Dysflow.
- [ ] Vitest coverage pins the config shape before implementation.
- [ ] README and OpenSpec agree with generated config behavior.
