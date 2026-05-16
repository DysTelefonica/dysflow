import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { createDysflowError, failureResult, successResult, type OperationResult } from "../contracts/index.js";

export type VbaManagerExecutionRequest = {
  scriptPath: string;
  action: string;
  accessPath?: string;
  destinationRoot: string;
  moduleNames: readonly string[];
  password?: string;
  json: boolean;
  extra: Record<string, string | boolean | number | undefined>;
};

export type VbaManagerExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type VbaManagerExecutor = (request: VbaManagerExecutionRequest) => Promise<VbaManagerExecutionResult>;

export type VbaSyncLegacyServiceOptions = {
  executor?: VbaManagerExecutor;
  scriptPath?: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
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
  exists: mapping("Exists", true, (input) => { const moduleName = stringValue(input.moduleName); return moduleName ? [moduleName] : []; }),
  run_vba: mapping("Run-Procedure", true, () => [], (input) => ({ procedureName: stringValue(input.procedureName), argsJson: stringValue(input.argsJson), reuseInstance: booleanValue(input.reuseInstance) })),
  test_vba: mapping("Run-Tests", true, () => [], (input) => ({ proceduresJson: directTestProceduresJson(input), reuseInstance: booleanValue(input.reuseInstance) })),
  compile_vba: mapping("Compile", true),
  fix_encoding: mapping("Fix-Encoding", false, (input) => stringArray(input.moduleNames), (input) => ({ location: stringValue(input.location) })),
  delete_module: mapping("Delete", true, (input) => stringArray(input.moduleNames)),
  generate_erd: mapping("Generate-ERD", false, () => [], (input) => ({ backendPath: stringValue(input.backendPath), erdPath: stringValue(input.erdPath) })),
};

const HIGHER_LEVEL_TOOLS: Record<string, string> = {
  verify_code: "verify_code requires source document/code-behind comparison and is tracked by #25.",
  verify_binary: "verify_binary requires a higher-level source/binary comparison implementation and is tracked by #25.",
  reconcile_binary: "reconcile_binary requires source/binary reconciliation and is tracked by #25.",
  init_project: "init_project requires project bootstrap orchestration and is tracked by #25.",
  normalize_documents: "normalize_documents requires source document normalization and is tracked by #25.",
  validate_form_spec: "validate_form_spec is tracked by #29 form generation parity.",
  generate_form: "generate_form is tracked by #29 form generation parity.",
  catalog_add_control: "catalog_add_control is tracked by #29 form generation parity.",
  harvest_form_catalog: "harvest_form_catalog is tracked by #29 form generation parity.",
};

export class VbaSyncLegacyService {
  private readonly executor: VbaManagerExecutor;
  private readonly scriptPath: string;
  private readonly env: Record<string, string | undefined>;
  private readonly cwd: string;

  constructor(options: VbaSyncLegacyServiceOptions = {}) {
    this.env = options.env ?? process.env;
    this.executor = options.executor ?? spawnVbaManager;
    this.scriptPath = options.scriptPath ?? resolveDefaultVbaManagerScriptPath(this.env);
    this.cwd = options.cwd ?? process.cwd();
  }

  async execute(toolName: string, input: unknown): Promise<OperationResult<unknown>> {
    const params = isRecord(input) ? input : {};
    if (toolName === "test_vba") return this.executeTestVba(params);
    if (toolName === "verify_code") return this.executeVerifyCode(params);
    if (toolName === "verify_binary") return this.executeVerifyBinary(params);
    if (toolName === "reconcile_binary") return this.executeReconcileBinary(params);
    const mapping = DIRECT_MAPPINGS[toolName];
    if (mapping === undefined) {
      return failureResult(createDysflowError("LEGACY_TOOL_NOT_IMPLEMENTED", HIGHER_LEVEL_TOOLS[toolName] ?? `${toolName} is tracked for legacy parity but not implemented by this service yet.`));
    }

    return this.executeMappedTool(toolName, params, mapping);
  }

  private async executeMappedTool(toolName: string, params: Record<string, unknown>, mapping: DirectMapping): Promise<OperationResult<unknown>> {
    const destinationRoot = stringValue(params.destinationRoot) || stringValue(params.projectRoot) || this.cwd;
    const accessContext = resolveSafeAccessContext(params, destinationRoot, this.cwd);
    if (!accessContext.ok) return accessContext;
    const password = this.env.ACCESS_VBA_PASSWORD;
    const request: VbaManagerExecutionRequest = {
      scriptPath: this.scriptPath,
      action: mapping.action,
      accessPath: accessContext.data.accessPath,
      destinationRoot,
      moduleNames: mapping.moduleNames(params),
      password,
      json: mapping.json ?? false,
      extra: mapping.extra(params),
    };

    const result = await this.executor(request);
    const secrets = [password].filter((secret): secret is string => Boolean(secret));
    if (result.exitCode !== 0) {
      return failureResult(
        createDysflowError("VBA_MANAGER_FAILED", `${toolName} failed with exit code ${result.exitCode ?? "unknown"}: ${sanitize(result.stderr || result.stdout || "No output.", secrets)}`),
        { durationMs: result.durationMs },
      );
    }

    return successResult(parseOutput(result.stdout, secrets), { durationMs: result.durationMs });
  }

  private async executeTestVba(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    if (truthy(params.compile)) {
      const compileResult = await this.executeMappedTool("compile_vba", params, DIRECT_MAPPINGS.compile_vba);
      if (!compileResult.ok) return compileResult;
    }

    const plan = await this.resolveTestPlan(params);
    const result = await this.executeMappedTool("test_vba", { ...params, proceduresJson: plan.proceduresJson }, DIRECT_MAPPINGS.test_vba);
    if (!result.ok) return result;
    return successResult(buildTestReport(plan, result.data, result.durationMs), { durationMs: result.durationMs, operation: result.operation });
  }

  private async resolveTestPlan(params: Record<string, unknown>): Promise<ResolvedTestPlan> {
    const procedureName = stringValue(params.procedureName);
    if (procedureName !== undefined) {
      const test = { name: procedureName, procedure: procedureName, args: parseArgsJson(params.argsJson), tags: ["direct"], expect: {} };
      return {
        testsPath: null,
        totalInPlan: 1,
        selected: [test],
        proceduresJson: JSON.stringify([{ procedure: test.procedure, args: test.args }]),
      };
    }

    const destinationRoot = stringValue(params.destinationRoot) || stringValue(params.projectRoot) || this.cwd;
    const testsPath = stringValue(params.testsPath) ?? "tests.vba.json";
    const resolvedPath = isAbsolute(testsPath) ? testsPath : resolve(destinationRoot, testsPath);
    const raw = await readFile(resolvedPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const tests = normalizeTestPlan(parsed);
    const filterText = stringValue(params.filter)?.toLowerCase();
    const selected = filterText === undefined ? tests : tests.filter((test) =>
      test.name.toLowerCase().includes(filterText)
      || test.procedure.toLowerCase().includes(filterText)
      || test.tags.some((tag) => tag.toLowerCase().includes(filterText)),
    );
    return {
      testsPath: resolvedPath,
      totalInPlan: tests.length,
      selected,
      proceduresJson: JSON.stringify(selected.map((test) => ({ procedure: test.procedure, args: test.args }))),
    };
  }

  private async executeVerifyCode(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const sourceRoot = stringValue(params.destinationRoot) || stringValue(params.projectRoot) || this.cwd;
    const moduleNames = stringArray(params.moduleNames);
    const strict = truthy(params.strict);
    const targets = moduleNames.length > 0 ? moduleNames : await listDocumentModuleNames(sourceRoot);
    const results = [];

    for (const moduleName of targets) {
      const artifacts = await resolveDocumentArtifacts(sourceRoot, moduleName);
      if (artifacts === undefined) {
        results.push({ moduleName, status: "missing_document" });
        continue;
      }
      if (artifacts.clsPath === undefined) {
        results.push({ moduleName, status: "missing_cls", textPath: artifacts.textPath });
        continue;
      }

      const documentText = await readFile(artifacts.textPath, "utf8");
      const clsText = await readFile(artifacts.clsPath, "utf8");
      const documentBody = extractDocumentCodeBehindBody(documentText);
      if (documentBody === undefined) {
        results.push({ moduleName, status: "missing_codebehind", textPath: artifacts.textPath, clsPath: artifacts.clsPath });
        continue;
      }
      const left = normalizeVbaBody(stripVbaMetadata(documentBody), strict);
      const right = normalizeVbaBody(stripVbaMetadata(clsText), strict);
      results.push({
        moduleName,
        status: left === right ? "in_sync" : "mismatch",
        textPath: artifacts.textPath,
        clsPath: artifacts.clsPath,
      });
    }

    const mismatches = results.filter((result) => result.status === "mismatch").length;
    return successResult({
      ok: mismatches === 0,
      checked: results.length,
      mismatches,
      results,
    });
  }

  private async executeVerifyBinary(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const sourceRoot = stringValue(params.destinationRoot) || stringValue(params.projectRoot) || this.cwd;
    const tempRoot = await mkdtemp(join(tmpdir(), "dysflow-verify-binary-"));
    try {
      const exportResult = await this.executeMappedTool("export_all", { ...params, projectRoot: sourceRoot, destinationRoot: tempRoot }, DIRECT_MAPPINGS.export_all);
      if (!exportResult.ok) return exportResult;

      const report = await buildBinaryVerificationReport({
        sourceRoot,
        binaryRoot: tempRoot,
        moduleNames: stringArray(params.moduleNames),
        strict: truthy(params.strict),
        accessPath: stringValue(params.accessPath) || this.env.DYSFLOW_ACCESS_DB_PATH,
      });
      return successResult(report, { durationMs: exportResult.durationMs, operation: exportResult.operation });
    } finally {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async executeReconcileBinary(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    if (truthy(params.apply)) {
      return failureResult(createDysflowError(
        "RECONCILE_BINARY_APPLY_NOT_IMPLEMENTED",
        "reconcile_binary apply=true is intentionally deferred to a separate safety-reviewed slice.",
      ));
    }

    const report = await this.executeVerifyBinary(params);
    if (!report.ok) return report;
    return successResult({ ...(report.data as Record<string, unknown>), applied: false }, { durationMs: report.durationMs, operation: report.operation });
  }
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function directTestProceduresJson(input: Record<string, unknown>): string | undefined {
  return stringValue(input.proceduresJson);
}

function resolveSafeAccessContext(params: Record<string, unknown>, destinationRoot: string, cwd: string): OperationResult<{ accessPath: string; projectRoot: string }> {
  const accessPath = stringValue(params.accessPath);
  if (accessPath === undefined) {
    return failureResult(createDysflowError(
      "ACCESS_PATH_REQUIRED",
      "Access-touching legacy tools require an explicit absolute accessPath in multi-project mode.",
    ));
  }
  if (!isAbsolute(accessPath)) {
    return failureResult(createDysflowError("ACCESS_PATH_NOT_ABSOLUTE", "accessPath must be absolute."));
  }
  const projectRoot = stringValue(params.projectRoot) || destinationRoot || cwd;
  const resolvedProjectRoot = resolve(projectRoot);
  const resolvedAccessPath = resolve(accessPath);
  const rel = relative(resolvedProjectRoot, resolvedAccessPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return failureResult(createDysflowError(
      "ACCESS_PATH_PROJECT_MISMATCH",
      "Resolved accessPath is outside projectRoot/destinationRoot. Refusing to touch Access.",
    ));
  }
  return successResult({ accessPath, projectRoot: resolvedProjectRoot });
}

function booleanValue(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  return value === true || value === "true" || value === 1 || value === "1";
}

function parseArgsJson(value: unknown): unknown[] {
  const text = stringValue(value);
  if (text === undefined) return [];
  const parsed = JSON.parse(text) as unknown;
  return Array.isArray(parsed) ? parsed : [parsed];
}

type VbaTestPlanEntry = {
  name: string;
  procedure: string;
  args: unknown[];
  tags: string[];
  expect: Record<string, unknown>;
};

type ResolvedTestPlan = {
  testsPath: string | null;
  totalInPlan: number;
  selected: VbaTestPlanEntry[];
  proceduresJson: string;
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
    const expect = isRecord(item.expect) ? item.expect : {};
    return {
      name: stringValue(item.name) ?? procedure,
      procedure,
      args,
      tags,
      expect,
    };
  });
}

function buildTestReport(plan: ResolvedTestPlan, runnerData: unknown, durationMs: number): Record<string, unknown> {
  const rawResults = Array.isArray(runnerData) ? runnerData : [];
  const results = plan.selected.map((test, index) => {
    const run = isRecord(rawResults[index]) ? rawResults[index] : { ok: false, procedure: test.procedure, error: "No result returned from runner" };
    const assertion = evaluateExpectation(run, test.expect);
    return {
      name: test.name,
      procedure: test.procedure,
      args: test.args,
      tags: test.tags,
      durationMs: typeof run.durationMs === "number" ? run.durationMs : undefined,
      ok: assertion.ok,
      failures: assertion.failures,
      run,
      logs: Array.isArray(run.logs) ? run.logs : [],
    };
  });
  const failed = results.filter((result) => result.ok !== true).length;
  const report = {
    ok: failed === 0,
    phase: "tests",
    testsPath: plan.testsPath,
    total: plan.selected.length,
    passed: plan.selected.length - failed,
    failed,
    skipped: plan.totalInPlan - plan.selected.length,
    durationMs,
    results,
  };
  return {
    ...report,
    summary: {
      total: report.total,
      passed: report.passed,
      failed: report.failed,
      skipped: report.skipped,
      testsPath: report.testsPath,
      text: `Total: ${report.total} | Passed: ${report.passed} | Failed: ${report.failed} | Skipped: ${report.skipped}`,
      failures: results.filter((result) => result.ok !== true).map((result) => ({
        name: result.name,
        procedure: result.procedure,
        failures: result.failures,
        logs: result.logs,
        error: isRecord(result.run) && typeof result.run.error === "string" ? result.run.error : null,
      })),
    },
  };
}

function evaluateExpectation(run: Record<string, unknown>, expected: Record<string, unknown>): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (Object.prototype.hasOwnProperty.call(expected, "ok")) {
    if (run.ok !== expected.ok) failures.push(`ok esperado ${String(expected.ok)}, recibido ${String(run.ok)}`);
  } else if (run.ok !== true) {
    failures.push(`ok esperado true, recibido ${String(run.ok)}`);
  }
  if (Object.prototype.hasOwnProperty.call(expected, "returnValue") && !jsonEqual(run.returnValue, expected.returnValue)) {
    failures.push(`returnValue esperado ${JSON.stringify(expected.returnValue)}, recibido ${JSON.stringify(run.returnValue)}`);
  }
  return { ok: failures.length === 0, failures };
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function truthy(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

async function listDocumentModuleNames(sourceRoot: string): Promise<string[]> {
  const folders = [
    { dir: join(sourceRoot, "forms"), suffix: ".form.txt" },
    { dir: join(sourceRoot, "reports"), suffix: ".report.txt" },
  ];
  const names: string[] = [];
  for (const folder of folders) {
    let entries: string[] = [];
    try {
      entries = await readdir(folder.dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.toLowerCase().endsWith(folder.suffix)) {
        names.push(entry.slice(0, -folder.suffix.length));
      }
    }
  }
  return names.sort();
}

async function resolveDocumentArtifacts(sourceRoot: string, moduleName: string): Promise<{ textPath: string; clsPath?: string } | undefined> {
  const folders = [
    { dir: join(sourceRoot, "forms"), suffix: ".form.txt" },
    { dir: join(sourceRoot, "reports"), suffix: ".report.txt" },
  ];
  for (const folder of folders) {
    const textPath = join(folder.dir, `${moduleName}${folder.suffix}`);
    if (!(await existsFile(textPath))) continue;
    const clsPath = join(folder.dir, `${moduleName.replace(/^(Form|Report)_/i, "")}.cls`);
    return {
      textPath,
      ...(await existsFile(clsPath) ? { clsPath } : {}),
    };
  }
  return undefined;
}

async function existsFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function extractDocumentCodeBehindBody(text: string): string | undefined {
  const normalized = normalizeNewlines(text);
  const match = /^([ \t]*CodeBehind\w*[^\r\n]*)(?:\n|$)/im.exec(normalized);
  if (match === null || match.index === undefined) return undefined;
  return normalized.slice(match.index + match[0].length);
}

function stripVbaMetadata(text: string): string {
  const lines = normalizeNewlines(text).split("\n");
  while (lines.length > 0) {
    const trimmed = (lines[0] ?? "").trim();
    if (trimmed.length === 0 || /^Option\s+/i.test(trimmed) || /^(Attribute|VERSION|BEGIN|END)\b/i.test(trimmed) || /^[A-Za-z][\w]*\s*=/.test(trimmed)) {
      lines.shift();
      continue;
    }
    break;
  }
  return lines.join("\n");
}

function normalizeVbaBody(text: string, strict: boolean): string {
  const normalized = normalizeNewlines(text);
  if (strict) return normalized.trimEnd();
  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

type BinaryCompareArtifact = {
  module: string;
  file: string;
  normalized: string;
};

async function buildBinaryVerificationReport(options: {
  sourceRoot: string;
  binaryRoot: string;
  moduleNames: readonly string[];
  strict: boolean;
  accessPath?: string;
}): Promise<Record<string, unknown>> {
  const sourceArtifacts = await collectBinaryArtifacts(options.sourceRoot, options.strict);
  const binaryArtifacts = await collectBinaryArtifacts(options.binaryRoot, options.strict);
  const requested = new Set(options.moduleNames.map(String));
  const shouldInclude = (module: string): boolean => requested.size === 0 || requested.has(module);
  const moduleNames = [...new Set([...sourceArtifacts.keys(), ...binaryArtifacts.keys()])]
    .filter(shouldInclude)
    .sort();

  const same = [];
  const different = [];
  const sourceOnly = [];
  const binaryOnly = [];

  for (const module of moduleNames) {
    const source = sourceArtifacts.get(module);
    const binary = binaryArtifacts.get(module);
    if (source !== undefined && binary !== undefined) {
      if (source.normalized === binary.normalized) same.push({ module, file: source.file });
      else different.push({ module, file: source.file });
    } else if (source !== undefined) {
      sourceOnly.push({ module, file: source.file });
    } else if (binary !== undefined) {
      binaryOnly.push({ module, file: binary.file });
    }
  }

  return {
    ok: different.length === 0 && sourceOnly.length === 0 && binaryOnly.length === 0,
    accessPath: options.accessPath,
    sourceRoot: options.sourceRoot,
    same,
    different,
    sourceOnly,
    binaryOnly,
    plan: {
      import: [...different, ...sourceOnly].map((item) => item.module).sort(),
      delete: binaryOnly.map((item) => item.module).sort(),
    },
    diffs: [],
  };
}

async function collectBinaryArtifacts(root: string, strict: boolean): Promise<Map<string, BinaryCompareArtifact>> {
  const specs = [
    { dir: "modules", suffix: ".bas" },
    { dir: "classes", suffix: ".cls" },
    { dir: "forms", suffix: ".form.txt" },
    { dir: "reports", suffix: ".report.txt" },
  ];
  const artifacts = new Map<string, BinaryCompareArtifact>();
  for (const spec of specs) {
    const dir = join(root, spec.dir);
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries.sort()) {
      if (!entry.toLowerCase().endsWith(spec.suffix)) continue;
      const file = `${spec.dir}/${entry}`;
      const module = entry.slice(0, -spec.suffix.length);
      const text = await readFile(join(dir, entry), "utf8");
      artifacts.set(module, {
        module,
        file,
        normalized: normalizeBinaryArtifactText(text, spec.suffix, strict),
      });
    }
  }
  return artifacts;
}

function normalizeBinaryArtifactText(text: string, suffix: string, strict: boolean): string {
  if (suffix === ".form.txt" || suffix === ".report.txt") {
    const body = extractDocumentCodeBehindBody(text);
    const ui = body === undefined ? normalizeNewlines(text).trimEnd() : normalizeNewlines(text).slice(0, normalizeNewlines(text).length - body.length).trimEnd();
    const code = body === undefined ? "" : normalizeVbaBody(stripVbaMetadata(body), strict);
    return `${ui}\n${code}`;
  }
  return normalizeVbaBody(stripVbaMetadata(text), strict);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOutput(stdout: string, secrets: readonly string[]): unknown {
  const safe = sanitize(stdout, secrets).trim();
  if (safe.length === 0) return { ok: true };
  try {
    return JSON.parse(safe) as unknown;
  } catch {
    return { ok: true, stdout: safe };
  }
}

function sanitize(value: string, secrets: readonly string[]): string {
  return secrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"), value);
}

const spawnVbaManager: VbaManagerExecutor = (request) => {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", request.scriptPath, "-Action", request.action, "-DestinationRoot", request.destinationRoot];
    if (request.accessPath) args.push("-AccessPath", request.accessPath);
    if (request.moduleNames.length > 0) args.push("-ModuleNamesJson", JSON.stringify(request.moduleNames));
    if (request.password) args.push("-Password", request.password);
    if (request.json) args.push("-Json");
    for (const [key, value] of Object.entries(request.extra)) {
      if (value === undefined) continue;
      const flag = `-${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      args.push(flag, String(value));
    }

    const child = spawn("powershell.exe", args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error: Error) => { stderr += error.message; });
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr, durationMs: Date.now() - startedAt }));
  });
};
