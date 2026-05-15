import { loadDysflowConfig, redactDysflowConfig } from "../../core/config/dysflow-config.js";
import type { CliCommandContext, CliResult } from "./types.js";

export async function handleSetupCommand(_args: readonly string[], context: CliCommandContext = {}): Promise<CliResult> {
  const configResult = loadDysflowConfig({ env: context.env });
  if (!configResult.ok) {
    return { exitCode: 1, stdout: "", stderr: `${configResult.error.code}: ${configResult.error.message}` };
  }

  const redacted = redactDysflowConfig(configResult.data);
  return {
    exitCode: 0,
    stdout: [
      "Dysflow core configuration resolved.",
      `Access database: ${redacted.accessDbPath}`,
      `Timeout: ${redacted.timeoutMs}ms`,
      `Password: ${redacted.accessPassword ?? "(not configured)"}`,
    ].join("\n"),
    stderr: "",
  };
}


