import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
} from "../../core/contracts/index.js";
import { type FormFileSystemPort, VbaFormService } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import type { VbaManagerExecutor } from "./vba-sync-adapter.js";
import { type DirectMapping, mapping } from "./vba-sync-types.js";

const FORMS_MAPPINGS: Record<string, DirectMapping> = {
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

  constructor(private readonly orchestrator: VbaFormsOrchestrator) {
    this.formService = new VbaFormService({
      cwd: this.orchestrator.cwd,
      fileSystem: nodeFormFileSystem,
    });
  }

  static handles(toolName: string): boolean {
    return (
      toolName === "generate_erd" ||
      toolName === "validate_form_spec" ||
      toolName === "generate_form" ||
      toolName === "catalog_add_control" ||
      toolName === "harvest_form_catalog"
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
