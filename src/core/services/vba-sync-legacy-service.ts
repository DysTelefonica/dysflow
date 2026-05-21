import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, isAbsolute, parse, relative, resolve } from "node:path";
import { createDysflowError, failureResult, successResult, type OperationResult } from "../contracts/index.js";
import { stringValue, isRecord, sanitizeSecrets, readJsonFileAsync, truthy } from "../utils/index.js";
import { loadDysflowConfigAsync, type DysflowConfig } from "../config/dysflow-config.js";
import { POWERSHELL_EXE, spawnPowerShellProcess } from "../runner/powershell-executor.js";
import { AccessOperationPreflightCleanupService, diagnosticsFromPreflightCleanup, type AccessOperationPreflightCleanup, type AccessOperationPreflightCleanupResult } from "../operations/access-operation-preflight.js";
import { FileAccessOperationRegistry, resolveProjectOperationRegistryPath } from "../operations/access-operation-registry.js";

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

export type VbaManagerExecutor = (request: VbaManagerExecutionRequest) => Promise<VbaManagerExecutionResult>;

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

export type ImportPlanTarget = Pick<DysflowConfig, "accessDbPath" | "backendPath" | "projectRoot" | "projectId" | "configSource"> & {
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

type VbaSourceComparisonFile = {
  moduleName: string;
  fileType: string;
  path: string;
  relativePath: string;
};

type VbaSourceComparisonEntry = {
  moduleName: string;
  fileType: string;
  sourcePath?: string;
  binaryPath?: string;
};

type VbaSourceDiffEntry = VbaSourceComparisonEntry & {
  sourceSnippet: string;
  binarySnippet: string;
};

type VbaVerifyResult = {
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

type VbaReconcilePlanResult = Omit<VbaVerifyResult, "operation"> & {
  operation: "reconcile_binary";
  recommendation: string;
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
  import_modules: mapping("Import", false, (input) => stringArray(input.moduleNames), (input) => ({ importMode: stringValue(input.importMode) })),
  import_all: mapping("Import"),
  list_objects: mapping("List-Objects", true),
  exists: mapping("Exists", true, (input) => {
    const moduleName = stringValue(input.moduleName) || stringValue(input.name);
    return moduleName ? [moduleName] : [];
  }),
  test_vba: mapping("Run-Tests", true, () => [], (input) => ({ proceduresJson: directTestProceduresJson(input) })),
  compile_vba: mapping("Compile", true),
  fix_encoding: mapping("Fix-Encoding", false, (input) => stringArray(input.moduleNames), (input) => ({ location: stringValue(input.location) })),
  delete_module: mapping("Delete", true, (input) => stringArray(input.moduleNames)),
  generate_erd: mapping("Generate-ERD", false, () => [], (input) => ({ backendPath: stringValue(input.backendPath), erdPath: stringValue(input.erdPath) })),
};

const VBA_MANAGER_EXTRA_KEYS = new Set(["backendPath", "erdPath", "importMode", "location", "proceduresJson"]);
const LEGACY_TOOL_NOT_IMPLEMENTED_MESSAGE = "This legacy tool is tracked for parity but is not implemented by this service yet.";

export class VbaSyncLegacyService {
  private readonly executor: VbaManagerExecutor;
  private readonly preflightCleanup?: AccessOperationPreflightCleanup;
  private readonly scriptPath: string;
  private readonly env: Record<string, string | undefined>;
  private readonly cwd: string;
  private readonly accessPath?: string;
  private readonly destinationRoot?: string;
  private readonly accessPassword?: string;
  private readonly processTimeoutMs: number;

  constructor(options: VbaSyncLegacyServiceOptions = {}) {
    this.env = options.env ?? process.env;
    this.executor = options.executor ?? spawnVbaManager;
    this.preflightCleanup = options.preflightCleanup;
    this.scriptPath = options.scriptPath ?? resolveDefaultVbaManagerScriptPath(this.env);
    this.cwd = options.cwd ?? process.cwd();
    this.accessPath = stringValue(options.accessPath);
    this.destinationRoot = stringValue(options.destinationRoot);
    this.accessPassword = stringValue(options.accessPassword) ?? stringValue(this.env.DYSFLOW_ACCESS_PASSWORD);
    this.processTimeoutMs = options.processTimeoutMs ?? 30_000;
  }

  async execute(toolName: string, input: unknown): Promise<OperationResult<unknown>> {
    const params = isRecord(input) ? input : {};
    if (toolName === "validate_form_spec") return this.validateFormSpec(params);
    if (toolName === "generate_form") return this.generateForm(params);
    if (toolName === "catalog_add_control") return this.catalogAddControl(params);
    if (toolName === "harvest_form_catalog") return this.harvestFormCatalog(params);
    if (toolName === "verify_code" || toolName === "verify_binary") return this.verifySourceAgainstBinary(toolName, params);
    if (toolName === "reconcile_binary") return this.planReconcileBinary(params);
    if (toolName === "test_vba") {
      return this.executeTestVba(params);
    }
    const mapping = DIRECT_MAPPINGS[toolName];
    if (mapping === undefined) {
      return failureResult(createDysflowError("LEGACY_TOOL_NOT_IMPLEMENTED", LEGACY_TOOL_NOT_IMPLEMENTED_MESSAGE));
    }

    // For export_modules/export_all: exportPath overrides destinationRoot so the export goes to
    // the caller-specified directory instead of the project's default src/ folder (issue #185).
    const exportPath = stringValue(params.exportPath);
    const effectiveParams = (toolName === "export_modules" || toolName === "export_all") && exportPath !== undefined
      ? { ...params, destinationRoot: exportPath }
      : params;

    return this.executeMappedTool(toolName, effectiveParams, mapping);
  }

  private async executeMappedTool(toolName: string, params: Record<string, unknown>, mapping: DirectMapping): Promise<OperationResult<unknown>> {
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
    const effectiveTimeoutMs = typeof params.timeoutMs === "number" && params.timeoutMs > 0
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
      env: password === undefined ? undefined : { DYSFLOW_ACCESS_PASSWORD: password, ACCESS_VBA_PASSWORD: password },
    };
    const extraValidation = validateVbaManagerExtra(request.extra);
    if (!extraValidation.ok) return extraValidation;

    const preflightDiagnostics = diagnosticsFromPreflightCleanup(await this.runPreflightCleanup(target.data));
    const result = await this.executeWithTimeout(request);
    const secrets = [password].filter((secret): secret is string => Boolean(secret));
    if (result.timedOut) {
      return failureResult(
        createDysflowError("VBA_MANAGER_TIMEOUT", `${toolName} timed out after ${result.durationMs}ms`, { retryable: true }),
        { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
      );
    }
    if (result.exitCode !== 0) {
      return failureResult(
        createDysflowError("VBA_MANAGER_FAILED", `${toolName} failed with exit code ${result.exitCode ?? "unknown"}: ${sanitizeSecrets(result.stderr || result.stdout || "No output.", secrets)}`),
        { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
      );
    }

    const parsedOutput = parseOutput(result.stdout, secrets);
    if (toolName === "import_all" || toolName === "import_modules") {
      return successResult({
        result: parsedOutput,
        ...buildTargetDiagnostics(toolName, params, target.data, true),
      }, { diagnostics: preflightDiagnostics, durationMs: result.durationMs });
    }

    return successResult(parsedOutput, { diagnostics: preflightDiagnostics, durationMs: result.durationMs });
  }

  private async runPreflightCleanup(target: { accessPath?: string; projectRoot?: string }): Promise<AccessOperationPreflightCleanupResult> {
    if (target.accessPath === undefined) return { cleaned: [], killed: [], orphanedKilled: [], errors: [] };
    const projectRoot = target.projectRoot ?? this.cwd;
    try {
      const cleanup = this.preflightCleanup ?? await createDefaultPreflightCleanup(projectRoot);
      return await cleanup.cleanup({ accessPath: target.accessPath, projectRoot });
    } catch (error) {
      return {
        cleaned: [],
        killed: [],
        orphanedKilled: [],
        errors: [{ operationId: "preflight", message: `Pre-flight cleanup failed: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }

  private async resolveExecutionTarget(params: Record<string, unknown>): Promise<OperationResult<Pick<DysflowConfig, "accessDbPath" | "backendPath" | "destinationRoot" | "projectRoot" | "projectId" | "configSource" | "timeoutMs" | "processTimeoutMs"> & { accessPath?: string; destinationRoot: string }>> {
    const hasExplicitConfigOverride = stringValue(params.accessPath) !== undefined || stringValue(params.projectRoot) !== undefined;
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
        destinationRoot: stringValue(params.destinationRoot) ?? config.data.destinationRoot ?? config.data.projectRoot ?? this.cwd,
      });
    }

    if (this.accessPath === undefined) {
      const repoConfig = await loadDysflowConfigAsync({ env: this.env, cwd: this.cwd });
      if (repoConfig.ok) {
        return successResult({
          ...repoConfig.data,
          accessPath: repoConfig.data.accessDbPath,
          destinationRoot: stringValue(params.destinationRoot) ?? repoConfig.data.destinationRoot ?? repoConfig.data.projectRoot ?? this.cwd,
        });
      }
      return repoConfig;
    }

    const destinationRoot = stringValue(params.destinationRoot) ?? stringValue(params.projectRoot) ?? this.destinationRoot ?? this.cwd;
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

  private validateStrictContext(params: Record<string, unknown>, target: { accessPath?: string; destinationRoot: string; projectRoot?: string }): OperationResult<undefined> {
    if (!truthy(params.strictContext) && !truthy(params.strictWrite)) return successResult(undefined);
    const checks: Array<[string, string | undefined, string | undefined]> = [
      ["expectedAccessPath", stringValue(params.expectedAccessPath), target.accessPath],
      ["expectedDestinationRoot", stringValue(params.expectedDestinationRoot), target.destinationRoot],
      ["expectedProjectRoot", stringValue(params.expectedProjectRoot), target.projectRoot],
    ];
    for (const [name, expected, actual] of checks) {
      if (expected !== undefined && actual === undefined) {
        return failureResult(createDysflowError("STRICT_CONTEXT_MISMATCH", `${name} was provided but the resolved target has no matching value.`));
      }
      if (expected !== undefined && actual !== undefined && resolve(expected) !== resolve(actual)) {
        return failureResult(createDysflowError("STRICT_CONTEXT_MISMATCH", `${name} does not match resolved target. Expected ${expected}; resolved ${actual}.`));
      }
    }
    return successResult(undefined);
  }

  private async planImport(toolName: "import_all" | "import_modules", params: Record<string, unknown>): Promise<OperationResult<ImportPlanResult>> {
    const target = await this.resolveExecutionTarget(params);
    if (!target.ok) return target;
    const strict = this.validateStrictContext(params, target.data);
    if (!strict.ok) return strict;

    const requestedModules = stringArray(params.moduleNames);
    const modulesPlanned = toolName === "import_modules"
      ? requestedModules
      : await discoverImportModules(target.data.destinationRoot);
    const warnings: string[] = [];
    const errors: string[] = [];
    await stat(target.data.destinationRoot).catch(() => errors.push(`destinationRoot not found: ${target.data.destinationRoot}`));
    if (target.data.accessPath !== undefined) {
      await stat(target.data.accessPath).catch(() => errors.push(`accessPath not found: ${target.data.accessPath}`));
    }

    return successResult(buildImportPlanResult({
      toolName,
      params,
      target: target.data,
      modulesPlanned,
      warnings,
      errors,
    }));
  }

  private async verifySourceAgainstBinary(toolName: "verify_code" | "verify_binary", params: Record<string, unknown>): Promise<OperationResult<VbaVerifyResult>> {
    const comparison = await this.compareSourceAgainstBinary(params);
    if (!comparison.ok) return comparison;
    return successResult({ operation: toolName, ...comparison.data });
  }

  private async planReconcileBinary(params: Record<string, unknown>): Promise<OperationResult<VbaReconcilePlanResult>> {
    const comparison = await this.compareSourceAgainstBinary(params);
    if (!comparison.ok) return comparison;
    return successResult({
      operation: "reconcile_binary",
      ...comparison.data,
      recommendation: comparison.data.ok
        ? "Source and Access binary exports already match; no reconciliation is needed."
        : "Dry-run only: review differences, then run an explicit import/export workflow if you want to reconcile.",
    });
  }

  private async compareSourceAgainstBinary(params: Record<string, unknown>): Promise<OperationResult<Omit<VbaVerifyResult, "operation">>> {
    const target = await this.resolveExecutionTarget(params);
    if (!target.ok) return target;
    const strict = this.validateStrictContext(params, target.data);
    if (!strict.ok) return strict;

    const sourceRoot = target.data.destinationRoot;
    const tempExportRoot = await mkdtemp(resolve(tmpdir(), "dysflow-vba-verify-"));
    const password = this.accessPassword;
    const effectiveTimeoutMs = typeof params.timeoutMs === "number" && params.timeoutMs > 0
      ? params.timeoutMs
      : target.data.processTimeoutMs;
    try {
      const request: VbaManagerExecutionRequest = {
        scriptPath: this.scriptPath,
        action: "Export",
        accessPath: target.data.accessPath,
        destinationRoot: tempExportRoot,
        moduleNames: stringArray(params.moduleNames),
        password,
        json: false,
        extra: {},
        timeoutMs: effectiveTimeoutMs,
        env: password === undefined ? undefined : { DYSFLOW_ACCESS_PASSWORD: password, ACCESS_VBA_PASSWORD: password },
      };

      const preflightDiagnostics = diagnosticsFromPreflightCleanup(await this.runPreflightCleanup(target.data));
      const result = await this.executeWithTimeout(request);
      const secrets = [password].filter((secret): secret is string => Boolean(secret));
      if (result.timedOut) {
        return failureResult(
          createDysflowError("VBA_MANAGER_TIMEOUT", `verify export timed out after ${result.durationMs}ms`, { retryable: true }),
          { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
        );
      }
      if (result.exitCode !== 0) {
        return failureResult(
          createDysflowError("VBA_MANAGER_FAILED", `verify export failed with exit code ${result.exitCode ?? "unknown"}: ${sanitizeSecrets(result.stderr || result.stdout || "No output.", secrets)}`),
          { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
        );
      }

      const comparison = await compareVbaSourceTrees(sourceRoot, tempExportRoot, stringArray(params.moduleNames), truthy(params.diff));
      return successResult(comparison, { diagnostics: preflightDiagnostics, durationMs: result.durationMs });
    } finally {
      await rm(tempExportRoot, { recursive: true, force: true });
    }
  }

  private async executeWithTimeout(request: VbaManagerExecutionRequest): Promise<VbaManagerExecutionResult> {
    const controller = new AbortController();
    const requestWithSignal = { ...request, signal: controller.signal };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<VbaManagerExecutionResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ exitCode: null, stdout: "", stderr: "", durationMs: request.timeoutMs, timedOut: true });
      }, request.timeoutMs);
    });
    const execution = this.executor(requestWithSignal).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
    return Promise.race([execution, timeout]);
  }

  private async executeTestVba(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    if (truthy(params.compile)) {
      const compileResult = await this.executeMappedTool("compile_vba", params, DIRECT_MAPPINGS.compile_vba);
      if (!compileResult.ok) return compileResult;
    }

    const directProceduresJson = stringValue(params.proceduresJson);
    if (directProceduresJson !== undefined) {
      const directPlan = validateTestProceduresJson(directProceduresJson);
      if (!directPlan.ok) return directPlan;
      return inspectTestResult(await this.executeMappedTool("test_vba", { ...params, proceduresJson: directPlan.data }, DIRECT_MAPPINGS.test_vba));
    }

    const planResult = await this.resolveTestProceduresJson(params);
    if (!planResult.ok) return planResult;
    return inspectTestResult(await this.executeMappedTool("test_vba", { ...params, proceduresJson: planResult.data }, DIRECT_MAPPINGS.test_vba));
  }

  private async resolveTestProceduresJson(params: Record<string, unknown>): Promise<OperationResult<string>> {
    try {
      const procedureName = stringValue(params.procedureName);
      if (procedureName !== undefined) {
        const parsed = parseArgsJson(params.argsJson);
        if (!parsed.ok) return failureResult(createDysflowError("VBA_INVALID_TEST_PLAN", parsed.error));
        return successResult(JSON.stringify([{ procedure: procedureName, args: parsed.value }]));
      }

      const projectRoot = stringValue(params.projectRoot) || this.cwd;
      const testsPath = stringValue(params.testsPath) ?? "tests.vba.json";
      const resolvedPath = isAbsolute(testsPath) ? testsPath : resolve(projectRoot, testsPath);
      const parsed = await readJsonFileAsync<unknown>(resolvedPath);
      const tests = normalizeTestPlan(parsed);
      const filterParts = parseTestFilter(params.filter);
      const selected = filterParts === undefined ? tests : tests.filter((test) => matchesTestFilter(test, filterParts));
      if (selected.length === 0) {
        return failureResult(createDysflowError(
          "VBA_NO_TESTS_SELECTED",
          `No VBA tests selected from ${resolvedPath}${stringValue(params.filter) !== undefined ? ` with filter "${stringValue(params.filter)}"` : ""}.`,
        ));
      }
      return successResult(JSON.stringify(selected.map((test) => ({ procedure: test.procedure, args: test.args }))));
    } catch (err) {
      return failureResult(createDysflowError("VBA_INVALID_TEST_PLAN", err instanceof Error ? err.message : String(err)));
    }
  }

  private async validateFormSpec(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const spec = await this.resolveFormSpec(params);
    if (!spec.ok) return spec;
    return successResult({
      valid: true,
      name: spec.data.name,
      kind: spec.data.kind,
      controlCount: spec.data.controls.length,
      controls: spec.data.controls,
      specPath: spec.data.specPath,
    });
  }

  private async generateForm(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const spec = await this.resolveFormSpec(params);
    if (!spec.ok) return spec;

    const destinationRoot = stringValue(params.destinationRoot) || stringValue(params.projectRoot) || this.cwd;
    const formsDir = resolve(destinationRoot, "forms");
    await mkdir(formsDir, { recursive: true });

    const fileName = `${spec.data.name}.${spec.data.kind === "Report" ? "report" : "form"}.json`;
    const outputPath = resolve(formsDir, fileName);
    const payload = JSON.stringify({
      name: spec.data.name,
      kind: spec.data.kind,
      controls: spec.data.controls,
      generatedAt: new Date().toISOString(),
    }, null, 2);
    await writeFile(outputPath, payload, "utf8");

    return successResult({
      generated: true,
      outputPath,
      name: spec.data.name,
      kind: spec.data.kind,
      controlCount: spec.data.controls.length,
    });
  }

  private async catalogAddControl(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const spec = await this.resolveFormSpec(params);
    if (!spec.ok) return spec;

    const destinationRoot = stringValue(params.destinationRoot) || stringValue(params.projectRoot) || this.cwd;
    const catalogPath = stringValue(params.catalogPath) ?? resolve(destinationRoot, "forms", "catalog.json");
    const controlName = stringValue(params.controlName) ?? stringValue(params.name);
    if (controlName === undefined) {
      return failureResult(createDysflowError("FORM_SPEC_INVALID", "catalog_add_control requires controlName."));
    }
    const controlType = stringValue(params.controlType) ?? stringValue(params.type);
    if (controlType === undefined) {
      return failureResult(createDysflowError("FORM_SPEC_INVALID", "catalog_add_control requires controlType."));
    }
    const catalog = await readJsonFileAsync<Record<string, unknown>>(catalogPath).catch(() => ({} as Record<string, unknown>));
    const forms = isRecord(catalog.forms) ? catalog.forms as Record<string, unknown> : {};
    const controls = Array.isArray(forms[spec.data.name]) ? forms[spec.data.name] as unknown[] : [];
    controls.push({ name: controlName, type: controlType });
    forms[spec.data.name] = controls;
    const updated = { ...catalog, forms };
    try {
      await mkdir(resolve(catalogPath, ".."), { recursive: true });
      await writeFile(catalogPath, JSON.stringify(updated, null, 2), "utf8");
    } catch (err) {
      return failureResult(createDysflowError("VBA_CATALOG_WRITE_FAILED", err instanceof Error ? err.message : String(err)));
    }

    return successResult({
      catalogPath,
      formName: spec.data.name,
      controlCount: controls.length,
    });
  }

  private async harvestFormCatalog(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const destinationRoot = stringValue(params.destinationRoot) || stringValue(params.projectRoot) || this.cwd;
    const formsDir = resolve(destinationRoot, "forms");
    const reportsDir = resolve(destinationRoot, "reports");
    const catalog: Array<Record<string, unknown>> = [];
    for (const folder of [formsDir, reportsDir]) {
      const kind = folder === reportsDir ? "Report" : "Form";
      const entries = await this.safeReadDir(folder);
      for (const entry of entries) {
        if (!entry.toLowerCase().endsWith(".json")) continue;
        if (!entry.toLowerCase().endsWith(".form.json") && !entry.toLowerCase().endsWith(".report.json")) continue;
        const spec = await readJsonFileAsync<Record<string, unknown>>(resolve(folder, entry)).catch(() => undefined);
        if (spec === undefined) continue;
        const controls = Array.isArray(spec.controls) ? spec.controls : [];
        catalog.push({
          name: stringValue(spec.name) ?? entry.replace(/\.(form|report)\.json$/i, ""),
          kind: stringValue(spec.kind) ?? kind,
          controls: controls.length,
          specPath: resolve(folder, entry),
        });
      }
    }

    return successResult({
      destinationRoot,
      forms: catalog.filter((item) => item.kind === "Form"),
      reports: catalog.filter((item) => item.kind === "Report"),
      total: catalog.length,
    });
  }

  private async resolveFormSpec(params: Record<string, unknown>): Promise<OperationResult<{ name: string; kind: "Form" | "Report"; controls: readonly { name: string; type: string }[]; specPath?: string }>> {
    const specFromInput = isRecord(params.spec) ? params.spec : undefined;
    const specPath = stringValue(params.specPath);
    const loaded = specFromInput ?? (specPath ? await readJsonFileAsync<Record<string, unknown>>(specPath) : undefined);
    if (loaded === undefined) {
      return failureResult(createDysflowError("FORM_SPEC_MISSING", "validate_form_spec requires spec or specPath."));
    }
    const name = stringValue(loaded.name) ?? stringValue(params.name);
    if (name === undefined) {
      return failureResult(createDysflowError("FORM_SPEC_INVALID", "Form spec requires a name."));
    }
    const kindText = stringValue(loaded.kind) ?? stringValue(params.kind) ?? (name.startsWith("Report_") ? "Report" : "Form");
    if (kindText !== "Form" && kindText !== "Report") {
      return failureResult(createDysflowError("FORM_SPEC_INVALID", `Unsupported form kind: ${kindText}`));
    }
    const controls = Array.isArray(loaded.controls)
      ? loaded.controls
          .filter(isRecord)
          .map((control) => ({
            name: stringValue(control.name) ?? "",
            type: stringValue(control.type) ?? stringValue(control.controlType) ?? "Unknown",
          }))
          .filter((control) => control.name.length > 0)
      : [];

    return successResult({
      name,
      kind: kindText as "Form" | "Report",
      controls,
      specPath,
    });
  }

  private async safeReadDir(path: string): Promise<string[]> {
    try {
      return await readdir(path);
    } catch {
      return [];
    }
  }
}

function validateVbaManagerExtra(extra: Record<string, string | boolean | number | undefined>): OperationResult<undefined> {
  for (const key of Object.keys(extra)) {
    if (!VBA_MANAGER_EXTRA_KEYS.has(key)) {
      return failureResult(createDysflowError("VBA_MANAGER_EXTRA_NOT_ALLOWED", `Unsupported VBA manager option: ${key}.`));
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
    configSource: target.configSource === "explicit-request" ? "explicit-overrides" : target.configSource,
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

export function resolveDefaultVbaManagerScriptPath(env: Record<string, string | undefined> = process.env): string {
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
  extra: (input: Record<string, unknown>) => Record<string, string | boolean | number | undefined> = () => ({}),
): DirectMapping {
  return { action, json, moduleNames, extra };
}

async function createDefaultPreflightCleanup(projectRoot: string): Promise<AccessOperationPreflightCleanup> {
  const { WindowsMsAccessProcessInspector, WindowsMsAccessProcessScanner, WindowsProcessKiller } = await import("../operations/windows-processes.js");
  return new AccessOperationPreflightCleanupService({
    registry: new FileAccessOperationRegistry({ filePath: resolveProjectOperationRegistryPath({ projectRoot }) }),
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
  for (const folder of [destinationRoot, resolve(destinationRoot, "modules"), resolve(destinationRoot, "classes"), resolve(destinationRoot, "forms")]) {
    const entries = await readdir(folder).catch(() => []);
    for (const entry of entries) {
      const extension = extname(entry).toLowerCase();
      if (![".bas", ".cls", ".frm"].includes(extension)) continue;
      modules.push(parse(entry).name);
    }
  }
  return Array.from(new Set(modules)).sort();
}

async function compareVbaSourceTrees(sourceRoot: string, binaryExportRoot: string, moduleNames: readonly string[], includeDiffs: boolean): Promise<Omit<VbaVerifyResult, "operation">> {
  const moduleFilter = new Set(moduleNames.map((name) => name.toLowerCase()));
  const sourceFiles = await collectVbaSourceFiles(sourceRoot, moduleFilter);
  const binaryFiles = await collectVbaSourceFiles(binaryExportRoot, moduleFilter);
  const sourceByKey = new Map(sourceFiles.map((file) => [comparisonKey(file), file]));
  const binaryByKey = new Map(binaryFiles.map((file) => [comparisonKey(file), file]));
  const matched: VbaSourceComparisonEntry[] = [];
  const different: VbaSourceComparisonEntry[] = [];
  const missingInSource: VbaSourceComparisonEntry[] = [];
  const missingInBinary: VbaSourceComparisonEntry[] = [];
  const diffs: VbaSourceDiffEntry[] = [];

  for (const [key, binaryFile] of binaryByKey) {
    const sourceFile = sourceByKey.get(key);
    if (sourceFile === undefined) {
      missingInSource.push(toComparisonEntry(undefined, binaryFile));
      continue;
    }

    const [sourceText, binaryText] = await Promise.all([
      readFile(sourceFile.path, "utf8"),
      readFile(binaryFile.path, "utf8"),
    ]);
    const entry = toComparisonEntry(sourceFile, binaryFile);
    if (sourceText === binaryText) {
      matched.push(entry);
    } else {
      different.push(entry);
      if (includeDiffs) {
        diffs.push({
          ...entry,
          sourceSnippet: firstDifferentLineSnippet(sourceText, binaryText, "source"),
          binarySnippet: firstDifferentLineSnippet(binaryText, sourceText, "binary"),
        });
      }
    }
  }

  for (const [key, sourceFile] of sourceByKey) {
    if (!binaryByKey.has(key)) missingInBinary.push(toComparisonEntry(sourceFile, undefined));
  }

  return {
    ok: different.length === 0 && missingInSource.length === 0 && missingInBinary.length === 0,
    dryRun: true,
    willModifyAccess: false,
    sourceRoot,
    matched: sortComparisonEntries(matched),
    different: sortComparisonEntries(different),
    missingInSource: sortComparisonEntries(missingInSource),
    missingInBinary: sortComparisonEntries(missingInBinary),
    ...(includeDiffs ? { diffs: sortDiffEntries(diffs) } : {}),
  };
}

async function collectVbaSourceFiles(root: string, moduleFilter: ReadonlySet<string>): Promise<VbaSourceComparisonFile[]> {
  const files: VbaSourceComparisonFile[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const fileType = vbaSourceFileType(entry.name);
      if (fileType === undefined) continue;
      const moduleName = moduleNameFromVbaFile(entry.name);
      if (moduleFilter.size > 0 && !moduleFilter.has(moduleName.toLowerCase())) continue;
      files.push({
        moduleName,
        fileType,
        path,
        relativePath: relative(root, path).replace(/\\/g, "/"),
      });
    }
  }

  await visit(root);
  return files;
}

function vbaSourceFileType(fileName: string): string | undefined {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".form.txt")) return "form.txt";
  if (lower.endsWith(".report.txt")) return "report.txt";
  const extension = extname(lower);
  if (extension === ".bas" || extension === ".cls" || extension === ".frm") return extension.slice(1);
  return undefined;
}

function moduleNameFromVbaFile(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".form.txt")) return fileName.slice(0, -".form.txt".length);
  if (lower.endsWith(".report.txt")) return fileName.slice(0, -".report.txt".length);
  return parse(fileName).name;
}

function comparisonKey(file: VbaSourceComparisonFile): string {
  return `${file.moduleName.toLowerCase()}\0${file.fileType}`;
}

function toComparisonEntry(sourceFile: VbaSourceComparisonFile | undefined, binaryFile: VbaSourceComparisonFile | undefined): VbaSourceComparisonEntry {
  const file = sourceFile ?? binaryFile;
  return {
    moduleName: file?.moduleName ?? "",
    fileType: file?.fileType ?? "",
    sourcePath: sourceFile?.relativePath,
    binaryPath: binaryFile?.relativePath,
  };
}

function sortComparisonEntries(entries: VbaSourceComparisonEntry[]): VbaSourceComparisonEntry[] {
  return entries.sort((left, right) => `${left.moduleName}\0${left.fileType}`.localeCompare(`${right.moduleName}\0${right.fileType}`));
}

function sortDiffEntries(entries: VbaSourceDiffEntry[]): VbaSourceDiffEntry[] {
  return entries.sort((left, right) => `${left.moduleName}\0${left.fileType}`.localeCompare(`${right.moduleName}\0${right.fileType}`));
}

function firstDifferentLineSnippet(leftText: string, rightText: string, label: string): string {
  const leftLines = leftText.split(/\r?\n/);
  const rightLines = rightText.split(/\r?\n/);
  const max = Math.max(leftLines.length, rightLines.length);
  for (let index = 0; index < max; index += 1) {
    if (leftLines[index] !== rightLines[index]) return `${label}:${index + 1}: ${leftLines[index] ?? ""}`;
  }
  return `${label}: files differ`;
}

function buildTargetDiagnostics(
  operation: string,
  params: Record<string, unknown>,
  target: Pick<DysflowConfig, "backendPath" | "configSource" | "projectId" | "projectRoot"> & { accessPath?: string; destinationRoot: string },
  willModifyAccess: boolean,
): Record<string, unknown> {
  return {
    operation,
    dryRun: false,
    willModifyAccess,
    requestedProjectId: stringValue(params.projectId),
    requestedContextId: stringValue(params.contextId),
    resolvedProjectId: target.projectId,
    configSource: target.configSource === "explicit-request" ? "explicit-overrides" : target.configSource,
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
  const tests = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.tests) ? value.tests : undefined;
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
      return failureResult(createDysflowError("VBA_NO_TESTS_SELECTED", "proceduresJson must contain at least one VBA test procedure."));
    }
    return successResult(JSON.stringify(procedures.map((test) => ({ procedure: test.procedure, args: test.args }))));
  } catch (err) {
    return failureResult(createDysflowError("VBA_INVALID_TEST_PLAN", err instanceof Error ? err.message : String(err)));
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
  return filterParts.some((filterText) =>
    test.name.toLowerCase().includes(filterText)
    || test.procedure.toLowerCase().includes(filterText)
    || test.tags.some((tag) => tag.toLowerCase().includes(filterText)),
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
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", request.scriptPath, "-Action", request.action, "-DestinationRoot", request.destinationRoot];
  if (request.accessPath) args.push("-AccessPath", request.accessPath);
  if (request.moduleNames.length > 0) args.push("-ModuleNamesJson", JSON.stringify(request.moduleNames));
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
