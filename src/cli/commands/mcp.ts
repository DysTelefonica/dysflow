import { loadDysflowConfigAsync } from "../../adapters/config/dysflow-config-node.js";
import { startMcpStdioAdapter } from "../../adapters/mcp/stdio.js";
import type { CliCommandContext, CliResult } from "./types.js";

export const MCP_USAGE =
  "Usage: dysflow mcp [--disable-writes | --enable-writes] [--tool-surface core|full]";

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

  const enableWrites = args.includes("--enable-writes");
  const disableWrites = args.includes("--disable-writes");
  if (enableWrites && disableWrites) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `--enable-writes and --disable-writes are mutually exclusive. Cannot use both at the same time.\n${MCP_USAGE}`,
    };
  }

  const toolSurfaceFlagIndex = args.indexOf("--tool-surface");
  let toolSurfaceOverride: "core" | "full" | undefined;
  if (toolSurfaceFlagIndex !== -1) {
    const value = args[toolSurfaceFlagIndex + 1];
    if (value !== "core" && value !== "full") {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `--tool-surface requires a value of "core" or "full". Got: ${value ?? "(missing)"}\n${MCP_USAGE}`,
      };
    }
    toolSurfaceOverride = value;
  }

  const writesEnabled = !disableWrites;
  const allowedArgs = new Set(["--enable-writes", "--disable-writes", "--tool-surface"]);
  const unknownArg = args.find(
    (arg, index) =>
      !(
        allowedArgs.has(arg) ||
        (toolSurfaceFlagIndex !== -1 && index === toolSurfaceFlagIndex + 1)
      ),
  );
  if (unknownArg !== undefined) {
    return { exitCode: 1, stdout: "", stderr: MCP_USAGE };
  }
  try {
    const configResult = await loadDysflowConfigAsync({ env: context.env, cwd: context.cwd });
    await (context.startMcpAdapter ?? startMcpStdioAdapter)(
      configResult.ok ? configResult.data : undefined,
      {
        writesEnabled,
        ...(toolSurfaceOverride === undefined ? {} : { toolSurfaceOverride }),
      },
    );
    return { exitCode: 0, stdout: "", stderr: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start MCP stdio adapter.";
    return { exitCode: 1, stdout: "", stderr: message };
  }
}
