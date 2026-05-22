# Specification: `dysflow uninstall` command

## Outcome
Cleanly and completely remove all Dysflow components, configurations, and environment configurations from the user's system, returning it to a pre-installed state.

---

## 1. Command Syntax & Options

The command is invoked via the CLI as:
```bash
dysflow uninstall [options]
```

### Options

| Option | Type | Description |
| :--- | :--- | :--- |
| `-h`, `--help` | Flag | Displays the command usage and exits immediately with code `0`. |
| `--runtime-dir <dir>` | Path | Overrides the target runtime directory to be uninstalled. |

### Configuration Discovery Order (when `--runtime-dir` is not provided)
If `--runtime-dir` is not explicitly passed, the command locates the runtime directory using the following hierarchy:
1. **DYSFLOW_HOME Environment Variable**: The value of the `DYSFLOW_HOME` variable in the execution context `env`.
2. **System Marker File**: The path to the runtime directory recorded in the system marker file (usually located at `C:\ProgramData\dysflow\.dysflow-marker` on Windows).
3. **User Profile Fallback**: `%LOCALAPPDATA%\dysflow` (on Windows) or the platform-specific default fallback directory.

---

## 2. Precise Side-Effects

A successful uninstallation executes the following side-effects in order:

### A. Revert Agent Integrations
Revert all Dysflow MCP configurations in all supported AI agent config files. The configurations will be removed, leaving other settings in those config files untouched.
* **Codex**: Removes the `[mcp_servers.dysflow]` section from `%USERPROFILE%\.codex\config.toml`.
* **OpenCode**: Deletes `mcp.dysflow` from `%USERPROFILE%\.config\opencode\opencode.json`.
* **Claude Desktop / Settings**: 
  * Deletes `mcpServers.dysflow` from `%APPDATA%\Claude\claude_desktop_config.json`.
  * Deletes `mcpServers.dysflow` from `%USERPROFILE%\.claude\settings.json`.
* **Pi**: Deletes `mcpServers.dysflow` from `%USERPROFILE%\.pi\agent\mcp.json`.

*Note: If a config file does not exist, the command skips it gracefully.*

### B. Delete Runtime Directory
Deletes the resolved runtime directory recursively and forcefully (equivalent to `rm -rf <runtimeDir>`). This deletes all launcher scripts (e.g. `bin/dysflow.cmd`), runtime scripts, application source files, documentation, and cached files.

### C. Remove System Marker File & Directory
* Deletes the machine-level marker file `.dysflow-marker` located at the system marker path.
* Attempts to delete the parent directory of the marker file (e.g. `C:\ProgramData\dysflow`) only if it is empty. If the folder contains other files or cannot be deleted, the command fails silently for this step and continues.

### D. Clean Up Environment Variables
* **In-Context Clean Up**: If `context.env` is supplied in the CLI command context, deletes the `DYSFLOW_HOME` and `DYSFLOW_RUNTIME_MARKER_PATH` keys.
* **Shell Warnings**: Since process environment variables cannot be permanently removed from the user's persistent system profile during execution, the CLI prints warning messages instructing the user to manually remove them if they remain in `process.env`.

---

## 3. Exit Codes & Console Output

### Exit Codes

| Exit Code | Condition |
| :--- | :--- |
| `0` | Success (including help text display). |
| `1` | Failure (invalid arguments, unsupported options, or unhandled file system/permission errors). |

### Expected Stdout on Success

```
Dysflow successfully uninstalled.
Removed runtime directory: <resolved_path>
Removed marker file: <marker_path>
Removed agent integrations: codex, opencode, claude, pi
```
*If environment variables were modified in context:*
```
Cleaned up environment variables in context.
```
*If environment variables remain in process.env:*
```
Environment warnings:
- DYSFLOW_HOME is set in your environment. Please remove it manually.
- DYSFLOW_RUNTIME_MARKER_PATH is set in your environment. Please remove it manually.
```

### Expected Stderr on Failure
Contains a descriptive error message explaining the failure, for example:
* `Unsupported uninstall option: --unknown`
* `Missing value for --runtime-dir.`
* `Failed to uninstall Dysflow: <error_message>`

---

## 4. Error Handling & Robustness

* **Idempotency**: The command must run successfully even if Dysflow is already partially or completely uninstalled (e.g. if the runtime directory or marker file is missing).
* **Missing Config Files**: Do not throw errors if agent config files are absent.
* **Permission Errors**: If the marker directory or runtime directory cannot be deleted due to permission restrictions, output the descriptive error and exit with code `1`.
