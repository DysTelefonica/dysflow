import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import { isPathInside } from "../../core/utils/path-containment.js";
import { isWithinRuntime } from "../../shared/runtime-dir.js";
import {
  deriveFormName,
  hasManagedFormExtension,
  normalizePathForDetails,
  resolveMutationPath,
} from "./vba-forms-paths.js";
import type {
  FormsExecutionTarget,
  ManagedFormSource,
  VbaFormsOrchestrator,
} from "./vba-forms-types.js";

export async function resolveManagedMutationSource(args: {
  orchestrator: VbaFormsOrchestrator;
  toolName: string;
  params: Record<string, unknown>;
  rawSourcePath: string;
}): Promise<OperationResult<ManagedFormSource>> {
  const { orchestrator, toolName, params, rawSourcePath } = args;
  if (!hasManagedFormExtension(rawSourcePath)) {
    return failureResult(
      createDysflowError(
        "INVALID_INPUT",
        `${toolName} requires sourcePath to end with .form.txt or .report.txt.`,
      ),
    );
  }

  const target = await orchestrator.resolveExecutionTarget(params);
  if (!target.ok) return target as OperationResult<ManagedFormSource>;
  const targetData = target.data as FormsExecutionTarget;
  const strict = orchestrator.validateStrictContext(params, targetData);
  if (!strict.ok) return strict as OperationResult<ManagedFormSource>;

  const destinationRoot = normalizePathForDetails(targetData.destinationRoot);
  const projectRoot =
    targetData.projectRoot !== undefined
      ? normalizePathForDetails(targetData.projectRoot)
      : undefined;
  const sourcePath = normalizePathForDetails(resolveMutationPath(destinationRoot, rawSourcePath));
  const runtimeEnv =
    orchestrator.env ??
    (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } })
      .process?.env ??
    {};

  if (isWithinRuntime(sourcePath, runtimeEnv)) {
    return failureResult(
      createDysflowError(
        "INVALID_INPUT",
        "Refusing to mutate a form/report source inside the dysflow production runtime.",
      ),
    );
  }
  if (isWithinRuntime(destinationRoot, runtimeEnv)) {
    return failureResult(
      createDysflowError(
        "INVALID_INPUT",
        "Refusing to import form/report source from a destinationRoot inside the dysflow production runtime.",
      ),
    );
  }

  if (!isPathInside(sourcePath, destinationRoot)) {
    return failureResult(
      createDysflowError(
        "INVALID_INPUT",
        `sourcePath must be inside the resolved destinationRoot used by import_modules. sourcePath=${sourcePath}; destinationRoot=${destinationRoot}.`,
      ),
    );
  }
  if (projectRoot !== undefined && !isPathInside(sourcePath, projectRoot)) {
    return failureResult(
      createDysflowError(
        "INVALID_INPUT",
        `sourcePath must be inside the resolved projectRoot. sourcePath=${sourcePath}; projectRoot=${projectRoot}.`,
      ),
    );
  }

  return successResult({
    sourcePath,
    destinationRoot,
    moduleName: deriveFormName(sourcePath),
  });
}
