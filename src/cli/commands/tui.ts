import { createRequire } from "node:module";
import { applyIntegrationSelection, handleInstallCommand } from "./install.js";
import { renderDashboard } from "../tui/render.js";
import type { CliCommandContext, CliResult } from "./types.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../../package.json") as { version?: unknown };
const PACKAGE_VERSION =
	typeof packageJson.version === "string" ? packageJson.version : "0.0.0";

export async function handleTuiCommand(
	args: readonly string[],
	context: CliCommandContext = {},
): Promise<CliResult> {
	if (context.tuiSelectedAgents !== undefined) {
		return applyIntegrationSelection(context.tuiSelectedAgents, {
			env: context.env ?? process.env,
		});
	}

	if (args.length > 0) {
		return handleInstallCommand(args, {
			env: context.env ?? process.env,
		});
	}

	return {
		exitCode: 0,
		stdout: renderDashboard({
			localVersion: context.localVersion ?? PACKAGE_VERSION,
			latestVersion: context.latestVersion,
			cursor: 0,
		}),
		stderr: "",
	};
}
