type ToolResult = {
  content?: Array<{ type?: string; text?: string }>;
  details?: { mcpResult?: unknown } | Record<string, unknown>;
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
  return record(details?.mcpResult) ?? details;
}

function structuredResult(result: ToolResult): Record<string, unknown> | undefined {
  const raw = mcpResult(result);
  return record(raw?.structuredContent) ?? record(raw?.data) ?? raw;
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
