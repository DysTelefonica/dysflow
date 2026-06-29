## Exploration: v0.9.7 MCP/runtime startup fix

### Current State
Dysflow installs a runtime under a selected runtime directory and writes MCP client integrations from `src/cli/commands/install.ts`. All configured agents currently receive the same command path from `commandPathForConfig()`: `<runtimeDir>/bin/dysflow.cmd`. For OpenCode, `configureOpencode()` serializes that as `mcp.dysflow.command = [commandPath, "mcp"]`; the README documents the same `.cmd`-based OpenCode config. The installed `.cmd` launcher then sets `DYSFLOW_HOME`, prepends Node to `PATH`, and runs `node "%DYSFLOW_HOME%\app\dist\cli\index.js" %*`.

The recent symptom is specifically Windows/OpenCode startup: OpenCode launching `dysflow.cmd mcp` can fail with `EINVAL`, while directly launching `node C:/Users/adm1/AppData/Local/dysflow/app/dist/cli/index.js mcp` initializes and returns tools. This matches the known Windows Node behavior already fixed for `dysflow update` in issue #289 / PR #290: spawning `.cmd` without a shell can raise `spawn EINVAL`. Dysflow cannot force OpenCode's spawn implementation to use `shell: true`, so the product-side fix should avoid writing a `.cmd` command for OpenCode MCP startup on Windows.

### Affected Areas
- `src/cli/commands/install.ts` — owns runtime command path generation and per-agent config writers; `configureOpencode()` is the likely faulty writer.
- `test/cli/install.test.ts` — already asserts OpenCode receives `[expectedCmd, "mcp"]`; strict TDD should change/add tests before implementation.
- `README.md` — documents OpenCode config as `bin/dysflow.cmd`; user-facing docs would become stale after the fix.
- `openspec/specs/product-cli/spec.md` — contains installer/integration requirements and should receive the delta spec for Windows-safe OpenCode startup.

### Approaches
1. **OpenCode direct Node entrypoint** — write OpenCode config as `["node", "<runtimeDir>/app/dist/cli/index.js", "mcp"]` and, if supported/needed, include runtime environment such as `DYSFLOW_HOME`.
   - Pros: avoids `.cmd` entirely in the client spawn path; matches the verified workaround; small install/config surface change.
   - Cons: depends on `node` being available to OpenCode's environment; must confirm whether `DYSFLOW_HOME` is necessary for Access/VBA runtime script lookup or whether package-root/runtime resolution is enough.
   - Effort: Low/Medium

2. **OpenCode shell wrapper command** — write OpenCode config as a shell-safe command such as `["cmd.exe", "/d", "/s", "/c", "<runtimeDir>/bin/dysflow.cmd", "mcp"]`.
   - Pros: preserves launcher behavior including `DYSFLOW_HOME` and PATH setup.
   - Cons: more quoting/escaping risk; Windows-only shape in a JSON config; still routes through `.cmd`; less direct than the known working command.
   - Effort: Medium

3. **Change all agents to direct Node** — replace the canonical integration command for every client.
   - Pros: one command model.
   - Cons: unnecessarily broad for a narrow OpenCode symptom; higher regression risk for Codex/Claude/Pi; likely too much for the v0.9.7 hotfix slice.
   - Effort: Medium/High

### Recommendation
Proceed with a narrow v0.9.7 bug fix focused on OpenCode config generation and docs. Use strict TDD to first pin the Windows-safe OpenCode command shape in `test/cli/install.test.ts`, then update `configureOpencode()` and README/OpenSpec docs. Prefer the direct Node entrypoint if tests can prove it preserves the runtime path deterministically; otherwise use the `cmd.exe /c` wrapper only if `DYSFLOW_HOME` preservation is proven necessary.

No existing issue/PR was found that directly covers OpenCode MCP startup failing on `.cmd` with `EINVAL`. Issue #289 / PR #290 are related but closed and scoped to `dysflow update` spawning `pnpm.cmd`, not MCP client config generation.

### Risks
- OpenCode may not support extra environment fields in the MCP config; avoid relying on unsupported config keys unless verified.
- Direct `node` launch may not get the PATH normalization currently done by `dysflow.cmd`; tests should document this tradeoff and docs should mention Node must be discoverable.
- Reinstall/update flows call the same config writer and can overwrite a manual workaround, so the fix must cover both `handleInstallCommand()` and `applyIntegrationSelection()` paths.
- Chained PR budget is low-risk, but keep docs/spec/test+code slices small and under 400 changed lines.

### Ready for Proposal
Yes — create/approve a bug issue first, then run proposal/spec/design/tasks for change `fix-mcp-runtime-startup`. Suggested issue: `fix(install): avoid .cmd OpenCode MCP startup on Windows`.
