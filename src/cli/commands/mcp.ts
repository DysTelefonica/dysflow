import { plannedCommandResult } from "./planned.js";
import type { CliResult } from "./types.js";

export async function handleMcpCommand(_args: readonly string[]): Promise<CliResult> {
  return plannedCommandResult("mcp", "stdio adapter is planned; MCP wiring is not implemented yet.");
}


