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
  type VbaComparisonContext,
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
  delete_module: mapping(
    "Delete",
    true,
    (input) => {
      const moduleNames = stringArray(input.moduleNames);
      const moduleName = stringValue(input.moduleName);
      return moduleNames.length > 0 ? moduleNames : moduleName ? [moduleName] : [];
    },
    (input) => ({ force: input.force === true ? true : undefined }),
  ),
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

/**
 * Compare a single named VBA module semantically against its binary export.
 *
 * Reuses compareSourceAgainstBinary with moduleNames=[moduleName] so the
 * full export+compare+classify pipeline is invoked with no duplicated logic.
 * Returns a single-module result shape: the one classified diff entry (or
 * matched/missing signal) plus the aggregated semantic summary.
 *
 * Errors on unknown module names (not found in source or binary).
 */
async function compareSingleModule(
  params: Record<string, unknown>,
  ctx: VbaComparisonContext,
  fileSystem: ComparisonFileSystemPort,
): Promise<OperationResult<unknown>> {
  const moduleName = stringValue(params.moduleName);
  if (!moduleName) {
    return failureResult(
      createDysflowError("INVALID_INPUT", "compare_module requires a non-empty moduleName."),
    );
  }

  const effectiveParams = { ...params, moduleNames: [moduleName] };
  const result = await compareSourceAgainstBinary("verify_code", effectiveParams, ctx, fileSystem);
  if (!result.ok) return result;

  const {
    matched,
    different,
    missingInSource,
    missingInBinary,
    diffs,
    summary,
    actionableDifferent,
    nonActionableDifferent,
    hasFunctionalDifferences,
    actionableOk,
  } = result.data;

  // Validate the requested module was actually found in at least one side
  const totalFound =
    matched.length + different.length + missingInSource.length + missingInBinary.length;
  if (totalFound === 0) {
    return failureResult(
      createDysflowError(
        "MODULE_NOT_FOUND",
        `Module "${moduleName}" was not found in source or binary export.`,
      ),
    );
  }

  return successResult(
    {
      operation: "compare_module",
      moduleName,
      ok: result.data.ok,
      dryRun: result.data.dryRun,
      willModifyAccess: result.data.willModifyAccess,
      sourceRoot: result.data.sourceRoot,
      matched,
      different,
      missingInSource,
      missingInBinary,
      ...(diffs !== undefined ? { diffs } : {}),
      ...(summary !== undefined ? { summary } : {}),
      ...(actionableDifferent !== undefined ? { actionableDifferent } : {}),
      ...(nonActionableDifferent !== undefined ? { nonActionableDifferent } : {}),
      ...(hasFunctionalDifferences !== undefined ? { hasFunctionalDifferences } : {}),
      ...(actionableOk !== undefined ? { actionableOk } : {}),
    },
    { diagnostics: result.diagnostics, durationMs: result.durationMs },
  );
}

export class VbaModulesAdapter {
  constructor(
    private readonly orchestrator: VbaModulesOrchestrator,
    private readonly fileSystem: ComparisonFileSystemPort = nodeComparisonFileSystem,
  ) {}

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
      toolName === "fix_encoding" ||
      toolName === "compare_module" ||
      toolName === "vba_orphan_audit"
    );
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<OperationResult<unknown>> {
    if (toolName === "vba_orphan_audit") {
      return this.auditOrphans(params);
    }
    if (toolName === "compare_module") {
      return compareSingleModule(params, this.getComparisonContext(), this.fileSystem);
    }
    if (toolName === "verify_code" || toolName === "verify_binary") {
      return compareSourceAgainstBinary(
        toolName,
        params,
        this.getComparisonContext(),
        this.fileSystem,
      );
    }
    if (toolName === "reconcile_binary") {
      return planReconcileBinary(params, this.getComparisonContext(), this.fileSystem);
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

  async auditOrphans(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const mapping = MODULE_MAPPINGS.list_objects;
    if (!mapping) {
      return failureResult(createDysflowError("MAPPING_ERROR", "Missing list_objects mapping."));
    }
    const listResult = await this.orchestrator.executeMappedTool("list_objects", params, mapping);
    if (!listResult.ok) return listResult;

    // biome-ignore lint/suspicious/noExplicitAny: VBE data structure
    const vbeData = listResult.data as any;
    const vbeModules = vbeData?.modules || [];
    const vbeClasses = vbeData?.classes || [];
    const vbeForms = vbeData?.forms || [];
    const vbeReports = vbeData?.reports || [];
    const vbeDocumentModules = vbeData?.documentModules || [];

    const vbeAll = new Set<string>([
      ...vbeModules,
      ...vbeClasses,
      ...vbeForms,
      ...vbeReports,
      ...vbeDocumentModules,
    ]);

    const targetResult = await this.orchestrator.resolveExecutionTarget(params);
    if (!targetResult.ok) return targetResult;
    const destinationRoot = targetResult.data.destinationRoot;

    const folders = [
      destinationRoot,
      resolve(destinationRoot, "modules"),
      resolve(destinationRoot, "classes"),
      resolve(destinationRoot, "forms"),
      resolve(destinationRoot, "reports"),
    ];

    // VBA identifiers are case-insensitive and the VBE re-cases module names on
    // import, so a disk file "myform.bas" and a VBE name "MyForm" are the SAME
    // module. Key the cross-reference by lowercase name (keeping the original
    // disk name for display) to avoid reporting one real module as two orphans.
    const diskModulesMap = new Map<string, { name: string; path: string }>();
    for (const folder of folders) {
      try {
        const entries = await this.fileSystem.readdir(folder);
        for (const entry of entries) {
          const entryName = typeof entry === "string" ? entry : entry.name;
          const lower = entryName.toLowerCase();
          let modName: string | null = null;

          if (lower.endsWith(".form.txt")) {
            modName = entryName.slice(0, -".form.txt".length);
          } else if (lower.endsWith(".report.txt")) {
            modName = entryName.slice(0, -".report.txt".length);
          } else {
            const ext = extname(entryName).toLowerCase();
            if ([".bas", ".cls", ".frm"].includes(ext)) {
              modName = parse(entryName).name;
            }
          }

          if (modName) {
            const key = modName.toLowerCase();
            const fullPath = resolve(folder, entryName);
            const current = diskModulesMap.get(key);
            if (!current) {
              diskModulesMap.set(key, { name: modName, path: fullPath });
            } else if (current.path.endsWith(".form.txt") || current.path.endsWith(".report.txt")) {
              diskModulesMap.set(key, { name: modName, path: fullPath });
            }
          }
        }
      } catch {
        // Folder missing or readdir failed, ignore
      }
    }

    const vbeKeys = new Set<string>([...vbeAll].map((n) => n.toLowerCase()));
    const SUSPICIOUS_REGEX =
      /^(Form_|Report_)?(Módulo|Modulo|Class|Clase|Form|Formulario|Report|Reporte)\d+$/i;
    const orphans = [];
    for (const name of vbeAll) {
      const disk = diskModulesMap.get(name.toLowerCase());
      orphans.push({
        moduleName: name,
        isOrphan: disk === undefined,
        isSuspicious: SUSPICIOUS_REGEX.test(name),
        sourcePath: disk?.path ?? null,
      });
    }

    for (const [key, disk] of diskModulesMap) {
      if (!vbeKeys.has(key)) {
        orphans.push({
          moduleName: disk.name,
          isOrphan: true,
          isSuspicious: SUSPICIOUS_REGEX.test(disk.name),
          sourcePath: disk.path,
        });
      }
    }

    return successResult({ orphans });
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
    resolve(destinationRoot, "reports"),
  ]) {
    const entries = await readdir(folder).catch(() => []);
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      if (lower.endsWith(".form.txt")) {
        modules.push(entry.slice(0, -".form.txt".length));
      } else if (lower.endsWith(".report.txt")) {
        modules.push(entry.slice(0, -".report.txt".length));
      } else {
        const extension = extname(entry).toLowerCase();
        if ([".bas", ".cls", ".frm"].includes(extension)) {
          modules.push(parse(entry).name);
        }
      }
    }
  }
  return Array.from(new Set(modules)).sort();
}
