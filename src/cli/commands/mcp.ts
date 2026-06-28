import { loadDysflowConfigAsync } from "../../adapters/config/dysflow-config-node.js";
import { startMcpStdioAdapter } from "../../adapters/mcp/stdio.js";
import type { CliCommandContext, CliResult } from "./types.js";

export const MCP_USAGE = "Usage: dysflow mcp [--enable-writes]";

export async function handleMcpCommand(
  args: readonly string[],
  context: CliCommandContext = {},
): Promise<CliResult> {
  // Defense in depth (#591): if `--help` / `-h` reaches the handler (e.g.
  // called directly from a test or future caller), return usage without
  // touching config or the MCP adapter.
  if (args[0] === "--help" || args[0] === "-h") {
    return { exitCode: 0, stdout: MCP_USAGE, stderr: "" };
  }

  const writesEnabled = args.includes("--enable-writes");
  const unknownArg = args.find((arg) => arg !== "--enable-writes");
  if (unknownArg !== undefined) {
    return { exitCode: 1, stdout: "", stderr: MCP_USAGE };
  }
  try {
    const configResult = await loadDysflowConfigAsync({ env: context.env, cwd: context.cwd });
    await (context.startMcpAdapter ?? startMcpStdioAdapter)(
      configResult.ok ? configResult.data : undefined,
      { writesEnabled },
    );
    return { exitCode: 0, stdout: "", stderr: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start MCP stdio adapter.";
    return { exitCode: 1, stdout: "", stderr: message };
  }
}
