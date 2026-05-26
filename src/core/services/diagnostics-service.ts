import type { DysflowConfig } from "../config/dysflow-config.js";
import type { OperationResult } from "../contracts/index.js";
import {
  type AccessDiagnosticsRequest,
  type AccessRunner,
  ensureResultShape,
} from "../runner/access-runner.js";
import { isRecord } from "../utils/index.js";

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

  async run(
    request: AccessDiagnosticsRequest = {},
  ): Promise<OperationResult<AccessDiagnosticsResult>> {
    const result = await this.runner.run<AccessDiagnosticsResult>(
      { kind: "diagnostics", request },
      this.config,
    );
    return ensureResultShape(result, (d) => {
      if (!isRecord(d)) return false;
      const checks = (d as Record<string, unknown>).checks;
      return checks === undefined || Array.isArray(checks);
    });
  }
}
