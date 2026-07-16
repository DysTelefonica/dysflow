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
import { parseFormTxt } from "../../core/services/form-ir-service.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import type { VbaFormsOrchestrator } from "./vba-forms-types.js";

export type ReadFormContext = { sourcePath: string; ir: FormIR };

export async function readFormContext(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator: VbaFormsOrchestrator | undefined,
  toolName: string,
): Promise<OperationResult<ReadFormContext>> {
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
    sourcePath = undefined;
    for (const candidate of candidates) {
      try {
        await fileSystem.readFile(candidate.absolutePath);
        sourcePath = candidate.absolutePath;
        break;
      } catch {
        // Try the next canonical source location.
      }
    }
    if (sourcePath === undefined) {
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
  }

  if (!sourcePath) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        `${toolName} requires sourcePath (path to the .form.txt file).`,
      ),
    );
  }

  let text: string;
  try {
    text = await fileSystem.readFile(sourcePath);
  } catch (error) {
    return failureResult(
      createDysflowError(
        "FORM_NOT_FOUND",
        `Cannot read form file at "${sourcePath}". ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  const basename = sourcePath.replace(/\\/g, "/").split("/").pop() ?? "";
  const name = basename
    .replace(/^Form_/, "")
    .replace(/^Report_/, "")
    .replace(/\.form\.txt$/i, "")
    .replace(/\.report\.txt$/i, "");
  try {
    return successResult({ sourcePath, ir: parseFormTxt(text, { name }) });
  } catch (error) {
    return failureResult(
      createDysflowError(
        "FORM_PARSE_ERROR",
        `Failed to parse "${sourcePath}": ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}
