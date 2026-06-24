import { type OperationResult, successResult } from "../contracts/index.js";
import { stringValue } from "../utils/index.js";
import {
  type ConfigFileSystemPort,
  type DysflowConfig,
  loadDysflowConfigAsyncWith,
} from "./dysflow-config.js";

export type ExecutionTargetContext = {
  env: Record<string, string | undefined>;
  cwd: string;
  accessPath?: string;
  destinationRoot?: string;
  timeoutMs?: number;
  fileSystem: ConfigFileSystemPort;
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
> & { accessPath?: string; destinationRoot: string };

export async function resolveExecutionTarget(
  params: Record<string, unknown>,
  context: ExecutionTargetContext,
): Promise<OperationResult<ExecutionTarget>> {
  const explicitTimeoutMs =
    typeof params.timeoutMs === "number"
      ? params.timeoutMs
      : typeof params.timeoutMs === "string" && !Number.isNaN(Number(params.timeoutMs))
        ? Number(params.timeoutMs)
        : undefined;

  const hasExplicitConfigOverride =
    stringValue(params.accessPath) !== undefined || stringValue(params.projectRoot) !== undefined;
  const requestedProjectId = stringValue(params.projectId) ?? stringValue(params.contextId);
  if (hasExplicitConfigOverride || requestedProjectId !== undefined) {
    const config = await loadDysflowConfigAsyncWith(
      {
        env: context.env,
        cwd: context.cwd,
        accessDbPath: stringValue(params.accessPath),
        backendPath: stringValue(params.backendPath),
        destinationRoot: stringValue(params.destinationRoot),
        projectRoot: stringValue(params.projectRoot),
        projectId: stringValue(params.projectId),
        contextId: stringValue(params.contextId),
        timeoutMs: explicitTimeoutMs,
      },
      context.fileSystem,
    );
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
    const repoConfig = await loadDysflowConfigAsyncWith(
      {
        env: context.env,
        cwd: context.cwd,
        timeoutMs: explicitTimeoutMs,
      },
      context.fileSystem,
    );
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
    timeoutMs: explicitTimeoutMs ?? context.timeoutMs ?? 30000,
  });
}
