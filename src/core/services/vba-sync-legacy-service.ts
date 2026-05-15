import { spawn } from "node:child_process";
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
  test_vba: mapping("Run-Tests", true, () => [], (input) => ({ proceduresJson: directTestProceduresJson(input) })),
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
    const mapping = DIRECT_MAPPINGS[toolName];
    if (mapping === undefined) {
      return failureResult(createDysflowError("LEGACY_TOOL_NOT_IMPLEMENTED", HIGHER_LEVEL_TOOLS[toolName] ?? `${toolName} is tracked for legacy parity but not implemented by this service yet.`));
    }

    const accessPath = stringValue(params.accessPath) || this.env.DYSFLOW_ACCESS_DB_PATH;
    const destinationRoot = stringValue(params.destinationRoot) || stringValue(params.projectRoot) || this.cwd;
    const password = this.env.DYSFLOW_ACCESS_PASSWORD;
    const request: VbaManagerExecutionRequest = {
      scriptPath: this.scriptPath,
      action: mapping.action,
      accessPath,
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
  const procedureName = stringValue(input.procedureName);
  if (procedureName === undefined) return undefined;
  return JSON.stringify([{ procedure: procedureName, args: parseArgsJson(input.argsJson) }]);
}

function parseArgsJson(value: unknown): unknown[] {
  const text = stringValue(value);
  if (text === undefined) return [];
  const parsed = JSON.parse(text) as unknown;
  return Array.isArray(parsed) ? parsed : [parsed];
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
