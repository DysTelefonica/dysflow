import { createDysflowError, failureResult, successResult, type OperationResult } from "../contracts/index.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const REDACTED_SECRET = "[REDACTED]";

export type DysflowConfig = {
  accessDbPath: string;
  timeoutMs: number;
  accessPassword?: string;
};

export type RedactedDysflowConfig = Omit<DysflowConfig, "accessPassword"> & {
  accessPassword?: typeof REDACTED_SECRET;
};

export type DysflowConfigInput = {
  accessDbPath?: string;
  accessPassword?: string;
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
};

export function loadDysflowConfig(input: DysflowConfigInput = {}): OperationResult<DysflowConfig> {
  const env = input.env ?? process.env;
  const accessDbPath = input.accessDbPath ?? env.DYSFLOW_ACCESS_DB_PATH;

  if (!accessDbPath || accessDbPath.trim().length === 0) {
    return failureResult(
      createDysflowError(
        "CONFIG_MISSING_ACCESS_PATH",
        "Access database path is required. Set DYSFLOW_ACCESS_DB_PATH or pass accessDbPath.",
      ),
    );
  }

  const timeoutMs = resolveTimeout(input.timeoutMs, env.DYSFLOW_TIMEOUT_MS);
  const config: DysflowConfig = {
    accessDbPath,
    timeoutMs,
  };
  const accessPassword = input.accessPassword ?? env.DYSFLOW_ACCESS_PASSWORD;
  if (accessPassword !== undefined && accessPassword.length > 0) {
    config.accessPassword = accessPassword;
  }

  return successResult(config);
}

export function redactDysflowConfig(config: DysflowConfig): RedactedDysflowConfig {
  if (config.accessPassword === undefined) {
    return { accessDbPath: config.accessDbPath, timeoutMs: config.timeoutMs };
  }

  return {
    accessDbPath: config.accessDbPath,
    timeoutMs: config.timeoutMs,
    accessPassword: REDACTED_SECRET,
  };
}

function resolveTimeout(explicitTimeoutMs: number | undefined, envTimeoutMs: string | undefined): number {
  if (explicitTimeoutMs !== undefined) {
    return Number.isFinite(explicitTimeoutMs) && explicitTimeoutMs > 0 ? explicitTimeoutMs : DEFAULT_TIMEOUT_MS;
  }

  return parseTimeout(envTimeoutMs);
}

function parseTimeout(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}
