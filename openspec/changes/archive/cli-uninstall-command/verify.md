# Verification Report: `dysflow uninstall` command

Verification of the uninstaller implementation for `dysflow` (GitHub issue #278) to ensure complete, surgical, and idempotent removal of all Dysflow components, configuration folders, system markers, and integrations.

> [!NOTE]
> All unit, integration, and CLI routing tests executed successfully under Vitest. Compilation has been verified with type safety.

---

## Verification Summary

| Phase / Check | Command | Status | Result |
| :--- | :--- | :--- | :--- |
| **Project Build** | `pnpm build` | **PASSED** | Clean compile via `tsc -p tsconfig.json` with no errors. |
| **All Test Suites** | `pnpm test` | **PASSED** | 34 test files, 369 tests passed successfully. |
| **Uninstall Tests** | `vitest run test/cli/uninstall.test.ts` | **PASSED** | 14 tests targeting uninstallation side-effects passed. |

---

## Detailed Test Verification

The uninstaller execution was verified using the integration test suite in `test/cli/uninstall.test.ts` using temporary directories for filesystem isolation. The following side-effects and behaviors were validated:

### 1. Argument Parsing & CLI Routing
- **Help display**: `-h` or `--help` prints the command usage (`Usage: dysflow uninstall [--runtime-dir <dir>]`) and exits with code `0`.
- **Validation**: Rejects invalid values or missing parameters for `--runtime-dir` and unknown flags, exiting with code `1` and reporting descriptive errors on stderr.
- **Routing**: `runCli` successfully routes `uninstall` to the uninstaller handler.

### 2. Surgical Configuration Scrubbing
- **Agent Configs Reverted**: Integrations are reverted safely for:
  - **Codex** (`.codex/config.toml` - removes `[mcp_servers.dysflow]`)
  - **OpenCode** (`.config/opencode/opencode.json` - deletes `mcp.dysflow`)
  - **Claude Desktop** (`claude_desktop_config.json` and `.claude/settings.json` - deletes `mcpServers.dysflow`)
  - **Pi** (`.pi/agent/mcp.json` - deletes `mcpServers.dysflow`)
- **Isolation**: Verified that other MCP server configurations in these files are kept completely intact.
- **Idempotency**: Running uninstall when these files do not exist completes gracefully and does not throw errors.

### 3. File System Cleanliness
- **Runtime Directory Deletion**: Deletes the resolved runtime directory recursively and forcefully (even if it contains files/folders).
- **System Marker File**: Removes `.dysflow-marker` from the system marker path.
- **Parent Marker Directory Cleanup**: Deletes the parent folder of the marker file only if it becomes empty. Leaves it untouched if other files remain.

### 4. Environment Variables Handling
- **Context Environment**: Removes `DYSFLOW_HOME` and `DYSFLOW_RUNTIME_MARKER_PATH` from `context.env` when a CLI context is provided.
- **Process Environment Warning**: Emits clear stdout warnings if `DYSFLOW_HOME` or `DYSFLOW_RUNTIME_MARKER_PATH` persist in `process.env`, guiding the user to manually remove them.

---

## Manual Verification Path

To manually verify the uninstall command:

1. **Bootstrap / Install Dysflow to a custom location**:
   ```bash
   pnpm build
   # Run the installer pointing to a temp home and runtime dir
   node dist/cli/index.js install --runtime-dir C:/Temp/dysflow-test-runtime
   ```

2. **Verify target integrations and files**:
   - Check that `C:\ProgramData\dysflow\.dysflow-marker` contains the reference.
   - Check your configured agents' MCP configs (e.g., Claude Desktop, Codex) to ensure `dysflow` is listed.

3. **Execute Uninstall**:
   ```bash
   node dist/cli/index.js uninstall --runtime-dir C:/Temp/dysflow-test-runtime
   ```

4. **Verify Clean Removal**:
   - Confirm `C:\Temp\dysflow-test-runtime` has been deleted.
   - Confirm `C:\ProgramData\dysflow\.dysflow-marker` has been removed.
   - Confirm `dysflow` has been surgically removed from your agent's config files without altering other entries.
