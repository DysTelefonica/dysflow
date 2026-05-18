import { startMcpStdioAdapter } from "../../adapters/mcp/stdio.js";
import { loadDysflowConfig } from "../../core/config/dysflow-config.js";
import type { CliCommandContext, CliResult } from "./types.js";

export const MCP_USAGE = "Usage: dysflow mcp [--enable-writes]";

export async function handleMcpCommand(args: readonly string[], context: CliCommandContext = {}): Promise<CliResult> {
  const writesEnabled = args.includes("--enable-writes");
  const unknownArg = args.find((arg) => arg !== "--enable-writes");
  if (unknownArg !== undefined) {
    return { exitCode: 1, stdout: "", stderr: MCP_USAGE };
  }
  try {
    const configResult = loadDysflowConfig({ env: context.env, cwd: context.cwd });
    await (context.startMcpAdapter ?? startMcpStdioAdapter)(configResult.ok ? configResult.data : undefined, { writesEnabled });
    return { exitCode: 0, stdout: "", stderr: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start MCP stdio adapter.";
    return { exitCode: 1, stdout: "", stderr: message };
  }
}
