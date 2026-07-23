import { copyFile, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, parse, resolve } from "node:path";
import packageJson from "../../../package.json" with { type: "json" };
import {
  createDysflowError,
  type Diagnostic,
  failureResult,
  type OperationMetadata,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import {
  recordPersistence,
  recordVerifyFail,
  recordVerifyOk,
} from "../../core/runtime/human-compile-state.js";
import {
  type ControlPropertyLookup,
  postprocessFormTxt,
} from "../../core/services/control-property-allow-list.js";
import { parseFormTxt } from "../../core/services/form-ir-service.js";
import { runBulkImportByDirectory } from "../../core/services/import-modules-bulk.js";
import { runListVbaModules } from "../../core/services/list-vba-modules-service.js";
import {
  cleanupOrphanedTransactionalCopies,
  transactionalWrite,
} from "../../core/services/transactional-write.js";
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
import {
  type ControlPropertyBatch,
  type ControlPropertyReader,
  NoopControlPropertyReader,
} from "./control-property-reader.js";
import { collectFormSourceDefects, type FormSourceDefect } from "./form-source-quality.js";
import { nodeTransactionalFileSystem } from "./node-transactional-file-system.js";
import { type DirectMapping, mapping, stringArray } from "./vba-sync-types.js";

// ========================================================================
// #732 — compile-failure rollback types + constants REMOVED in v1.19.0
// (feat-759-no-compile): compile + rollbackOnCompileFail leave the public
// surface entirely, so the rollback helpers and the COMPILE_MAPPING constant
// are gone with them. Save-only persistence (acCmdSaveAllModules = 280) is
// the canonical mutation path per openspec/specs/vba-manager-actions/spec.md.
// ========================================================================

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
  // Issue #807 (Feature 2) — `exists` lets the bulk import walker probe
  // the sourceDir before recursion. Adding it on the runtime port keeps
  // the core walker free of direct filesystem imports (architectural
  // boundary at `test/architecture/core-boundary`).
  exists: async (path) =>
    await stat(path)
      .then(() => true)
      .catch(() => false),
};

// COMPILE_MAPPING was removed in v1.19.0 (feat-759-no-compile). The runtime
// no longer compiles after a mutation. Persistence is save-only via
// acCmdSaveAllModules (RunCommand 280).

const MODULE_MAPPINGS: Record<string, DirectMapping> = {
  export_modules: mapping(
    "Export",
    false,
    (input) => stringArray(input.moduleNames),
    // issue #752 — forward the opt-in verbose flag so the per-module export
    // result carries {source, destination, truncated, mismatchReason}.
    (input) => ({
      verbose: input.verbose === true,
      readOnly: input.readOnly === true ? true : undefined,
    }),
  ),
  export_all: mapping(
    "Export",
    false,
    (input) => {
      const filter = stringValue(input.filter);
      return filter === undefined ? [] : [filter];
    },
    (input) => ({
      verbose: input.verbose === true,
      readOnly: input.readOnly === true ? true : undefined,
    }),
  ),
  import_modules: mapping(
    "Import",
    false,
    (input) => stringArray(input.moduleNames),
    (input) => ({
      importMode: normalizeImportMode(stringValue(input.importMode)),
      // issue #752 — opt-in verbose flag for truncation detection.
      verbose: input.verbose === true,
    }),
  ),
  import_all: mapping(
    "Import",
    false,
    () => [],
    (input) => ({
      importMode: normalizeImportMode(stringValue(input.importMode)),
      // issue #752 — opt-in verbose flag for truncation detection.
      verbose: input.verbose === true,
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

export function postprocessExportedFormText(
  formText: string,
  lookup: ControlPropertyLookup,
): string {
  return postprocessFormTxt(formText, lookup);
}

/**
 * Async wrapper around `postprocessFormTxt`. The pure seam takes a sync lookup;
 * the wired export pipeline owns an async `ControlPropertyReader`, so this
 * helper does a single async batch-read per (form, control) before handing
 * the resulting lookup map back to the sync post-processor.
 *
 * The post-processor's own round-trip invariant
 * (`serializeFormTxt(parseFormTxt(x)) === x` for clean forms) means the
 * default `NoopControlPropertyReader` produces byte-identical output to
 * raw SaveAsText — see `control-property-allow-list.ts:36`.
 */
async function postprocessFormTextWithReader(
  formText: string,
  formName: string,
  reader: ControlPropertyReader,
): Promise<string> {
  // Parse once to learn which (control, missingProperty) pairs need a value.
  // Then batch-read those pairs from the reader (parallel awaits) and feed a
  // sync lookup map into the pure sync post-processor — avoiding per-property
  // round-trips through the parser/serializer for empty lookups.
  const form = parseFormTxt(formText);

  type Pending = { controlName: string; missing: readonly string[] };
  const pendingByControl: Pending[] = [];
  const seen = new Set<string>();

  const visit = (node: import("../../core/models/form-ir.js").FormNode): void => {
    const entry = node.entries.find(
      (candidate) => candidate.kind === "scalar" && candidate.key === "Name",
    );
    const controlName =
      entry !== undefined && entry.kind === "scalar" ? extractControlName(entry.value) : undefined;
    if (controlName !== undefined && /^(ComboBox|ListBox)$/i.test(node.blockType)) {
      const missing: string[] = [];
      for (const propertyName of COMBOBOX_LISTBOX_NAMES) {
        const exists = node.entries.some(
          (candidate) => candidate.kind === "scalar" && candidate.key === propertyName,
        );
        if (!exists) missing.push(propertyName);
      }
      if (missing.length > 0) {
        const key = `${controlName}::${missing.join(",")}`;
        if (!seen.has(key)) {
          seen.add(key);
          pendingByControl.push({ controlName, missing });
        }
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(form.root);

  const valueByControl = new Map<string, ControlPropertyBatch>();
  await Promise.all(
    pendingByControl.map(async ({ controlName, missing }) => {
      const batch = await reader.readProperties(formName, controlName, missing);
      valueByControl.set(controlName, batch);
    }),
  );

  const lookup: ControlPropertyLookup = (controlName, propertyName) => {
    const batch = valueByControl.get(controlName);
    if (batch === undefined) return undefined;
    return batch.get(propertyName);
  };

  return postprocessFormTxt(formText, lookup);
}

function extractControlName(rawValue: string): string | undefined {
  const trimmed = rawValue.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Return the first path that resolves to an existing file, or `undefined` if
 * none do. Used to locate an exported form file when the precise on-disk
 * convention (under `forms/` vs flat in `destinationRoot`) is not externally
 * knowable.
 */
async function firstExistingPath(candidates: readonly string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    try {
      const result = await stat(candidate);
      if (result.isFile()) return candidate;
    } catch {
      // Missing or unreadable — try the next candidate.
    }
  }
  return undefined;
}

const COMBOBOX_LISTBOX_NAMES: readonly string[] = [
  "BoundColumn",
  "ColumnCount",
  "ColumnHeads",
  "RowSource",
  "ColumnWidths",
  "Format",
  "StatusBarText",
  "ListRows",
  "ListWidth",
];

export class VbaModulesAdapter {
  constructor(
    private readonly orchestrator: VbaModulesOrchestrator,
    private readonly fileSystem: ComparisonFileSystemPort = nodeComparisonFileSystem,
    private readonly controlPropertyReader: ControlPropertyReader = new NoopControlPropertyReader(),
  ) {}

  /**
   * Issue #975 — wrap a write-tool dispatch with the transactional copy /
   * atomic-rename contract. When `effectiveParams.transactional === true`:
   *
   *   1. The target is resolved (if not pre-resolved) and validated against
   *      the strict context.
   *   2. The original binary is copied to
   *      `<projectRoot>/.dysflow/runtime/transactional/<uuid>/<basename>`.
   *   3. The actual mutation runs against the staging copy (the orchestrator
   *      receives `accessPath: stagingPath` in the forwarded params).
   *   4. On any failure (pre-flight, gate, post-write verify), the staging
   *      copy is deleted and the original is untouched.
   *   5. On success, a single `rename(2)` syscall atomically commits the
   *      staging copy back to the original path.
   *
   * When the flag is absent or `false`, this is a no-op pass-through to
   * `orchestrator.executeMappedTool(...)` — the legacy non-atomic path is
   * preserved exactly.
   *
   * The `preResolvedTarget` lets export_modules / export_all reuse the
   * target they already resolved for the exportPath + runtime-guard rails,
   * avoiding a redundant `resolveExecutionTarget` round-trip.
   */
  private async executeMappedToolTransactional(
    toolName: string,
    effectiveParams: Record<string, unknown>,
    mapping: DirectMapping,
    preResolvedTarget?: VbaModulesExecutionTarget,
  ): Promise<OperationResult<unknown>> {
    if (effectiveParams.transactional !== true) {
      return this.orchestrator.executeMappedTool(toolName, effectiveParams, mapping);
    }

    let target = preResolvedTarget;
    if (target === undefined) {
      const resolved = await this.orchestrator.resolveExecutionTarget(effectiveParams);
      if (!resolved.ok) return resolved;
      const strict = this.orchestrator.validateStrictContext(effectiveParams, resolved.data);
      if (!strict.ok) return strict;
      target = resolved.data;
    }

    const binaryPath = target.accessPath;
    if (binaryPath === undefined) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          "transactional:true requires a resolved accessPath (binary path). Provide an explicit accessPath or ensure .dysflow/project.json is configured.",
        ),
      );
    }

    const projectRoot =
      target.projectRoot ?? target.destinationRoot ?? this.orchestrator.cwd ?? process.cwd();
    const stagingRoot = join(projectRoot, ".dysflow", "runtime", "transactional");

    // Issue #975 — orphan sweep. A process killed mid-transaction (SIGKILL /
    // power loss) leaves the staging copy behind; clean it on the next
    // transactional call so stale `<uuid>/<name>.accdb` copies cannot leak.
    // Best-effort: a failure here surfaces as a warning diagnostic, never as
    // a hard failure of the write itself.
    await cleanupOrphanedTransactionalCopies({
      fileSystem: nodeTransactionalFileSystem,
      stagingRoot,
    });

    const txResult = await transactionalWrite({
      fileSystem: nodeTransactionalFileSystem,
      stagingRoot,
      binaryPath,
      execute: async (stagingPath) => {
        const innerParams = { ...effectiveParams, accessPath: stagingPath };
        const innerResult = await this.orchestrator.executeMappedTool(
          toolName,
          innerParams,
          mapping,
        );
        if (!innerResult.ok) {
          return { ok: false as const, error: innerResult.error };
        }
        return { ok: true as const, data: innerResult.data };
      },
    });

    if (!txResult.ok) {
      return failureResult(txResult.error, {
        diagnostics: [
          {
            level: "info",
            source: "transactional",
            message: `transactional rollback: original SHA-256 ${txResult.originalSha256} preserved.`,
          },
        ],
      });
    }

    return successResult(txResult.data, {
      metadata: {
        transactional: {
          stagingPath: txResult.stagingPath,
          originalSha256: txResult.originalSha256,
        },
      },
    });
  }

  /**
   * Export from a disposable binary copy unless the caller explicitly opts
   * into the legacy side effect. Access may rewrite database metadata merely
   * by opening/exporting a project, so Quit(acQuitSaveNone) is not a sufficient
   * non-mutation guarantee for the original file.
   */
  private async executeExportWithBinaryIsolation(
    toolName: string,
    effectiveParams: Record<string, unknown>,
    mapping: DirectMapping,
    target: VbaModulesExecutionTarget | undefined,
  ): Promise<OperationResult<unknown>> {
    if (
      (toolName !== "export_modules" && toolName !== "export_all") ||
      effectiveParams.mutateBinary === true ||
      effectiveParams.transactional === true
    ) {
      const result = await this.executeMappedToolTransactional(
        toolName,
        effectiveParams,
        mapping,
        target,
      );
      if (!result.ok || (toolName !== "export_modules" && toolName !== "export_all")) return result;
      return {
        ...result,
        data: { ...(result.data as Record<string, unknown>), binaryMutated: true },
      };
    }

    const binaryPath = target?.accessPath ?? target?.accessDbPath;
    if (binaryPath === undefined) {
      const result = await this.orchestrator.executeMappedTool(toolName, effectiveParams, mapping);
      if (!result.ok) return result;
      return {
        ...result,
        data: { ...(result.data as Record<string, unknown>), binaryMutated: false },
      };
    }

    // Several port-level tests use a synthetic accessPath and a fake runner.
    // Preserve that seam: the real runner will report a missing database,
    // while a fake can still verify mapping behavior without disk fixtures.
    try {
      await stat(binaryPath);
    } catch {
      const result = await this.orchestrator.executeMappedTool(toolName, effectiveParams, mapping);
      if (!result.ok) return result;
      return {
        ...result,
        data: { ...(result.data as Record<string, unknown>), binaryMutated: false },
      };
    }

    const stagingDirectory = await mkdtemp(join(tmpdir(), "dysflow-export-"));
    const stagingPath = join(stagingDirectory, parse(binaryPath).base);
    try {
      await copyFile(binaryPath, stagingPath);
      const result = await this.orchestrator.executeMappedTool(
        toolName,
        { ...effectiveParams, accessPath: stagingPath, transactional: false },
        mapping,
      );
      if (!result.ok) return result;
      return {
        ...result,
        data: { ...(result.data as Record<string, unknown>), binaryMutated: false },
      };
    } finally {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
  }

  static handles(toolName: string): boolean {
    return (
      toolName === "export_modules" ||
      toolName === "export_all" ||
      toolName === "import_modules" ||
      toolName === "import_all" ||
      toolName === "list_objects" ||
      toolName === "list_vba_modules" ||
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
    // Issue #807 (Feature 1) — list_vba_modules short-circuits to the dedicated
    // service. It never touches the runner dispatch / mapping table; the
    // runner is invoked by the service with a tailored request shape so the
    // PowerShell side stays narrowly responsible for one step (binary-side
    // enumeration + COM cleanup). The orchestrator's stricter types
    // (VbaModulesExecutionTarget) are sound cast targets: the service only
    // reads `accessPath` / `destinationRoot` / `timeoutMs`, the shape it
    // declares is a structural subset.
    if (toolName === "list_vba_modules") {
      const ctx: Parameters<typeof runListVbaModules>[1] = {
        scriptPath: this.orchestrator.scriptPath,
        accessPassword: this.orchestrator.accessPassword,
        resolveExecutionTarget: (p: Record<string, unknown>) =>
          this.orchestrator.resolveExecutionTarget(p) as unknown as ReturnType<
            Parameters<typeof runListVbaModules>[1]["resolveExecutionTarget"]
          >,
        validateStrictContext: (p: Record<string, unknown>, t: never) =>
          // The orchestrator expects the wider `VbaModulesExecutionTarget`;
          // service declares a strict-subset and never touches `projectRoot`.
          // Cast at the seam only.
          this.orchestrator.validateStrictContext(
            p,
            t as unknown as Parameters<typeof this.orchestrator.validateStrictContext>[1],
          ) as unknown as ReturnType<
            Parameters<typeof runListVbaModules>[1]["validateStrictContext"]
          >,
        runPreflightCleanup: (t: never) =>
          this.orchestrator.runPreflightCleanup(
            t as unknown as Parameters<typeof this.orchestrator.runPreflightCleanup>[0],
          ) as unknown as ReturnType<
            Parameters<typeof runListVbaModules>[1]["runPreflightCleanup"]
          >,
        runVbaManager: (req) =>
          (
            this.orchestrator.executor as unknown as (
              r: typeof req,
            ) => ReturnType<Parameters<typeof runListVbaModules>[1]["runVbaManager"]>
          )(req),
      };
      return runListVbaModules(params, ctx, this.fileSystem);
    }
    if (toolName === "verify_code") {
      // PR-1 (issue #762, v1.20.0) — record the verify_code round-trip into
      // the human-compile state cache. `actionableOk === true` means the
      // comparison surfaced no actionable differences → the user has
      // confirmed the binary state; anything else (failure envelope,
      // warnings, drift) is recorded as a failed verify (the reminder stays
      // visible).
      const verifyResult = await compareSourceAgainstBinary(
        params,
        this.getComparisonContext(),
        this.fileSystem,
      );
      if (verifyResult.ok) {
        const accessPath = await this.resolveAccessPathForRecording(params);
        if (accessPath !== undefined) {
          if (verifyResult.data.actionableOk === true) {
            recordVerifyOk(accessPath);
          } else {
            recordVerifyFail(accessPath);
          }
        }
      }
      return verifyResult;
    }

    // Issue #785 (v2.1.1) — the dispatch seam (capa 1) is the SINGLE source
    // of truth for the policy-driven dryRun default. By the time the
    // adapter is invoked through the MCP dispatch boundary, the helper has
    // already injected `dryRun: false` for `routine-dev-write` tools in
    // `developer` mode (or `dryRun: true` for every other combination) —
    // caller intent is preserved. The adapter therefore only needs to
    // honor EXPLICIT dryRun / apply intent. Removing the implicit
    // "absence = plan" rule (`params.dryRun !== false`) enables the
    // developer loop to actually execute routine imports without each
    // caller having to thread `dryRun: false` through the pipeline.
    //
    // Pre-2.1.1 the line was `const dryRun = params.apply === true ? false :
    // params.dryRun !== false;`. Post-2.1.1 the truth table collapses to:
    //   - `dryRun === true`           → plan.
    //   - `dryRun === false`          → execute.
    //   - `apply === true`            → execute (commit signal; legacy contract).
    //   - absent (caller omitted both) → execute.
    // Direct adapter callers (no dispatch seam) MUST pass an explicit flag
    // to plan; the seam is the policy authority.
    const dryRun = params.dryRun === true || params.apply === false;
    if (dryRun && (toolName === "import_all" || toolName === "import_modules")) {
      return this.planImport(toolName, params);
    }
    // `dryRun && toolName === "delete_module"` handles dryRun:true or apply:false
    if (dryRun && toolName === "delete_module") {
      return this.planDelete(params);
    }

    // Issue #958 — pre-import structural quality gate. Every planned
    // .form.txt / .report.txt must parse with the strict FormIR parser
    // BEFORE the runner (and Access) is spawned. Metadata-only legacy
    // defects pass through (the PS import path self-heals them); an
    // unparseable control tree fails closed with FORM_SOURCE_MALFORMED
    // so a broken source can never half-load into the binary.
    if (toolName === "import_all" || toolName === "import_modules") {
      const gate = await this.gateImportFormSources(toolName, params);
      if (!gate.ok) return gate;
    }

    // Issue #807 (Feature 2) — import_modules bulk by directory. When
    // `sourceDir` is provided AND `moduleNames` is empty/omitted, the
    // adapter takes a dedicated path that walks the directory, chunks
    // the resolved list, and dispatches each chunk as a sub-call. The
    // chunked path NEVER crosses the runner boundary twice with
    // overlapping modules. Backward-compat: when `moduleNames` is
    // non-empty, the legacy single-call path is preserved exactly.
    if (toolName === "import_modules") {
      const moduleNames = stringArray(params.moduleNames);
      const hasSourceDir = typeof params.sourceDir === "string" && params.sourceDir.length > 0;
      if (moduleNames.length === 0 && hasSourceDir) {
        return this.runBulkImportByDirectory(params);
      }
    }

    // Issue #757 (C1) — `diff:true` is the legacy no-write alias for the
    // export_ family. Pre-#757 the adapter refused it outright via
    // `DIFF_MODE_REQUIRES_VERIFY_CODE` (#802). Post-#757 the rejection is
    // REMOVED — `diff:true` is honored as a no-write mapping (the runner
    // receives `readOnly:true`) and the response carries
    // `metadata.deprecated = { flag: "diff", since: "<runtime>", use: "apply" }`
    // so an AI consumer can migrate without a manual source-tree audit.
    //
    // `apply:true` overrides `diff:true` (apply wins). When the caller
    // omits both the default-write behavior is preserved for `export_*`
    // (legacy orchestrator briefs that never passed `apply` keep
    // writing). The flag routing happens BEFORE the mapping lookup /
    // exportPath guard / target resolution so this branch never touches
    // the orchestrator.
    //
    // Issue #1055: `apply:false` or `dryRun:true` on export_modules / export_all
    // routes as no-write (readOnly:true) unless apply:true is also present.
    let effectiveExportReadOnly: boolean | undefined;
    let deprecationNotice: { metadata: OperationMetadata; diagnostic: Diagnostic } | undefined;
    if (
      (toolName === "export_all" || toolName === "export_modules") &&
      (params.apply === false || params.dryRun === true) &&
      params.apply !== true
    ) {
      effectiveExportReadOnly = true;
    }
    const isExportWithDeprecationAlias =
      (toolName === "export_all" || toolName === "export_modules") && params.diff === true;
    if (isExportWithDeprecationAlias) {
      const runtimeVersion = readRuntimeVersionSafe();
      deprecationNotice = {
        metadata: {
          deprecated: {
            flag: "diff",
            since: runtimeVersion,
            use: "apply",
          },
        },
        diagnostic: {
          level: "warning",
          source: "export-deprecation",
          message: `${toolName}(diff:true) is deprecated since ${runtimeVersion}; pass apply:true to commit or apply:false / omitted for the historical no-write semantics (see #757 C1).`,
        },
      };
      if (params.apply !== true) {
        // No apply:true override — route as the legacy no-write mapping
        // (readOnly:true). apply:true wins otherwise (see below).
        effectiveExportReadOnly = true;
      }
      // When apply:true IS also present, we keep the deprecation notice
      // for the consumer's migration log but DO NOT inject readOnly —
      // apply:true is the explicit commit signal.
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

    let importResult = await this.executeExportWithBinaryIsolation(
      toolName,
      effectiveExportReadOnly === true ? { ...effectiveParams, readOnly: true } : effectiveParams,
      mapping,
      resolvedExportTarget?.ok ? resolvedExportTarget.data : undefined,
    );
    if (!importResult.ok) return importResult;

    // REQ-003 (issue #1053) — wire the curated ComboBox/ListBox control-property
    // allow-list into the export pipeline. After Access writes each `.form.txt`
    // (its raw SaveAsText output), re-read the file, run `postprocessFormTxt`
    // with the injected reader's batched value lookups, and overwrite with
    // the post-processed text. With the default `NoopControlPropertyReader`
    // this is observationally a no-op (the sync post-processor's round-trip
    // invariant keeps the file byte-identical) — see
    // `control-property-allow-list.ts:36`. Failure to read or rewrite a
    // single form is contained: post-process errors on one form never
    // abort the whole export, so a partial SaveAsText result remains on disk.
    if (toolName === "export_all" || toolName === "export_modules") {
      const postProcResult = await this.applyControlPropertyPostprocess(
        importResult,
        resolvedExportTarget?.ok ? resolvedExportTarget.data : undefined,
        effectiveParams,
      );
      if (postProcResult.ok) {
        // Mutate the data envelope in place so the deprecation-notice
        // merge downstream still observes the full export shape.
        importResult = {
          ...importResult,
          data: {
            ...(importResult.data as Record<string, unknown>),
            postprocess: postProcResult.summary,
          },
        };
      } else {
        // A post-process failure must NEVER mask the successful export.
        // Surface it as a warning diagnostic instead and continue.
        const existingDiagnostics = Array.isArray(importResult.diagnostics)
          ? importResult.diagnostics
          : [];
        importResult = {
          ...importResult,
          diagnostics: [
            ...existingDiagnostics,
            {
              level: "warning",
              source: "export-all-postprocess",
              message: `control-property postprocess skipped: ${postProcResult.error}`,
            },
          ],
        };
      }
    }

    // PR-1 (issue #762, v1.20.0) — record the save-only persistence into the
    // human-compile state cache so `get_capabilities` and the result
    // reminder surface know there is something for the human to compile.
    // Only recorded for the tools that actually mutate the binary (import_*
    // and delete_module) — verify_code, export_*, and read-only tools do not
    // trigger this hook.
    if (
      toolName === "import_modules" ||
      toolName === "import_all" ||
      toolName === "delete_module"
    ) {
      const accessPath = await this.resolveAccessPathForRecording(effectiveParams);
      if (accessPath !== undefined) {
        recordPersistence(accessPath);
      }
    }

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

    // Issue #757 (C1) — propagate the export_* deprecation notice onto
    // the outbound envelope. Two surfaces, both stable:
    //   - `metadata.deprecated` for AI consumers (programmatic branch).
    //   - `diagnostics[*]` (level:"warning") for log-grep + legacy
    //     readers.
    if (deprecationNotice !== undefined) {
      if (resultWithPrune.ok) {
        return {
          ...resultWithPrune,
          diagnostics: [...resultWithPrune.diagnostics, deprecationNotice.diagnostic],
          metadata: mergeOperationMetadata(resultWithPrune.metadata, deprecationNotice.metadata),
        };
      }
      // Failure envelope: surface the notice too so a consumer that
      // bailed on the no-write run still sees the migration hint.
      return {
        ...resultWithPrune,
        diagnostics: [...resultWithPrune.diagnostics, deprecationNotice.diagnostic],
        metadata: mergeOperationMetadata(resultWithPrune.metadata, deprecationNotice.metadata),
      };
    }

    return resultWithPrune;
  }

  /**
   * REQ-003 (issue #1053) — wire the curated ComboBox/ListBox control-property
   * allow-list into the export pipeline. After the orchestrator returns a
   * successful `export_all` / `export_modules` result with its `exported`
   * module-name list, walk the resolved `destinationRoot/forms/` folder for
   * each form name in `exported`, run `postprocessFormTxt` with the injected
   * `ControlPropertyReader`, and overwrite the on-disk `.form.txt` file with
   * the post-processed text.
   *
   * Failure isolation: a read/parse/rewrite error on a single form is caught
   * and recorded in the summary; it never aborts the export or rewinds the
   * other forms. Errors that prevent the whole pipeline from running at all
   * (e.g. destinationRoot missing, `exported` not an array) yield `ok: false`
   * with a recoverable shape that the caller converts to a warning diagnostic.
   */
  private async applyControlPropertyPostprocess(
    importResult: OperationResult<unknown>,
    preResolvedTarget: VbaModulesExecutionTarget | undefined,
    effectiveParams: Record<string, unknown>,
  ): Promise<
    | {
        ok: true;
        summary: {
          formsScanned: number;
          formsRewritten: number;
          errors: Array<{ formName: string; message: string }>;
        };
      }
    | { ok: false; error: string }
  > {
    if (!importResult.ok) {
      return { ok: true, summary: { formsScanned: 0, formsRewritten: 0, errors: [] } };
    }
    const data = (importResult.data ?? {}) as Record<string, unknown>;
    if (!Array.isArray(data.exported)) {
      // Pre-#689 contract — the runtime returns an array of exported names;
      // absent or non-array means the export payload was malformed/truncated.
      // Skip postprocess in that case rather than risk scanning the wrong tree.
      return {
        ok: false,
        error: "exported list missing or invalid; skipping control-property postprocess.",
      };
    }
    if (this.controlPropertyReader === undefined) {
      // Defensive: a missing reader keeps the noop contract (legacy callers
      // that bypassed the new constructor default still observe byte-identical
      // output rather than a no-op skip that nobody would notice).
      return {
        ok: true,
        summary: { formsScanned: 0, formsRewritten: 0, errors: [] },
      };
    }
    const target =
      preResolvedTarget ??
      (await this.orchestrator
        .resolveExecutionTarget(effectiveParams)
        .then((res) => (res.ok ? res.data : undefined)));
    if (target === undefined) {
      return {
        ok: false,
        error: "could not resolve destinationRoot for control-property postprocess; skipping.",
      };
    }
    const destinationRoot = target.destinationRoot;
    if (typeof destinationRoot !== "string" || destinationRoot.length === 0) {
      return {
        ok: false,
        error: "destinationRoot is empty; cannot locate exported forms on disk.",
      };
    }

    const formsScanned: string[] = [];
    const formsRewritten: string[] = [];
    const errors: Array<{ formName: string; message: string }> = [];

    for (const exportedName of data.exported as unknown[]) {
      if (typeof exportedName !== "string" || exportedName.length === 0) continue;
      // Only `.form.txt` files participate — reports and code modules are
      // outside the ComboBox/ListBox allow-list scope.
      const candidates = [
        join(destinationRoot, "forms", `${exportedName}.form.txt`),
        join(destinationRoot, `${exportedName}.form.txt`),
      ];
      const formPath = await firstExistingPath(candidates);
      if (formPath === undefined) {
        // No `.form.txt` for this exported name — likely a code module or
        // report. The postprocessor scope is forms only, so this is a no-op.
        continue;
      }
      let rawText: string;
      try {
        rawText = await readFile(formPath, "utf8");
      } catch (error) {
        errors.push({
          formName: exportedName,
          message: `read failed: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }
      let postprocessed: string;
      try {
        postprocessed = await postprocessFormTextWithReader(
          rawText,
          exportedName,
          this.controlPropertyReader,
        );
      } catch (error) {
        errors.push({
          formName: exportedName,
          message: `postprocess failed: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }
      if (postprocessed !== rawText) {
        try {
          await writeFile(formPath, postprocessed, "utf8");
          formsRewritten.push(exportedName);
        } catch (error) {
          errors.push({
            formName: exportedName,
            message: `write failed: ${error instanceof Error ? error.message : String(error)}`,
          });
          continue;
        }
      }
      formsScanned.push(exportedName);
    }

    return {
      ok: true,
      summary: {
        formsScanned: formsScanned.length,
        formsRewritten: formsRewritten.length,
        errors,
      },
    };
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
    const exportResult = await this.orchestrator.executeMappedTool(
      "export_all",
      { ...params, readOnly: true },
      mapping,
    );
    if (!exportResult.ok) return exportResult;

    const data = (exportResult.data ?? {}) as Record<string, unknown>;
    const warnings = Array.isArray(data.warnings) ? data.warnings : [];
    const meta = { diagnostics: exportResult.diagnostics, durationMs: exportResult.durationMs };

    // REQ-003 (issue #1053) — wire the curated ComboBox/ListBox allow-list
    // BEFORE prune runs. The post-process overwrites the same `.form.txt`
    // files that prune later inspects for keepsets, so the order matters:
    // postprocess first (preserves the on-disk form content with curated
    // defaults), then prune (removes orphans). With the default
    // `NoopControlPropertyReader` the postprocess is observationally a
    // no-op (round-trip identity for clean forms), so this is backward-
    // compatible at the public envelope level.
    const postProc = await this.applyControlPropertyPostprocess(
      exportResult,
      preResolvedTarget?.ok ? preResolvedTarget.data : undefined,
      params,
    );
    const exportResultWithPostprocess: OperationResult<unknown> = (() => {
      if (!postProc.ok) {
        // Wire a warning diagnostic instead of failing closed — the prune
        // path below still needs the same shape.
        const existing: Diagnostic[] = Array.isArray(exportResult.diagnostics)
          ? [...exportResult.diagnostics]
          : [];
        return {
          ...exportResult,
          diagnostics: [
            ...existing,
            {
              level: "warning",
              source: "export-all-postprocess",
              message: `control-property postprocess skipped: ${postProc.error}`,
            },
          ],
        };
      }
      return exportResult;
    })();

    if (warnings.length > 0) {
      return successResult(
        {
          ...data,
          postprocess: postProc.ok ? postProc.summary : undefined,
          prune: { applied: false, reason: "export-had-warnings", deleted: [] },
        },
        { ...meta, diagnostics: exportResultWithPostprocess.diagnostics },
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
        {
          ...data,
          postprocess: postProc.ok ? postProc.summary : undefined,
          prune: { applied: false, reason: "exported-missing-or-invalid", deleted: [] },
        },
        { ...meta, diagnostics: exportResultWithPostprocess.diagnostics },
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

    return successResult(
      {
        ...data,
        postprocess: postProc.ok ? postProc.summary : undefined,
        prune: { applied: true, deleted },
      },
      { ...meta, diagnostics: exportResultWithPostprocess.diagnostics },
    );
  }

  async auditOrphans(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const mapping = MODULE_MAPPINGS.list_objects;
    if (!mapping) {
      return failureResult(createDysflowError("MAPPING_ERROR", "Missing list_objects mapping."));
    }
    const listResult = await this.orchestrator.executeMappedTool("list_objects", params, mapping);
    if (!listResult.ok) return listResult;

    // Narrow shape of the `list_objects` result: each category is a list of
    // VBE component names. Fields are optional — an older runtime may omit a
    // category entirely, so every access falls back to an empty list.
    type VbeObjectList = {
      modules?: readonly string[];
      classes?: readonly string[];
      forms?: readonly string[];
      reports?: readonly string[];
      documentModules?: readonly string[];
    };
    const vbeData = listResult.data as VbeObjectList | null;
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

  /**
   * Resolve the `accessPath` for a recording hook (v1.20.0, #762). Used by
   * the verify_code and `import_modules` / `import_all` / `delete_module`
   * recording sites. Returns `undefined` when the target resolution fails
   * or the resolved target has no `accessPath` — recording is best-effort
   * and never throws.
   *
   * The orchestrator's `resolveExecutionTarget` is independent from the
   * executor path used by `executeMappedTool`, so calling it here does not
   * short-circuit the executor. The double-resolve is intentional: the
   * recording hook keeps the consumer of the recording decoupled from the
   * executor's internal target handling.
   */
  private async resolveAccessPathForRecording(
    params: Record<string, unknown>,
  ): Promise<string | undefined> {
    try {
      const target = await this.orchestrator.resolveExecutionTarget(params);
      if (!target.ok) return undefined;
      const accessPath = target.data.accessPath;
      return typeof accessPath === "string" && accessPath.length > 0 ? accessPath : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Issue #958 — resolve the planned form/report sources and run the
   * structural quality gate over them. Returns a failure envelope with
   * `FORM_SOURCE_MALFORMED` (and the per-file defect list in `details`)
   * when any planned document source cannot be parsed; the runner is
   * never invoked in that case.
   */
  private async gateImportFormSources(
    toolName: "import_all" | "import_modules",
    params: Record<string, unknown>,
  ): Promise<OperationResult<undefined>> {
    const target = await this.orchestrator.resolveExecutionTarget(params);
    if (!target.ok) return target;
    const defects = await this.collectImportFormDefects(toolName, params, target.data);
    if (defects.length === 0) return successResult(undefined);
    const listing = defects.map((d) => `${d.file} — ${d.message}`).join(" | ");
    return failureResult(
      createDysflowError(
        "FORM_SOURCE_MALFORMED",
        `Pre-import quality gate rejected ${defects.length} form/report source file(s): ${listing}`,
        {
          details: { defects },
          remediation:
            "Repair the listed .form.txt/.report.txt files (or re-export them from a healthy binary with export_modules/export_all) and retry. Metadata-only legacy defects are self-healed during import; this gate only rejects structural damage the importer cannot repair.",
        },
      ),
    );
  }

  private async collectImportFormDefects(
    toolName: "import_all" | "import_modules",
    params: Record<string, unknown>,
    target: VbaModulesExecutionTarget,
  ): Promise<FormSourceDefect[]> {
    // includeForms:false (#807 bulk) excludes every Form_*/Report_* source
    // from the import — nothing document-shaped will reach LoadFromText, so
    // there is nothing for the structural gate to protect.
    if (params.includeForms === false) return [];
    const moduleNames = stringArray(params.moduleNames);
    const sourceDir = stringValue(params.sourceDir);
    return collectFormSourceDefects(
      {
        root: sourceDir ?? target.destinationRoot,
        moduleNames: toolName === "import_modules" ? moduleNames : [],
        sourcePath: stringValue(params.sourcePath),
      },
      this.fileSystem,
    );
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
    // Issue #958 — surface structural form-source defects in the plan so a
    // dryRun consumer sees exactly what the real run would fail closed on.
    const formDefects = await this.collectImportFormDefects(toolName, params, target.data);
    for (const defect of formDefects) {
      errors.push(`FORM_SOURCE_MALFORMED: ${defect.file} — ${defect.message}`);
    }
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

  // Issue #807 (Feature 2) — bulk import_modules by directory. Resolves
  // the target, runs the bulk service which walks the directory, applies
  // the include/pattern filters, chunks the result, and dispatches each
  // chunk via `executeMappedTool("import_modules", …)` so the dispatch
  // policy + write-gate + per-chunk PowerShell spawn stay centralized in
  // the existing seam. Returns the merged `BulkImportResult`.
  private async runBulkImportByDirectory(
    params: Record<string, unknown>,
  ): Promise<OperationResult<unknown>> {
    const target = await this.orchestrator.resolveExecutionTarget(params);
    if (!target.ok) return target;
    const strict = this.orchestrator.validateStrictContext(params, target.data);
    if (!strict.ok) return strict;

    const sourceDir = stringValue(params.sourceDir) ?? target.data.destinationRoot;
    const recursive = params.recursive !== false;
    const filePatternValue = stringValue(params.filePattern);
    const includeTests = params.includeTests !== false;
    const includeForms = params.includeForms !== false;
    const chunkSize =
      typeof params.chunkSize === "number" && params.chunkSize > 0
        ? Math.floor(params.chunkSize)
        : 10;
    const onChunkError: "continue" | "abort" =
      params.onChunkError === "abort" ? "abort" : "continue";
    const dryRun = params.dryRun === true;
    const apply = params.apply === true;

    const mapping = MODULE_MAPPINGS.import_modules;
    if (mapping === undefined) {
      return failureResult(createDysflowError("MAPPING_ERROR", "Missing import_modules mapping."));
    }

    return runBulkImportByDirectory(
      {
        sourceDir,
        recursive,
        filePattern: filePatternValue ?? null,
        includeTests,
        includeForms,
        chunkSize,
        onChunkError,
        dryRun,
        apply,
        target: {
          accessPath: target.data.accessPath,
          destinationRoot: target.data.destinationRoot,
          timeoutMs: target.data.timeoutMs,
        },
        mapping,
        runImportModules: async (chunkParams) =>
          this.orchestrator.executeMappedTool("import_modules", chunkParams, mapping),
      },
      this.fileSystem,
    );
  }

  // #732 — compile-failure rollback helpers REMOVED in v1.19.0
  // (feat-759-no-compile). compile + rollbackOnCompileFail leave the public
  // surface; the snapshot + rollback helpers above lived only to undo a
  // failed compile, so they are gone with it.
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

/**
 * Read the running `dysflow` package version without throwing on a
 * malformed `package.json`. Returns `"v0.0.0"` when the version is
 * unavailable — callers that embed it in the deprecation note want
 * a stable, machine-readable `vX.Y.Z` shape, never an exception.
 *
 * Issue #757 (C1) — the version is the `since` claim on
 * `metadata.deprecated`. Consumers grep on it to know when the alias
 * was introduced; the contract is `vX.Y.Z`.
 */
function readRuntimeVersionSafe(): string {
  try {
    const pkg = packageJson as { version?: unknown };
    const version = typeof pkg.version === "string" ? pkg.version : "";
    return version.length > 0 ? `v${version}` : "v0.0.0";
  } catch {
    return "v0.0.0";
  }
}

/**
 * Merge two `OperationMetadata` blobs. Today both sides only carry
 * `deprecated`, but later additions (e.g. `experimental`, `featureFlag`)
 * should land here too — each top-level key is independently merged so
 * the surfaces compose without overwriting. When both sides carry the
 * same key, the right-hand side wins (later call site has more
 * context).
 */
function mergeOperationMetadata(
  base: OperationMetadata | undefined,
  overlay: OperationMetadata,
): OperationMetadata {
  if (base === undefined) return overlay;
  return {
    ...base,
    ...overlay,
    deprecated: overlay.deprecated ?? base.deprecated,
    transactional: overlay.transactional ?? base.transactional,
  };
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
