import { resolve } from "node:path";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
} from "../../core/contracts/index.js";
import { type FormFileSystemPort, VbaFormService } from "../../core/services/vba-form-service.js";
import { nodeFormFileSystem } from "../services/node-form-file-system.js";
import { executeFormUiBuilderTool, type FormUiBuilderToolName } from "./vba-forms-ai-tools.js";
import { cloneFormFromTemplate } from "./vba-forms-clone-tools.js";
import { mutateForm } from "./vba-forms-mutation-tools.js";
import { compareForm, inspectForm, lintFormCode } from "./vba-forms-read-tools.js";
import { deserializeForm, serializeForm } from "./vba-forms-serialization-tools.js";
import { FORMS_MAPPINGS } from "./vba-forms-tool-mappings.js";
import type { VbaFormsOrchestrator } from "./vba-forms-types.js";

export type { VbaFormsOrchestrator } from "./vba-forms-types.js";

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
   *   `create_form_from_template` tool resolves `source_form` here
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
      toolName === "form_add_control" ||
      toolName === "form_move_control" ||
      toolName === "form_rename_control" ||
      toolName === "form_serialize" ||
      toolName === "form_deserialize" ||
      toolName === "create_form_from_template" ||
      toolName === "analyze_form_ui" ||
      toolName === "map_form_behavior" ||
      toolName === "generate_form_design_plan" ||
      toolName === "apply_form_design_plan" ||
      toolName === "copy_form_ui_pattern" ||
      toolName === "verify_form_ui"
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
    if (toolName === "inspect_form") return inspectForm(this.fileSystem, params, this.orchestrator);
    if (toolName === "compare_form") return compareForm(this.fileSystem, params, this.orchestrator);
    if (toolName === "lint_form_code")
      return lintFormCode(this.fileSystem, params, this.orchestrator);
    if (
      toolName === "form_add_control" ||
      toolName === "form_move_control" ||
      toolName === "form_rename_control"
    ) {
      return mutateForm({
        orchestrator: this.orchestrator,
        fileSystem: this.fileSystem,
        toolName,
        params,
      });
    }
    if (toolName === "form_serialize")
      return serializeForm(this.fileSystem, params, this.orchestrator);
    if (toolName === "form_deserialize") {
      return deserializeForm({
        orchestrator: this.orchestrator,
        fileSystem: this.fileSystem,
        params,
      });
    }
    if (toolName === "create_form_from_template") {
      return cloneFormFromTemplate({
        orchestrator: this.orchestrator,
        fileSystem: this.fileSystem,
        benchCacheRoot: this.benchCacheRoot,
        params,
      });
    }
    if (
      toolName === "analyze_form_ui" ||
      toolName === "map_form_behavior" ||
      toolName === "generate_form_design_plan" ||
      toolName === "apply_form_design_plan" ||
      toolName === "copy_form_ui_pattern" ||
      toolName === "verify_form_ui"
    ) {
      return executeFormUiBuilderTool({
        fileSystem: this.fileSystem,
        orchestrator: this.orchestrator,
        toolName: toolName as FormUiBuilderToolName,
        params,
      });
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
}
