#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { handleDoctorCommand } from "./commands/doctor.js";
import { handleMcpCommand } from "./commands/mcp.js";
import { handleServeCommand } from "./commands/serve.js";
import { handleSetupCommand } from "./commands/setup.js";
import {
	handleInstallCommand,
	handleUpdateCommand,
} from "./commands/install.js";
import { handleTuiCommand } from "./commands/tui.js";
import { handleVersionCommand } from "./commands/version.js";
import { handleUninstallCommand } from "./commands/uninstall.js";
import {
	HELP_TEXT,
	type CliCommandContext,
	type CliResult,
	type CommandHandler,
} from "./commands/types.js";

export type { CliResult } from "./commands/types.js";

const COMMANDS = new Map<string, CommandHandler>([
	["mcp", handleMcpCommand],
	["setup", handleSetupCommand],
	["doctor", handleDoctorCommand],
	["tui", handleTuiCommand],
	["install", handleInstallCommand],
	["update", handleUpdateCommand],
	["uninstall", handleUninstallCommand],
	["serve", handleServeCommand],
]);
export async function runCli(
	args: readonly string[],
	context: CliCommandContext = {},
): Promise<CliResult> {
	const [command, ...commandArgs] = args;

	if (command === undefined) {
		return (context.runTui ?? handleTuiCommand)([], context);
	}

	if (command === "--help" || command === "-h") {
		return { exitCode: 0, stdout: HELP_TEXT, stderr: "" };
	}

	if (command === "--version" || command === "-v") {
		return handleVersionCommand();
	}

	const handler = COMMANDS.get(command);
	if (handler !== undefined) {
		return handler(commandArgs, context);
	}

	return {
		exitCode: 1,
		stdout: "",
		stderr: [`Unsupported command: ${command}`, "", HELP_TEXT].join("\n"),
	};
}

async function main(): Promise<void> {
	const result = await runCli(process.argv.slice(2));

	if (result.stdout.length > 0) {
		process.stdout.write(`${result.stdout}\n`);
	}

	if (result.stderr.length > 0) {
		process.stderr.write(`${result.stderr}\n`);
	}

	process.exitCode = result.exitCode;
}

function getEntrypointUrl(): string | undefined {
	if (!process.argv[1]) return undefined;
	try {
		return pathToFileURL(realpathSync(process.argv[1])).href;
	} catch {
		return pathToFileURL(process.argv[1]).href;
	}
}

const entrypoint = getEntrypointUrl();
if (entrypoint === import.meta.url) {
	void main();
}

