import { handleInstallCommand } from "./install.js";
import type { CliResult } from "./types.js";

export async function handleTuiCommand(
	args: readonly string[],
): Promise<CliResult> {
	return handleInstallCommand(args, {
		env: process.env,
	});
}
