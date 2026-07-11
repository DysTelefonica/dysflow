import {
  buildResolutionDiagnostic,
  resolveFormSourceCandidates,
} from "../../core/config/form-source-resolver.js";
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
import type { LintRuleId } from "../../core/services/form-lint-types.js";
import {
  type RenderFormPreviewOptions,
  renderFormPreview,
} from "../../core/services/form-ui-render.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import { VbaFormsLintAdapter } from "./vba-forms-lint-adapter.js";
import { deriveFormName } from "./vba-forms-paths.js";
import type { VbaFormsOrchestrator } from "./vba-forms-types.js";

export async function inspectForm(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator?: VbaFormsOrchestrator,
): Promise<OperationResult<unknown>> {
  let sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
  const projectId = stringValue(params.projectId);
  const formName = stringValue(params.formName) ?? stringValue(params.name);

  if (projectId && formName) {
    if (orchestrator === undefined) {
      return failureResult(
        createDysflowError(
          "MCP_INPUT_INVALID",
          "orchestrator is required when projectId is specified.",
        ),
      );
    }
    const target = await orchestrator.resolveExecutionTarget({ projectId, formName });
    if (!target.ok) return target;
    const targetData = target.data as { destinationRoot: string; projectRoot?: string };
    const candidates = resolveFormSourceCandidates({
      sourceRoot: targetData.destinationRoot,
      projectRoot: targetData.projectRoot,
      formName,
    });
    let resolvedPath: string | undefined;
    for (const candidate of candidates) {
      try {
        await fileSystem.readFile(candidate.absolutePath);
        resolvedPath = candidate.absolutePath;
        break;
      } catch {
        // try next
      }
    }
    if (resolvedPath === undefined) {
      const diagnostic = buildResolutionDiagnostic(
        {
          sourceRoot: targetData.destinationRoot,
          projectRoot: targetData.projectRoot,
          formName,
        },
        candidates,
        projectId,
      );
      return failureResult(createDysflowError("FORM_NOT_FOUND", diagnostic.remediation));
    }
    sourcePath = resolvedPath;
  }

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
    text = await fileSystem.readFile(sourcePath);
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
// Issue #814 — `render_form_preview` (Phase 2 — Perception)
//
// Pure read-class adapter: reads the .form.txt, parses to FormIR, and
// delegates to the pure `renderFormPreview` in `core/services/form-ui-render`.
// The renderer is the SINGLE source of truth for both #814 (this tool) and
// #817 (`diff_form_preview`, sibling issue) — the output shape is locked so
// the diff composer can rely on it.
//
// The adapter mirrors `inspect_form`'s path-resolution contract verbatim:
//   - literal `sourcePath` / `path` (or `projectId`+`formName`) is supported,
//   - missing sourcePath returns `FORM_SPEC_MISSING`,
//   - missing file returns `FORM_NOT_FOUND`,
//   - parse failure returns `FORM_PARSE_ERROR`.
// ---------------------------------------------------------------------------

export async function renderFormPreviewTool(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator?: VbaFormsOrchestrator,
): Promise<OperationResult<unknown>> {
  let sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
  const projectId = stringValue(params.projectId);
  const formName = stringValue(params.formName) ?? stringValue(params.name);

  if (projectId && formName) {
    if (orchestrator === undefined) {
      return failureResult(
        createDysflowError(
          "MCP_INPUT_INVALID",
          "orchestrator is required when projectId is specified.",
        ),
      );
    }
    const target = await orchestrator.resolveExecutionTarget({ projectId, formName });
    if (!target.ok) return target;
    const targetData = target.data as { destinationRoot: string; projectRoot?: string };
    const candidates = resolveFormSourceCandidates({
      sourceRoot: targetData.destinationRoot,
      projectRoot: targetData.projectRoot,
      formName,
    });
    let resolvedPath: string | undefined;
    for (const candidate of candidates) {
      try {
        await fileSystem.readFile(candidate.absolutePath);
        resolvedPath = candidate.absolutePath;
        break;
      } catch {
        // try next
      }
    }
    if (resolvedPath === undefined) {
      const diagnostic = buildResolutionDiagnostic(
        {
          sourceRoot: targetData.destinationRoot,
          projectRoot: targetData.projectRoot,
          formName,
        },
        candidates,
        projectId,
      );
      return failureResult(createDysflowError("FORM_NOT_FOUND", diagnostic.remediation));
    }
    sourcePath = resolvedPath;
  }

  if (!sourcePath) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "render_form_preview requires sourcePath (path to the .form.txt file).",
      ),
    );
  }

  // Read from disk — adapter owns the I/O, core is pure.
  let text: string;
  try {
    text = await fileSystem.readFile(sourcePath);
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_NOT_FOUND",
        `Cannot read form file at "${sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  // Derive the form name from the filename (mirror inspect_form derivation).
  const basename = sourcePath.replace(/\\/g, "/").split("/").pop() ?? "";
  const name = basename
    .replace(/^Form_/, "")
    .replace(/^Report_/, "")
    .replace(/\.form\.txt$/i, "")
    .replace(/\.report\.txt$/i, "");

  // Parse to FormIR (pure).
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

  // Honor an optional viewportScale override (default 0.05). The renderer
  // is pure; no I/O is required once the IR is in hand.
  const options: RenderFormPreviewOptions = {};
  const viewportScale = readNumber(params.viewportScale);
  if (viewportScale !== undefined) options.viewportScale = viewportScale;
  if (params.ascii !== undefined) {
    const ascii = params.ascii;
    if (typeof ascii === "object" && ascii !== null && !Array.isArray(ascii)) {
      const a = ascii as Record<string, unknown>;
      const cellWidth = readNumber(a.cellWidth);
      const cellHeight = readNumber(a.cellHeight);
      if (cellWidth !== undefined && cellHeight !== undefined) {
        options.ascii = { cellWidth, cellHeight };
      }
    }
  }

  const preview = renderFormPreview(ir, options);

  // `output` selects which frames to surface. The structured envelope
  // (formName + viewport + warnings) is always returned so #817 can reuse
  // it without re-rendering.
  const outputMode = stringValue(params.output) ?? "svg";
  const data: Record<string, unknown> = {
    formName: ir.name,
    viewport: preview.viewport,
    warnings: preview.warnings,
  };
  if (outputMode === "svg") {
    data.svg = preview.svg;
  } else if (outputMode === "ascii") {
    data.ascii = preview.ascii;
  } else {
    data.svg = preview.svg;
    data.ascii = preview.ascii;
  }

  return successResult(data);
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export async function compareForm(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator?: VbaFormsOrchestrator,
): Promise<OperationResult<unknown>> {
  let sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
  let targetPath = stringValue(params.targetPath) ?? stringValue(params.target);
  const projectId = stringValue(params.projectId);
  const formName = stringValue(params.formName) ?? stringValue(params.name);
  const targetName = stringValue(params.targetName) ?? stringValue(params.targetForm);

  if (projectId && (formName || targetName)) {
    if (orchestrator === undefined) {
      return failureResult(
        createDysflowError(
          "MCP_INPUT_INVALID",
          "orchestrator is required when projectId is specified.",
        ),
      );
    }
    const target = await orchestrator.resolveExecutionTarget({
      projectId,
      formName,
      targetName,
    });
    if (!target.ok) return target;
    const targetData = target.data as { destinationRoot: string; projectRoot?: string };

    if (formName) {
      const candidates = resolveFormSourceCandidates({
        sourceRoot: targetData.destinationRoot,
        projectRoot: targetData.projectRoot,
        formName,
      });
      let resolvedPath: string | undefined;
      for (const candidate of candidates) {
        try {
          await fileSystem.readFile(candidate.absolutePath);
          resolvedPath = candidate.absolutePath;
          break;
        } catch {
          // try next
        }
      }
      if (resolvedPath === undefined) {
        const diagnostic = buildResolutionDiagnostic(
          {
            sourceRoot: targetData.destinationRoot,
            projectRoot: targetData.projectRoot,
            formName,
          },
          candidates,
          projectId,
        );
        return failureResult(createDysflowError("FORM_NOT_FOUND", diagnostic.remediation));
      }
      sourcePath = resolvedPath;
    }

    if (targetName) {
      const candidates = resolveFormSourceCandidates({
        sourceRoot: targetData.destinationRoot,
        projectRoot: targetData.projectRoot,
        formName: targetName,
      });
      let resolvedPath: string | undefined;
      for (const candidate of candidates) {
        try {
          await fileSystem.readFile(candidate.absolutePath);
          resolvedPath = candidate.absolutePath;
          break;
        } catch {
          // try next
        }
      }
      if (resolvedPath === undefined) {
        const diagnostic = buildResolutionDiagnostic(
          {
            sourceRoot: targetData.destinationRoot,
            projectRoot: targetData.projectRoot,
            formName: targetName,
          },
          candidates,
          projectId,
        );
        return failureResult(createDysflowError("FORM_NOT_FOUND", diagnostic.remediation));
      }
      targetPath = resolvedPath;
    }
  }

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
    leftText = await fileSystem.readFile(sourcePath);
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_NOT_FOUND",
        `Cannot read source form file at "${sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
  try {
    rightText = await fileSystem.readFile(targetPath);
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

export async function lintFormCode(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator?: VbaFormsOrchestrator,
): Promise<OperationResult<unknown>> {
  const lintAdapter = new VbaFormsLintAdapter(fileSystem);
  return lintAdapter.lintFormCode(
    {
      destinationRoot: stringValue(params.destinationRoot),
      sourceRoot: stringValue(params.sourceRoot),
      formName: stringValue(params.formName),
      moduleNames: Array.isArray(params.moduleNames)
        ? params.moduleNames.filter((m): m is string => typeof m === "string")
        : undefined,
      rules: Array.isArray(params.rules)
        ? params.rules.filter((r): r is LintRuleId => typeof r === "string")
        : undefined,
      strict: params.strict === true,
      projectId: stringValue(params.projectId),
      projectRoot: stringValue(params.projectRoot),
    },
    orchestrator,
  );
}
