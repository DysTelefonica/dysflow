# Design: Fix MCP Runtime Startup

## Technical Approach

Use a narrow `product-cli` installer change: keep the existing runtime install/launcher model, but make only the OpenCode MCP writer avoid direct `.cmd` startup on Windows. Tests in `test/cli/install.test.ts` should first pin the desired JSON shape for both `handleInstallCommand()` and `applyIntegrationSelection()`. The final spec was not present during design, so this design follows the proposal/exploration and remains compatible with an expected `product-cli` delta.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| OpenCode command shape | Generate `command: ["node", "<runtimeDir>/app/dist/cli/index.js", "mcp"]` for OpenCode. | Keep `["<runtimeDir>/bin/dysflow.cmd", "mcp"]`; wrap with `cmd.exe /c`. | Direct Node avoids Node/OpenCode `.cmd` spawn `EINVAL` and matches the verified workaround. `cmd.exe` adds quoting risk and still depends on shell behavior. |
| Change boundary | Add an OpenCode-specific runtime entrypoint helper and pass it only to `configureOpencode()`. | Change `commandPathForConfig()` for every agent. | Codex/Claude/Pi are out of scope; preserving their existing `.cmd` launcher limits regression risk. |
| Runtime env | Do not depend on OpenCode-specific env fields unless implementation proves support/need. | Add `DYSFLOW_HOME` or PATH fields to OpenCode config. | Existing OpenCode config contract here is `command` array only. Unsupported env keys would create a hidden compatibility risk. Node must be discoverable, as already required by the runtime launcher. |

## Data Flow

```text
dysflow install/apply selection
  ├─ installRuntime() copies app, scripts, docs, launchers
  ├─ commandPathForConfig() ──→ Codex/Claude/Pi unchanged (.cmd)
  └─ opencodeCommandForConfig() ──→ configureOpencode() writes node + app/dist/cli/index.js + mcp
```

## File Changes

| File | Action | Description |
|---|---|---|
| `test/cli/install.test.ts` | Modify | Red tests: OpenCode command must not include `.cmd`; must equal direct Node entrypoint in install and TUI selection paths; other agents remain `.cmd`. |
| `src/cli/commands/install.ts` | Modify | Add/derive OpenCode runtime entrypoint from `runtimeDir`, pass it to `configureOpencode()`, leave `commandPathForConfig()` for other agents. |
| `README.md` | Modify | Replace OpenCode `.cmd` example with direct Node runtime entrypoint and mention `--runtime-dir` path substitution. |
| `openspec/changes/fix-mcp-runtime-startup/specs/product-cli/spec.md` | Create/Modify | Delta requirement for Windows-safe OpenCode startup. |
| `openspec/specs/product-cli/spec.md` | Later archive | Source capability receives the accepted delta when archived, not during apply unless archive phase runs. |

## Interfaces / Contracts

OpenCode config remains JSON with the existing local MCP object shape:

```ts
{
  mcp: {
    dysflow: {
      enabled: true,
      type: "local",
      command: ["node", "<runtimeDir>/app/dist/cli/index.js", "mcp"]
    }
  }
}
```

Paths should continue to be slash-normalized for config stability.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit/Integration | `handleInstallCommand()` writes OpenCode direct Node command and keeps Codex/Claude/Pi `.cmd`. | Vitest temp home/runtime fixture; assert JSON/TOML outputs. |
| Unit/Integration | `applyIntegrationSelection(["opencode"])` refreshes OpenCode with direct Node command while preserving unrelated config. | Extend existing selection test. |
| Docs/spec | README/OpenSpec match generated behavior. | Review assertions plus `pnpm test`; verification later should run `pnpm build`. |

## Migration / Rollout

No data migration required. Existing users need to rerun `dysflow install --agents opencode` or TUI integration selection to rewrite OpenCode config. Rollback is reverting test/code/docs/spec changes.

## Open Questions

- [ ] Final delta spec is not present yet; confirm exact RFC 2119 wording in `sdd-spec`.
- [ ] If direct Node fails in a real OpenCode environment because `node` is not discoverable, use the proposal fallback decision: `cmd.exe /c` wrapper with explicit quoting tests.
