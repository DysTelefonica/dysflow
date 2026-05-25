import type { DysflowConfig } from "../config/dysflow-config.js";
import { stringValue } from "../utils/index.js";

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
