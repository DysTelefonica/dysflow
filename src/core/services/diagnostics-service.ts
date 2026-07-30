import type { DysflowConfig } from "../config/dysflow-config.js";
import type {
  CheckId,
  DiagnosticCategory,
  ReasonCode,
} from "../contracts/diagnostic-check.js";
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
  check_id?: CheckId;
  reason_code?: ReasonCode;
  requires_confirmation?: boolean;
  category?: DiagnosticCategory;
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
    const shaped = ensureResultShape(result, (d) => {
      if (!isRecord(d)) return false;
      const checks = (d as Record<string, unknown>).checks;
      return checks === undefined || Array.isArray(checks);
    });
    if (!shaped.ok) return shaped;
    return {
      ...shaped,
      data: {
        checks: shaped.data.checks.map((check) => ({
          ...check,
          check_id: check.check_id ?? "diagnostics_powershell_router",
          reason_code: check.reason_code ?? "DIAGNOSTICS_PS_ROUTED",
          requires_confirmation: check.requires_confirmation ?? false,
          category: check.category ?? "runtimeConsumer",
        })),
      },
    };
  }
}
