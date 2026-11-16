type ToolResult = {
  content?: Array<{ type?: string; text?: string }>;
  details?: { mcpResult?: unknown } | Record<string, unknown>;
  structuredContent?: unknown;
  isError?: boolean;
};

type RenderOptions = {
  expanded?: boolean;
  isPartial?: boolean;
  isError?: boolean;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function arrayLength(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function moduleCount(args: Record<string, unknown>): number | undefined {
  return arrayLength(args.moduleNames);
}

export function operationLabel(toolName: string, args: Record<string, unknown> = {}): string {
  const count = moduleCount(args);
  if (toolName === "bootstrap") return "bootstrap";
  if (toolName === "import_modules") {
    return count === undefined ? "importing modules" : `importing ${count} module${count === 1 ? "" : "s"}`;
  }
  if (toolName === "export_modules") {
    return count === undefined ? "exporting modules" : `exporting ${count} module${count === 1 ? "" : "s"}`;
  }
  if (toolName === "verify_code") return "checking source drift";
  if (toolName === "test_vba") return "running VBA tests";
  if (toolName === "run_vba") return "running VBA";
  if (toolName === "query_execute" || toolName === "query_sql") return "running query";
  return "operation";
}

export function renderDysflowCallText(
  toolName: string,
  args: Record<string, unknown> = {},
): string {
  return `⚡ Dysflow · ${operationLabel(toolName, args)}…`;
}

function firstText(result: ToolResult): string {
  return (
    result.content?.find((entry) => entry.type === "text" && typeof entry.text === "string")?.text ??
    ""
  );
}

function mcpResult(result: ToolResult): Record<string, unknown> | undefined {
  const details = record(result.details);
  return record(details?.mcpResult) ?? details ?? record(result);
}

function structuredResult(result: ToolResult): Record<string, unknown> | undefined {
  const raw = mcpResult(result);
  const structured = record(raw?.structuredContent) ?? record(raw?.data);
  if (structured) return structured;
  try {
    const parsed = record(JSON.parse(firstText(result)));
    return parsed?.schemaVersion === "dysflow.result/v1" &&
      (parsed.ok === false || parsed.isError === true)
      ? parsed
      : raw;
  } catch {
    return raw;
  }
}

function typedError(result: ToolResult): Record<string, unknown> | undefined {
  const data = structuredResult(result);
  const error = record(data?.error);
  return data?.schemaVersion === "dysflow.result/v1" &&
    (data.ok === false || data.isError === true) &&
    typeof error?.code === "string" &&
    /^[A-Z][A-Z0-9_]{0,95}$/.test(error.code)
    ? error
    : undefined;
}

function diagnosticText(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/\b(password|pwd|token|secret|authorization|api[_-]?key)["']?\s*[:=]\s*(?:(?:Bearer|Basic)\s+)?(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$1=[redacted]")
    .replace(/(?:[A-Z]:[\\/]+|[\\/]{2,})(?:[^\\/\r\n"'<>|;:]+[\\/]+)*[^\s\\/"'<>|;:,]+/gi, "[path]")
    .replace(/(?<![\w:/])\/(?:[^/\r\n"'<>|;:]+\/)*[^\s/"'<>|;:,]+/g, "[path]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, limit);
}

/** Preserve actionable typed diagnostics without exposing raw backend payloads. */
export function dysflowErrorText(result: ToolResult): string {
  const source = typedError(result);
  if (!source) return "Dysflow operation failed.";
  const error: Record<string, unknown> = { code: source.code };
  for (const key of ["message", "remediation", "missingParam", "rejectedFlag"]) {
    const text = diagnosticText(source[key], key === "message" ? 800 : 400);
    if (text !== undefined) error[key] = text;
  }
  const details = record(source.details);
  if (Array.isArray(details?.failures)) {
    error.details = {
      failures: details.failures.slice(0, 10).map((failure) => {
        const entry = record(failure);
        return {
          procedure: diagnosticText(entry?.procedure, 100),
          error: diagnosticText(entry?.error, 250),
        };
      }),
    };
  }
  const envelope = { schemaVersion: "dysflow.result/v1", isError: true, ok: false, error };
  const failures = record(error.details)?.failures;
  while (Array.isArray(failures) && failures.length && JSON.stringify(envelope).length > 8_000) {
    failures.pop();
  }
  return JSON.stringify(envelope);
}

function findArrayLength(data: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!data) return undefined;
  const direct = arrayLength(data[key]);
  if (direct !== undefined) return direct;
  for (const value of Object.values(data)) {
    const nested = record(value);
    const count = nested ? arrayLength(nested[key]) : undefined;
    if (count !== undefined) return count;
  }
  return undefined;
}

export function compactDysflowResultStatus(
  toolName: string,
  result: ToolResult,
  options: RenderOptions = {},
): string {
  if (options.isPartial) return `⚠ ${operationLabel(toolName)}…`;
  const error = typedError(result);
  if (error) return `✗ Dysflow failed · ${error.code}`;
  if (options.isError || result.isError) return "✗ Dysflow failed";

  const data = structuredResult(result);
  const warnings = findArrayLength(data, "warnings");
  const marker = warnings !== undefined && warnings > 0 ? "⚠" : "✓";

  if (toolName === "bootstrap") return `${marker} ready`;
  if (toolName === "import_modules") {
    const count = findArrayLength(data, "imported");
    return `${marker} ${count === undefined ? "import complete" : `imported ${count} module${count === 1 ? "" : "s"}`}`;
  }
  if (toolName === "export_modules") {
    const count = findArrayLength(data, "exported");
    return `${marker} ${count === undefined ? "export complete" : `exported ${count} module${count === 1 ? "" : "s"}`}`;
  }
  if (toolName === "verify_code") {
    if (data?.actionableOk === true) return `${marker} no actionable drift`;
    if (data?.actionableOk === false) return "⚠ actionable drift";
  }
  if (toolName === "test_vba") {
    const failed = typeof data?.failed === "number" ? data.failed : undefined;
    if (failed !== undefined && failed > 0) return `✗ ${failed} VBA test${failed === 1 ? "" : "s"} failed`;
    const passed = typeof data?.passed === "number" ? data.passed : undefined;
    if (passed !== undefined) return `${marker} ${passed} VBA test${passed === 1 ? "" : "s"} passed`;
  }
  return `${marker} ${warnings ? `done with ${warnings} warning${warnings === 1 ? "" : "s"}` : "done"}`;
}

function expandedDetails(result: ToolResult): string {
  const raw = mcpResult(result);
  const structured = record(raw?.structuredContent);
  if (structured) return JSON.stringify(structured, null, 2);
  const text = firstText(result);
  if (text) return text;
  return raw ? JSON.stringify(raw, null, 2) : "";
}

export function renderDysflowResultText(
  toolName: string,
  result: ToolResult,
  options: RenderOptions = {},
): string {
  const status = compactDysflowResultStatus(toolName, result, options);
  if (!options.expanded || options.isPartial) return `↳ ${status}`;
  const details = expandedDetails(result);
  return details ? `↳ ${status}\n\n${details}` : `↳ ${status}`;
}
