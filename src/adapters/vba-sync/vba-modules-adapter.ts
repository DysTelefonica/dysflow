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
} from "../../core/services/vba-source-comparison.js";
import { stringValue, truthy } from "../../core/utils/index.js";
import { isWithinRuntime } from "../../shared/runtime-dir.js";
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

/**
 * Compile mapping — used when compile:true is requested after a successful import.
 * Maps to Action: "Compile" with JSON output enabled (same as compile_vba tool).
 */
const COMPILE_MAPPING: DirectMapping = mapping("Compile", true);

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
  env?: Record<string, string | undefined>;
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

const MANAGED_CODE_EXTENSIONS = [".bas", ".cls", ".frm"];

/**
 * Maps a disk file name to the VBA module name it represents, or null when the
 * file is not a managed source artifact. Forms/reports serialize as
 * `<name>.form.txt` / `<name>.report.txt`; code lives in `.bas` / `.cls` / `.frm`.
 * Keep this aligned with the export layout so orphan detection and pruning
 * agree on what counts as a managed file.
 */
function managedDiskModuleName(entryName: string): string | null {
  const lower = entryName.toLowerCase();
  if (lower.endsWith(".form.txt")) return entryName.slice(0, -".form.txt".length);
  if (lower.endsWith(".report.txt")) return entryName.slice(0, -".report.txt".length);
  if (MANAGED_CODE_EXTENSIONS.includes(extname(entryName).toLowerCase())) {
    return parse(entryName).name;
  }
  return null;
}

/** Folders that hold managed source artifacts. Queries are intentionally excluded. */
function managedFolders(destinationRoot: string): string[] {
  return [
    destinationRoot,
    resolve(destinationRoot, "modules"),
    resolve(destinationRoot, "classes"),
    resolve(destinationRoot, "forms"),
    resolve(destinationRoot, "reports"),
  ];
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
      toolName === "delete_module" ||
      toolName === "fix_encoding" ||
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
    if (toolName === "verify_code") {
      return compareSourceAgainstBinary(params, this.getComparisonContext(), this.fileSystem);
    }

    const dryRun = params.apply === true ? false : params.dryRun !== false;
    if (dryRun && (toolName === "import_all" || toolName === "import_modules")) {
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
    // Guardrail (#574): an exportPath that points inside the dysflow production runtime would
    // overwrite installed code under AGENTS.md hard rule. Refuse BEFORE invoking the runner.
    const exportPath = stringValue(params.exportPath);
    if (
      (toolName === "export_modules" || toolName === "export_all") &&
      exportPath !== undefined &&
      isWithinRuntime(
        exportPath,
        this.orchestrator.env ?? (process.env as Record<string, string | undefined>),
      )
    ) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          `Refusing to export to exportPath '${exportPath}' inside the dysflow production runtime. Point exportPath at your project, not the installed runtime.`,
        ),
      );
    }
    const effectiveParams =
      (toolName === "export_modules" || toolName === "export_all") && exportPath !== undefined
        ? { ...params, destinationRoot: exportPath }
        : params;

    if (toolName === "export_all" && truthy(params.prune)) {
      if (stringValue(params.filter) !== undefined) {
        return failureResult(
          createDysflowError(
            "INVALID_INPUT",
            "export_all prune is incompatible with filter: a filtered export only lists the matching modules, so pruning would delete every other on-disk file. Run an unfiltered export_all to prune.",
          ),
        );
      }
      return this.exportAllWithPrune(effectiveParams);
    }

    const importPruneResult =
      toolName === "import_all" && truthy(params.prune)
        ? await this.pruneBinaryModulesAbsentFromSource(effectiveParams)
        : successResult({ applied: false, deleted: [] as string[] });
    if (!importPruneResult.ok) return importPruneResult;

    const importResult = await this.orchestrator.executeMappedTool(
      toolName,
      effectiveParams,
      mapping,
    );
    if (!importResult.ok) return importResult;
    const resultWithPrune =
      toolName === "import_all" && truthy(params.prune)
        ? {
            ...importResult,
            data: {
              ...(importResult.data as Record<string, unknown>),
              prune: importPruneResult.data,
            },
          }
        : importResult;

    // If compile:true is requested, run acCmdCompileAndSaveAllModules after a successful import.
    // Skip compile on dry-run (already handled above), on import failure, or when compile is falsy.
    if ((toolName === "import_modules" || toolName === "import_all") && truthy(params.compile)) {
      const compileResult = await this.orchestrator.executeMappedTool(
        "compile_vba",
        params,
        COMPILE_MAPPING,
      );

      if (!compileResult.ok) {
        // The IsCompiled compile gate (issue #543) is reliable for standard and
        // class modules, but NOT for document modules: Access cannot bring a
        // programmatically imported form/report document module to a compiled
        // state headless, so it reports a spurious VBA_COMPILE_ERROR even when the
        // code is valid (tracked separately). When the import set includes a
        // form/report, do NOT hard-fail on a compile result we cannot trust —
        // surface the import success with compileVerified:false so the caller
        // knows the compile was not verified. For standard/class-only imports the
        // failure is trustworthy and propagates as a hard failure.
        const untrustworthy =
          compileResult.error.code === "VBA_COMPILE_ERROR" &&
          (await this.importIncludesDocumentModule(toolName, params));
        if (!untrustworthy) return compileResult;
        return {
          ...resultWithPrune,
          data: {
            ...(resultWithPrune.data as Record<string, unknown>),
            compileResult: {
              ok: false,
              verified: false,
              reason: "document-module-compile-not-verifiable-headless",
              error: compileResult.error,
            },
          },
        };
      }

      // Merge compileResult into the import result data so callers can inspect it.
      return {
        ...resultWithPrune,
        data: {
          ...(resultWithPrune.data as Record<string, unknown>),
          compileResult: { ...(compileResult.data as Record<string, unknown>), verified: true },
        },
      };
    }

    return resultWithPrune;
  }

  private async pruneBinaryModulesAbsentFromSource(
    params: Record<string, unknown>,
  ): Promise<OperationResult<{ applied: boolean; deleted: string[] }>> {
    const listMapping = MODULE_MAPPINGS.list_objects;
    const deleteMapping = MODULE_MAPPINGS.delete_module;
    if (!listMapping || !deleteMapping) {
      return failureResult(createDysflowError("MAPPING_ERROR", "Missing VBA module mapping."));
    }

    const target = await this.orchestrator.resolveExecutionTarget(params);
    if (!target.ok) return target;

    const sourceModules = new Set(
      (await discoverImportModules(target.data.destinationRoot)).map((name) => name.toLowerCase()),
    );
    const listResult = await this.orchestrator.executeMappedTool("list_objects", params, listMapping);
    if (!listResult.ok) return listResult;

    const binaryModules = listObjectModuleNames(listResult.data);
    const deleteNames = binaryModules.filter((name) => !sourceModules.has(name.toLowerCase()));
    if (deleteNames.length === 0) return successResult({ applied: true, deleted: [] });

    const deleteResult = await this.orchestrator.executeMappedTool(
      "delete_module",
      { ...params, moduleNames: deleteNames, force: true },
      deleteMapping,
    );
    if (!deleteResult.ok) return deleteResult;

    return successResult({ applied: true, deleted: deleteNames });
  }

  /**
   * True when the import set includes a form/report document module. Used to
   * decide whether a post-import compile failure is trustworthy: the IsCompiled
   * gate cannot verify document modules headless (issue #543), so a compile error
   * after a form/report import must not hard-fail the operation.
   */
  private async importIncludesDocumentModule(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<boolean> {
    // import_all imports every object, including all forms and reports.
    if (toolName === "import_all") return true;
    const moduleNames = stringArray(params.moduleNames).map((name) => name.toLowerCase());
    if (moduleNames.length === 0) return false;

    const target = await this.orchestrator.resolveExecutionTarget(params);
    if (!target.ok) return false;
    const root = target.data.destinationRoot;

    for (const folder of [resolve(root, "forms"), resolve(root, "reports")]) {
      let entries: readonly { name: string }[] | readonly string[];
      try {
        entries = await this.fileSystem.readdir(folder);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const entryName = typeof entry === "string" ? entry : entry.name;
        const lower = entryName.toLowerCase();
        // Any file in forms/ or reports/ belongs to a document module: a .form.txt
        // /.report.txt is the layout, a .cls is its code-behind. A form whose source
        // currently has only the .cls (layout not re-exported) is still a document
        // module, so detect it too. This is scoped to forms/ and reports/ — a normal
        // class in classes/ is never scanned here, so it cannot be misclassified.
        const base = lower.endsWith(".form.txt")
          ? lower.slice(0, -".form.txt".length)
          : lower.endsWith(".report.txt")
            ? lower.slice(0, -".report.txt".length)
            : lower.endsWith(".cls")
              ? lower.slice(0, -".cls".length)
              : null;
        if (base !== null && moduleNames.includes(base)) return true;
      }
    }
    return false;
  }

  /**
   * Runs export_all, then deletes managed source files whose object no longer
   * exists in the binary, so `src` mirrors the live project.
   *
   * Safety invariant: pruning NEVER runs after a non-clean export. If any module
   * failed to serialize (e.g. a form open in design view), it is still live in
   * the binary, so deleting its file would destroy real source. In that case the
   * prune is skipped and reported, never silently applied. The export result's
   * `exported` list is the single source of truth for what must survive; queries
   * are never pruned.
   */
  private async exportAllWithPrune(
    params: Record<string, unknown>,
  ): Promise<OperationResult<unknown>> {
    const mapping = MODULE_MAPPINGS.export_all;
    if (!mapping) {
      return failureResult(createDysflowError("MAPPING_ERROR", "Missing export_all mapping."));
    }
    const exportResult = await this.orchestrator.executeMappedTool("export_all", params, mapping);
    if (!exportResult.ok) return exportResult;

    const data = (exportResult.data ?? {}) as Record<string, unknown>;
    const warnings = Array.isArray(data.warnings) ? data.warnings : [];
    const meta = { diagnostics: exportResult.diagnostics, durationMs: exportResult.durationMs };

    if (warnings.length > 0) {
      return successResult(
        { ...data, prune: { applied: false, reason: "export-had-warnings", deleted: [] } },
        meta,
      );
    }

    const target = await this.orchestrator.resolveExecutionTarget(params);
    if (!target.ok) return target;
    const destinationRoot = target.data.destinationRoot;

    // Guardrail (#574): export_all prune deletes managed source files under destinationRoot.
    // Refuse if the resolved destinationRoot is inside the dysflow production runtime,
    // BEFORE the rm loop runs.
    if (
      isWithinRuntime(
        destinationRoot,
        this.orchestrator.env ?? (process.env as Record<string, string | undefined>),
      )
    ) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          `Refusing to run export_all prune inside the dysflow production runtime (destinationRoot='${destinationRoot}'). Point destinationRoot at your project, not the installed runtime.`,
        ),
      );
    }

    const exported = Array.isArray(data.exported) ? data.exported.map(String) : [];
    const keep = new Set(exported.map((name) => name.toLowerCase()));

    const deleted: string[] = [];
    for (const folder of managedFolders(destinationRoot)) {
      let entries: readonly { name: string }[] | readonly string[];
      try {
        entries = await this.fileSystem.readdir(folder);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const entryName = typeof entry === "string" ? entry : entry.name;
        const modName = managedDiskModuleName(entryName);
        if (modName === null || keep.has(modName.toLowerCase())) continue;
        const fullPath = resolve(folder, entryName);
        await this.fileSystem.rm(fullPath, { recursive: false, force: true });
        deleted.push(fullPath);
      }
    }

    return successResult({ ...data, prune: { applied: true, deleted } }, meta);
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
    // `form` is a deprecated alias for `auto`: a form/report always imports its
    // UI from the `.form.txt` and its canonical code from the sibling `.cls`,
    // so there is no separate layout-only mode. Kept as an accepted alias.
    case "form":
      return "Auto";
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

function listObjectModuleNames(data: unknown): string[] {
  const record = data as Record<string, unknown> | null | undefined;
  const names = new Set<string>();
  for (const key of ["modules", "classes", "forms", "reports", "documentModules"]) {
    const value = record?.[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item === "string" && item.length > 0) names.add(item);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
