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
import { compareForms } from "../../core/services/form-ir-compare-service.js";
import { parseFormTxt } from "../../core/services/form-ir-service.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import type { FormTargetResolver } from "./vba-forms-read-context.js";

type FormSnapshot = { path: string; text: string };

async function readSnapshot(
  fileSystem: FormFileSystemPort,
  path: string,
  side: "source" | "target",
): Promise<OperationResult<FormSnapshot>> {
  try {
    return successResult({ path, text: await fileSystem.readFile(path) });
  } catch (error) {
    return failureResult(
      createDysflowError(
        "FORM_NOT_FOUND",
        `Cannot read ${side} form file at "${path}". ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}

async function resolveSnapshot(
  fileSystem: FormFileSystemPort,
  target: { destinationRoot: string; projectRoot?: string },
  formName: string,
  projectId: string,
): Promise<OperationResult<FormSnapshot>> {
  const candidates = resolveFormSourceCandidates({
    sourceRoot: target.destinationRoot,
    projectRoot: target.projectRoot,
    formName,
  });
  for (const candidate of candidates) {
    try {
      return successResult({
        path: candidate.absolutePath,
        text: await fileSystem.readFile(candidate.absolutePath),
      });
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

function parseSnapshot(snapshot: FormSnapshot, side: "source" | "target") {
  const basename = snapshot.path.replace(/\\/g, "/").split("/").pop() ?? "";
  const name = basename
    .replace(/^Form_/, "")
    .replace(/^Report_/, "")
    .replace(/\.form\.txt$/i, "")
    .replace(/\.report\.txt$/i, "");
  try {
    return successResult(parseFormTxt(snapshot.text, { name }));
  } catch (error) {
    return failureResult(
      createDysflowError(
        "FORM_PARSE_ERROR",
        `Failed to parse ${side} "${snapshot.path}": ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}

export async function compareForm(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator?: FormTargetResolver,
): Promise<OperationResult<unknown>> {
  const sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
  const targetPath = stringValue(params.targetPath) ?? stringValue(params.target);
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
    const resolved = await orchestrator.resolveExecutionTarget({ projectId, formName, targetName });
    if (!resolved.ok) return resolved;
    const target = resolved.data as { destinationRoot: string; projectRoot?: string };

    const left = formName
      ? await resolveSnapshot(fileSystem, target, formName, projectId)
      : sourcePath
        ? await readSnapshot(fileSystem, sourcePath, "source")
        : failureResult(
            createDysflowError(
              "FORM_SPEC_MISSING",
              "compare_form requires sourcePath (path to the left .form.txt file).",
            ),
          );
    if (!left.ok) return left;

    const right = targetName
      ? await resolveSnapshot(fileSystem, target, targetName, projectId)
      : targetPath
        ? await readSnapshot(fileSystem, targetPath, "target")
        : failureResult(
            createDysflowError(
              "FORM_SPEC_MISSING",
              "compare_form requires targetPath (path to the right .form.txt file).",
            ),
          );
    if (!right.ok) return right;
    const leftIr = parseSnapshot(left.data, "source");
    if (!leftIr.ok) return leftIr;
    const rightIr = parseSnapshot(right.data, "target");
    if (!rightIr.ok) return rightIr;
    return successResult(
      compareForms({
        left: leftIr.data,
        right: rightIr.data,
        leftName: leftIr.data.name,
        rightName: rightIr.data.name,
      }),
    );
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

  const left = await readSnapshot(fileSystem, sourcePath, "source");
  if (!left.ok) return left;
  const right = await readSnapshot(fileSystem, targetPath, "target");
  if (!right.ok) return right;

  const leftIr = parseSnapshot(left.data, "source");
  if (!leftIr.ok) return leftIr;
  const rightIr = parseSnapshot(right.data, "target");
  if (!rightIr.ok) return rightIr;

  return successResult(
    compareForms({
      left: leftIr.data,
      right: rightIr.data,
      leftName: leftIr.data.name,
      rightName: rightIr.data.name,
    }),
  );
}
