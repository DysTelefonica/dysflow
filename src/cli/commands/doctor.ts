import type { CliResult } from "./types.js";

export async function handleDoctorCommand(_args: readonly string[]): Promise<CliResult> {
  return { exitCode: 0, stdout: "doctor checks are planned; core diagnostics are not wired yet.", stderr: "" };
}


