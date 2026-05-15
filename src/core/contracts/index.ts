import type { AccessOperationMetadata } from "../operations/access-operation-registry.js";

export type DiagnosticLevel = "info" | "warning" | "error";

export type Diagnostic = {
  level: DiagnosticLevel;
  source: string;
  message: string;
};

export type DysflowError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type OperationResult<T> =
  | { ok: true; data: T; diagnostics: Diagnostic[]; durationMs: number; operation?: AccessOperationMetadata }
  | { ok: false; error: DysflowError; diagnostics: Diagnostic[]; durationMs: number; operation?: AccessOperationMetadata };

export type AccessVbaRequest = {
  moduleName: string;
  procedureName: string;
  arguments?: readonly unknown[];
};

export type AccessQueryRequest = {
  sql: string;
  mode: "read" | "write";
};

export function createDiagnostic(level: DiagnosticLevel, source: string, message: string): Diagnostic {
  return { level, source, message };
}

export function createDysflowError(
  code: string,
  message: string,
  options: { retryable?: boolean } = {},
): DysflowError {
  return { code, message, retryable: options.retryable ?? false };
}

export function successResult<T>(
  data: T,
  options: { diagnostics?: Diagnostic[]; durationMs?: number; operation?: AccessOperationMetadata } = {},
): OperationResult<T> {
  return {
    ok: true,
    data,
    diagnostics: options.diagnostics ?? [],
    durationMs: options.durationMs ?? 0,
    ...(options.operation ? { operation: options.operation } : {}),
  };
}

export function failureResult<T = never>(
  error: DysflowError,
  options: { diagnostics?: Diagnostic[]; durationMs?: number; operation?: AccessOperationMetadata } = {},
): OperationResult<T> {
  return {
    ok: false,
    error,
    diagnostics: options.diagnostics ?? [],
    durationMs: options.durationMs ?? 0,
    ...(options.operation ? { operation: options.operation } : {}),
  };
}
