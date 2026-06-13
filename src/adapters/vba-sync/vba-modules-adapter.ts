import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, parse, resolve } from "node:path";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import {
  buildImportPlanResult,
  type ImportPlanResult,
} from "../../core/services/vba-import-plan.js";
import {
  type ComparisonFileSystemPort,
  compareSourceAgainstBinary,
  planReconcileBinary,
} from "../../core/services/vba-source-comparison.js";
import { stringValue, truthy } from "../../core/utils/index.js";
import { type DirectMapping, mapping, stringArray } from "./vba-sync-types.js";

const nodeComparisonFileSystem: ComparisonFileSystemPort = {
  mkdtemp: (prefix) => mkdtemp(prefix),
  readdir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path, encoding) => readFile(path, encoding),
  readFileBytes: async (path) => {
    const buf = await readFile(path);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  },
  rm: (path, options) => rm(path, options),
  tmpdir: () => tmpdir(),
};

const MODULE_MAPPINGS: Record<string, DirectMapping> = {
  export_modules: mapping("Export", false, (input) => stringArray(input.moduleNames)),
  export_all: mapping("Export", false, (input) => {
    const filter = stringValue(input.filter);
    return filter === undefined ? [] : [filter];
  }),
  import_modules: mapping(
    "Import",
    false,
    (input) => stringArray(input.moduleNames),
    (input) => ({ importMode: normalizeImportMode(stringValue(input.importMode)) }),
  ),
  import_all: mapping(
    "Import",
    false,
    () => [],
    (input) => ({
      importMode: normalizeImportMode(stringValue(input.importMode)),
    }),
  ),
  list_objects: mapping("List-Objects", true),
  exists: mapping("Exists", true, (input) => {
    const moduleName = stringValue(input.moduleName) || stringValue(input.name);
    return moduleName ? [moduleName] : [];
  }),
  fix_encoding: mapping(
    "Fix-Encoding",
    false,
    (input) => stringArray(input.moduleNames),
    (input) => ({ location: stringValue(input.location) }),
  ),
  delete_module: mapping("Delete", true, (input) => {
    const moduleNames = stringArray(input.moduleNames);
    const moduleName = stringValue(input.moduleName);
    return moduleNames.length > 0 ? moduleNames : moduleName ? [moduleName] : [];
  }),
};

import type { DysflowConfig } from "../../core/config/dysflow-config.js";
import type { AccessOperationPreflightCleanupResult } from "../../core/operations/access-operation-preflight.js";
import type { VbaExecutionTarget } from "../../core/services/vba-source-comparison.js";
import type { VbaManagerExecutor } from "./vba-sync-adapter.js";

export type VbaModulesExecutionTarget = VbaExecutionTarget &
  Pick<
    DysflowConfig,
    "accessDbPath" | "backendPath" | "projectRoot" | "projectId" | "configSource"
  >;

export interface VbaModulesOrchestrator {
  scriptPath: string;
  accessPassword?: string;
  cwd: string;
  resolveExecutionTarget(
    params: Record<string, unknown>,
  ): Promise<OperationResult<VbaModulesExecutionTarget>>;
  validateStrictContext(
    params: Record<string, unknown>,
    target: VbaModulesExecutionTarget,
  ): OperationResult<undefined>;
  runPreflightCleanup(
    target: VbaModulesExecutionTarget,
  ): Promise<AccessOperationPreflightCleanupResult>;
  executor: VbaManagerExecutor;
  executeMappedTool(
    toolName: string,
    params: Record<string, unknown>,
    mapping: DirectMapping,
  ): Promise<OperationResult<unknown>>;
}

export class VbaModulesAdapter {
  constructor(private readonly orchestrator: VbaModulesOrchestrator) {}

  static handles(toolName: string): boolean {
    return (
      toolName === "export_modules" ||
      toolName === "export_all" ||
      toolName === "import_modules" ||
      toolName === "import_all" ||
      toolName === "list_objects" ||
      toolName === "exists" ||
      toolName === "verify_code" ||
      toolName === "verify_binary" ||
      toolName === "reconcile_binary" ||
      toolName === "delete_module" ||
      toolName === "fix_encoding"
    );
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<OperationResult<unknown>> {
    if (toolName === "verify_code" || toolName === "verify_binary") {
      return compareSourceAgainstBinary(
        toolName,
        params,
        this.getComparisonContext(),
        nodeComparisonFileSystem,
      );
    }
    if (toolName === "reconcile_binary") {
      return planReconcileBinary(params, this.getComparisonContext(), nodeComparisonFileSystem);
    }

    if (truthy(params.dryRun) && (toolName === "import_all" || toolName === "import_modules")) {
      return this.planImport(toolName, params);
    }

    const mapping = MODULE_MAPPINGS[toolName];
    if (mapping === undefined) {
      return failureResult(
        createDysflowError(
          "TOOL_NOT_IMPLEMENTED",
          `Tool ${toolName} not supported by VbaModulesAdapter.`,
        ),
      );
    }

    // For export_modules/export_all: exportPath overrides destinationRoot so the export goes to
    // the caller-specified directory instead of the project's default src/ folder (issue #185).
    const exportPath = stringValue(params.exportPath);
    const effectiveParams =
      (toolName === "export_modules" || toolName === "export_all") && exportPath !== undefined
        ? { ...params, destinationRoot: exportPath }
        : params;

    return this.orchestrator.executeMappedTool(toolName, effectiveParams, mapping);
  }

  private getComparisonContext() {
    return {
      scriptPath: this.orchestrator.scriptPath,
      accessPassword: this.orchestrator.accessPassword,
      resolveExecutionTarget: this.orchestrator.resolveExecutionTarget.bind(this.orchestrator),
      validateStrictContext: this.orchestrator.validateStrictContext.bind(this.orchestrator),
      runPreflightCleanup: this.orchestrator.runPreflightCleanup.bind(this.orchestrator),
      runVbaManager: this.orchestrator.executor.bind(this.orchestrator),
    };
  }

  private async planImport(
    toolName: "import_all" | "import_modules",
    params: Record<string, unknown>,
  ): Promise<OperationResult<ImportPlanResult>> {
    const target = await this.orchestrator.resolveExecutionTarget(params);
    if (!target.ok) return target;
    const strict = this.orchestrator.validateStrictContext(params, target.data);
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

    const effectiveParams = {
      ...params,
      importMode: normalizeImportMode(stringValue(params.importMode)),
    };

    return successResult(
      buildImportPlanResult({
        toolName,
        params: effectiveParams,
        target: target.data,
        modulesPlanned,
        warnings,
        errors,
      }),
    );
  }
}

function normalizeImportMode(importMode: string | undefined): string | undefined {
  if (importMode === undefined) return undefined;
  switch (importMode.toLowerCase()) {
    case "auto":
    case "replace":
      return "Auto";
    case "form":
      return "Form";
    case "code":
      return "Code";
    default:
      return importMode;
  }
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
