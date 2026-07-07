import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import type { FormIR } from "../../core/models/form-ir.js";
import {
  addControl,
  FormMutationError,
  moveControl,
  parseFormTxt,
  renameControl,
} from "../../core/services/form-ir-service.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import { resolveManagedMutationSource } from "./vba-forms-managed-source.js";
import { captureRollbackOutcome } from "./vba-forms-rollback.js";
import { FORMS_MAPPINGS } from "./vba-forms-tool-mappings.js";
import type { VbaFormsOrchestrator } from "./vba-forms-types.js";

export type FormMutationToolName = "form_add_control" | "form_move_control" | "form_rename_control";

export async function mutateForm(args: {
  orchestrator: VbaFormsOrchestrator;
  fileSystem: FormFileSystemPort;
  toolName: FormMutationToolName;
  params: Record<string, unknown>;
}): Promise<OperationResult<unknown>> {
  const { orchestrator, fileSystem, toolName, params } = args;
  const sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
  if (!sourcePath) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        `${toolName} requires sourcePath (path to the .form.txt file).`,
      ),
    );
  }

  const source = await resolveManagedMutationSource({
    orchestrator,
    toolName,
    params,
    rawSourcePath: sourcePath,
  });
  if (!source.ok) return source;

  let originalSource: string;
  try {
    originalSource = await fileSystem.readFile(source.data.sourcePath);
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
      toolName === "form_add_control"
        ? addControl(ir, {
            targetSectionName: stringValue(params.targetSectionName),
            control: {
              name: stringValue(params.controlName) ?? stringValue(params.name) ?? "",
              type: stringValue(params.controlType) ?? stringValue(params.type) ?? "",
              properties: readProperties(params.properties),
            },
          })
        : toolName === "form_move_control"
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
      await fileSystem.writeFile(source.data.sourcePath, mutation.source, "utf8");
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
    const importResult = await orchestrator.executeMappedTool(
      "import_modules",
      importParams,
      FORMS_MAPPINGS.import_modules_gate,
    );
    if (!importResult.ok) {
      // Capture rollback outcome for consumer visibility (#692).
      // source always existed here (readFile succeeded above).
      const rollbackOutcome = await captureRollbackOutcome(
        () => fileSystem.writeFile(source.data.sourcePath, originalSource, "utf8"),
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
      createDysflowError("FORM_MUTATION_INVALID", err instanceof Error ? err.message : String(err)),
    );
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
