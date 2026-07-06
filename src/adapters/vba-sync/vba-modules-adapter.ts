import { randomUUID } from "node:crypto";
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
  buildDeletePlanResult,
  buildImportPlanResult,
  type DeletePlanResult,
  type ImportPlanResult,
} from "../../core/services/vba-import-plan.js";
import {
  type ComparisonFileSystemPort,
  compareSourceAgainstBinary,
} from "../../core/services/vba-source-comparison.js";
import { stringValue, truthy } from "../../core/utils/index.js";
import { isWithinRuntime } from "../../shared/runtime-dir.js";
import { type DirectMapping, mapping, stringArray } from "./vba-sync-types.js";

// ========================================================================
// #732 — compile-failure rollback types + constants (module level so the
// helper methods inside VbaModulesAdapter can use them)
// ========================================================================

const COMPILE_FAILURE_ROLLBACK_REASON = "compile_failure_post_import";
const NO_BASELINE_ROLLBACK_REASON = "no_baseline_snapshot";

type RollbackSnapshotEntry = {
  fileType: "bas" | "cls" | "form.txt" | "report.txt";
  relPath: string;
};

type RollbackSnapshot = {
  /** Temp directory holding the pre-call source files. */
  snapshotDir: string;
  /** Modules that were exported; missing means no pre-call binary state. */
  snapshotFiles: ReadonlyMap<string, RollbackSnapshotEntry>;
};

type ExportModuleEntry = {
  module: string;
  status: string;
  fileType?: string;
  relPath?: string;
};

type PerModuleResult = {
  module: string;
  status: string;
  rollbackApplied?: boolean;
  rollbackReason?: string;
  rollbackFailed?: boolean;
};

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

const MANAGED_CODE_EXTENSIONS = [".bas", ".cls"];

/**
 * Maps a disk file name to the VBA module name it represents, or null when the
 * file is not a managed source artifact. Forms/reports serialize as
 * `<name>.form.txt` / `<name>.report.txt`; code lives in `.bas` / `.cls`.
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
    // Round-3 Item 5 (P2) — explicit `dryRun: true` short-circuits
    // `delete_module` to a plan-shaped result via `planDelete`. Unlike
    // `import_*`/`import_all` above, this branch is EXPLICIT-only:
    // `delete_module` without `dryRun` keeps the legacy execute path so
    // production delete workflows don't accidentally dry-run when the flag
    // is omitted. The `dryRun` variable above is reused as a guard so a
    // future change that wants default-dry-run for delete_module can flip
    // the predicate in one place.
    if (dryRun && toolName === "delete_module" && params.dryRun === true) {
      return this.planDelete(params);
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

    // F1 (#619): after the explicit-exportPath guard, resolve the target and refuse
    // if destinationRoot (from project config, context defaults, or a caller override)
    // falls inside the dysflow production runtime. The runner MUST NOT be invoked
    // when the resolved target is unsafe; mirror vba-execution-adapter.ts:160-175.
    //
    // #644 — runtime-guard regression fix: when the user has supplied an explicit
    // exportPath, the exportPath guard above has ALREADY validated the user's intent.
    // The orchestrator's resolved destinationRoot is then irrelevant for the
    // destinationRoot guard, because the runner receives `effectiveParams` with
    // `destinationRoot: exportPath` (see lines above). Trusting the user's explicit
    // override is the correct contract; without this guard, the user's safe export
    // path would be silently shadowed by whatever the orchestrator resolves
    // (misconfigured project config, MCP context defaults, etc.), breaking the
    // `exportPath` override path documented in #185.
    let resolvedExportTarget: OperationResult<VbaModulesExecutionTarget> | undefined;
    if (toolName === "export_modules" || toolName === "export_all") {
      const target = await this.orchestrator.resolveExecutionTarget(effectiveParams);
      if (!target.ok) return target;
      resolvedExportTarget = target;
      if (
        exportPath === undefined &&
        isWithinRuntime(
          target.data.destinationRoot,
          this.orchestrator.env ?? (process.env as Record<string, string | undefined>),
        )
      ) {
        return failureResult(
          createDysflowError(
            "INVALID_INPUT",
            `Refusing to export to destinationRoot '${target.data.destinationRoot}' inside the dysflow production runtime. Point destinationRoot at your project, not the installed runtime.`,
          ),
        );
      }
    }

    if (toolName === "export_all" && truthy(params.prune)) {
      if (stringValue(params.filter) !== undefined) {
        return failureResult(
          createDysflowError(
            "INVALID_INPUT",
            "export_all prune is incompatible with filter: a filtered export only lists the matching modules, so pruning would delete every other on-disk file. Run an unfiltered export_all to prune.",
          ),
        );
      }
      return this.exportAllWithPrune(effectiveParams, resolvedExportTarget);
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
      // #732 — snapshot the binary state of every module being imported BEFORE
      // the write so a project-wide compile failure can be rolled back. The
      // snapshot is per-module; modules that did not exist in the binary
      // pre-call (i.e. brand-new modules) cannot be rolled back and are
      // surfaced as rollbackFailed: true with a warning instead.
      const rollbackOnCompileFail = params.rollbackOnCompileFail !== false;
      const rollbackSnapshot =
        toolName === "import_modules" && rollbackOnCompileFail
          ? await this.snapshotModulesForRollback(params)
          : undefined;

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

        if (untrustworthy) {
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

        // #732 — compile failed and we DO trust the failure (standard/class
        // only). Roll back every successfully imported module using the
        // pre-import snapshot so the .accdb is left in its pre-call state.
        // The caller still receives the typed VBA_COMPILE_ERROR so they know
        // WHY the write did not stick; the per-module rollbackReason
        // surfaces what was reverted (in `error.details.modules`).
        if (rollbackSnapshot !== undefined) {
          const rollbackReport = await this.rollbackModulesFromSnapshot(
            rollbackSnapshot,
            resultWithPrune,
          );
          return failureResult(
            {
              ...compileResult.error,
              // `details` is the structured place the consumer can branch
              // on. `rollbackApplied` is the single boolean the issue
              // pins; `modules` is the per-module array so callers can
              // render what was reverted (and which brand-new modules
              // were flagged `rollbackFailed: true` with a `no_baseline_snapshot` reason).
              details: {
                ...(compileResult.error.details ?? {}),
                rollbackApplied: true,
                modules: rollbackReport,
              },
            },
            {
              diagnostics: resultWithPrune.diagnostics,
              durationMs: resultWithPrune.durationMs,
              operation: resultWithPrune.operation,
            },
          );
        }

        return compileResult;
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

    const sourceRootStatus = await stat(target.data.destinationRoot)
      .then((stats) => (stats.isDirectory() ? "directory" : "not-directory"))
      .catch(() => "missing");
    if (sourceRootStatus !== "directory") {
      return failureResult(
        createDysflowError(
          "IMPORT_PRUNE_SOURCE_UNSAFE",
          `Refusing import_all prune because destinationRoot is not a readable source directory: ${target.data.destinationRoot}`,
          { details: { destinationRoot: target.data.destinationRoot, reason: sourceRootStatus } },
        ),
      );
    }

    const sourceDiscovery = await discoverManagedSource(
      target.data.destinationRoot,
      this.fileSystem,
      {
        failOnRootReadError: true,
        failOnManagedFolderReadError: true,
      },
    );
    if (!sourceDiscovery.ok) {
      return failureResult(
        createDysflowError(
          "IMPORT_PRUNE_SOURCE_UNSAFE",
          `Refusing import_all prune because source discovery failed: ${sourceDiscovery.error.message}`,
          { details: { destinationRoot: target.data.destinationRoot } },
        ),
      );
    }
    if (sourceDiscovery.data.modules.length === 0) {
      return failureResult(
        createDysflowError(
          "IMPORT_PRUNE_SOURCE_UNSAFE",
          `Refusing import_all prune because destinationRoot contains no managed VBA source files: ${target.data.destinationRoot}`,
          { details: { destinationRoot: target.data.destinationRoot } },
        ),
      );
    }

    const sourceModules = new Set(
      sourceDiscovery.data.protectedNames.map((name) => name.toLowerCase()),
    );
    const listResult = await this.orchestrator.executeMappedTool(
      "list_objects",
      params,
      listMapping,
    );
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
    preResolvedTarget?: OperationResult<VbaModulesExecutionTarget>,
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

    // When the caller has already resolved and pre-validated the target (the F1 top-level
    // guard at the execute() entry), reuse it. Otherwise fall back to resolving here so
    // existing internal callers still work. The post-resolution guard below remains as
    // defense-in-depth in case a future refactor bypasses the top-level guard.
    const target = preResolvedTarget ?? (await this.orchestrator.resolveExecutionTarget(params));
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

    // Guardrail: `exported` must be a trustworthy, explicit array. A missing or non-array
    // value can mean the export payload was malformed or truncated — treating it as `[]`
    // would delete every managed source file, which is catastrophic and non-recoverable.
    // Instead, skip the prune with a stable reason so the caller can investigate.
    if (
      !Array.isArray(data.exported) ||
      data.exported.some((name) => typeof name !== "string" || name.trim().length === 0)
    ) {
      return successResult(
        { ...data, prune: { applied: false, reason: "exported-missing-or-invalid", deleted: [] } },
        meta,
      );
    }

    const exported = data.exported;
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
            if ([".bas", ".cls"].includes(ext)) {
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

  /**
   * Round-3 Item 5 (P2) — dry-run plan helper for `delete_module`. Mirrors
   * `planImport` in shape and contract: resolve the target + strict-context
   * first, derive the module list from the request (singular `moduleName`
   * OR plural `moduleNames`, matching the `delete_module` mapping at line
   * 107), capture any pre-call path warnings/errors, then build the
   * `DeletePlanResult` so consumers see exactly which modules would have
   * been deleted without invoking the runner.
   *
   * IMPORTANT: `delete_module` is intentionally EXPLICIT-only for dryRun
   * (see the branch at execute() line 215). This helper therefore assumes
   * the caller already verified `params.dryRun === true`; it does not
   * re-check the flag.
   */
  private async planDelete(
    params: Record<string, unknown>,
  ): Promise<OperationResult<DeletePlanResult>> {
    const target = await this.orchestrator.resolveExecutionTarget(params);
    if (!target.ok) return target;
    const strict = this.orchestrator.validateStrictContext(params, target.data);
    if (!strict.ok) return strict;

    // Mirror the delete_module mapping (line 107): prefer `moduleNames`, fall
    // back to the singular `moduleName` so the plan exactly matches what the
    // runner would have received.
    const moduleNamesFromArray = stringArray(params.moduleNames);
    const moduleNameFromSingular = stringValue(params.moduleName);
    const modulesPlanned =
      moduleNamesFromArray.length > 0
        ? moduleNamesFromArray
        : moduleNameFromSingular !== undefined
          ? [moduleNameFromSingular]
          : [];

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
      buildDeletePlanResult({
        params,
        target: target.data,
        modulesPlanned,
        warnings,
        errors,
      }),
    );
  }

  // ========================================================================
  // #732 — compile-failure rollback helpers
  // ========================================================================

  /**
   * Per-module baseline snapshot used to roll back a partially-applied
   * `import_modules` call when the post-import project-wide compile fails.
   * `snapshotDir` is a temp directory holding the pre-call binary state of
   * every module that existed in the .accdb BEFORE the import. Modules
   * that did not exist pre-call (brand-new modules) are NOT in the snapshot
   * — they cannot be rolled back and surface as `rollbackFailed: true`
   * with a `no_baseline_snapshot` reason instead.
   */
  private async snapshotModulesForRollback(
    params: Record<string, unknown>,
  ): Promise<RollbackSnapshot> {
    const moduleNames = stringArray(params.moduleNames);
    const snapshotDir = resolve(tmpdir(), `dysflow-rollback-${randomUUID()}`);
    await this.fileSystem.mkdtemp?.(snapshotDir).catch(() => {
      /* the runner creates the directory itself; this is a no-op fallback */
    });

    const exportMapping = MODULE_MAPPINGS.export_modules;
    if (!exportMapping) {
      return { snapshotDir, snapshotFiles: new Map() };
    }
    const exportResult = await this.orchestrator.executeMappedTool(
      "export_modules",
      {
        ...params,
        moduleNames,
        exportPath: snapshotDir,
      },
      exportMapping,
    );

    const snapshotFiles = new Map<string, RollbackSnapshotEntry>();
    if (exportResult.ok && Array.isArray(exportResult.data)) {
      const exportEntries = exportResult.data as ExportModuleEntry[];
      for (const entry of exportEntries) {
        if (entry.status === "ok" && entry.fileType !== undefined && entry.relPath !== undefined) {
          snapshotFiles.set(entry.module, {
            fileType: entry.fileType as RollbackSnapshotEntry["fileType"],
            relPath: entry.relPath,
          });
        }
      }
    }
    return { snapshotDir, snapshotFiles };
  }

  /**
   * Re-import each snapshot module from its pre-call baseline so the
   * .accdb returns to its pre-`import_modules` state when the
   * project-wide compile failed. Mutates the per-module entries in
   * `resultWithPrune.data.result` so callers see
   * `rollbackApplied: true, rollbackReason: "compile_failure_post_import"`
   * for every module that was successfully reverted, and
   * `rollbackFailed: true, rollbackReason: "no_baseline_snapshot"` for
   * brand-new modules that did not exist in the binary pre-call (a
   * best-effort warning — the module is NOT deleted).
   */
  private async rollbackModulesFromSnapshot(
    snapshot: RollbackSnapshot,
    resultWithPrune: OperationResult<unknown>,
  ): Promise<PerModuleResult[]> {
    if (!resultWithPrune.ok) return [];
    const rawResult = (resultWithPrune.data as { result?: unknown })?.result;
    const modules: PerModuleResult[] = Array.isArray(rawResult)
      ? (rawResult as PerModuleResult[])
      : [];

    for (const entry of modules) {
      if (entry.status !== "ok") continue;
      const snapshotEntry = snapshot.snapshotFiles.get(entry.module);
      if (snapshotEntry === undefined) {
        // Brand-new module — there is no pre-call baseline to restore.
        entry.rollbackFailed = true;
        entry.rollbackReason = NO_BASELINE_ROLLBACK_REASON;
        continue;
      }
      entry.rollbackApplied = true;
      entry.rollbackReason = COMPILE_FAILURE_ROLLBACK_REASON;
    }

    const moduleNamesToRevert = [...snapshot.snapshotFiles.keys()];
    if (moduleNamesToRevert.length === 0) return modules;

    const importMapping = MODULE_MAPPINGS.import_modules;
    if (!importMapping) return modules;
    await this.orchestrator.executeMappedTool(
      "import_modules",
      {
        // The rollback re-import uses the snapshot temp dir as the source
        // root so the runner finds the pre-call .bas/.cls/.form.txt
        // files written by export_modules in snapshotModulesForRollback.
        destinationRoot: snapshot.snapshotDir,
        moduleNames: moduleNamesToRevert,
        importMode: "replace",
        compile: false,
        dryRun: false,
      },
      importMapping,
    );
    return modules;
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
  const discovered = await discoverManagedSource(destinationRoot, nodeComparisonFileSystem, {
    failOnRootReadError: false,
    failOnManagedFolderReadError: false,
  });
  return discovered.ok ? discovered.data.modules : [];
}

type ManagedSourceDiscovery = {
  modules: string[];
  protectedNames: string[];
};

async function discoverManagedSource(
  destinationRoot: string,
  fileSystem: Pick<ComparisonFileSystemPort, "readdir">,
  options: { failOnRootReadError: boolean; failOnManagedFolderReadError: boolean },
): Promise<OperationResult<ManagedSourceDiscovery>> {
  const modules = new Set<string>();
  const protectedNames = new Set<string>();
  const folders = [
    { path: destinationRoot, kind: "root" },
    { path: resolve(destinationRoot, "modules"), kind: "module" },
    { path: resolve(destinationRoot, "classes"), kind: "class" },
    { path: resolve(destinationRoot, "forms"), kind: "form" },
    { path: resolve(destinationRoot, "reports"), kind: "report" },
  ] as const;

  for (const folder of folders) {
    let entries: readonly { name: string }[] | readonly string[];
    try {
      entries = await fileSystem.readdir(folder.path);
    } catch (error) {
      if (folder.kind === "root" && options.failOnRootReadError) {
        const message = error instanceof Error ? error.message : String(error);
        return failureResult(createDysflowError("SOURCE_DISCOVERY_FAILED", message));
      }
      if (
        folder.kind !== "root" &&
        options.failOnManagedFolderReadError &&
        !isMissingDirectoryError(error)
      ) {
        const message = error instanceof Error ? error.message : String(error);
        return failureResult(
          createDysflowError(
            "SOURCE_DISCOVERY_FAILED",
            `Cannot read managed source folder ${folder.path}: ${message}`,
          ),
        );
      }
      continue;
    }

    for (const entry of entries) {
      const entryName = typeof entry === "string" ? entry : entry.name;
      const moduleName = managedDiskModuleName(entryName);
      if (moduleName === null) continue;
      modules.add(moduleName);
      protectedNames.add(moduleName);
      if (folder.kind === "form") addDocumentAliases(protectedNames, moduleName, "Form_");
      if (folder.kind === "report") addDocumentAliases(protectedNames, moduleName, "Report_");
    }
  }

  return successResult({
    modules: [...modules].sort((a, b) => a.localeCompare(b)),
    protectedNames: [...protectedNames].sort((a, b) => a.localeCompare(b)),
  });
}

function isMissingDirectoryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function addDocumentAliases(names: Set<string>, moduleName: string, prefix: "Form_" | "Report_") {
  if (moduleName.toLowerCase().startsWith(prefix.toLowerCase())) {
    names.add(moduleName.slice(prefix.length));
  } else {
    names.add(`${prefix}${moduleName}`);
  }
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
