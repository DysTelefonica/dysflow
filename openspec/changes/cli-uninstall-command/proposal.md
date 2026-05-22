# Proposal: `dysflow uninstall` command

## Abstract
Implement the `uninstall` command for Dysflow. This command reverts all MCP configurations for all supported agents, deletes launcher scripts, removes the runtime directory, cleans up the machine-level marker file, and warns/reverts modified environment variables.

## Detailed Design

### 1. File Exports in `src/cli/commands/install.ts`
To reuse existing logic and avoid duplication, the following helpers will be exported:
- `resolveRuntimeDir`
- `getSystemMarkerPath`
- `getHome`
- `resolveAgentConfigPaths`
- `removeAgentConfig`
- `fileExists`

### 2. Integration Command in `src/cli/commands/uninstall.ts`
We will create a new command handler module.

#### Signature and Parsing
```typescript
import {
	rm,
} from "node:fs/promises";
import path from "node:path";
import {
	ALL_AGENTS,
	resolveRuntimeDir,
	getSystemMarkerPath,
	getHome,
	resolveAgentConfigPaths,
	removeAgentConfig,
	fileExists,
} from "./install.js";
import type { CliCommandContext, CliResult } from "./types.js";

const UNINSTALL_USAGE = "Usage: dysflow uninstall [--runtime-dir <dir>]";

type UninstallOptions = {
	runtimeDir?: string;
};

export function parseUninstallArgs(
	args: readonly string[],
): { ok: true; options: UninstallOptions } | { ok: false; message: string } {
	if (args.includes("--help") || args.includes("-h")) {
		return { ok: false, message: UNINSTALL_USAGE };
	}

	const options: UninstallOptions = {};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === "--runtime-dir") {
			const runtimeDir = args[index + 1];
			if (runtimeDir === undefined || runtimeDir.startsWith("--")) {
				return { ok: false, message: "Missing value for --runtime-dir." };
			}
			options.runtimeDir = runtimeDir;
			index += 1;
			continue;
		}

		return { ok: false, message: `Unsupported uninstall option: ${arg}` };
	}

	return { ok: true, options };
}
```

#### Execution Logic
```typescript
export async function handleUninstallCommand(
	args: readonly string[],
	context: CliCommandContext = {},
): Promise<CliResult> {
	const parsed = parseUninstallArgs(args);
	if (!parsed.ok) {
		const isUsage = parsed.message === UNINSTALL_USAGE;
		return {
			exitCode: isUsage ? 0 : 1,
			stdout: isUsage ? UNINSTALL_USAGE : "",
			stderr: isUsage ? "" : parsed.message,
		};
	}

	const env = context.env ?? process.env;
	const runtimeDir = resolveRuntimeDir(parsed.options.runtimeDir, env);
	const markerPath = getSystemMarkerPath(env);
	const home = getHome(env);
	const agentConfigPaths = resolveAgentConfigPaths(home);

	try {
		// 1. Revert settings configured in all known agents
		for (const agent of ALL_AGENTS) {
			await removeAgentConfig(agent, agentConfigPaths);
		}

		// 2. Remove the runtime directory (including bin/, launchers, scripts, etc.)
		if (await fileExists(runtimeDir)) {
			await rm(runtimeDir, { recursive: true, force: true });
		}

		// 3. Remove the machine-level marker file and directory if empty
		if (await fileExists(markerPath)) {
			await rm(markerPath, { force: true });
		}
		const markerDir = path.dirname(markerPath);
		if (await fileExists(markerDir)) {
			try {
				await rm(markerDir, { recursive: false });
			} catch {
				// Keep directory if it is not empty or can't be deleted due to permissions
			}
		}

		// 4. Clean up environment variables in context if present
		let envCleaned = false;
		if (context.env) {
			if (context.env.DYSFLOW_HOME !== undefined) {
				delete context.env.DYSFLOW_HOME;
				envCleaned = true;
			}
			if (context.env.DYSFLOW_RUNTIME_MARKER_PATH !== undefined) {
				delete context.env.DYSFLOW_RUNTIME_MARKER_PATH;
				envCleaned = true;
			}
		}

		const envWarnings: string[] = [];
		if (process.env.DYSFLOW_HOME) {
			envWarnings.push("- DYSFLOW_HOME is set in your environment. Please remove it manually.");
		}
		if (process.env.DYSFLOW_RUNTIME_MARKER_PATH) {
			envWarnings.push("- DYSFLOW_RUNTIME_MARKER_PATH is set in your environment. Please remove it manually.");
		}

		const reportLines = [
			`Dysflow successfully uninstalled.`,
			`Removed runtime directory: ${runtimeDir}`,
			`Removed marker file: ${markerPath}`,
			`Removed agent integrations: ${ALL_AGENTS.join(", ")}`,
		];

		if (envCleaned) {
			reportLines.push("Cleaned up environment variables in context.");
		}
		if (envWarnings.length > 0) {
			reportLines.push("", "Environment warnings:", ...envWarnings);
		}

		return {
			exitCode: 0,
			stdout: reportLines.join("\n"),
			stderr: "",
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to uninstall Dysflow.";
		return { exitCode: 1, stdout: "", stderr: message };
	}
}
```

### 3. Registry & Help Updates
- Register in `COMMANDS` Map inside `src/cli/index.ts`:
  ```typescript
  import { handleUninstallCommand } from "./commands/uninstall.js";
  ...
  ["uninstall", handleUninstallCommand],
  ```
- Add entry to `HELP_TEXT` in `src/cli/commands/types.ts`:
  ```typescript
  "  uninstall Run Dysflow uninstaller (revert integrations + clean runtime)",
  ```

## Proposed Test Plan

STRICT TDD mode is active, so all implementation will be driven by new unit/integration tests added in `test/cli/uninstall.test.ts`.

### Planned Test Cases
1. **CLI Arg Parsing**:
   - Verify `--help` and `-h` show the `Usage: dysflow uninstall [--runtime-dir <dir>]` message with `exitCode: 0`.
   - Verify `--runtime-dir` followed by a path parses correctly.
   - Verify unknown options fail with `exitCode: 1`.
2. **Behavioral E2E Tests**:
   - Verify mock agent configuration files (Codex, OpenCode, Claude, Pi) are updated correctly to remove the `dysflow` section during uninstall, while leaving other configs untouched.
   - Verify standard runtime folder is deleted recursively.
   - Verify custom runtime folder is deleted recursively when `--runtime-dir` is specified.
   - Verify the marker file and directory (if empty) are deleted.
   - Verify that keys are removed from mock `context.env`.
   - Verify warning outputs when env variables are present in process environment.
