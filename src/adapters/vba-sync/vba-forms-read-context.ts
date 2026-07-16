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

export interface FormTargetResolver {
  resolveExecutionTarget(params: Record<string, unknown>): Promise<OperationResult<unknown>>;
}

export type ReadFormContext = { sourcePath: string; ir: FormIR };

type ReadLabels = { missing: string; parse: string };

export async function readFormSnapshot(
  fileSystem: FormFileSystemPort,
  sourcePath: string,
  text: string | undefined,
  labels: ReadLabels = { missing: "form file", parse: `"${sourcePath}"` },
): Promise<OperationResult<ReadFormContext>> {
  let snapshot = text;
  if (snapshot === undefined) {
    try {
      snapshot = await fileSystem.readFile(sourcePath);
    } catch (error) {
      return failureResult(
        createDysflowError(
          "FORM_NOT_FOUND",
          `Cannot read ${labels.missing} at "${sourcePath}". ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  const basename = sourcePath.replace(/\\/g, "/").split("/").pop() ?? "";
  const name = basename
    .replace(/^Form_/, "")
    .replace(/^Report_/, "")
    .replace(/\.form\.txt$/i, "")
    .replace(/\.report\.txt$/i, "");
  try {
    return successResult({ sourcePath, ir: parseFormTxt(snapshot, { name }) });
  } catch (error) {
    return failureResult(
      createDysflowError(
        "FORM_PARSE_ERROR",
        `Failed to parse ${labels.parse}: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}

export async function readFormCandidateContext(
  fileSystem: FormFileSystemPort,
  target: { destinationRoot: string; projectRoot?: string },
  formName: string,
  projectId: string,
  side?: "before" | "after",
): Promise<OperationResult<ReadFormContext>> {
  const candidates = resolveFormSourceCandidates({
    sourceRoot: target.destinationRoot,
    projectRoot: target.projectRoot,
    formName,
  });
  for (const candidate of candidates) {
    try {
      const text = await fileSystem.readFile(candidate.absolutePath);
      return readFormSnapshot(
        fileSystem,
        candidate.absolutePath,
        text,
        side
          ? {
              missing: `${side} form file`,
              parse: `${side} "${candidate.absolutePath}"`,
            }
          : undefined,
      );
    } catch {
      // Try the next canonical source location.
    }
  }
  const diagnostic = buildResolutionDiagnostic(
    { sourceRoot: target.destinationRoot, projectRoot: target.projectRoot, formName },
    candidates,
    projectId,
  );
  return failureResult(createDysflowError("FORM_NOT_FOUND", diagnostic.remediation));
}

export async function readFormContext(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator: FormTargetResolver | undefined,
  toolName: string,
): Promise<OperationResult<ReadFormContext>> {
  const sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
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
    return readFormCandidateContext(fileSystem, targetData, formName, projectId);
  }

  if (!sourcePath) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        `${toolName} requires sourcePath (path to the .form.txt file).`,
      ),
    );
  }

  return readFormSnapshot(fileSystem, sourcePath, undefined);
}
