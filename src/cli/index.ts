#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { handleAccessCommand } from "./commands/access.js";
import { handleCodegraphDriftCommand } from "./commands/codegraph-drift.js";
import { handleDoctorCommand } from "./commands/doctor.js";
import { handleInstallCommand, handleUpdateCommand } from "./commands/install.js";
import { handleLintCommand } from "./commands/lint.js";
import { handleMcpCommand } from "./commands/mcp.js";
import { handleServeCommand } from "./commands/serve.js";
import { handleSetupCommand } from "./commands/setup.js";
import { handleTuiCommand } from "./commands/tui.js";
import {
  type CliCommandContext,
  type CliResult,
  type CommandHandler,
  HELP_TEXT,
} from "./commands/types.js";
import { handleUninstallCommand } from "./commands/uninstall.js";
import { handleVersionCommand } from "./commands/version.js";

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
  ["access", handleAccessCommand],
  ["lint", handleLintCommand],
  ["codegraph-drift", handleCodegraphDriftCommand],
]);

/**
 * Subcommands that MUST treat `--help` / `-h` as a side-effect-free usage
 * request at the dispatch layer (#591). Other subcommands (`install`,
 * `update`, etc.) already produce subcommand-specific usage themselves
 * and are left untouched. Per-handler defense in depth is still added in
 * `mcp.ts`, `doctor.ts`, `access.ts` so direct handler calls also behave.
 */
const HELP_SHORT_CIRCUIT = new Set<string>(["mcp", "doctor", "access"]);
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
    // Per-subcommand help short-circuit (#591): for the three subcommands
    // that regressed from the side-effect-free help contract, short-circuit
    // at the dispatch layer so `--help` / `-h` never reaches a handler that
    // would run diagnostics, PowerShell, or treat the flag as a subcommand
    // name. Other subcommands keep their existing per-subcommand usage path.
    if (
      HELP_SHORT_CIRCUIT.has(command) &&
      (commandArgs[0] === "--help" || commandArgs[0] === "-h")
    ) {
      return { exitCode: 0, stdout: HELP_TEXT, stderr: "" };
    }
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

export function setupProcessHandlers(): void {
  process.on("unhandledRejection", (reason) => {
    process.stderr.write(`[dysflow] Unhandled rejection: ${String(reason)}\n`);
    process.exit(1);
  });
  process.on("uncaughtException", (error: Error) => {
    process.stderr.write(`[dysflow] Uncaught exception: ${error.message}\n`);
    process.exit(1);
  });
}

const entrypoint = getEntrypointUrl();
if (entrypoint === import.meta.url) {
  setupProcessHandlers();
  void main();
}
