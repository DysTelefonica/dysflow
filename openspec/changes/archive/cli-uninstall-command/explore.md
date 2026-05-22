# Exploration Report: `dysflow uninstall` command

## Objective
Analyze the existing codebase to understand runtime detection, markers, and agent integrations, defining a pathway to safely and completely clean up a Dysflow installation.

## Findings

### 1. Runtime Directory Resolution
The active runtime directory is resolved using `resolveRuntimeDir` in [install.ts](file:///C:/Proyectos/dysflow/src/cli/commands/install.ts#L222-L252):
1. **Explicit Override**: `--runtime-dir <path>` parameter.
2. **Environment Variable**: `DYSFLOW_HOME` value.
3. **Machine-level Marker**: System marker file value (read from path resolved via `getSystemMarkerPath(env)`).
4. **Default fallback**: `%LOCALAPPDATA%\dysflow` (or platform equivalent).

### 2. Marker File Location & Behavior
The machine-level marker file is managed in [install.ts](file:///C:/Proyectos/dysflow/src/cli/commands/install.ts#L199-L208):
- **Path resolution**: `getSystemMarkerPath(env)` targets `DYSFLOW_RUNTIME_MARKER_PATH` from the environment if specified. Otherwise, it defaults to `%ProgramData%\dysflow\.dysflow-marker`.
- **Content**: The version (`1`) on the first line, followed by the absolute path to the active runtime directory on the second line.
- **Write pattern**: Written during `install` and `update` runs to preserve the directory pointer.

### 3. Agent Integrations & Cleanup
Integrations configuration/removal functions exist in [install.ts](file:///C:/Proyectos/dysflow/src/cli/commands/install.ts#L362-L404):
- **Known Agents**: `codex`, `opencode`, `claude`, `pi`.
- **Removal**: The uninstaller can call `removeAgentConfig(agent, agentConfigPaths)` for all agents. This relies on helper functions such as `removeDysflowMcpConfig`, which deletes the `dysflow` section inside each agent's configuration files while preserving all other settings.
- **Paths**: Agent config paths are resolved using `resolveAgentConfigPaths(getHome(env))` pointing to local profiles (e.g. `~/.codex/config.toml`, `~/AppData/Roaming/Claude/claude_desktop_config.json`, etc.).

### 4. Launcher Scripts
Launchers are written to `bin/` under the resolved `runtimeDir`:
- Windows CMD: `dysflow.cmd`
- PowerShell: `dysflow.ps1`
- Since these are created inside `runtimeDir/bin`, recursively deleting `runtimeDir` completely removes these scripts. No extra manual deletions are required.

### 5. Environment Variables
No system/registry environment variables are persistently modified by `dysflow install`. However:
- The context `env` (`CliCommandContext.env`) might hold `DYSFLOW_HOME` or `DYSFLOW_RUNTIME_MARKER_PATH` overrides.
- In `uninstall`, any keys inside `context.env` should be cleaned up.
- The command should output a warning if it detects `DYSFLOW_HOME` or `DYSFLOW_RUNTIME_MARKER_PATH` in the parent process's environment.

## Test Suite Status
The existing test suite was verified by running `pnpm test`. All 355 tests passed successfully, indicating a clean baseline.
- Commands E2E tests are located in [commands.test.ts](file:///C:/Proyectos/dysflow/test/cli/commands.test.ts).
- Install/update tests are in [install.test.ts](file:///C:/Proyectos/dysflow/test/cli/install.test.ts).
