import type { DysflowConfig } from "../config/dysflow-config.js";
import type { AccessQueryRequest, OperationResult } from "../contracts/index.js";
import type { AccessRunner } from "../runner/access-runner.js";

export type AccessQueryResult = {
  rows?: readonly Record<string, unknown>[];
  affectedRows?: number;
};

export type AccessQueryServiceOptions = {
  runner: AccessRunner;
  config: DysflowConfig;
};

export class AccessQueryService {
  private readonly runner: AccessRunner;
  private readonly config: DysflowConfig;

  constructor(options: AccessQueryServiceOptions) {
    this.runner = options.runner;
    this.config = options.config;
  }

  execute(request: AccessQueryRequest): Promise<OperationResult<AccessQueryResult>> {
    return this.runner.run<AccessQueryResult>({ kind: "query", request }, this.config);
  }
}
