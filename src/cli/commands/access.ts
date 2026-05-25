import { loadDysflowConfig } from "../../core/config/dysflow-config.js";
import { AccessPowerShellRunner } from "../../core/runner/access-runner.js";
import { AccessQueryService } from "../../core/services/query-service.js";
import { handleRelinkDirectoryCommand } from "./access/relink-directory.js";
import type { CommandHandler } from "./types.js";

function extractRootPath(args: readonly string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1] !== undefined && !args[i + 1].startsWith("--")) {
      return args[i + 1];
    }
  }
  return undefined;
}

export const handleAccessCommand: CommandHandler = async (args, context) => {
  const [subcommand, ...rest] = args;
  if (subcommand === "relink-directory") {
    // Wire the AccessQueryService for relink-directory.
    // Per ADR-2: rootPath is passed as accessDbPath; the PS dispatch branches
    // BEFORE Open-DatabaseWithBackendPassword so the path is never opened as a DB.
    const rootPath = extractRootPath(rest);
    if (rootPath === undefined) {
      // Let the handler produce the proper error (missing --root)
      return handleRelinkDirectoryCommand(rest, context);
    }

    if (context?.accessQueryService !== undefined) {
      return handleRelinkDirectoryCommand(rest, context, { service: context.accessQueryService });
    }

    const env = context?.env ?? process.env;
    const configResult = loadDysflowConfig({
      accessDbPath: rootPath,
      env: env as Record<string, string | undefined>,
    });
    if (!configResult.ok) {
      return handleRelinkDirectoryCommand(rest, context);
    }

    const runner = new AccessPowerShellRunner();
    const service = new AccessQueryService({ runner, config: configResult.data });
    return handleRelinkDirectoryCommand(rest, context, { service });
  }
  return {
    exitCode: 1,
    stdout: "",
    stderr: `Unknown access subcommand: ${subcommand ?? "(none)"}\nUsage: dysflow access relink-directory --root <path> [options]`,
  };
};
