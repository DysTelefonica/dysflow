import type { DysflowConfig } from "../config/dysflow-config.js";
import type {
  AccessQueryRequest,
  OperationResult,
  RelinkDirectoryReport,
} from "../contracts/index.js";
import {
  type AccessRunner,
  type AccessRunnerProgressCallback,
  ensureResultShape,
} from "../runner/access-runner.js";
import { isRecord } from "../utils/index.js";

export type AccessQueryResult = {
  rows?: readonly Record<string, unknown>[];
  affectedRows?: number;
  tables?: readonly string[];
  links?: readonly Record<string, unknown>[];
  queries?: readonly Record<string, unknown>[];
  schema?: readonly Record<string, unknown>[];
  files?: readonly string[];
  relationships?: readonly Record<string, unknown>[];
  comparison?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  relinkDirectory?: RelinkDirectoryReport;
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

  async execute(
    request: AccessQueryRequest,
    onProgress?: AccessRunnerProgressCallback,
  ): Promise<OperationResult<AccessQueryResult>> {
    const result = await this.runner.run<AccessQueryResult>(
      { kind: "query", request },
      this.config,
      { onProgress },
    );
    return ensureResultShape(result, isRecord);
  }
}
