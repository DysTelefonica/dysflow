import { createDefaultPowerShellExecutor } from "../../adapters/powershell/default-executor.js";
import { createWindowsAccessOperationPreflightCleanup } from "../../adapters/process/windows-processes.js";
import { loadDysflowConfig } from "../../core/config/dysflow-config.js";
import { createProjectAccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import { AccessPowerShellRunner } from "../../core/runner/access-runner.js";
import { AccessQueryService } from "../../core/services/query-service.js";
import { handleRelinkDirectoryCommand } from "./access/relink-directory.js";
import type { CommandHandler } from "./types.js";

function extractRootPath(args: readonly string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === "--root" && nextArg !== undefined && !nextArg.startsWith("--")) {
      return nextArg;
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

    const operationRegistry = createProjectAccessOperationRegistry(configResult.data);
    const runner = new AccessPowerShellRunner({
      executor: createDefaultPowerShellExecutor(),
      operationRegistry,
      preflightCleanup: createWindowsAccessOperationPreflightCleanup({
        registry: operationRegistry,
      }),
    });
    const service = new AccessQueryService({ runner, config: configResult.data });
    return handleRelinkDirectoryCommand(rest, context, { service });
  }
  return {
    exitCode: 1,
    stdout: "",
    stderr: `Unknown access subcommand: ${subcommand ?? "(none)"}\nUsage: dysflow access relink-directory --root <path> [options]`,
  };
};
