import { loadDysflowConfigAsync } from "../../core/config/dysflow-config.js";
import type { OperationResult } from "../../core/contracts/index.js";
import { AccessPowerShellRunner } from "../../core/runner/access-runner.js";
import {
  type AccessDiagnosticsResult,
  AccessDiagnosticsService,
} from "../../core/services/diagnostics-service.js";
import type { CliCommandContext, CliResult } from "./types.js";

export async function handleDoctorCommand(
  _args: readonly string[],
  context: CliCommandContext = {},
): Promise<CliResult> {
  try {
    const diagnosticsService =
      context.diagnosticsService ?? (await createDiagnosticsService(context));
    const result = await diagnosticsService.run({ includeEnvironment: true });

    return formatDiagnosticsResult(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run Dysflow diagnostics.";
    return { exitCode: 1, stdout: "", stderr: message };
  }
}

async function createDiagnosticsService(
  context: CliCommandContext,
): Promise<AccessDiagnosticsService> {
  const configResult = await loadDysflowConfigAsync({ env: context.env, cwd: context.cwd });
  if (!configResult.ok) {
    throw new Error(`${configResult.error.code}: ${configResult.error.message}`);
  }

  return new AccessDiagnosticsService({
    runner: new AccessPowerShellRunner(),
    config: configResult.data,
  });
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
