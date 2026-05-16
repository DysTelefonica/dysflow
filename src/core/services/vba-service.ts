import type { DysflowConfig } from "../config/dysflow-config.js";
import { createDysflowError, failureResult, type AccessVbaRequest, type OperationResult } from "../contracts/index.js";
import type { AccessRunner } from "../runner/access-runner.js";
import { isAbsolute, relative, resolve } from "node:path";

export type AccessVbaResult = {
  returnValue?: unknown;
};

export type AccessVbaServiceOptions = {
  runner: AccessRunner;
  config: DysflowConfig;
};

export class AccessVbaService {
  private readonly runner: AccessRunner;
  private readonly config: DysflowConfig;

  constructor(options: AccessVbaServiceOptions) {
    this.runner = options.runner;
    this.config = options.config;
  }

  execute(request: AccessVbaRequest): Promise<OperationResult<AccessVbaResult>> {
    const accessContext = resolveSafeAccessContext(request);
    if (!accessContext.ok) return Promise.resolve(accessContext);
    const { accessPath } = accessContext.data;
    return this.runner.run<AccessVbaResult>(
      { kind: "vba", request },
      { ...this.config, accessDbPath: accessPath },
    );
  }
}

function resolveSafeAccessContext(request: AccessVbaRequest): OperationResult<{ accessPath: string }> {
  const accessPath = request.accessPath?.trim();
  if (!accessPath) {
    return failureResult(createDysflowError(
      "ACCESS_PATH_REQUIRED",
      "VBA execution requires an explicit absolute accessPath in multi-project mode.",
    ));
  }
  if (!isAbsolute(accessPath)) {
    return failureResult(createDysflowError("ACCESS_PATH_NOT_ABSOLUTE", "accessPath must be absolute."));
  }

  const root = request.projectRoot ?? request.destinationRoot;
  if (root !== undefined && root.trim().length > 0) {
    const resolvedRoot = resolve(root);
    const resolvedAccessPath = resolve(accessPath);
    const rel = relative(resolvedRoot, resolvedAccessPath);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      return failureResult(createDysflowError(
        "ACCESS_PATH_PROJECT_MISMATCH",
        "Resolved accessPath is outside projectRoot/destinationRoot. Refusing to touch Access.",
      ));
    }
  }

  return { ok: true, data: { accessPath }, diagnostics: [], durationMs: 0 };
}
