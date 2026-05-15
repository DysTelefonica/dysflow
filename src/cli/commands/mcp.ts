import { startMcpStdioAdapter } from "../../adapters/mcp/stdio.js";
import type { CliCommandContext, CliResult } from "./types.js";

export async function handleMcpCommand(_args: readonly string[], context: CliCommandContext = {}): Promise<CliResult> {
  try {
    await (context.startMcpAdapter ?? startMcpStdioAdapter)();
    return { exitCode: 0, stdout: "", stderr: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start MCP stdio adapter.";
    return { exitCode: 1, stdout: "", stderr: message };
  }
}


