import { readdir, stat } from "node:fs/promises";
import { extname, isAbsolute, parse, resolve } from "node:path";
import { type DysflowConfig, loadDysflowConfigAsync } from "../../core/config/dysflow-config.js";
import {
  createDysflowError,
  failureResult,
  type LegacyVbaSyncPort,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import {
  type AccessOperationPreflightCleanup,
  type AccessOperationPreflightCleanupResult,
  AccessOperationPreflightCleanupService,
  diagnosticsFromPreflightCleanup,
} from "../../core/operations/access-operation-preflight.js";
import {
  FileAccessOperationRegistry,
  resolveProjectOperationRegistryPath,
} from "../../core/operations/access-operation-registry.js";
import { POWERSHELL_EXE, spawnPowerShellProcess } from "../../core/runner/powershell-executor.js";
import { VbaFormService } from "../../core/services/vba-form-service.js";
import {
  compareSourceAgainstBinary,
  planReconcileBinary,
} from "../../core/services/vba-source-comparison.js";
import {
  isRecord,
  readJsonFileAsync,
  sanitizeSecrets,
  stringValue,
  truthy,
} from "../../core/utils/index.js";

export type VbaSourceComparisonFile = {
  moduleName: string;
  fileType: string;
  path: string;
  relativePath: string;
};

export type VbaSourceComparisonEntry = {
  moduleName: string;
  fileType: string;
  sourcePath?: string;
  binaryPath?: string;
};

export type VbaSourceDiffEntry = VbaSourceComparisonEntry & {
  sourceSnippet: string;
  binarySnippet: string;
};

export type VbaVerifyResult = {
  operation: "verify_code" | "verify_binary";
  ok: boolean;
  dryRun: true;
  willModifyAccess: false;
  sourceRoot: string;
  matched: readonly VbaSourceComparisonEntry[];
  different: readonly VbaSourceComparisonEntry[];
  missingInSource: readonly VbaSourceComparisonEntry[];
  missingInBinary: readonly VbaSourceComparisonEntry[];
  diffs?: readonly VbaSourceDiffEntry[];
};

export type VbaReconcilePlanResult = Omit<VbaVerifyResult, "operation"> & {
  operation: "reconcile_binary";
  recommendation: string;
};

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

export type VbaManagerExecutor = (
  request: VbaManagerExecutionRequest,
) => Promise<VbaManagerExecutionResult>;

export type ImportPlanResult = {
  operation: "import_all" | "import_modules";
  dryRun: true;
  willModifyAccess: false;
  requestedProjectId?: string;
  requestedContextId?: string;
  resolvedProjectId?: string;
  configSource: string;
  projectRoot?: string;
  accessPath?: string;
  backendPath?: string;
  destinationRoot: string;
  importMode?: string;
  modulesPlanned: readonly string[];
  modulesCount: number;
  warnings: readonly string[];
  errors: readonly string[];
};

export type ImportPlanTarget = Pick<
  DysflowConfig,
  "accessDbPath" | "backendPath" | "projectRoot" | "projectId" | "configSource"
> & {
  accessPath?: string;
  destinationRoot: string;
};

export type BuildImportPlanResultOptions = {
  toolName: "import_all" | "import_modules";
  params: Record<string, unknown>;
  target: ImportPlanTarget;
  modulesPlanned: readonly string[];
  warnings: readonly string[];
  errors: readonly string[];
};

export type VbaSyncLegacyServiceOptions = {
  executor?: VbaManagerExecutor;
  preflightCleanup?: AccessOperationPreflightCleanup;
  scriptPath?: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
  accessPath?: string;
  destinationRoot?: string;
  accessPassword?: string;
  processTimeoutMs?: number;
};

type DirectMapping = {
  action: string;
  json?: boolean;
  moduleNames(input: Record<string, unknown>): readonly string[];
  extra(input: Record<string, unknown>): Record<string, string | boolean | number | undefined>;
};

const DIRECT_MAPPINGS: Record<string, DirectMapping> = {
  export_modules: mapping("Export", false, (input) => stringArray(input.moduleNames)),
  export_all: mapping("Export"),
  import_modules: mapping(
    "Import",
    false,
    (input) => stringArray(input.moduleNames),
    (input) => ({ importMode: stringValue(input.importMode) }),
  ),
  import_all: mapping("Import"),
  list_objects: mapping("List-Objects", true),
  exists: mapping("Exists", true, (input) => {
    const moduleName = stringValue(input.moduleName) || stringValue(input.name);
    return moduleName ? [moduleName] : [];
  }),
  test_vba: mapping(
    "Run-Tests",
    true,
    () => [],
    (input) => ({ proceduresJson: directTestProceduresJson(input) }),
  ),
  compile_vba: mapping("Compile", true),
  fix_encoding: mapping(
    "Fix-Encoding",
    false,
    (input) => stringArray(input.moduleNames),
    (input) => ({ location: stringValue(input.location) }),
  ),
  delete_module: mapping("Delete", true, (input) => stringArray(input.moduleNames)),
  generate_erd: mapping(
    "Generate-ERD",
    false,
    () => [],
    (input) => ({
      backendPath: stringValue(input.backendPath),
      erdPath: stringValue(input.erdPath),
    }),
  ),
};

const VBA_MANAGER_EXTRA_KEYS = new Set([
  "backendPath",
  "erdPath",
  "importMode",
  "location",
  "proceduresJson",
]);
const LEGACY_TOOL_NOT_IMPLEMENTED_MESSAGE =
  "This legacy tool is tracked for parity but is not implemented by this service yet.";

export class VbaSyncLegacyAdapter implements LegacyVbaSyncPort {
  private readonly executor: VbaManagerExecutor;
  private readonly preflightCleanup?: AccessOperationPreflightCleanup;
  private readonly scriptPath: string;
  private readonly env: Record<string, string | undefined>;
  private readonly cwd: string;
  private readonly accessPath?: string;
  private readonly destinationRoot?: string;
  private readonly accessPassword?: string;
  private readonly processTimeoutMs: number;
  private readonly formService: VbaFormService;

  constructor(options: VbaSyncLegacyServiceOptions = {}) {
    this.env = options.env ?? process.env;
    this.executor = options.executor ?? spawnVbaManager;
    this.preflightCleanup = options.preflightCleanup;
    this.scriptPath = options.scriptPath ?? resolveDefaultVbaManagerScriptPath(this.env);
    this.cwd = options.cwd ?? process.cwd();
    this.accessPath = stringValue(options.accessPath);
    this.destinationRoot = stringValue(options.destinationRoot);
    this.accessPassword =
      stringValue(options.accessPassword) ?? stringValue(this.env.DYSFLOW_ACCESS_PASSWORD);
    this.processTimeoutMs = options.processTimeoutMs ?? 30_000;
    this.formService = new VbaFormService({
      executor: this.executor,
      env: this.env,
      resolveExecutionTarget: this.resolveExecutionTarget.bind(this),
      validateStrictContext: this.validateStrictContext.bind(this),
      cwd: this.cwd,
    });
  }

  async execute(toolName: string, input: unknown): Promise<OperationResult<unknown>> {
    const params = isRecord(input) ? input : {};
    if (toolName === "validate_form_spec") return this.formService.validateFormSpec(params);
    if (toolName === "generate_form") return this.formService.generateForm(params);
    if (toolName === "catalog_add_control") return this.formService.catalogAddControl(params);
    if (toolName === "harvest_form_catalog") return this.formService.harvestFormCatalog(params);
    if (toolName === "verify_code" || toolName === "verify_binary")
      return compareSourceAgainstBinary(toolName, params, this.getComparisonContext());
    if (toolName === "reconcile_binary")
      return planReconcileBinary(params, this.getComparisonContext());

    if (toolName === "test_vba") {
      return this.executeTestVba(params);
    }
    const mapping = DIRECT_MAPPINGS[toolName];
    if (mapping === undefined) {
      return failureResult(
        createDysflowError("LEGACY_TOOL_NOT_IMPLEMENTED", LEGACY_TOOL_NOT_IMPLEMENTED_MESSAGE),
      );
    }

    // For export_modules/export_all: exportPath overrides destinationRoot so the export goes to
    // the caller-specified directory instead of the project's default src/ folder (issue #185).
    const exportPath = stringValue(params.exportPath);
    const effectiveParams =
      (toolName === "export_modules" || toolName === "export_all") && exportPath !== undefined
        ? { ...params, destinationRoot: exportPath }
        : params;

    return this.executeMappedTool(toolName, effectiveParams, mapping);
  }

  private async executeMappedTool(
    toolName: string,
    params: Record<string, unknown>,
    mapping: DirectMapping,
  ): Promise<OperationResult<unknown>> {
    if (truthy(params.dryRun) && (toolName === "import_all" || toolName === "import_modules")) {
      return this.planImport(toolName, params);
    }

    const target = await this.resolveExecutionTarget(params);
    if (!target.ok) return target;
    const strict = this.validateStrictContext(params, target.data);
    if (!strict.ok) return strict;
    const accessPath = target.data.accessPath;
    const destinationRoot = target.data.destinationRoot;
    const password = this.accessPassword;
    const effectiveTimeoutMs =
      typeof params.timeoutMs === "number" && params.timeoutMs > 0
        ? params.timeoutMs
        : target.data.processTimeoutMs;
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
      env:
        password === undefined
          ? undefined
          : { DYSFLOW_ACCESS_PASSWORD: password, ACCESS_VBA_PASSWORD: password },
    };
    const extraValidation = validateVbaManagerExtra(request.extra);
    if (!extraValidation.ok) return extraValidation;

    const preflightDiagnostics = diagnosticsFromPreflightCleanup(
      await this.runPreflightCleanup(target.data),
    );
    const result = await this.executeWithTimeout(request);
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

  private async runPreflightCleanup(target: {
    accessPath?: string;
    projectRoot?: string;
  }): Promise<AccessOperationPreflightCleanupResult> {
    if (target.accessPath === undefined)
      return { cleaned: [], killed: [], orphanedKilled: [], errors: [] };
    const projectRoot = target.projectRoot ?? this.cwd;
    try {
      const cleanup = this.preflightCleanup ?? (await createDefaultPreflightCleanup(projectRoot));
      return await cleanup.cleanup({ accessPath: target.accessPath, projectRoot });
    } catch (error) {
      return {
        cleaned: [],
        killed: [],
        orphanedKilled: [],
        errors: [
          {
            operationId: "preflight",
            message: `Pre-flight cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  private async resolveExecutionTarget(
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

  private validateStrictContext(
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

  private async planImport(
    toolName: "import_all" | "import_modules",
    params: Record<string, unknown>,
  ): Promise<OperationResult<ImportPlanResult>> {
    const target = await this.resolveExecutionTarget(params);
    if (!target.ok) return target;
    const strict = this.validateStrictContext(params, target.data);
    if (!strict.ok) return strict;

    const requestedModules = stringArray(params.moduleNames);
    const modulesPlanned =
      toolName === "import_modules"
        ? requestedModules
        : await discoverImportModules(target.data.destinationRoot);
    const warnings: string[] = [];
    const errors: string[] = [];
    await stat(target.data.destinationRoot).catch(() =>
      errors.push(`destinationRoot not found: ${target.data.destinationRoot}`),
    );
    if (target.data.accessPath !== undefined) {
      await stat(target.data.accessPath).catch(() =>
        errors.push(`accessPath not found: ${target.data.accessPath}`),
      );
    }

    return successResult(
      buildImportPlanResult({
        toolName,
        params,
        target: target.data,
        modulesPlanned,
        warnings,
        errors,
      }),
    );
  }

  private getComparisonContext() {
    return {
      scriptPath: this.scriptPath,
      accessPassword: this.accessPassword,
      resolveExecutionTarget: this.resolveExecutionTarget.bind(this),
      validateStrictContext: this.validateStrictContext.bind(this),
      runPreflightCleanup: this.runPreflightCleanup.bind(this),
      executeWithTimeout: this.executeWithTimeout.bind(this),
    };
  }

  private async executeWithTimeout(
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

  private async executeTestVba(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    if (truthy(params.compile)) {
      const compileResult = await this.executeMappedTool(
        "compile_vba",
        params,
        DIRECT_MAPPINGS.compile_vba,
      );
      if (!compileResult.ok) return compileResult;
    }

    const directProceduresJson = stringValue(params.proceduresJson);
    if (directProceduresJson !== undefined) {
      const directPlan = validateTestProceduresJson(directProceduresJson);
      if (!directPlan.ok) return directPlan;
      return inspectTestResult(
        await this.executeMappedTool(
          "test_vba",
          { ...params, proceduresJson: directPlan.data },
          DIRECT_MAPPINGS.test_vba,
        ),
      );
    }

    const planResult = await this.resolveTestProceduresJson(params);
    if (!planResult.ok) return planResult;
    return inspectTestResult(
      await this.executeMappedTool(
        "test_vba",
        { ...params, proceduresJson: planResult.data },
        DIRECT_MAPPINGS.test_vba,
      ),
    );
  }

  private async resolveTestProceduresJson(
    params: Record<string, unknown>,
  ): Promise<OperationResult<string>> {
    try {
      const procedureName = stringValue(params.procedureName);
      if (procedureName !== undefined) {
        const parsed = parseArgsJson(params.argsJson);
        if (!parsed.ok)
          return failureResult(createDysflowError("VBA_INVALID_TEST_PLAN", parsed.error));
        return successResult(JSON.stringify([{ procedure: procedureName, args: parsed.value }]));
      }

      const projectRoot = stringValue(params.projectRoot) || this.cwd;
      const testsPath = stringValue(params.testsPath) ?? "tests.vba.json";
      const resolvedPath = isAbsolute(testsPath) ? testsPath : resolve(projectRoot, testsPath);
      const parsed = await readJsonFileAsync<unknown>(resolvedPath);
      const tests = normalizeTestPlan(parsed);
      const filterParts = parseTestFilter(params.filter);
      const selected =
        filterParts === undefined
          ? tests
          : tests.filter((test) => matchesTestFilter(test, filterParts));
      if (selected.length === 0) {
        return failureResult(
          createDysflowError(
            "VBA_NO_TESTS_SELECTED",
            `No VBA tests selected from ${resolvedPath}${stringValue(params.filter) !== undefined ? ` with filter "${stringValue(params.filter)}"` : ""}.`,
          ),
        );
      }
      return successResult(
        JSON.stringify(selected.map((test) => ({ procedure: test.procedure, args: test.args }))),
      );
    } catch (err) {
      return failureResult(
        createDysflowError(
          "VBA_INVALID_TEST_PLAN",
          err instanceof Error ? err.message : String(err),
        ),
      );
    }
  }
}

export { VbaSyncLegacyAdapter as VbaSyncLegacyService };

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

export function buildImportPlanResult(options: BuildImportPlanResultOptions): ImportPlanResult {
  const { toolName, params, target, modulesPlanned, warnings, errors } = options;
  return {
    operation: toolName,
    dryRun: true,
    willModifyAccess: false,
    requestedProjectId: stringValue(params.projectId),
    requestedContextId: stringValue(params.contextId),
    resolvedProjectId: target.projectId,
    configSource:
      target.configSource === "explicit-request" ? "explicit-overrides" : target.configSource,
    projectRoot: target.projectRoot,
    accessPath: target.accessPath,
    backendPath: target.backendPath,
    destinationRoot: target.destinationRoot,
    importMode: stringValue(params.importMode),
    modulesPlanned,
    modulesCount: modulesPlanned.length,
    warnings,
    errors,
  };
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

function mapping(
  action: string,
  json = false,
  moduleNames: (input: Record<string, unknown>) => readonly string[] = () => [],
  extra: (
    input: Record<string, unknown>,
  ) => Record<string, string | boolean | number | undefined> = () => ({}),
): DirectMapping {
  return { action, json, moduleNames, extra };
}

async function createDefaultPreflightCleanup(
  projectRoot: string,
): Promise<AccessOperationPreflightCleanup> {
  const { WindowsMsAccessProcessInspector, WindowsMsAccessProcessScanner, WindowsProcessKiller } =
    await import("../../core/operations/windows-processes.js");
  return new AccessOperationPreflightCleanupService({
    registry: new FileAccessOperationRegistry({
      filePath: resolveProjectOperationRegistryPath({ projectRoot }),
    }),
    processInspector: new WindowsMsAccessProcessInspector(),
    processKiller: new WindowsProcessKiller(),
    processScanner: new WindowsMsAccessProcessScanner(),
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

async function discoverImportModules(destinationRoot: string): Promise<string[]> {
  const modules: string[] = [];
  for (const folder of [
    destinationRoot,
    resolve(destinationRoot, "modules"),
    resolve(destinationRoot, "classes"),
    resolve(destinationRoot, "forms"),
  ]) {
    const entries = await readdir(folder).catch(() => []);
    for (const entry of entries) {
      const extension = extname(entry).toLowerCase();
      if (![".bas", ".cls", ".frm"].includes(extension)) continue;
      modules.push(parse(entry).name);
    }
  }
  return Array.from(new Set(modules)).sort();
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

function directTestProceduresJson(input: Record<string, unknown>): string | undefined {
  return stringValue(input.proceduresJson);
}

type ParseArgsJsonResult = { ok: true; value: unknown[] } | { ok: false; error: string };

export function parseArgsJson(value: unknown): ParseArgsJsonResult {
  const text = stringValue(value);
  if (text === undefined) return { ok: true, value: [] };
  try {
    const parsed = JSON.parse(text) as unknown;
    return { ok: true, value: Array.isArray(parsed) ? parsed : [parsed] };
  } catch {
    return { ok: false, error: "argsJson must be valid JSON." };
  }
}

type VbaTestPlanEntry = {
  name: string;
  procedure: string;
  args: unknown[];
  tags: string[];
};

function normalizeTestPlan(value: unknown): VbaTestPlanEntry[] {
  const tests = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.tests)
      ? value.tests
      : undefined;
  if (tests === undefined) {
    throw new Error("tests.vba.json must contain an array or an object with a tests array.");
  }
  return tests.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Test #${index + 1} must be an object.`);
    const procedure = stringValue(item.procedure) ?? stringValue(item.proc);
    if (procedure === undefined) throw new Error(`Test #${index + 1} is missing procedure.`);
    const args = Array.isArray(item.args) ? item.args : [];
    const tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
    return {
      name: stringValue(item.name) ?? procedure,
      procedure,
      args,
      tags,
    };
  });
}

function validateTestProceduresJson(proceduresJson: string): OperationResult<string> {
  try {
    const procedures = normalizeTestPlan(JSON.parse(proceduresJson));
    if (procedures.length === 0) {
      return failureResult(
        createDysflowError(
          "VBA_NO_TESTS_SELECTED",
          "proceduresJson must contain at least one VBA test procedure.",
        ),
      );
    }
    return successResult(
      JSON.stringify(procedures.map((test) => ({ procedure: test.procedure, args: test.args }))),
    );
  } catch (err) {
    return failureResult(
      createDysflowError("VBA_INVALID_TEST_PLAN", err instanceof Error ? err.message : String(err)),
    );
  }
}

function parseTestFilter(value: unknown): string[] | undefined {
  const filterText = stringValue(value);
  if (filterText === undefined) return undefined;
  const parts = filterText
    .split("|")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : undefined;
}

function matchesTestFilter(test: VbaTestPlanEntry, filterParts: readonly string[]): boolean {
  return filterParts.some(
    (filterText) =>
      test.name.toLowerCase().includes(filterText) ||
      test.procedure.toLowerCase().includes(filterText) ||
      test.tags.some((tag) => tag.toLowerCase().includes(filterText)),
  );
}

function inspectTestResult(result: OperationResult<unknown>): OperationResult<unknown> {
  if (!result.ok) return result;
  const tests = Array.isArray(result.data) ? result.data : undefined;
  if (tests !== undefined) {
    const failedCount = tests.filter((test) => isRecord(test) && test.ok === false).length;
    if (failedCount > 0) {
      return failureResult(
        createDysflowError("VBA_TESTS_FAILED", `${failedCount} VBA test(s) failed.`),
        { diagnostics: result.diagnostics, durationMs: result.durationMs },
      );
    }
  }
  return result;
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
  for (const [key, value] of Object.entries(request.extra)) {
    if (value === undefined) continue;
    const flag = `-${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    args.push(flag, String(value));
  }

  return spawnPowerShellProcess({
    command: POWERSHELL_EXE,
    args,
    timeoutMs: request.timeoutMs,
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
