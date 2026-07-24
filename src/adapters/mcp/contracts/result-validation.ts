import type { AnyExecutableResultContract } from "./result-contract.js";

export const RESULT_CONTRACT_VIOLATION = "RESULT_CONTRACT_VIOLATION" as const;

export type ResultValidationPolicy = "off" | "report" | "enforce";

export type ResultContractViolationDiagnostic = {
  code: typeof RESULT_CONTRACT_VIOLATION;
  toolName: string;
  issues: readonly {
    path: string;
    code: string;
  }[];
};

export type ResultValidationOutcome =
  | { ok: true }
  | { ok: false; diagnostic: ResultContractViolationDiagnostic };

export function resolveResultValidationPolicy(
  policy?: ResultValidationPolicy,
): ResultValidationPolicy {
  return policy ?? "report";
}

export function validateToolResult(input: {
  toolName: string;
  contract: AnyExecutableResultContract;
  payload: unknown;
  policy: ResultValidationPolicy;
  report?: (diagnostic: ResultContractViolationDiagnostic) => void;
}): ResultValidationOutcome {
  if (input.policy === "off" || input.contract.kind === "envelope-only") return { ok: true };

  const parsed = input.contract.schema.safeParse(input.payload);
  if (parsed.success) return { ok: true };

  const diagnostic: ResultContractViolationDiagnostic = {
    code: RESULT_CONTRACT_VIOLATION,
    toolName: input.toolName,
    issues: parsed.error.issues.map((issue) => ({
      path: formatSchemaPath(issue.path),
      code: issue.code,
    })),
  };
  if (input.policy === "report") input.report?.(diagnostic);
  return { ok: false, diagnostic };
}

function formatSchemaPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "$";
  return `$${path
    .map((segment) =>
      typeof segment === "number" ? `[${segment}]` : `.${String(segment).replaceAll(".", "\\.")}`,
    )
    .join("")}`;
}
