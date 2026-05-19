import { createDysflowError, failureResult, successResult, type OperationResult } from "../contracts/index.js";

const ACCESS_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_ ]{0,63}$/;

export function validateAccessIdentifier(value: string, label: string): OperationResult<string> {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return failureResult(createDysflowError("ACCESS_SQL_INVALID_IDENTIFIER", `${label} must not be empty.`));
  }
  if (!ACCESS_IDENTIFIER_PATTERN.test(normalized)) {
    return failureResult(
      createDysflowError(
        "ACCESS_SQL_INVALID_IDENTIFIER",
        `${label} contains unsupported characters. Allowed: letters, numbers, spaces, and underscore; must start with a letter or underscore and max length is 64.`,
      ),
    );
  }
  return successResult(normalized);
}

export function formatAccessIdentifier(value: string, label: string): OperationResult<string> {
  const validated = validateAccessIdentifier(value, label);
  if (!validated.ok) return validated;
  return successResult(`[${validated.data}]`);
}

export function validateAccessRowKeys(rows: readonly Record<string, unknown>[], label: string): OperationResult<void> {
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const keyValidation = validateAccessIdentifier(key, `${label} key`);
      if (!keyValidation.ok) return failureResult(keyValidation.error);
    }
  }
  return successResult(undefined);
}
