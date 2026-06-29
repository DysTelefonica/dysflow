import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import type { FormIR } from "../../core/models/form-ir.js";
import { compareForms, type FormDriftReport } from "../../core/services/form-ir-compare-service.js";
import {
  collectControls,
  collectFormEvents,
  parseFormTxt,
} from "../../core/services/form-ir-service.js";
import { type FormFileSystemPort, VbaFormService } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
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
  const basename = sourcePath.replace(/\\/g, "/").split("/").pop() ?? "";
  return basename
    .replace(/^Form_/, "")
    .replace(/^Report_/, "")
    .replace(/\.form\.txt$/i, "")
    .replace(/\.report\.txt$/i, "");
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
      toolName === "lint_form_code"
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
}
