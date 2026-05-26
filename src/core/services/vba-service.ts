import type { DysflowConfig } from "../config/dysflow-config.js";
import type { AccessVbaRequest, OperationResult } from "../contracts/index.js";
import {
  type AccessRunner,
  type AccessRunnerProgressCallback,
  ensureResultShape,
} from "../runner/access-runner.js";
import { isRecord } from "../utils/index.js";

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

  async execute(
    request: AccessVbaRequest,
    onProgress?: AccessRunnerProgressCallback,
  ): Promise<OperationResult<AccessVbaResult>> {
    const result = await this.runner.run<AccessVbaResult>(
      { kind: "vba", request },
      this.config,
      { onProgress },
    );
    return ensureResultShape(result, isRecord);
  }
}
