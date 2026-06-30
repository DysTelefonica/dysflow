import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
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
  collectControls,
  collectFormEvents,
  FormMutationError,
  moveControl,
  parseFormTxt,
  renameControl,
} from "../../core/services/form-ir-service.js";
import { type FormFileSystemPort, VbaFormService } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import { isWithinRuntime } from "../../shared/runtime-dir.js";
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

// Node.js implementation of the form filesystem port.
// Adapters own the concrete I/O; core owns only the interface.
const nodeFormFileSystem: FormFileSystemPort = {
  mkdir: (path, options) => mkdir(path, options),
  readdir: (path) => readdir(path),
  readFile: (path) => readFile(path, "utf8"),
  readJson: async <T>(path: string): Promise<T> => {
    const raw = await readFile(path, "utf8");
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(`Invalid JSON file: ${path}`);
    }
  },
  writeFile: (path, data, encoding) => writeFile(path, data, encoding),
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

function hasManagedFormExtension(sourcePath: string): boolean {
  return /\.form\.txt$/i.test(sourcePath) || /\.report\.txt$/i.test(sourcePath);
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const rel = relative(resolve(parentPath), resolve(childPath));
  return rel === "" || (rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel));
}

function normalizePathForDetails(path: string): string {
  return resolve(path);
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

  /**
   * @param orchestrator - Provides VBA manager execution context.
   * @param fileSystem   - Optional injectable filesystem port. Defaults to the real Node.js fs.
   *                       Inject a mock in tests to avoid real I/O.
   */
  constructor(
    private readonly orchestrator: VbaFormsOrchestrator,
    fileSystem?: FormFileSystemPort,
  ) {
    this.fileSystem = fileSystem ?? nodeFormFileSystem;
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
      toolName === "dysflow_form_rename_control"
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
    const sourcePath = normalizePathForDetails(
      isAbsolute(rawSourcePath) ? rawSourcePath : resolve(destinationRoot, rawSourcePath),
    );

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
        await Promise.resolve(
          this.fileSystem.writeFile(source.data.sourcePath, originalSource, "utf8"),
        ).catch(() => undefined);
        return failureResult(
          createDysflowError(
            "FORM_IMPORT_GATE_FAILED",
            `import_modules apply gate failed for "${source.data.sourcePath}": ${importResult.error.message}`,
            { details: { cause: importResult.error } },
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
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
