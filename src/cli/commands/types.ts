import type { OperationResult } from "../../core/contracts/index.js";
import type { AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { StartHttpAdapter } from "./serve.js";

export type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CliCommandContext = {
  env?: Record<string, string | undefined>;
  startMcpAdapter?: () => Promise<void>;
  diagnosticsService?: {
    run(request?: { includeEnvironment?: boolean }): Promise<OperationResult<AccessDiagnosticsResult>>;
  };
  startHttpAdapter?: StartHttpAdapter;
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

export type CommandHandler = (args: readonly string[], context?: CliCommandContext) => Promise<CliResult> | CliResult;
