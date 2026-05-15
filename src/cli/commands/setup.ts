import { plannedCommandResult } from "./planned.js";
import type { CliResult } from "./types.js";

export async function handleSetupCommand(_args: readonly string[]): Promise<CliResult> {
  return plannedCommandResult("setup", "is planned; configuration file creation is not implemented yet.");
}


