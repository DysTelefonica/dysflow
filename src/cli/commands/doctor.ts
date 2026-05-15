import { loadDysflowConfig } from "../../core/config/dysflow-config.js";
import { AccessPowerShellRunner } from "../../core/runner/access-runner.js";
import { AccessDiagnosticsService, type AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { OperationResult } from "../../core/contracts/index.js";
import type { CliCommandContext, CliResult } from "./types.js";

export async function handleDoctorCommand(_args: readonly string[], context: CliCommandContext = {}): Promise<CliResult> {
  try {
    const diagnosticsService = context.diagnosticsService ?? createDiagnosticsService(context);
    const result = await diagnosticsService.run({ includeEnvironment: true });

    return formatDiagnosticsResult(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run Dysflow diagnostics.";
    return { exitCode: 1, stdout: "", stderr: message };
  }
}

function createDiagnosticsService(context: CliCommandContext): AccessDiagnosticsService {
  const configResult = loadDysflowConfig({ env: context.env });
  if (!configResult.ok) {
    throw new Error(`${configResult.error.code}: ${configResult.error.message}`);
  }

  return new AccessDiagnosticsService({ runner: new AccessPowerShellRunner(), config: configResult.data });
}

function formatDiagnosticsResult(result: OperationResult<AccessDiagnosticsResult>): CliResult {
  if (!result.ok) {
    return { exitCode: 1, stdout: "", stderr: `${result.error.code}: ${result.error.message}` };
  }

  const stdout = result.data.checks
    .map((check) => `${check.ok ? "✓" : "✗"} ${check.name}: ${check.message}`)
    .join("\n");
  return { exitCode: result.data.checks.every((check) => check.ok) ? 0 : 1, stdout, stderr: "" };
}


