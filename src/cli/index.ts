#!/usr/bin/env node

export type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const HELP_TEXT = [
  "Usage: dysflow <command>",
  "",
  "Commands:",
  "  mcp     Start the MCP stdio adapter",
  "  setup   Prepare local Dysflow configuration",
  "  doctor  Check local Dysflow requirements",
  "  tui     Open the Dysflow terminal UI",
  "  serve   Planned local HTTP API adapter",
].join("\n");

const PLANNED_COMMANDS = new Set(["mcp", "setup", "doctor", "tui", "serve"]);

export async function runCli(args: readonly string[]): Promise<CliResult> {
  const [command] = args;

  if (command === undefined || command === "--help" || command === "-h") {
    return { exitCode: 0, stdout: HELP_TEXT, stderr: "" };
  }

  if (PLANNED_COMMANDS.has(command)) {
    return {
      exitCode: 0,
      stdout: `${command} is planned for a later Dysflow foundation phase.`,
      stderr: "",
    };
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

const entrypoint = process.argv[1] ? new URL(`file://${process.argv[1]}`).href : undefined;
if (entrypoint === import.meta.url) {
  void main();
}
