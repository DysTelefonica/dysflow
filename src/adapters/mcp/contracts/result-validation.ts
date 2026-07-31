import type { AnyExecutableResultContract } from "./result-contract.js";

export const RESULT_CONTRACT_VIOLATION = "RESULT_CONTRACT_VIOLATION" as const;

export type ResultValidationPolicy = "off" | "report" | "enforce";

export type ResultContractViolationDiagnostic = {
  code: typeof RESULT_CONTRACT_VIOLATION;
  toolName: string;
  actualShape: Record<string, unknown>;
  expectedShape: Record<string, unknown>;
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
  return policy ?? "enforce";
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
    actualShape: describeValueShape(input.payload),
    expectedShape: {
      schema: input.contract.introspectionSchema,
    },
    issues: parsed.error.issues.map((issue) => ({
      path: formatSchemaPath(issue.path),
      code: issue.code,
    })),
  };
  if (input.policy === "report") input.report?.(diagnostic);
  return { ok: false, diagnostic };
}

function describeValueShape(value: unknown, depth = 0): Record<string, unknown> {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      ...(depth < 2 && value.length > 0 ? { items: describeValueShape(value[0], depth + 1) } : {}),
    };
  }
  if (typeof value !== "object") return { type: typeof value };
  const entries = Object.entries(value as Record<string, unknown>);
  return {
    type: "object",
    keys: entries.map(([key]) => key).sort(),
    ...(depth < 2
      ? {
          properties: Object.fromEntries(
            entries
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([key, child]) => [key, describeValueShape(child, depth + 1)]),
          ),
        }
      : {}),
  };
}

function formatSchemaPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "$";
  return `$${path
    .map((segment) =>
      typeof segment === "number" ? `[${segment}]` : `.${String(segment).replaceAll(".", "\\.")}`,
    )
    .join("")}`;
}
