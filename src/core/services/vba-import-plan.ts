import type { DysflowConfig } from "../config/dysflow-config.js";
import { stringValue } from "../utils/index.js";

/**
 * Issue #1866 item 3 — per-module verdict for an `import_modules` / `import_all`
 * plan, computed with the same classifier verify_code uses. `classification` is
 * one of sourceNewer, binaryNewer, bothChanged, matched, missingInBinary or
 * missingInSource.
 */
export type ImportPlanModuleClassification = {
  module: string;
  classification: string;
  actionable: boolean;
  recommendation: string;
};

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
  moduleClassifications?: readonly ImportPlanModuleClassification[];
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
  moduleClassifications?: readonly ImportPlanModuleClassification[];
  warnings: readonly string[];
  errors: readonly string[];
};

export function buildImportPlanResult(options: BuildImportPlanResultOptions): ImportPlanResult {
  const { toolName, params, target, modulesPlanned, warnings, errors, moduleClassifications } =
    options;
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
    ...(moduleClassifications === undefined ? {} : { moduleClassifications }),
    warnings,
    errors,
  };
}

const DEFAULT_IMPORT_PLAN_BUDGET_MS = 30_000;
const CLASSIFICATION_RESERVE_RATIO = 0.25;
const CLASSIFICATION_RESERVE_MIN_MS = 10_000;
const CLASSIFICATION_RESERVE_MAX_MS = 30_000;

/**
 * Issue #1908 — deadline for the dry-run classification export. The export
 * spawns Access against a snapshot, so on a timeout dysflow still has to reap
 * that Access and delete the snapshot. Reserving part of the caller's budget
 * (the call's `timeoutMs`, else the project timeout) lets dysflow finish that
 * cleanup and return the plan before the client gives up. The reserve is a
 * quarter of the budget, kept between 10 s and 30 s and never more than half.
 */
export function deriveImportPlanClassificationTimeoutMs(input: {
  callTimeoutMs?: unknown;
  targetTimeoutMs?: number;
  elapsedMs?: number;
}): number {
  const budgetMs =
    typeof input.callTimeoutMs === "number" && input.callTimeoutMs > 0
      ? input.callTimeoutMs
      : (input.targetTimeoutMs ?? DEFAULT_IMPORT_PLAN_BUDGET_MS);
  const reserveMs = Math.min(
    Math.floor(budgetMs / 2),
    CLASSIFICATION_RESERVE_MAX_MS,
    Math.max(CLASSIFICATION_RESERVE_MIN_MS, Math.floor(budgetMs * CLASSIFICATION_RESERVE_RATIO)),
  );
  return Math.max(1, budgetMs - reserveMs - Math.max(0, input.elapsedMs ?? 0));
}

/**
 * Round-3 Item 5 (P2) — dry-run plan shape for `delete_module`. Mirrors
 * `ImportPlanResult` so consumers can read the same envelope fields
 * (`operation`, `dryRun`, `willModifyAccess`, `requestedProjectId`,
 * `configSource`, `accessPath`, `backendPath`, `destinationRoot`,
 * `modulesPlanned`, `modulesCount`, `warnings`, `errors`) regardless of
 * whether the operation was an import or a delete. The `force` flag is the
 * one delete-specific addition so consumers can review whether a forced
 * delete was requested (without `force`, the field is `false`).
 */
export type DeletePlanResult = {
  operation: "delete_module";
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
  force: boolean;
  modulesPlanned: readonly string[];
  modulesCount: number;
  warnings: readonly string[];
  errors: readonly string[];
};

export type BuildDeletePlanResultOptions = {
  params: Record<string, unknown>;
  target: ImportPlanTarget;
  modulesPlanned: readonly string[];
  warnings: readonly string[];
  errors: readonly string[];
};

export function buildDeletePlanResult(options: BuildDeletePlanResultOptions): DeletePlanResult {
  const { params, target, modulesPlanned, warnings, errors } = options;
  return {
    operation: "delete_module",
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
    force: params.force === true,
    modulesPlanned,
    modulesCount: modulesPlanned.length,
    warnings,
    errors,
  };
}

/**
 * Issue #1920 — applied-result shape for `delete_module`. The runner emits one
 * entry per module (`{module, status, deleted, kind}`), where `deleted` is the
 * removed object NAME, and `ConvertTo-Json` unwraps a one-module batch into a
 * bare object. Returned as-is, that bare object put `deleted: "<name>"` at the
 * top level and broke the `deleted: string[]` result contract after Access had
 * already been mutated. This builder gives every batch size one envelope:
 * `deleted` lists the requested module names (matching `modulesPlanned` on the
 * plan path) and `results` keeps the runner's per-module evidence verbatim.
 */
export type DeleteApplyResult = {
  operation: "delete_module";
  dryRun: false;
  willModifyAccess: true;
  deleted: string[];
  modulesCount: number;
  results: Record<string, unknown>[];
};

export function buildDeleteApplyResult(
  runnerPayload: unknown,
  requestedModules: readonly string[],
): DeleteApplyResult {
  const entries = (Array.isArray(runnerPayload) ? runnerPayload : [runnerPayload]).filter(
    (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
  );
  const deletedFromRunner = entries
    .filter((entry) => entry.status === "ok")
    .map((entry) => stringValue(entry.module) ?? stringValue(entry.deleted))
    .filter((name): name is string => name !== undefined);
  const deleted = deletedFromRunner.length > 0 ? deletedFromRunner : [...requestedModules];
  return {
    operation: "delete_module",
    dryRun: false,
    willModifyAccess: true,
    deleted,
    modulesCount: deleted.length,
    results: entries,
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
