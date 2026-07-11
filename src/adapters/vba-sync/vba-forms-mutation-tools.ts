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
import { applyGuardedFormWrite } from "./vba-forms-guarded-write.js";
import { resolveManagedMutationSource } from "./vba-forms-managed-source.js";
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
      const outputMode = stringValue(params.outputMode) ?? "full";
      if (outputMode === "summary") {
        return successResult({
          mode: "dry-run",
          sourcePath: source.data.sourcePath,
          changedControlName: mutation.changedControlName,
          preservedKeys: mutation.preservedKeys,
          importGate: "not-run",
        });
      } else if (outputMode === "file") {
        return successResult({
          sourcePath: source.data.sourcePath,
          source: mutation.source,
        });
      } else {
        return successResult({
          mode: "dry-run",
          sourcePath: source.data.sourcePath,
          source: mutation.source,
          changedControlName: mutation.changedControlName,
          preservedKeys: mutation.preservedKeys,
          importGate: "not-run",
        });
      }
    }

    // Apply: delegate the single-write + single-guarded-import + single-rollback
    // block to the seam. mutateForm always operates on an existing source
    // (readFile succeeded above), so targetExisted is always true.
    const write = await applyGuardedFormWrite({
      orchestrator,
      fileSystem,
      source: source.data,
      newSource: mutation.source,
      originalSource,
      targetExisted: true,
      forwardedParams: params,
    });
    if (!write.ok) return write;

    return successResult({
      mode: "apply",
      sourcePath: source.data.sourcePath,
      changedControlName: mutation.changedControlName,
      preservedKeys: mutation.preservedKeys,
      importGate: "passed",
      importResult: write.data.importResult,
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
