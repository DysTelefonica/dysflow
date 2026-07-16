import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import { collectControls, collectFormEvents } from "../../core/services/form-ir-service.js";
import { parseBoundingBox } from "../../core/services/form-ui-geometry.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import { readFormContext } from "./vba-forms-read-context.js";
import type { VbaFormsOrchestrator } from "./vba-forms-types.js";

export async function inspectForm(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator?: VbaFormsOrchestrator,
): Promise<OperationResult<unknown>> {
  const context = await readFormContext(fileSystem, params, orchestrator, "inspect_form");
  if (!context.ok) return context;
  const { ir } = context.data;
  return successResult({
    name: ir.name,
    kind: ir.kind,
    controls: collectControls(ir.root),
    events: collectFormEvents(ir.root),
  });
}

export async function getFormGeometry(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator?: VbaFormsOrchestrator,
): Promise<OperationResult<unknown>> {
  const context = await readFormContext(fileSystem, params, orchestrator, "form_get_geometry");
  if (!context.ok) return context;
  const controlName = stringValue(params.controlName);
  if (!controlName)
    return failureResult(
      createDysflowError("FORM_SPEC_MISSING", "form_get_geometry requires controlName."),
    );
  const found = collectControls(context.data.ir.root).find(
    (control) => control.name === controlName,
  );
  if (!found)
    return failureResult(
      createDysflowError(
        "FORM_CONTROL_NOT_FOUND",
        `Control "${controlName}" was not found in "${context.data.sourcePath}".`,
      ),
    );
  const box = parseBoundingBox(found.properties);
  const data: Record<string, unknown> = {
    controlName: found.name,
    type: found.type,
    left: box?.left ?? null,
    top: box?.top ?? null,
    width: box?.width ?? null,
    height: box?.height ?? null,
  };
  for (const [source, target] of [
    ["LayoutCachedLeft", "layoutCachedLeft"],
    ["LayoutCachedTop", "layoutCachedTop"],
    ["LayoutCachedWidth", "layoutCachedWidth"],
    ["LayoutCachedHeight", "layoutCachedHeight"],
  ] as const) {
    const value = parseTwipOrUndefined(found.properties[source]);
    if (value !== undefined) data[target] = value;
  }
  return successResult(data);
}

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

export async function listFormControls(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator?: VbaFormsOrchestrator,
): Promise<OperationResult<unknown>> {
  const context = await readFormContext(fileSystem, params, orchestrator, "form_list_controls");
  if (!context.ok) return context;
  const section = stringValue(params.section);
  const matched = collectControls(context.data.ir.root).filter(
    (control) => section === undefined || controlMatchesSection(control, section),
  );
  const limit = resolveLimit(params.limit);
  return successResult({
    formName: context.data.ir.name,
    section: section ?? null,
    controls: matched.slice(0, limit).map((control) => {
      const box = parseBoundingBox(control.properties);
      return {
        name: control.name,
        type: control.type,
        left: box?.left ?? null,
        top: box?.top ?? null,
        width: box?.width ?? null,
        height: box?.height ?? null,
        hasEventBinding: Object.values(control.properties).some((value) =>
          value.includes("[Event Procedure]"),
        ),
      };
    }),
    totalCount: matched.length,
    truncated: matched.length > limit,
    limit,
  });
}

function resolveLimit(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) return DEFAULT_LIMIT;
  return raw > MAX_LIMIT ? MAX_LIMIT : Math.floor(raw);
}

function parseTwipOrUndefined(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function controlMatchesSection(control: { type: string }, section: string): boolean {
  const lower = section.toLowerCase();
  if (control.type.toLowerCase() === lower) return true;
  return (
    (lower === "header" && control.type === "FormHeader") ||
    (lower === "footer" && control.type === "FormFooter") ||
    (lower === "detail" && control.type === "Detail")
  );
}
