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
import { parseFormTxt } from "../../core/services/form-ir-service.js";
import type { LintRuleId } from "../../core/services/form-lint-types.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import { VbaFormsLintAdapter } from "./vba-forms-lint-adapter.js";
import { deriveFormName } from "./vba-forms-paths.js";
import type { VbaFormsOrchestrator } from "./vba-forms-types.js";

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

export { getFormGeometry, inspectForm, listFormControls } from "./vba-forms-inspection-tools.js";

export { analyzeFormLayoutTool, verifyFormBindingsTool } from "./vba-forms-layout-binding-tools.js";

export { diffFormPreviewTool, renderFormPreviewTool } from "./vba-forms-preview-tools.js";
