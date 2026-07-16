import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import { type DiffFormPreviewOptions, diffFormPreview } from "../../core/services/form-ui-diff.js";
import {
  type RenderFormPreviewOptions,
  renderFormPreview,
} from "../../core/services/form-ui-render.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import {
  type FormTargetResolver,
  type ReadFormContext,
  readFormCandidateContext,
  readFormContext,
  readFormSnapshot,
} from "./vba-forms-read-context.js";

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function renderOptions(params: Record<string, unknown>): RenderFormPreviewOptions {
  const options: RenderFormPreviewOptions = {};
  const viewportScale = readNumber(params.viewportScale);
  if (viewportScale !== undefined) options.viewportScale = viewportScale;
  const ascii = params.ascii;
  if (typeof ascii === "object" && ascii !== null && !Array.isArray(ascii)) {
    const cellWidth = readNumber((ascii as Record<string, unknown>).cellWidth);
    const cellHeight = readNumber((ascii as Record<string, unknown>).cellHeight);
    if (cellWidth !== undefined && cellHeight !== undefined)
      options.ascii = { cellWidth, cellHeight };
  }
  return options;
}

export async function renderFormPreviewTool(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator?: FormTargetResolver,
): Promise<OperationResult<unknown>> {
  const context = await readFormContext(fileSystem, params, orchestrator, "render_form_preview");
  if (!context.ok) return context;
  const preview = renderFormPreview(context.data.ir, renderOptions(params));
  const outputMode = stringValue(params.output) ?? "svg";
  const data: Record<string, unknown> = {
    formName: context.data.ir.name,
    viewport: preview.viewport,
    warnings: preview.warnings,
  };
  if (outputMode !== "ascii") data.svg = preview.svg;
  if (outputMode !== "svg") data.ascii = preview.ascii;
  return successResult(data);
}

async function readDiffSide(
  fileSystem: FormFileSystemPort,
  path: string | undefined,
  name: string | undefined,
  target: { destinationRoot: string; projectRoot?: string } | undefined,
  projectId: string | undefined,
  side: "before" | "after",
): Promise<OperationResult<ReadFormContext>> {
  if (name && target && projectId) {
    return readFormCandidateContext(fileSystem, target, name, projectId, side);
  }
  if (!path) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        `diff_form_preview requires ${side}Path (path to the ${side === "before" ? "left" : "right"} .form.txt file).`,
      ),
    );
  }
  return readFormSnapshot(fileSystem, path, undefined, {
    missing: `${side} form file`,
    parse: `${side} "${path}"`,
  });
}

export async function diffFormPreviewTool(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator?: FormTargetResolver,
): Promise<OperationResult<unknown>> {
  const projectId = stringValue(params.projectId);
  const beforeName = stringValue(params.beforeName) ?? stringValue(params.beforeForm);
  const afterName = stringValue(params.afterName) ?? stringValue(params.afterForm);
  const beforePath = stringValue(params.beforePath) ?? stringValue(params.before);
  const afterPath = stringValue(params.afterPath) ?? stringValue(params.after);
  let target: { destinationRoot: string; projectRoot?: string } | undefined;
  if (projectId && (beforeName || afterName)) {
    if (!orchestrator) {
      return failureResult(
        createDysflowError(
          "MCP_INPUT_INVALID",
          "orchestrator is required when projectId is specified.",
        ),
      );
    }
    const resolved = await orchestrator.resolveExecutionTarget({
      projectId,
      formName: beforeName,
      targetName: afterName,
    });
    if (!resolved.ok) return resolved;
    target = resolved.data as { destinationRoot: string; projectRoot?: string };
  }

  if (!beforePath && !(beforeName && target)) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "diff_form_preview requires beforePath (path to the left .form.txt file).",
      ),
    );
  }
  if (!afterPath && !(afterName && target)) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "diff_form_preview requires afterPath (path to the right .form.txt file).",
      ),
    );
  }

  const before = await readDiffSide(
    fileSystem,
    beforePath,
    beforeName,
    target,
    projectId,
    "before",
  );
  if (!before.ok) return before;
  const after = await readDiffSide(fileSystem, afterPath, afterName, target, projectId, "after");
  if (!after.ok) return after;

  const options: DiffFormPreviewOptions = { render: renderOptions(params) };
  const epsilon = readNumber(params.epsilon);
  if (epsilon !== undefined) options.epsilon = epsilon;
  const outputMode = stringValue(params.output) ?? "both";
  options.output = outputMode === "svg" || outputMode === "ascii" ? outputMode : "both";
  const diff = diffFormPreview(before.data.ir, after.data.ir, options);
  const data: Record<string, unknown> = {
    beforeForm: before.data.ir.name,
    afterForm: after.data.ir.name,
    changes: diff.changes,
    warnings: diff.warnings,
  };
  if (outputMode !== "ascii") data.svg = diff.svg;
  if (outputMode !== "svg") data.ascii = diff.ascii;
  return successResult(data);
}
