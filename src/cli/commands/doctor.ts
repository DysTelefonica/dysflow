import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadDysflowConfigAsync } from "../../adapters/config/dysflow-config-node.js";
import { diagnoseProjectConfig } from "../../adapters/config/project-config-diagnostic.js";
import { nodeRegistryFileSystem } from "../../adapters/operations/node-registry-file-system.js";
import { createDefaultPowerShellExecutor } from "../../adapters/powershell/default-executor.js";
import { createWindowsAccessOperationPreflightCleanup } from "../../adapters/process/windows-processes.js";
import { nodeLockFileSystem } from "../../adapters/runner/node-lock-file-system.js";
import type { OperationResult } from "../../core/contracts/index.js";
import { createProjectAccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import { AccessPowerShellRunner } from "../../core/runner/access-runner.js";
import {
  type AccessDiagnosticsResult,
  AccessDiagnosticsService,
} from "../../core/services/diagnostics-service.js";
import {
  runSupplementDriftCheckFromEnv,
  type SupplementDriftDiagnostic,
} from "./codegraph-supplement-drift-check.js";
import { getHome, resolveAgentConfigPaths } from "./install/agent-config.js";
import { ensureObject } from "./install/file-utils.js";
import { runExternalDepsChecks } from "./doctor/checks/external-deps.js";
import { runProjectConfigChecks } from "./doctor/checks/project-config.js";
import { runRuntimeConsumerChecks } from "./doctor/checks/runtime-consumer.js";
import {
  DOCTOR_CATEGORY_LABELS,
  type DoctorCategoryCheck,
  type DoctorCategoryId,
} from "./doctor/checks/types.js";
import { runVbaStructureChecks } from "./doctor/checks/vba-structure.js";
import { checkOpencodeWiring, type McpWiringCheck } from "./opencode-mcp-wiring.js";
import type { CliCommandContext, CliResult } from "./types.js";

export async function handleDoctorCommand(
  args: readonly string[],
  context: CliCommandContext = {},
): Promise<CliResult> {
  // Defense in depth (#591): `--help` / `-h` is a usage request, NOT a
  // diagnostics trigger. Short-circuit before any PowerShell / Access / config
  // load so help is side-effect-free.
  if (args[0] === "--help" || args[0] === "-h") {
    return {
      exitCode: 0,
      stdout:
        "Usage: dysflow doctor [--cwd <path>] [--category A|B|C|D|all]\n\n" +
        "Check local Dysflow requirements without modifying the target worktree.\n\n" +
        "Categories (#1057 — read-only, no PowerShell, no Access):\n" +
        "  A  .dysflow/project.json schema, path resolution, conventions\n" +
        "  B  VBA source structure (Attribute VB_Name, Option Explicit)\n" +
        "  C  runtime consumer contract (apply polarity, param naming)\n" +
        "  D  external dependencies (.laccdb locks, .codegraph freshness)\n" +
        "  all  run every category; exit code reflects critical findings only",
      stderr: "",
    };
  }

  // Issue #1057 (F9) — categorized read-only checks. When `--category` is
  // present the doctor runs ONLY the requested category checks: no
  // PowerShell, no Access COM, no config-load side effects.
  const categoryIndex = args.indexOf("--category");
  if (categoryIndex >= 0) {
    const requested = args[categoryIndex + 1];
    if (requested === undefined)
      return { exitCode: 1, stdout: "", stderr: "Missing value for --category (A|B|C|D|all)." };
    const normalized = requested.toUpperCase();
    if (!["A", "B", "C", "D", "ALL"].includes(normalized))
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Unknown category '${requested}'. Expected A, B, C, D, or all.`,
      };
    const cwdIndex = args.indexOf("--cwd");
    if (cwdIndex >= 0 && args[cwdIndex + 1] === undefined)
      return { exitCode: 1, stdout: "", stderr: "Missing value for --cwd." };
    const requestedCwd = cwdIndex >= 0 ? args[cwdIndex + 1] : undefined;
    const effectiveCwd =
      requestedCwd === undefined ? (context.cwd ?? process.cwd()) : path.resolve(requestedCwd);
    const categories: DoctorCategoryId[] =
      normalized === "ALL" ? ["A", "B", "C", "D"] : [normalized as DoctorCategoryId];
    return runCategorizedDoctor(categories, effectiveCwd);
  }

  try {
    const cwdIndex = args.indexOf("--cwd");
    if (cwdIndex >= 0 && args[cwdIndex + 1] === undefined)
      return { exitCode: 1, stdout: "", stderr: "Missing value for --cwd." };
    const requestedCwd = cwdIndex >= 0 ? args[cwdIndex + 1] : undefined;
    const effectiveCwd =
      requestedCwd === undefined ? (context.cwd ?? process.cwd()) : path.resolve(requestedCwd);
    const projectConfig = cwdIndex >= 0 ? diagnoseProjectConfig(effectiveCwd) : undefined;
    if (projectConfig !== undefined && !projectConfig.writeReady)
      return { exitCode: 1, stdout: JSON.stringify({ projectConfig }, null, 2), stderr: "" };
    const effectiveContext = { ...context, cwd: effectiveCwd };
    const diagnosticsService =
      context.diagnosticsService ?? (await createDiagnosticsService(effectiveContext));
    const result = await diagnosticsService.run({ includeEnvironment: true });

    const wiringCheck = await runWiringCheck(effectiveContext);
    const supplementDriftCheck = await runSupplementDriftCheck(effectiveContext);

    const formatted = formatDiagnosticsResult(result, wiringCheck, supplementDriftCheck);
    return projectConfig === undefined
      ? formatted
      : { ...formatted, stdout: `${JSON.stringify({ projectConfig })}\n${formatted.stdout}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run Dysflow diagnostics.";
    return { exitCode: 1, stdout: "", stderr: message };
  }
}

/**
 * Issue #1057 (F9) — run the requested read-only check categories and
 * render `✓ / ✗ / ⚠` lines under per-category headers. Best-effort: a
 * category whose runner throws surfaces one failed entry instead of
 * aborting the run. Exit code reflects CRITICAL findings only.
 */
function runCategorizedDoctor(categories: readonly DoctorCategoryId[], cwd: string): CliResult {
  const runners: Record<DoctorCategoryId, () => DoctorCategoryCheck[]> = {
    A: () => runProjectConfigChecks(cwd),
    B: () => runVbaStructureChecks(cwd),
    C: () => runRuntimeConsumerChecks(),
    D: () => runExternalDepsChecks(cwd),
  };

  const lines: string[] = [];
  let criticals = 0;
  let warnings = 0;
  for (const category of categories) {
    lines.push(DOCTOR_CATEGORY_LABELS[category]);
    let checks: DoctorCategoryCheck[];
    try {
      checks = runners[category]();
    } catch (error) {
      checks = [
        {
          ok: false,
          name: `${DOCTOR_CATEGORY_LABELS[category]} runner`,
          message: error instanceof Error ? error.message : String(error),
          severity: "warning",
        },
      ];
    }
    for (const check of checks) {
      const symbol = check.ok ? "✓" : check.severity === "critical" ? "✗" : "⚠";
      if (!check.ok && check.severity === "critical") criticals += 1;
      if (!check.ok && check.severity === "warning") warnings += 1;
      lines.push(`${symbol} ${check.name}: ${check.message}`);
    }
  }
  lines.push(
    `${criticals} critical, ${warnings} warning${warnings === 1 ? "" : "s"} — exit ${criticals > 0 ? 1 : 0} (criticals only)`,
  );
  return { exitCode: criticals > 0 ? 1 : 0, stdout: lines.join("\n"), stderr: "" };
}

async function createDiagnosticsService(
  context: CliCommandContext,
): Promise<AccessDiagnosticsService> {
  const configResult = await loadDysflowConfigAsync({ env: context.env, cwd: context.cwd });
  if (!configResult.ok) {
    throw new Error(`${configResult.error.code}: ${configResult.error.message}`);
  }

  const operationRegistry = createProjectAccessOperationRegistry({
    ...configResult.data,
    fileSystem: nodeRegistryFileSystem,
  });
  return new AccessDiagnosticsService({
    runner: new AccessPowerShellRunner({
      executor: createDefaultPowerShellExecutor(),
      lockFileSystem: nodeLockFileSystem,
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

async function runSupplementDriftCheck(
  context: CliCommandContext,
): Promise<SupplementDriftDiagnostic | null> {
  if (context.checkSupplementDrift === false) {
    // Explicit opt-out — used by callers that want to suppress the check.
    return null;
  }
  if (context.checkSupplementDrift) {
    return context.checkSupplementDrift();
  }

  const env = context.env ?? (process.env as Record<string, string | undefined>);
  try {
    return await runSupplementDriftCheckFromEnv(env);
  } catch {
    // Drift check is best-effort — never block the doctor on a scan
    // failure. Returning null drops the line entirely so a broken fs
    // never becomes a hard doctor failure.
    return null;
  }
}

function formatDiagnosticsResult(
  result: OperationResult<AccessDiagnosticsResult>,
  wiringCheck: McpWiringCheck | null,
  supplementDriftCheck: SupplementDriftDiagnostic | null,
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

  if (supplementDriftCheck !== null) {
    // Drift is a remediation hint — ⚠ instead of ✗. Detailed findings
    // are available on demand via `--verbose`; the single-line summary
    // keeps the doctor output scannable.
    const symbol = supplementDriftCheck.ok ? "✓" : "⚠";
    lines.push(`${symbol} ${supplementDriftCheck.name}: ${supplementDriftCheck.message}`);
  }

  const stdout = lines.join("\n");
  // Exit code is driven by core diagnostics checks only — wiring + drift
  // are warn-only so the doctor can be safely run in CI without flipping
  // the exit code on a stale supplement block.
  const exitCode = result.data.checks.every((check) => check.ok) ? 0 : 1;
  return { exitCode, stdout, stderr: "" };
}
