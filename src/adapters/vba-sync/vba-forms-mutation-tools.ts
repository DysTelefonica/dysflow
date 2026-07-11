import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import type { FormIR } from "../../core/models/form-ir.js";
import {
  addControl,
  deleteControl,
  FormMutationError,
  moveControl,
  parseFormTxt,
  renameControl,
  setProperty,
} from "../../core/services/form-ir-service.js";
import { alignControls, distributeControls } from "../../core/services/form-ui-align-distribute.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import { applyGuardedFormWrite } from "./vba-forms-guarded-write.js";
import { resolveManagedMutationSource } from "./vba-forms-managed-source.js";
import type { VbaFormsOrchestrator } from "./vba-forms-types.js";

// Issue #813 phase 6 — atomic exposure of the two net-new standalone
// tools (form_set_property, form_delete_control) sharing this seam. They
// route through the same single-write + single-guarded-import +
// single-rollback block via `applyGuardedFormWrite`.
//
// Issue #816 phase 3 — extends the same seam with `form_align_controls`
// and `form_distribute_controls`. These are batch geometry verbs
// (composites over `moveControl`) and reuse the same single-write +
// single-guarded-import + single-rollback path. No new write seam — the
// route table, the three-list lockstep, and the tool count cascade
// (+2: 75 → 77) all extend in lockstep.
export type FormMutationToolName =
  | "form_add_control"
  | "form_move_control"
  | "form_rename_control"
  | "form_set_property"
  | "form_delete_control"
  | "form_align_controls"
  | "form_distribute_controls";

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
          : toolName === "form_set_property"
            ? setProperty(ir, {
                controlName: stringValue(params.controlName) ?? "",
                property: stringValue(params.property) ?? "",
                value: readScalarValue(params.value),
              })
            : toolName === "form_delete_control"
              ? deleteControl(ir, {
                  controlName: stringValue(params.controlName) ?? "",
                })
              : toolName === "form_align_controls"
                ? runAlignDistribute("align", ir, params)
                : toolName === "form_distribute_controls"
                  ? runAlignDistribute("distribute", ir, params)
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

/**
 * Dispatch a batch align/distribute primitive. Reads `controlNames` from
 * the params, calls the corresponding pure service, and re-projects the
 * returned `{ ir, source, advisories }` into the `FormMutationResult`
 * shape that the shared mutation seam expects.
 */
function runAlignDistribute(
  verb: "align" | "distribute",
  ir: FormIR,
  params: Record<string, unknown>,
): ReturnType<typeof addControl> {
  const controlNames = readControlNames(params.controlNames);
  if (verb === "align") {
    const edge = stringValue(params.edge) ?? "";
    const result = alignControls(ir, controlNames, edge as never);
    return {
      ir: result.ir,
      source: result.source,
      changedControlName: controlNames.join(","),
      preservedKeys: [],
    };
  }
  const axis = stringValue(params.axis) ?? "";
  const spacing = numberValue(params.spacing);
  const result = distributeControls(ir, controlNames, axis as never, spacing);
  return {
    ir: result.ir,
    source: result.source,
    changedControlName: controlNames.join(","),
    preservedKeys: [],
  };
}

/**
 * Read the `controlNames` parameter — accepts either a string[] or a
 * comma-separated string. Returns `[]` for null/undefined so the service
 * primitive can produce the typed `FORM_MUTATION_INVALID` error.
 */
function readControlNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
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

/**
 * Read a scalar property value for `form_set_property`. The schema declares
 * `value: { type: ["string", "number", "boolean"] }`, so anything else
 * (object, array, null) is treated as an absent value — the primitive
 * refuses with FORM_CONTROL_NOT_FOUND / FORM_PROPERTY_PROTECTED in that
 * case rather than silently coercing. `undefined` falls through to empty
 * string so the primitive can produce the typed error.
 */
function readScalarValue(value: unknown): string | number | boolean {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return "";
}
