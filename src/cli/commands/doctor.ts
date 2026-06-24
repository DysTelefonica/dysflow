import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadDysflowConfigAsync } from "../../adapters/config/dysflow-config-node.js";
import { createDefaultPowerShellExecutor } from "../../adapters/powershell/default-executor.js";
import { createWindowsAccessOperationPreflightCleanup } from "../../adapters/process/windows-processes.js";
import type { OperationResult } from "../../core/contracts/index.js";
import { createProjectAccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import { AccessPowerShellRunner } from "../../core/runner/access-runner.js";
import {
  type AccessDiagnosticsResult,
  AccessDiagnosticsService,
} from "../../core/services/diagnostics-service.js";
import { getHome, resolveAgentConfigPaths } from "./install/agent-config.js";
import { ensureObject } from "./install/file-utils.js";
import { checkOpencodeWiring, type McpWiringCheck } from "./opencode-mcp-wiring.js";
import type { CliCommandContext, CliResult } from "./types.js";

export async function handleDoctorCommand(
  _args: readonly string[],
  context: CliCommandContext = {},
): Promise<CliResult> {
  try {
    const diagnosticsService =
      context.diagnosticsService ?? (await createDiagnosticsService(context));
    const result = await diagnosticsService.run({ includeEnvironment: true });

    const wiringCheck = await runWiringCheck(context);

    return formatDiagnosticsResult(result, wiringCheck);
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

  const operationRegistry = createProjectAccessOperationRegistry(configResult.data);
  return new AccessDiagnosticsService({
    runner: new AccessPowerShellRunner({
      executor: createDefaultPowerShellExecutor(),
      operationRegistry,
      preflightCleanup: createWindowsAccessOperationPreflightCleanup({
        registry: operationRegistry,
      }),
    }),
    config: configResult.data,
  });
}

async function runWiringCheck(context: CliCommandContext): Promise<McpWiringCheck | null> {
  if (context.checkMcpWiring) {
    return context.checkMcpWiring();
  }

  const env = context.env ?? (process.env as Record<string, string | undefined>);
  const cwd = context.cwd ?? process.cwd();
  const home = getHome(env);
  const agentPaths = resolveAgentConfigPaths(home);

  return checkOpencodeWiring({
    globalConfigPath: agentPaths.opencode,
    projectConfigPath: path.join(cwd, "opencode.json"),
    readJsonFile: async (filePath) => {
      try {
        const raw = await readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as unknown;
        return ensureObject(parsed);
      } catch {
        return {};
      }
    },
    existsSync,
  });
}

function formatDiagnosticsResult(
  result: OperationResult<AccessDiagnosticsResult>,
  wiringCheck: McpWiringCheck | null,
): CliResult {
  if (!result.ok) {
    return { exitCode: 1, stdout: "", stderr: `${result.error.code}: ${result.error.message}` };
  }

  const lines = result.data.checks.map(
    (check) => `${check.ok ? "✓" : "✗"} ${check.name}: ${check.message}`,
  );

  if (wiringCheck !== null) {
    // Warn-only: render with ⚠ but do NOT include in exit code calculation.
    const symbol = wiringCheck.ok ? "✓" : "⚠";
    lines.push(`${symbol} ${wiringCheck.name}: ${wiringCheck.message}`);
  }

  const stdout = lines.join("\n");
  // Exit code is driven by core diagnostics checks only — the wiring check is warn-only.
  const exitCode = result.data.checks.every((check) => check.ok) ? 0 : 1;
  return { exitCode, stdout, stderr: "" };
}
