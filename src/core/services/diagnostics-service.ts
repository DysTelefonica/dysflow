import type { DysflowConfig } from "../config/dysflow-config.js";
import type { OperationResult } from "../contracts/index.js";
import type { AccessDiagnosticsRequest, AccessRunner } from "../runner/access-runner.js";

export type AccessDiagnosticCheck = {
  name: string;
  ok: boolean;
  message: string;
};

export type AccessDiagnosticsResult = {
  checks: readonly AccessDiagnosticCheck[];
};

export type AccessDiagnosticsServiceOptions = {
  runner: AccessRunner;
  config: DysflowConfig;
};

export class AccessDiagnosticsService {
  private readonly runner: AccessRunner;
  private readonly config: DysflowConfig;

  constructor(options: AccessDiagnosticsServiceOptions) {
    this.runner = options.runner;
    this.config = options.config;
  }

  run(request: AccessDiagnosticsRequest = {}): Promise<OperationResult<AccessDiagnosticsResult>> {
    return this.runner.run<AccessDiagnosticsResult>({ kind: "diagnostics", request }, this.config);
  }
}
