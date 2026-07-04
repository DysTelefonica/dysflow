import { isAbsolute, resolve, win32 } from "node:path";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import type { FormIR } from "../../core/models/form-ir.js";
import { compareForms, type FormDriftReport } from "../../core/services/form-ir-compare-service.js";
import {
  addControl,
  cloneFormFromTemplate,
  collectControls,
  collectFormEvents,
  FormMutationError,
  moveControl,
  normalizeLineEndings,
  parseFormTxt,
  renameControl,
  serializeFormTxt,
} from "../../core/services/form-ir-service.js";
import { type FormFileSystemPort, VbaFormService } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import { isPathInside } from "../../core/utils/path-containment.js";
import { isWithinRuntime } from "../../shared/runtime-dir.js";
import { nodeFormFileSystem } from "../services/node-form-file-system.js";
import { VbaFormsLintAdapter } from "./vba-forms-lint-adapter.js";
import type { VbaManagerExecutor } from "./vba-sync-adapter.js";
import { type DirectMapping, mapping } from "./vba-sync-types.js";

const FORMS_MAPPINGS = {
  generate_erd: mapping(
    "Generate-ERD",
    false,
    () => [],
    (input) => ({
      backendPath: stringValue(input.backendPath),
      erdPath: stringValue(input.erdPath),
    }),
  ),
  import_modules_gate: mapping(
    "Import",
    true,
    (input) =>
      Array.isArray(input.moduleNames)
        ? input.moduleNames.filter((value): value is string => typeof value === "string")
        : [],
    (input) => ({ importMode: stringValue(input.importMode) }),
  ),
};

/**
 * Derive the canonical form/report name from a source path by stripping
 * `Form_` / `Report_` prefix and `.form.txt` / `.report.txt` suffix.
 * Mirrors the slice-1 `inspect_form` rule so the consumer-facing names
 * stay consistent across both tools.
 */
function deriveFormName(sourcePath: string): string {
  const fileName = sourcePath.replace(/\\/g, "/").split("/").pop() ?? "";
  return fileName
    .replace(/^Form_/, "")
    .replace(/^Report_/, "")
    .replace(/\.form\.txt$/i, "")
    .replace(/\.report\.txt$/i, "");
}

type FormsExecutionTarget = {
  destinationRoot: string;
  projectRoot?: string;
};

type ManagedFormSource = {
  sourcePath: string;
  destinationRoot: string;
  moduleName: string;
};

/**
 * Shape surfaced in error.details.rollback so consumers can tell what happened.
 * #692 — extended to disambiguate new-target creation from genuine restore.
 *
 * Cases:
 * - target existed, restore succeeded:    { attempted:true, applied:true, targetExisted:true }
 * - target existed, restore failed:         { attempted:true, applied:false, targetExisted:true, error:{message} }
 * - target did NOT exist, restore succeeded: { attempted:true, applied:true, targetExisted:false,
 *                                              restoredState:"empty-placeholder", requiresManualCleanup:true }
 * - target did NOT exist, restore failed:   { attempted:true, applied:false, targetExisted:false,
 *                                            restoredState:"empty-placeholder", requiresManualCleanup:true,
 *                                            error:{message} }
 */
type RollbackOutcome =
  | { attempted: true; applied: true; targetExisted: true }
  | { attempted: true; applied: false; targetExisted: true; error: { message: string } }
  | {
      attempted: true;
      applied: true;
      targetExisted: false;
      restoredState: "empty-placeholder";
      requiresManualCleanup: true;
    }
  | {
      attempted: true;
      applied: false;
      targetExisted: false;
      restoredState: "empty-placeholder";
      requiresManualCleanup: true;
      error: { message: string };
    };

function hasManagedFormExtension(sourcePath: string): boolean {
  return /\.form\.txt$/i.test(sourcePath) || /\.report\.txt$/i.test(sourcePath);
}

function isWindowsPath(path: string): boolean {
  return win32.isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path);
}

function resolveMutationPath(basePath: string, childPath: string): string {
  if (win32.isAbsolute(childPath)) return win32.normalize(childPath);
  if (isAbsolute(childPath)) return resolve(childPath);
  if (isWindowsPath(basePath)) return win32.normalize(win32.resolve(basePath, childPath));
  return resolve(basePath, childPath);
}

function normalizePathForDetails(path: string): string {
  return isWindowsPath(path) ? win32.normalize(path) : resolve(path);
}

export interface VbaFormsOrchestrator {
  executor: VbaManagerExecutor;
  env: Record<string, string | undefined>;
  cwd: string;
  resolveExecutionTarget(params: Record<string, unknown>): Promise<OperationResult<unknown>>;
  validateStrictContext(
    params: Record<string, unknown>,
    target: unknown,
  ): OperationResult<undefined>;
  executeMappedTool(
    toolName: string,
    params: Record<string, unknown>,
    mapping: DirectMapping,
  ): Promise<OperationResult<unknown>>;
}

export class VbaFormsAdapter {
  private readonly formService: VbaFormService;
  private readonly fileSystem: FormFileSystemPort;
  private readonly benchCacheRoot: string;

  /**
   * @param orchestrator - Provides VBA manager execution context.
   * @param fileSystem   - Optional injectable filesystem port. Defaults to the real Node.js fs.
   *                       Inject a mock in tests to avoid real I/O.
   * @param options      - Optional adapter options.
   * @param options.benchCacheRoot - Directory holding canonical bench forms. The
   *   `dysflow_create_form_from_template` tool resolves `source_form` here
   *   first, then falls back to the resolved `projectRoot` (slice 5 OQ2).
   *   Defaults to `<cwd>/bench-cache/ardelperal-VBA_TOOLKIT_BENCH/src/forms`.
   */
  constructor(
    private readonly orchestrator: VbaFormsOrchestrator,
    fileSystem?: FormFileSystemPort,
    options?: { benchCacheRoot?: string },
  ) {
    this.fileSystem = fileSystem ?? nodeFormFileSystem;
    this.benchCacheRoot =
      options?.benchCacheRoot ??
      resolve(this.orchestrator.cwd, "bench-cache", "ardelperal-VBA_TOOLKIT_BENCH", "src", "forms");
    this.formService = new VbaFormService({
      cwd: this.orchestrator.cwd,
      fileSystem: this.fileSystem,
    });
  }

  static handles(toolName: string): boolean {
    return (
      toolName === "generate_erd" ||
      toolName === "validate_form_spec" ||
      toolName === "generate_form" ||
      toolName === "catalog_add_control" ||
      toolName === "harvest_form_catalog" ||
      toolName === "inspect_form" ||
      toolName === "compare_form" ||
      toolName === "lint_form_code" ||
      toolName === "dysflow_form_add_control" ||
      toolName === "dysflow_form_move_control" ||
      toolName === "dysflow_form_rename_control" ||
      toolName === "dysflow_form_serialize" ||
      toolName === "dysflow_form_deserialize" ||
      toolName === "dysflow_create_form_from_template"
    );
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<OperationResult<unknown>> {
    if (toolName === "validate_form_spec") return this.formService.validateFormSpec(params);
    if (toolName === "generate_form") return this.formService.generateForm(params);
    if (toolName === "catalog_add_control") return this.formService.catalogAddControl(params);
    if (toolName === "harvest_form_catalog") return this.formService.harvestFormCatalog(params);
    if (toolName === "inspect_form") return this.inspectForm(params);
    if (toolName === "compare_form") return this.compareForm(params);
    if (toolName === "lint_form_code") return this.lintFormCode(params);
    if (
      toolName === "dysflow_form_add_control" ||
      toolName === "dysflow_form_move_control" ||
      toolName === "dysflow_form_rename_control"
    ) {
      return this.mutateForm(toolName, params);
    }
    if (toolName === "dysflow_form_serialize") return this.serializeForm(params);
    if (toolName === "dysflow_form_deserialize") return this.deserializeForm(params);
    if (toolName === "dysflow_create_form_from_template") {
      return this.cloneFormFromTemplate(params);
    }
    if (toolName === "generate_erd") {
      return this.orchestrator.executeMappedTool(toolName, params, FORMS_MAPPINGS.generate_erd);
    }
    return failureResult(
      createDysflowError(
        "TOOL_NOT_IMPLEMENTED",
        `Tool ${toolName} not supported by VbaFormsAdapter.`,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // inspect_form — read-only, source-path-first (Option C from design)
  // ---------------------------------------------------------------------------

  private async inspectForm(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
    if (!sourcePath) {
      return failureResult(
        createDysflowError(
          "FORM_SPEC_MISSING",
          "inspect_form requires sourcePath (path to the .form.txt file).",
        ),
      );
    }

    // Read from disk — adapter owns the I/O, core is pure
    let text: string;
    try {
      text = await this.fileSystem.readFile(sourcePath);
    } catch (err) {
      return failureResult(
        createDysflowError(
          "FORM_NOT_FOUND",
          `Cannot read form file at "${sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    // Derive the form name from the filename
    const basename = sourcePath.replace(/\\/g, "/").split("/").pop() ?? "";
    const name = basename
      .replace(/^Form_/, "")
      .replace(/^Report_/, "")
      .replace(/\.form\.txt$/i, "")
      .replace(/\.report\.txt$/i, "");

    // Parse — pure, no I/O
    let ir: FormIR;
    try {
      ir = parseFormTxt(text, { name });
    } catch (err) {
      return failureResult(
        createDysflowError(
          "FORM_PARSE_ERROR",
          `Failed to parse "${sourcePath}": ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    // Extract controls and events from the IR
    const controls = collectControls(ir.root);
    const events = collectFormEvents(ir.root);

    return successResult({
      name: ir.name,
      kind: ir.kind,
      controls,
      events,
    });
  }

  // ---------------------------------------------------------------------------
  // compare_form — read-only, source-vs-source drift (Option C, source-path)
  // ---------------------------------------------------------------------------

  private async compareForm(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    // Source/target path resolution. `path` is accepted as an alias for
    // `sourcePath`, and `target` is accepted as an alias for `targetPath`,
    // mirroring the slice-1 `inspect_form` parity.
    const sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
    const targetPath = stringValue(params.targetPath) ?? stringValue(params.target);

    if (!sourcePath) {
      return failureResult(
        createDysflowError(
          "FORM_SPEC_MISSING",
          "compare_form requires sourcePath (path to the left .form.txt file).",
        ),
      );
    }
    if (!targetPath) {
      return failureResult(
        createDysflowError(
          "FORM_SPEC_MISSING",
          "compare_form requires targetPath (path to the right .form.txt file).",
        ),
      );
    }

    // Read both files via the injectable port (no Access, no COM).
    let leftText: string;
    let rightText: string;
    try {
      leftText = await this.fileSystem.readFile(sourcePath);
    } catch (err) {
      return failureResult(
        createDysflowError(
          "FORM_NOT_FOUND",
          `Cannot read source form file at "${sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
    try {
      rightText = await this.fileSystem.readFile(targetPath);
    } catch (err) {
      return failureResult(
        createDysflowError(
          "FORM_NOT_FOUND",
          `Cannot read target form file at "${targetPath}". ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    // Derive form names from filenames (mirror inspect_form derivation).
    const leftName = deriveFormName(sourcePath);
    const rightName = deriveFormName(targetPath);

    // Parse both via the slice-1 pure parser. A malformed input fails closed
    // with FORM_PARSE_ERROR so the caller never sees a partial report.
    let leftIR: FormIR;
    let rightIR: FormIR;
    try {
      leftIR = parseFormTxt(leftText, { name: leftName });
    } catch (err) {
      return failureResult(
        createDysflowError(
          "FORM_PARSE_ERROR",
          `Failed to parse source "${sourcePath}": ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
    try {
      rightIR = parseFormTxt(rightText, { name: rightName });
    } catch (err) {
      return failureResult(
        createDysflowError(
          "FORM_PARSE_ERROR",
          `Failed to parse target "${targetPath}": ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    // Pure diff — no I/O, no Access.
    const report: FormDriftReport = compareForms({
      left: leftIR,
      right: rightIR,
      leftName,
      rightName,
    });
    return successResult(report);
  }

  // ---------------------------------------------------------------------------
  // lint_form_code — read-only form-level audit (no binary mutation)
  // ---------------------------------------------------------------------------

  private async lintFormCode(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const lintAdapter = new VbaFormsLintAdapter(this.fileSystem);
    return lintAdapter.lintFormCode({
      destinationRoot: stringValue(params.destinationRoot),
      sourceRoot: stringValue(params.sourceRoot),
      formName: stringValue(params.formName),
      moduleNames: Array.isArray(params.moduleNames)
        ? params.moduleNames.filter((m): m is string => typeof m === "string")
        : undefined,
      rules: Array.isArray(params.rules)
        ? params.rules.filter(
            (r): r is import("../../core/services/form-lint-types.js").LintRuleId =>
              typeof r === "string",
          )
        : undefined,
      strict: params.strict === true,
    });
  }

  // ---------------------------------------------------------------------------
  // dysflow_form_* — source mutation with import_modules LoadFromText gate
  // ---------------------------------------------------------------------------

  private async resolveManagedMutationSource(
    toolName: string,
    params: Record<string, unknown>,
    rawSourcePath: string,
  ): Promise<OperationResult<ManagedFormSource>> {
    if (!hasManagedFormExtension(rawSourcePath)) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          `${toolName} requires sourcePath to end with .form.txt or .report.txt.`,
        ),
      );
    }

    const target = await this.orchestrator.resolveExecutionTarget(params);
    if (!target.ok) return target as OperationResult<ManagedFormSource>;
    const targetData = target.data as FormsExecutionTarget;
    const strict = this.orchestrator.validateStrictContext(params, targetData);
    if (!strict.ok) return strict as OperationResult<ManagedFormSource>;

    const destinationRoot = normalizePathForDetails(targetData.destinationRoot);
    const projectRoot =
      targetData.projectRoot !== undefined
        ? normalizePathForDetails(targetData.projectRoot)
        : undefined;
    const sourcePath = normalizePathForDetails(resolveMutationPath(destinationRoot, rawSourcePath));

    if (isWithinRuntime(sourcePath, this.orchestrator.env ?? process.env)) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          "Refusing to mutate a form/report source inside the dysflow production runtime.",
        ),
      );
    }
    if (isWithinRuntime(destinationRoot, this.orchestrator.env ?? process.env)) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          "Refusing to import form/report source from a destinationRoot inside the dysflow production runtime.",
        ),
      );
    }

    if (!isPathInside(sourcePath, destinationRoot)) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          `sourcePath must be inside the resolved destinationRoot used by import_modules. sourcePath=${sourcePath}; destinationRoot=${destinationRoot}.`,
        ),
      );
    }
    if (projectRoot !== undefined && !isPathInside(sourcePath, projectRoot)) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          `sourcePath must be inside the resolved projectRoot. sourcePath=${sourcePath}; projectRoot=${projectRoot}.`,
        ),
      );
    }

    return successResult({
      sourcePath,
      destinationRoot,
      moduleName: deriveFormName(sourcePath),
    });
  }

  private async mutateForm(
    toolName:
      | "dysflow_form_add_control"
      | "dysflow_form_move_control"
      | "dysflow_form_rename_control",
    params: Record<string, unknown>,
  ): Promise<OperationResult<unknown>> {
    const sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
    if (!sourcePath) {
      return failureResult(
        createDysflowError(
          "FORM_SPEC_MISSING",
          `${toolName} requires sourcePath (path to the .form.txt file).`,
        ),
      );
    }

    const source = await this.resolveManagedMutationSource(toolName, params, sourcePath);
    if (!source.ok) return source;

    let originalSource: string;
    try {
      originalSource = await this.fileSystem.readFile(source.data.sourcePath);
    } catch (err) {
      return failureResult(
        createDysflowError(
          "FORM_NOT_FOUND",
          `Cannot read form file at "${source.data.sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    let ir: FormIR;
    try {
      ir = parseFormTxt(originalSource, { name: source.data.moduleName });
    } catch (err) {
      return failureResult(
        createDysflowError(
          "FORM_PARSE_ERROR",
          `Failed to parse "${source.data.sourcePath}": ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    try {
      const mutation =
        toolName === "dysflow_form_add_control"
          ? addControl(ir, {
              targetSectionName: stringValue(params.targetSectionName),
              control: {
                name: stringValue(params.controlName) ?? stringValue(params.name) ?? "",
                type: stringValue(params.controlType) ?? stringValue(params.type) ?? "",
                properties: readProperties(params.properties),
              },
            })
          : toolName === "dysflow_form_move_control"
            ? moveControl(ir, {
                controlName: stringValue(params.controlName) ?? "",
                left: numberValue(params.left),
                top: numberValue(params.top),
              })
            : renameControl(ir, {
                controlName: stringValue(params.controlName) ?? "",
                newName: stringValue(params.newName) ?? stringValue(params.name) ?? "",
              });

      const apply = params.apply === true || params.dryRun === false;
      if (!apply) {
        return successResult({
          mode: "dry-run",
          sourcePath: source.data.sourcePath,
          source: mutation.source,
          changedControlName: mutation.changedControlName,
          preservedKeys: mutation.preservedKeys,
          importGate: "not-run",
        });
      }

      try {
        await this.fileSystem.writeFile(source.data.sourcePath, mutation.source, "utf8");
      } catch (err) {
        return failureResult(
          createDysflowError(
            "FORM_WRITE_FAILED",
            `Cannot write mutated form file at "${source.data.sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }

      const importParams = {
        ...params,
        sourcePath: source.data.sourcePath,
        destinationRoot: source.data.destinationRoot,
        moduleNames: [source.data.moduleName],
        importMode: "Auto",
        apply: true,
        dryRun: false,
      };
      const importResult = await this.orchestrator.executeMappedTool(
        "import_modules",
        importParams,
        FORMS_MAPPINGS.import_modules_gate,
      );
      if (!importResult.ok) {
        // Capture rollback outcome for consumer visibility (#692).
        // source always existed here (readFile succeeded above).
        const rollbackOutcome = await this.captureRollbackOutcome(
          () => this.fileSystem.writeFile(source.data.sourcePath, originalSource, "utf8"),
          true, // targetExisted — source file always exists in mutateForm
        );
        return failureResult(
          createDysflowError(
            "FORM_IMPORT_GATE_FAILED",
            `import_modules apply gate failed for "${source.data.sourcePath}": ${importResult.error.message}`,
            { details: { cause: importResult.error, rollback: rollbackOutcome } },
          ),
        );
      }

      return successResult({
        mode: "apply",
        sourcePath: source.data.sourcePath,
        changedControlName: mutation.changedControlName,
        preservedKeys: mutation.preservedKeys,
        importGate: "passed",
        importResult: importResult.data,
      });
    } catch (err) {
      if (err instanceof FormMutationError) {
        return failureResult(createDysflowError(err.code, err.message));
      }
      return failureResult(
        createDysflowError(
          "FORM_MUTATION_INVALID",
          err instanceof Error ? err.message : String(err),
        ),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // dysflow_form_serialize — read-only round-trip: parse -> serialize -> report
  // ---------------------------------------------------------------------------

  /**
   * Read-only round-trip serializer (#616 slice 3). Parses the .form.txt at
   * `sourcePath`, re-serializes the resulting FormIR, and reports whether the
   * serialized output is byte-equal to the normalized original (LF endings).
   * No Access is opened, no binary is touched, no file is written. Apply is
   * ignored — this tool is intentionally read-only.
   */
  private async serializeForm(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
    if (!sourcePath) {
      return failureResult(
        createDysflowError(
          "FORM_SPEC_MISSING",
          "dysflow_form_serialize requires sourcePath (path to the .form.txt file).",
        ),
      );
    }

    let originalText: string;
    try {
      originalText = await this.fileSystem.readFile(sourcePath);
    } catch (err) {
      return failureResult(
        createDysflowError(
          "FORM_NOT_FOUND",
          `Cannot read form file at "${sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    const name =
      stringValue(params.formName) ??
      deriveFormName(sourcePath) ??
      stringValue(params.name) ??
      "Form";

    let ir: FormIR;
    try {
      ir = parseFormTxt(originalText, { name });
    } catch (err) {
      return failureResult(
        createDysflowError(
          "FORM_PARSE_ERROR",
          `Failed to parse "${sourcePath}": ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    const serialized = serializeFormTxt(ir);
    const normalizedOriginal = normalizeLineEndings(originalText);
    const byteEqual = serialized === normalizedOriginal;
    const byteDiff = Math.abs(serialized.length - normalizedOriginal.length);
    const opaqueCount = countOpaqueEntries(ir);

    return successResult({
      name: ir.name,
      kind: ir.kind,
      serialized,
      byteEqual,
      byteDiff,
      metadataReport: {
        preservedKeys: PRESERVED_METADATA_KEYS_FOR_SERIALIZE,
        byteDiff,
        opaqueCount,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // dysflow_form_deserialize — write-gated: serialize IR -> write -> import gate
  // ---------------------------------------------------------------------------

  /**
   * Write-gated FormIR -> .form.txt deserializer (#616 slice 3). Re-serializes
   * the supplied `ir` to text, writes it to `sourcePath` on apply, and invokes
   * the existing `import_modules` LoadFromText gate. On gate failure the
   * original source is restored best-effort (same pattern as slice 4 mutation
   * tools). Defaults to dry-run (no write, no import).
   */
  private async deserializeForm(
    params: Record<string, unknown>,
  ): Promise<OperationResult<unknown>> {
    const sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
    if (!sourcePath) {
      return failureResult(
        createDysflowError(
          "FORM_SPEC_MISSING",
          "dysflow_form_deserialize requires sourcePath (path to the .form.txt file).",
        ),
      );
    }

    const ir = readFormIR(params.ir);
    if (ir === undefined) {
      return failureResult(
        createDysflowError(
          "FORM_SPEC_MISSING",
          "dysflow_form_deserialize requires an `ir` parameter (FormIR object).",
        ),
      );
    }

    const source = await this.resolveManagedMutationSource(
      "dysflow_form_deserialize",
      params,
      sourcePath,
    );
    if (!source.ok) return source;

    let originalSource: string;
    try {
      originalSource = await this.fileSystem.readFile(source.data.sourcePath);
    } catch (err) {
      return failureResult(
        createDysflowError(
          "FORM_NOT_FOUND",
          `Cannot read form file at "${source.data.sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    const serializedText = serializeFormTxt(ir);
    const apply = params.apply === true || params.dryRun === false;

    if (!apply) {
      return successResult({
        mode: "dry-run",
        sourcePath: source.data.sourcePath,
        written: false,
        appliedChecksumBefore: undefined,
        appliedChecksumAfter: undefined,
        loadFromTextGate: "skipped",
        preview: serializedText,
      });
    }

    try {
      await this.fileSystem.writeFile(source.data.sourcePath, serializedText, "utf8");
    } catch (err) {
      return failureResult(
        createDysflowError(
          "FORM_WRITE_FAILED",
          `Cannot write form file at "${source.data.sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    const importParams = {
      ...params,
      sourcePath: source.data.sourcePath,
      destinationRoot: source.data.destinationRoot,
      moduleNames: [source.data.moduleName],
      importMode: "Auto",
      apply: true,
      dryRun: false,
    };
    const importResult = await this.orchestrator.executeMappedTool(
      "import_modules",
      importParams,
      FORMS_MAPPINGS.import_modules_gate,
    );
    if (!importResult.ok) {
      // Capture rollback outcome for consumer visibility (#692).
      // source always existed here (readFile succeeded above).
      const rollbackOutcome = await this.captureRollbackOutcome(
        () => this.fileSystem.writeFile(source.data.sourcePath, originalSource, "utf8"),
        true, // targetExisted — source file always exists in deserializeForm
      );
      return failureResult(
        createDysflowError(
          "FORM_IMPORT_GATE_FAILED",
          `import_modules apply gate failed for "${source.data.sourcePath}": ${importResult.error.message}`,
          { details: { cause: importResult.error, rollback: rollbackOutcome } },
        ),
      );
    }

    return successResult({
      mode: "apply",
      sourcePath: source.data.sourcePath,
      written: true,
      appliedChecksumBefore: undefined,
      appliedChecksumAfter: undefined,
      loadFromTextGate: "passed",
      importResult: importResult.data,
    });
  }

  // ---------------------------------------------------------------------------
  // dysflow_create_form_from_template — slice 5 (issue #618)
  // ---------------------------------------------------------------------------
  //
  // Pipeline:
  //   1. Resolve `sourceForm` against the bench cache first, then the resolved
  //      projectRoot (OQ2). Read the source `.form.txt` and parse via
  //      `parseFormTxt` — the engine is pure, the adapter owns I/O.
  //   2. Run `cloneFormFromTemplate(sourceIr, opts)` over the bench source.
  //   3. Resolve `targetForm` to the SAME root as the source — bench if bench,
  //      projectRoot otherwise. Read it to check existence.
  //   4. If `targetExisted && !overwrite` → FORM_TARGET_EXISTS, no write.
  //   5. Dry-run: return the post-replacement preview + token summary.
  //      Apply: write target, route through `import_modules` LoadFromText gate.
  //      On gate failure, best-effort restore the original target content.
  //
  // The restore-on-failure captures `originalTargetText` (empty string when the
  // target was newly created) and writes it back best-effort. Slice 4
  // `dysflow_form_deserialize` mirrors this pattern on the source path.

  private async cloneFormFromTemplate(
    params: Record<string, unknown>,
  ): Promise<OperationResult<unknown>> {
    const sourceForm = stringValue(params.sourceForm);
    const targetForm = stringValue(params.targetForm);
    if (!sourceForm) {
      return failureResult(
        createDysflowError(
          "FORM_SPEC_MISSING",
          "dysflow_create_form_from_template requires sourceForm (form name).",
        ),
      );
    }
    if (!targetForm) {
      return failureResult(
        createDysflowError(
          "FORM_SPEC_MISSING",
          "dysflow_create_form_from_template requires targetForm (form name).",
        ),
      );
    }
    if (
      !hasManagedFormExtension(`${sourceForm}.form.txt`) ||
      !hasManagedFormExtension(`${targetForm}.form.txt`)
    ) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          "dysflow_create_form_from_template requires sourceForm and targetForm to start with 'Form_' or 'Report_'.",
        ),
      );
    }

    // Structural validation of tokenMap happens here so we never read source files for an
    // obviously-invalid request. The engine's `validateTokenMap` is the gate that throws
    // FORM_TOKEN_MAP_INVALID for malformed keys/values — it WILL still be reached for any
    // missed checks (engine defense in depth).
    const tokenMapResult = readTokenMap(params.tokenMap);
    if (!tokenMapResult.ok) {
      return failureResult(createDysflowError("FORM_TOKEN_MAP_INVALID", tokenMapResult.message));
    }
    const tokenMap = tokenMapResult.tokenMap;

    const strictMissingTokens = params.strictMissingTokens === true;
    const requestedPolicy = stringValue(params.missingTokenPolicy);
    const missingTokenPolicy: "warn-pass-through" | "strict" =
      strictMissingTokens || requestedPolicy === "strict" ? "strict" : "warn-pass-through";
    const overwrite = params.overwrite === true;
    const apply = params.apply === true || params.dryRun === false;

    // Resolve the orchestrator target early so we can build both candidate paths (bench-first,
    // projectRoot-fallback).
    const targetResolution = await this.orchestrator.resolveExecutionTarget(params);
    if (!targetResolution.ok) return targetResolution;
    const targetData = targetResolution.data as FormsExecutionTarget;
    const projectRoot =
      targetData.projectRoot !== undefined
        ? normalizePathForDetails(targetData.projectRoot)
        : normalizePathForDetails(targetData.destinationRoot);

    // 1) bench-first resolve for the source.
    const benchSourcePath = resolveMutationPath(this.benchCacheRoot, `${sourceForm}.form.txt`);
    let sourcePath: string;
    let sourceRoot: "bench" | "projectRoot";
    let sourceText: string;
    try {
      sourceText = await this.fileSystem.readFile(benchSourcePath);
      sourcePath = normalizePathForDetails(benchSourcePath);
      sourceRoot = "bench";
    } catch {
      // 2) projectRoot fallback for the source.
      const projectSourcePath = resolveMutationPath(projectRoot, `forms/${sourceForm}.form.txt`);
      try {
        sourceText = await this.fileSystem.readFile(projectSourcePath);
        sourcePath = normalizePathForDetails(projectSourcePath);
        sourceRoot = "projectRoot";
      } catch {
        return failureResult(
          createDysflowError(
            "FORM_NOT_FOUND",
            `Cannot resolve source form "${sourceForm}" in bench-cache or projectRoot.`,
          ),
        );
      }
    }

    if (isWithinRuntime(sourcePath, this.orchestrator.env ?? process.env)) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          "Refusing to clone a form whose source lives inside the dysflow production runtime.",
        ),
      );
    }
    // #675 — also reject source paths that escape the resolved root.
    // The runtime check above is not enough: a path outside the runtime
    // could still traverse out of the bench-cache / projectRoot.
    const sourceRootForContainment = sourceRoot === "bench" ? this.benchCacheRoot : projectRoot;
    if (!isPathInside(sourcePath, sourceRootForContainment)) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          `dysflow_create_form_from_template sourcePath must be inside the resolved source root. sourcePath=${sourcePath}; root=${sourceRootForContainment}.`,
        ),
      );
    }

    // Parse the source IR — pure.
    let sourceIr: FormIR;
    try {
      sourceIr = parseFormTxt(sourceText, { name: deriveFormName(sourcePath) });
    } catch (err) {
      return failureResult(
        createDysflowError(
          "FORM_PARSE_ERROR",
          `Failed to parse "${sourcePath}": ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    // Target lives in the SAME root as the source (bench or projectRoot).
    const targetPath =
      sourceRoot === "bench"
        ? normalizePathForDetails(
            resolveMutationPath(this.benchCacheRoot, `${targetForm}.form.txt`),
          )
        : normalizePathForDetails(resolveMutationPath(projectRoot, `forms/${targetForm}.form.txt`));

    // #675 — replace the dead `hasManagedFormExtension` suffix-only
    // validation with a real path-containment check on the target.
    // The previous check only verified the `.form.txt` / `.report.txt`
    // suffix, which let a caller pass `targetForm = "../etc/passwd"`
    // and escape the bench-cache / projectRoot.
    const targetRoot = sourceRoot === "bench" ? this.benchCacheRoot : projectRoot;
    if (!isPathInside(targetPath, targetRoot)) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          `dysflow_create_form_from_template targetPath must be inside the resolved source root. targetPath=${targetPath}; root=${targetRoot}.`,
        ),
      );
    }

    if (isWithinRuntime(targetPath, this.orchestrator.env ?? process.env)) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          "Refusing to write a cloned form inside the dysflow production runtime.",
        ),
      );
    }

    // 3) Check target existence (capture original for restore-on-failure).
    let targetExisted = false;
    let originalTargetText = "";
    try {
      originalTargetText = await this.fileSystem.readFile(targetPath);
      targetExisted = true;
    } catch {
      // not present — newly created
    }
    if (targetExisted && !overwrite) {
      return failureResult(
        createDysflowError(
          "FORM_TARGET_EXISTS",
          `Target form "${targetForm}" already exists at "${targetPath}". Pass overwrite:true to replace it via the gated restore path.`,
        ),
      );
    }

    // 4) Run the clone engine.
    let cloneResult: ReturnType<typeof cloneFormFromTemplate>;
    try {
      cloneResult = cloneFormFromTemplate(sourceIr, {
        tokenMap,
        targetFormName: targetForm,
        missingTokenPolicy,
      });
    } catch (err) {
      if (err instanceof FormMutationError) {
        return failureResult(createDysflowError(err.code, err.message));
      }
      return failureResult(
        createDysflowError(
          "FORM_MUTATION_INVALID",
          err instanceof Error ? err.message : String(err),
        ),
      );
    }

    if (!apply) {
      return successResult({
        mode: "dry-run",
        sourcePath,
        targetPath,
        targetExisted,
        importGate: "not-run",
        appliedTokens: cloneResult.appliedTokens,
        missingTokens: cloneResult.missingTokens,
        warnings: cloneResult.warnings,
        preservedKeys: cloneResult.preservedKeys,
        targetSource: cloneResult.source,
      });
    }

    // 5) Apply: write the target, then route through import_modules.
    try {
      await this.fileSystem.writeFile(targetPath, cloneResult.source, "utf8");
    } catch (err) {
      return failureResult(
        createDysflowError(
          "FORM_WRITE_FAILED",
          `Cannot write cloned form file at "${targetPath}". ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    const importParams = {
      ...params,
      sourcePath: targetPath,
      destinationRoot:
        sourceRoot === "bench"
          ? this.benchCacheRoot
          : normalizePathForDetails(targetData.destinationRoot),
      moduleNames: [deriveFormName(targetPath)],
      importMode: "Auto",
      apply: true,
      dryRun: false,
    };
    const importResult = await this.orchestrator.executeMappedTool(
      "import_modules",
      importParams,
      FORMS_MAPPINGS.import_modules_gate,
    );
    if (!importResult.ok) {
      // Capture rollback outcome for consumer visibility (#692).
      // When targetExisted was false the target was newly created — writing
      // originalTargetText (empty string) back is the best-effort restore;
      // the caller decides whether to delete or keep the failed artifact.
      const rollbackOutcome = await this.captureRollbackOutcome(
        () => this.fileSystem.writeFile(targetPath, originalTargetText, "utf8"),
        targetExisted,
      );
      return failureResult(
        createDysflowError(
          "FORM_IMPORT_GATE_FAILED",
          `import_modules apply gate failed for "${targetPath}": ${importResult.error.message}`,
          { details: { cause: importResult.error, rollback: rollbackOutcome } },
        ),
      );
    }

    return successResult({
      mode: "apply",
      sourcePath,
      targetPath,
      targetExisted,
      importGate: "passed",
      appliedTokens: cloneResult.appliedTokens,
      missingTokens: cloneResult.missingTokens,
      warnings: cloneResult.warnings,
      preservedKeys: cloneResult.preservedKeys,
      targetSource: cloneResult.source,
      importResult: importResult.data,
    });
  }

  /**
   * Attempt the supplied best-effort restore write and report the outcome so
   * error.details.rollback carries a consumer-visible contract. Used by form
   * mutation, deserializeForm, and cloneFormFromTemplate when the import gate
   * fails and a restore is required.
   *
   * #692 — when `targetExisted` is false the original state was "no file".
   * The caller's restore write may create a placeholder artifact instead of a
   * true restore (for example, empty string for a new target). The returned
   * `restoredState:"empty-placeholder"` and `requiresManualCleanup:true`
   * signal this ambiguity to the consumer.
   */
  private async captureRollbackOutcome(
    write: () => Promise<void>,
    targetExisted: boolean,
  ): Promise<RollbackOutcome> {
    try {
      await write();
      if (targetExisted) {
        return { attempted: true, applied: true, targetExisted: true };
      }
      // New target — original state was "no file"; rollback wrote empty string.
      return {
        attempted: true,
        applied: true,
        targetExisted: false,
        restoredState: "empty-placeholder",
        requiresManualCleanup: true,
      };
    } catch (err) {
      if (targetExisted) {
        return {
          attempted: true,
          applied: false,
          targetExisted: true,
          error: { message: err instanceof Error ? err.message : String(err) },
        };
      }
      return {
        attempted: true,
        applied: false,
        targetExisted: false,
        restoredState: "empty-placeholder",
        requiresManualCleanup: true,
        error: { message: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Read and structurally validate the token map at the adapter boundary so we
 * never read source files for an obviously-bad request. Returns either a
 * parsed `Record<string, string>` or an actionable error message. The engine's
 * `validateTokenMap` is the contract — engine defense-in-depth will catch any
 * slipped-through value via the same FORM_TOKEN_MAP_INVALID code path.
 */
function readTokenMap(
  value: unknown,
): { ok: true; tokenMap: Readonly<Record<string, string>> } | { ok: false; message: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, message: "tokenMap must be an object of token -> string mappings." };
  }
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof key !== "string" || key.length === 0) {
      return {
        ok: false,
        message: `Token map keys must be non-empty strings; received ${JSON.stringify(key)}.`,
      };
    }
    if (typeof v !== "string") {
      return {
        ok: false,
        message: `Token "${key}" maps to a non-string value (${typeof v}). Token values must be strings.`,
      };
    }
    out[key] = v;
  }
  return { ok: true, tokenMap: out };
}

function readProperties(value: unknown): Record<string, string | number | boolean> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, propertyValue] of Object.entries(value)) {
    if (
      typeof propertyValue === "string" ||
      typeof propertyValue === "number" ||
      typeof propertyValue === "boolean"
    ) {
      out[key] = propertyValue;
    }
  }
  return out;
}

// Slice 3 (#616) — opaque metadata keys reported by dysflow_form_serialize
// as the "preserved" set the round-trip is contracted to keep byte-equal.
const PRESERVED_METADATA_KEYS_FOR_SERIALIZE = ["Checksum", "Format", "PrtDevMode"] as const;

/** Count opaque (blob) entries in a FormIR — used for the metadata report. */
function countOpaqueEntries(ir: FormIR): number {
  let count = 0;
  const walk = (node: FormIR["root"]): void => {
    for (const entry of node.entries) {
      if (entry.kind === "blob") count++;
    }
    for (const child of node.children) walk(child);
  };
  walk(ir.root);
  return count;
}

/**
 * Read a FormIR-shaped object from the deserializer input. Permissive: any
 * object with a `root` property of the right shape is accepted (the round-trip
 * tool contract is structural, not nominal). Returns undefined for anything
 * that cannot be coerced to a FormIR.
 */
function readFormIR(value: unknown): FormIR | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const candidate = value as { name?: unknown; kind?: unknown; root?: unknown };
  if (typeof candidate.root !== "object" || candidate.root === null) return undefined;
  const kind = candidate.kind === "Report" ? "Report" : "Form";
  const name = typeof candidate.name === "string" ? candidate.name : "Form";
  // The slice-1 FormIR contract carries preamble/root/codeBehind; we keep the
  // caller's `preamble` and `codeBehind` if provided, otherwise default to
  // empty/null so the re-serialized output stays minimal and deterministic.
  const ir: FormIR = {
    name,
    kind,
    preamble: Array.isArray((candidate as { preamble?: unknown }).preamble)
      ? ((candidate as { preamble: unknown[] }).preamble as FormIR["preamble"])
      : [],
    root: candidate.root as FormIR["root"],
    codeBehind:
      typeof (candidate as { codeBehind?: unknown }).codeBehind === "string"
        ? (candidate as { codeBehind: string }).codeBehind
        : null,
  };
  return ir;
}
