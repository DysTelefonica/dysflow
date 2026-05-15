export type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export const HELP_TEXT = [
  "Usage: dysflow <command>",
  "",
  "Commands:",
  "  mcp     Start the MCP stdio adapter",
  "  setup   Prepare local Dysflow configuration",
  "  doctor  Check local Dysflow requirements",
  "  tui     Open the Dysflow terminal UI",
  "  serve   Planned local HTTP API adapter",
].join("\n");

export type CommandHandler = (args: readonly string[]) => Promise<CliResult> | CliResult;
