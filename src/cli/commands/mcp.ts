import { startMcpStdioAdapter } from "../../adapters/mcp/stdio.js";
import { loadDysflowConfig } from "../../core/config/dysflow-config.js";
import type { CliCommandContext, CliResult } from "./types.js";

export async function handleMcpCommand(_args: readonly string[], context: CliCommandContext = {}): Promise<CliResult> {
  try {
    const configResult = loadDysflowConfig({ env: context.env });
    if (!configResult.ok) {
      return { exitCode: 1, stdout: "", stderr: `${configResult.error.code}: ${configResult.error.message}` };
    }

    await (context.startMcpAdapter ?? startMcpStdioAdapter)(configResult.data);
    return { exitCode: 0, stdout: "", stderr: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start MCP stdio adapter.";
    return { exitCode: 1, stdout: "", stderr: message };
  }
}
