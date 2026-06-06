import {
  type DysflowConfig,
  loadDysflowConfigAsync,
} from "./dysflow-config.js";
import { type OperationResult, successResult } from "../contracts/index.js";
import { stringValue } from "../utils/index.js";

export type ExecutionTargetContext = {
  env: Record<string, string | undefined>;
  cwd: string;
  accessPath?: string;
  destinationRoot?: string;
  processTimeoutMs?: number;
};

export type ExecutionTarget = Pick<
  DysflowConfig,
  | "accessDbPath"
  | "backendPath"
  | "destinationRoot"
  | "projectRoot"
  | "projectId"
  | "configSource"
  | "timeoutMs"
  | "processTimeoutMs"
> & { accessPath?: string; destinationRoot: string };

export async function resolveExecutionTarget(
  params: Record<string, unknown>,
  context: ExecutionTargetContext,
): Promise<OperationResult<ExecutionTarget>> {
  const hasExplicitConfigOverride =
    stringValue(params.accessPath) !== undefined || stringValue(params.projectRoot) !== undefined;
  const requestedProjectId = stringValue(params.projectId) ?? stringValue(params.contextId);
  if (hasExplicitConfigOverride || requestedProjectId !== undefined) {
    const config = await loadDysflowConfigAsync({
      env: context.env,
      cwd: context.cwd,
      accessDbPath: stringValue(params.accessPath),
      backendPath: stringValue(params.backendPath),
      destinationRoot: stringValue(params.destinationRoot),
      projectRoot: stringValue(params.projectRoot),
      projectId: stringValue(params.projectId),
      contextId: stringValue(params.contextId),
    });
    if (!config.ok) return config;
    return successResult({
      ...config.data,
      accessPath: config.data.accessDbPath,
      destinationRoot:
        stringValue(params.destinationRoot) ??
        config.data.destinationRoot ??
        config.data.projectRoot ??
        context.cwd,
    });
  }

  if (context.accessPath === undefined) {
    const repoConfig = await loadDysflowConfigAsync({ env: context.env, cwd: context.cwd });
    if (repoConfig.ok) {
      return successResult({
        ...repoConfig.data,
        accessPath: repoConfig.data.accessDbPath,
        destinationRoot:
          stringValue(params.destinationRoot) ??
          repoConfig.data.destinationRoot ??
          repoConfig.data.projectRoot ??
          context.cwd,
      });
    }
    return repoConfig;
  }

  const destinationRoot =
    stringValue(params.destinationRoot) ??
    stringValue(params.projectRoot) ??
    context.destinationRoot ??
    context.cwd;
  return successResult({
    configSource: "runtime-default" as const,
    accessDbPath: context.accessPath ?? "",
    accessPath: context.accessPath,
    destinationRoot,
    projectRoot: stringValue(params.projectRoot) ?? context.destinationRoot ?? context.cwd,
    projectId: undefined,
    timeoutMs: context.processTimeoutMs,
    processTimeoutMs: context.processTimeoutMs,
  });
}
