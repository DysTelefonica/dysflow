import type { CliCommandContext, CliResult } from "./types.js";

export async function handleUninstallCommand(
	args: readonly string[],
	context?: CliCommandContext,
): Promise<CliResult> {
	return { exitCode: 0, stdout: "", stderr: "" };
}

export function parseUninstallArgs(
	args: readonly string[],
): any {
	return { ok: true, options: {} };
}
