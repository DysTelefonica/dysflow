import { rm } from "node:fs/promises";
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

export type UninstallOptions = {
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

export async function handleUninstallCommand(
	args: readonly string[],
	context?: CliCommandContext,
): Promise<CliResult> {
	const parsed = parseUninstallArgs(args);
	if (!parsed.ok) {
		if (args.includes("--help") || args.includes("-h")) {
			return { exitCode: 0, stdout: parsed.message, stderr: "" };
		}
		return { exitCode: 1, stdout: "", stderr: parsed.message };
	}

	const env = context?.env ?? process.env;
	const home = getHome(env);

	// Revert agent configurations
	const agentConfigPaths = resolveAgentConfigPaths(home);
	for (const agent of ALL_AGENTS) {
		await removeAgentConfig(agent, agentConfigPaths);
	}

	return { exitCode: 0, stdout: "", stderr: "" };
}
