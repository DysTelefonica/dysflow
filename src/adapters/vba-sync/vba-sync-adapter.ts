import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type DysflowConfig, loadDysflowConfigAsync } from "../../core/config/dysflow-config.js";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
  type VbaSyncPort,
} from "../../core/contracts/index.js";
import {
  type AccessOperationPreflightCleanup,
  type AccessOperationPreflightCleanupResult,
  diagnosticsFromPreflightCleanup,
} from "../../core/operations/access-operation-preflight.js";
import {
  type AccessOperationRecord,
  type AccessOperationRegistry,
  createAccessOperationId,
} from "../../core/operations/access-operation-registry.js";
import { POWERSHELL_EXE, spawnPowerShellProcess } from "../../core/runner/powershell-executor.js";
import { isRecord, sanitizeSecrets, stringValue, truthy } from "../../core/utils/index.js";
import { VbaExecutionAdapter } from "./vba-execution-adapter.js";
import { VbaFormsAdapter } from "./vba-forms-adapter.js";
import { VbaModulesAdapter } from "./vba-modules-adapter.js";
import type { VbaOperationsCleanupService } from "./vba-operations-adapter.js";
import { VbaOperationsAdapter } from "./vba-operations-adapter.js";
import type { DirectMapping } from "./vba-sync-types.js";

export type {
  VbaReconcilePlanResult,
  VbaSourceComparisonEntry,
  VbaSourceComparisonFile,
  VbaSourceDiffEntry,
  VbaVerifyResult,
} from "../../core/services/vba-source-comparison.js";

export type VbaManagerExecutionRequest = {
  scriptPath: string;
  action: string;
  accessPath?: string;
  destinationRoot: string;
  moduleNames: readonly string[];
  password?: string;
  json: boolean;
  extra: Record<string, string | boolean | number | undefined>;
  timeoutMs: number;
  operationId?: string;
  operationFile?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
};

export type VbaManagerExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

type TrackedVbaManagerOperation = {
  operationId: string;
  operationFile: string;
  record: AccessOperationRecord;
};

type VbaManagerOperationMarker = {
  accessPid?: number;
  processStartTime?: string;
};

export type VbaManagerExecutor = (
  request: VbaManagerExecutionRequest,
) => Promise<VbaManagerExecutionResult>;

export type VbaSyncAdapterOptions = {
  executor?: VbaManagerExecutor;
  operationRegistry?: AccessOperationRegistry;
  cleanupService?: VbaOperationsCleanupService;
  preflightCleanup?: AccessOperationPreflightCleanup;
  scriptPath?: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
  accessPath?: string;
  destinationRoot?: string;
  accessPassword?: string;
  processTimeoutMs?: number;
};

const VBA_MANAGER_EXTRA_KEYS = new Set([
  "backendPath",
  "erdPath",
  "importMode",
  "location",
  "proceduresJson",
]);
const TOOL_NOT_IMPLEMENTED_MESSAGE =
  "This tool is tracked for parity but is not implemented by this service yet.";

const PROCESS_WALL_CLOCK_BUDGET_MS = 25_000;

export class VbaSyncAdapter implements VbaSyncPort {
  public readonly executor: VbaManagerExecutor;
  public readonly scriptPath: string;
  public readonly env: Record<string, string | undefined>;
  public readonly cwd: string;
  public readonly accessPath?: string;
  public readonly destinationRoot?: string;
  public readonly accessPassword?: string;
  public readonly processTimeoutMs: number;

  private readonly operationsAdapter: VbaOperationsAdapter;
  private readonly operationRegistry?: AccessOperationRegistry;
  private readonly executionAdapter: VbaExecutionAdapter;
  private readonly formsAdapter: VbaFormsAdapter;
  private readonly modulesAdapter: VbaModulesAdapter;

  constructor(options: VbaSyncAdapterOptions = {}) {
    this.env = options.env ?? process.env;
    this.executor = options.executor ?? spawnVbaManager;
    this.scriptPath = options.scriptPath ?? resolveDefaultVbaManagerScriptPath(this.env);
    this.cwd = options.cwd ?? process.cwd();
    this.accessPath = stringValue(options.accessPath);
    this.destinationRoot = stringValue(options.destinationRoot);
    this.accessPassword =
      stringValue(options.accessPassword) ?? stringValue(this.env.DYSFLOW_ACCESS_PASSWORD);
    this.processTimeoutMs = options.processTimeoutMs ?? 30_000;
    this.operationRegistry = options.operationRegistry;

    // Sub-adapters instantiation delegating orchestrator context
    this.operationsAdapter = new VbaOperationsAdapter({
      operationRegistry: options.operationRegistry,
      cleanupService: options.cleanupService,
      preflightCleanup: options.preflightCleanup,
      cwd: this.cwd,
    });
    this.executionAdapter = new VbaExecutionAdapter(this);
    this.formsAdapter = new VbaFormsAdapter(this);
    this.modulesAdapter = new VbaModulesAdapter(this);
  }

  async execute(toolName: string, input: unknown): Promise<OperationResult<unknown>> {
    const params = isRecord(input) ? input : {};

    if (VbaOperationsAdapter.handles(toolName)) {
      return this.operationsAdapter.execute(toolName, params);
    }
    if (VbaExecutionAdapter.handles(toolName)) {
      return this.executionAdapter.execute(toolName, params);
    }
    if (VbaFormsAdapter.handles(toolName)) {
      return this.formsAdapter.execute(toolName, params);
    }
    if (VbaModulesAdapter.handles(toolName)) {
      return this.modulesAdapter.execute(toolName, params);
    }

    return failureResult(createDysflowError("TOOL_NOT_IMPLEMENTED", TOOL_NOT_IMPLEMENTED_MESSAGE));
  }

  public async executeMappedTool(
    toolName: string,
    params: Record<string, unknown>,
    mapping: DirectMapping,
  ): Promise<OperationResult<unknown>> {
    const target = await this.resolveExecutionTarget(params);
    if (!target.ok) return target;
    const strict = this.validateStrictContext(params, target.data);
    if (!strict.ok) return strict;
    const accessPath = target.data.accessPath;
    const destinationRoot = target.data.destinationRoot;
    const password = this.accessPassword;
    const explicitTimeoutMs =
      typeof params.timeoutMs === "number" && params.timeoutMs > 0 ? params.timeoutMs : undefined;
    const effectiveTimeoutMs = explicitTimeoutMs ?? target.data.processTimeoutMs;
    const request: VbaManagerExecutionRequest = {
      scriptPath: this.scriptPath,
      action: mapping.action,
      accessPath,
      destinationRoot,
      moduleNames: mapping.moduleNames(params),
      password,
      json: mapping.json ?? false,
      extra: mapping.extra(params),
      timeoutMs: effectiveTimeoutMs,
      cwd: target.data.projectRoot ?? this.cwd,
      env:
        password === undefined
          ? undefined
          : { DYSFLOW_ACCESS_PASSWORD: password, ACCESS_VBA_PASSWORD: password },
    };
    const extraValidation = validateVbaManagerExtra(request.extra);
    if (!extraValidation.ok) return extraValidation;

    const preflightStart = Date.now();
    const preflightDiagnostics = diagnosticsFromPreflightCleanup(
      await this.runPreflightCleanup(target.data),
    );
    const preflightElapsedMs = Date.now() - preflightStart;

    const psTimeoutMs =
      explicitTimeoutMs !== undefined
        ? effectiveTimeoutMs
        : Math.max(
            Math.min(5_000, effectiveTimeoutMs),
            Math.min(effectiveTimeoutMs, PROCESS_WALL_CLOCK_BUDGET_MS) - preflightElapsedMs,
          );
    const timedRequest =
      psTimeoutMs !== effectiveTimeoutMs ? { ...request, timeoutMs: psTimeoutMs } : request;
    const trackedOperation = await this.startTrackedOperation(
      toolName,
      mapping.action,
      timedRequest,
      target.data,
    );
    const trackedRequest = trackedOperation
      ? {
          ...timedRequest,
          operationId: trackedOperation.operationId,
          operationFile: trackedOperation.operationFile,
        }
      : timedRequest;
    let result: VbaManagerExecutionResult;
    try {
      result = await this.executeWithTimeout(trackedRequest);
    } catch (error) {
      await this.finishTrackedOperation(trackedOperation, { status: "failed" });
      throw error;
    }
    await this.finishTrackedOperation(trackedOperation, {
      status: result.timedOut ? "timed_out" : result.exitCode === 0 ? "completed" : "failed",
    });
    const secrets = [password].filter((secret): secret is string => Boolean(secret));
    if (result.timedOut) {
      return failureResult(
        createDysflowError(
          "VBA_MANAGER_TIMEOUT",
          `${toolName} timed out after ${result.durationMs}ms`,
          { retryable: true },
        ),
        { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
      );
    }
    if (result.exitCode !== 0) {
      return failureResult(
        createDysflowError(
          "VBA_MANAGER_FAILED",
          `${toolName} failed with exit code ${result.exitCode ?? "unknown"}: ${sanitizeSecrets(result.stderr || result.stdout || "No output.", secrets)}`,
        ),
        { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
      );
    }

    const parsedOutput = parseOutput(result.stdout, secrets);
    if (toolName === "import_all" || toolName === "import_modules") {
      return successResult(
        {
          result: parsedOutput,
          ...buildTargetDiagnostics(toolName, params, target.data, true),
        },
        { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
      );
    }

    return successResult(parsedOutput, {
      diagnostics: preflightDiagnostics,
      durationMs: result.durationMs,
    });
  }

  public async runPreflightCleanup(target: {
    accessPath?: string;
    projectRoot?: string;
  }): Promise<AccessOperationPreflightCleanupResult> {
    return this.operationsAdapter.runPreflightCleanup(target);
  }

  private async startTrackedOperation(
    toolName: string,
    managerAction: string,
    request: VbaManagerExecutionRequest,
    target: Pick<DysflowConfig, "projectRoot" | "accessDbPath"> & {
      accessPath?: string;
      destinationRoot: string;
    },
  ): Promise<TrackedVbaManagerOperation | undefined> {
    if (this.operationRegistry === undefined || target.accessPath === undefined) return undefined;

    const operationId = createAccessOperationId();
    const operationFile = join(
      target.projectRoot ?? request.cwd ?? this.cwd,
      ".dysflow",
      "runtime",
      "markers",
      `${operationId}.json`,
    );
    const record = await this.operationRegistry.create({
      operationId,
      action: "vba",
      accessPath: target.accessPath,
      destinationRootAbs: target.destinationRoot,
      projectRootAbs: target.projectRoot ?? request.cwd ?? this.cwd,
      accessPid: null,
      processStartTime: null,
      status: "starting",
      metadata: {
        toolName,
        managerAction,
        moduleNames: [...request.moduleNames],
      },
      updatedAt: new Date().toISOString(),
    });
    return { operationId, operationFile, record };
  }

  private async finishTrackedOperation(
    operation: TrackedVbaManagerOperation | undefined,
    update: { status: AccessOperationRecord["status"] },
  ): Promise<void> {
    if (operation === undefined || this.operationRegistry === undefined) return;
    const marker = await readVbaManagerOperationMarker(operation.operationFile);
    await this.operationRegistry.update(operation.operationId, {
      accessPid: marker.accessPid ?? operation.record.accessPid,
      processStartTime: marker.processStartTime ?? operation.record.processStartTime,
      status: update.status,
      updatedAt: new Date().toISOString(),
    });
    await rm(operation.operationFile, { force: true }).catch(() => undefined);
  }

  public async resolveExecutionTarget(
    params: Record<string, unknown>,
  ): Promise<
    OperationResult<
      Pick<
        DysflowConfig,
        | "accessDbPath"
        | "backendPath"
        | "destinationRoot"
        | "projectRoot"
        | "projectId"
        | "configSource"
        | "timeoutMs"
        | "processTimeoutMs"
      > & { accessPath?: string; destinationRoot: string }
    >
  > {
    const hasExplicitConfigOverride =
      stringValue(params.accessPath) !== undefined || stringValue(params.projectRoot) !== undefined;
    const requestedProjectId = stringValue(params.projectId) ?? stringValue(params.contextId);
    if (hasExplicitConfigOverride || requestedProjectId !== undefined) {
      const config = await loadDysflowConfigAsync({
        env: this.env,
        cwd: this.cwd,
        accessDbPath: stringValue(params.accessPath),
        backendPath: stringValue(params.backendPath),
        destinationRoot: stringValue(params.destinationRoot),
        projectRoot: stringValue(params.projectRoot),
        projectId: stringValue(params.projectId),
        contextId: stringValue(params.contextId),
      });
      if (!config.ok) return config;
      return successResult({
        ...config.data,
        accessPath: config.data.accessDbPath,
        destinationRoot:
          stringValue(params.destinationRoot) ??
          config.data.destinationRoot ??
          config.data.projectRoot ??
          this.cwd,
      });
    }

    if (this.accessPath === undefined) {
      const repoConfig = await loadDysflowConfigAsync({ env: this.env, cwd: this.cwd });
      if (repoConfig.ok) {
        return successResult({
          ...repoConfig.data,
          accessPath: repoConfig.data.accessDbPath,
          destinationRoot:
            stringValue(params.destinationRoot) ??
            repoConfig.data.destinationRoot ??
            repoConfig.data.projectRoot ??
            this.cwd,
        });
      }
      return repoConfig;
    }

    const destinationRoot =
      stringValue(params.destinationRoot) ??
      stringValue(params.projectRoot) ??
      this.destinationRoot ??
      this.cwd;
    return successResult({
      configSource: "runtime-default",
      accessDbPath: this.accessPath ?? "",
      accessPath: this.accessPath,
      destinationRoot,
      projectRoot: stringValue(params.projectRoot) ?? this.destinationRoot ?? this.cwd,
      projectId: undefined,
      timeoutMs: this.processTimeoutMs,
      processTimeoutMs: this.processTimeoutMs,
    });
  }

  public validateStrictContext(
    params: Record<string, unknown>,
    target: { accessPath?: string; destinationRoot: string; projectRoot?: string },
  ): OperationResult<undefined> {
    if (!truthy(params.strictContext) && !truthy(params.strictWrite))
      return successResult(undefined);
    const checks: Array<[string, string | undefined, string | undefined]> = [
      ["expectedAccessPath", stringValue(params.expectedAccessPath), target.accessPath],
      [
        "expectedDestinationRoot",
        stringValue(params.expectedDestinationRoot),
        target.destinationRoot,
      ],
      ["expectedProjectRoot", stringValue(params.expectedProjectRoot), target.projectRoot],
    ];
    for (const [name, expected, actual] of checks) {
      if (expected !== undefined && actual === undefined) {
        return failureResult(
          createDysflowError(
            "STRICT_CONTEXT_MISMATCH",
            `${name} was provided but the resolved target has no matching value.`,
          ),
        );
      }
      if (expected !== undefined && actual !== undefined && resolve(expected) !== resolve(actual)) {
        return failureResult(
          createDysflowError(
            "STRICT_CONTEXT_MISMATCH",
            `${name} does not match resolved target. Expected ${expected}; resolved ${actual}.`,
          ),
        );
      }
    }
    return successResult(undefined);
  }

  public async executeWithTimeout(
    request: VbaManagerExecutionRequest,
  ): Promise<VbaManagerExecutionResult> {
    const controller = new AbortController();
    const requestWithSignal = { ...request, signal: controller.signal };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<VbaManagerExecutionResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({
          exitCode: null,
          stdout: "",
          stderr: "",
          durationMs: request.timeoutMs,
          timedOut: true,
        });
      }, request.timeoutMs);
    });
    const execution = this.executor(requestWithSignal).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
    return Promise.race([execution, timeout]);
  }
}

function validateVbaManagerExtra(
  extra: Record<string, string | boolean | number | undefined>,
): OperationResult<undefined> {
  for (const key of Object.keys(extra)) {
    if (!VBA_MANAGER_EXTRA_KEYS.has(key)) {
      return failureResult(
        createDysflowError(
          "VBA_MANAGER_EXTRA_NOT_ALLOWED",
          `Unsupported VBA manager option: ${key}.`,
        ),
      );
    }
  }
  return successResult(undefined);
}

export function resolveDefaultVbaManagerScriptPath(
  env: Record<string, string | undefined> = process.env,
): string {
  const home = env.DYSFLOW_HOME;
  if (home !== undefined && home.trim().length > 0) {
    return `${home.replace(/\\$/, "")}/app/scripts/dysflow-vba-manager.ps1`;
  }
  return "scripts/dysflow-vba-manager.ps1";
}

function buildTargetDiagnostics(
  operation: string,
  params: Record<string, unknown>,
  target: Pick<DysflowConfig, "backendPath" | "configSource" | "projectId" | "projectRoot"> & {
    accessPath?: string;
    destinationRoot: string;
  },
  willModifyAccess: boolean,
): Record<string, unknown> {
  return {
    operation,
    dryRun: false,
    willModifyAccess,
    requestedProjectId: stringValue(params.projectId),
    requestedContextId: stringValue(params.contextId),
    resolvedProjectId: target.projectId,
    configSource:
      target.configSource === "explicit-request" ? "explicit-overrides" : target.configSource,
    projectRoot: target.projectRoot,
    accessPath: target.accessPath,
    backendPath: target.backendPath,
    destinationRoot: target.destinationRoot,
  };
}

function parseOutput(stdout: string, secrets: readonly string[]): unknown {
  const safe = sanitizeSecrets(stdout, secrets).trim();
  if (safe.length === 0) return { ok: true };
  try {
    return JSON.parse(safe) as unknown;
  } catch {
    return { ok: true, stdout: safe };
  }
}

async function readVbaManagerOperationMarker(
  operationFile: string,
): Promise<VbaManagerOperationMarker> {
  const raw = await readFile(operationFile, "utf8").catch(() => undefined);
  if (raw === undefined) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {};
    const accessPid = typeof parsed.accessPid === "number" ? parsed.accessPid : undefined;
    const processStartTime = stringValue(parsed.processStartTime);
    return { accessPid, processStartTime };
  } catch {
    return {};
  }
}

export const spawnVbaManager: VbaManagerExecutor = (request) => {
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    request.scriptPath,
    "-Action",
    request.action,
    "-DestinationRoot",
    request.destinationRoot,
  ];
  if (request.accessPath) args.push("-AccessPath", request.accessPath);
  if (request.moduleNames.length > 0)
    args.push("-ModuleNamesJson", JSON.stringify(request.moduleNames));
  if (request.json) args.push("-Json");
  if (request.operationId !== undefined) args.push("-OperationId", request.operationId);
  if (request.operationFile !== undefined) args.push("-OperationFile", request.operationFile);
  for (const [key, value] of Object.entries(request.extra)) {
    if (value === undefined) continue;
    const flag = `-${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    args.push(flag, String(value));
  }

  return spawnPowerShellProcess({
    command: POWERSHELL_EXE,
    args,
    timeoutMs: request.timeoutMs,
    cwd: request.cwd,
    env: request.env,
    signal: request.signal,
  });
};

export { VbaFormService } from "../../core/services/vba-form-service.js";
export {
  collectVbaSourceFiles,
  compareSourceAgainstBinary,
  compareVbaSourceTrees,
  planReconcileBinary,
} from "../../core/services/vba-source-comparison.js";
