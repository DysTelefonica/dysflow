import type { CliResult } from "./types.js";

export function plannedCommandResult(command: string, detail: string): CliResult {
  return { exitCode: 0, stdout: `${command} ${detail}`, stderr: "" };
}
