import { resolve } from "node:path";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
} from "../../core/contracts/index.js";
import { type FormFileSystemPort, VbaFormService } from "../../core/services/vba-form-service.js";
import type { CodeGraphVbaInvoker } from "../codegraph-vba/index.js";
import { nodeFormFileSystem } from "../services/node-form-file-system.js";
import { executeFormUiBuilderTool, type FormUiBuilderToolName } from "./vba-forms-ai-tools.js";
import { cloneFormFromTemplate } from "./vba-forms-clone-tools.js";
import { mutateForm } from "./vba-forms-mutation-tools.js";
import {
  compareForm,
  inspectForm,
  lintFormCode,
  renderFormPreviewTool,
} from "./vba-forms-read-tools.js";
import { deserializeForm, serializeForm } from "./vba-forms-serialization-tools.js";
import { FORMS_MAPPINGS } from "./vba-forms-tool-mappings.js";
import type { VbaFormsOrchestrator } from "./vba-forms-types.js";

export type { VbaFormsOrchestrator } from "./vba-forms-types.js";

export type VbaFormsAdapterOptions = {
  benchCacheRoot?: string;
  /**
   * Issue #830 — optional CodeGraph-VBA invoker. When supplied, the
   * `map_form_behavior` tool consults it for the `autoFetchCodeGraph:true`
   * opt-in path. When absent, that path falls back to the legacy
   * `.form.txt`-only behavior (graceful, no throw).
   */
  codeGraphVbaInvoker?: CodeGraphVbaInvoker;
};

export class VbaFormsAdapter {
  private readonly formService: VbaFormService;
  private readonly fileSystem: FormFileSystemPort;
  private readonly benchCacheRoot: string;
  private readonly orchestrator: VbaFormsOrchestrator;

  /**
   * @param orchestrator - Provides VBA manager execution context.
   * @param fileSystem   - Optional injectable filesystem port. Defaults to the real Node.js fs.
   *                       Inject a mock in tests to avoid real I/O.
   * @param options      - Optional adapter options.
   * @param options.benchCacheRoot - Directory holding canonical bench forms. The
   *   `create_form_from_template` tool resolves `source_form` here
   *   first, then falls back to the resolved `projectRoot` (slice 5 OQ2).
   *   Defaults to `<cwd>/bench-cache/ardelperal-VBA_TOOLKIT_BENCH/src/forms`.
   * @param options.codeGraphVbaInvoker - Issue #830 — internal codegraph-vba
   *   invoker. One-way: dysflow → codegraph-vba. When supplied, the
   *   `map_form_behavior` tool's `autoFetchCodeGraph:true` opt-in path
   *   consults it. See {@link VbaFormsOrchestrator.codeGraphVbaInvoker}.
   */
  constructor(
    orchestrator: VbaFormsOrchestrator,
    fileSystem?: FormFileSystemPort,
    options?: VbaFormsAdapterOptions,
  ) {
    this.orchestrator =
      options?.codeGraphVbaInvoker !== undefined
        ? { ...orchestrator, codeGraphVbaInvoker: options.codeGraphVbaInvoker }
        : orchestrator;
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
      // Issue #813 phase 6 — atomic exposure of the two net-new standalone
      // tools sharing the mutateForm seam.
      toolName === "form_set_property" ||
      toolName === "form_delete_control" ||
      toolName === "form_serialize" ||
      toolName === "form_deserialize" ||
      toolName === "create_form_from_template" ||
      toolName === "analyze_form_ui" ||
      toolName === "map_form_behavior" ||
      toolName === "generate_form_design_plan" ||
      toolName === "apply_form_design_plan" ||
      toolName === "copy_form_ui_pattern" ||
      toolName === "verify_form_ui" ||
      toolName === "render_form_preview"
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
      toolName === "form_rename_control" ||
      // Issue #813 phase 6 — atomic exposure. The 2 net-new tools share
      // the same `mutateForm` single-write + single-guarded-import +
      // single-rollback seam as the slice-4 family.
      toolName === "form_set_property" ||
      toolName === "form_delete_control"
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
    if (toolName === "render_form_preview") {
      // Issue #814 — pure read-class adapter (Phase 2 — Perception).
      // Mirrors `inspect_form`'s path-resolution contract; uses the same
      // fileSystem port + orchestrator wiring so the tool count stays
      // focused on the visual rendering seam and not on path policy.
      return renderFormPreviewTool(this.fileSystem, params, this.orchestrator);
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
