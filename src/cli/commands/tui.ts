import { plannedCommandResult } from "./planned.js";
import type { CliResult } from "./types.js";

export async function handleTuiCommand(_args: readonly string[]): Promise<CliResult> {
  return plannedCommandResult("tui", "is planned; terminal UI is not implemented yet.");
}


