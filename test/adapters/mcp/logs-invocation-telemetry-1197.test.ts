import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { InvocationTelemetryEntry } from "../../../src/adapters/mcp/invocation-telemetry.js";
import { LOGS_TOOL_SCHEMA, tryReadLogs } from "../../../src/adapters/mcp/logs-tool.js";

const roots: string[] = [];

function fixture(entries: InvocationTelemetryEntry[]): string {
  const root = mkdtempSync(join(tmpdir(), "dysflow-invocation-logs-"));
  roots.push(root);
  const runtime = join(root, ".dysflow", "runtime");
  mkdirSync(runtime, { recursive: true });
  writeFileSync(
    join(runtime, "invocations.jsonl"),
    `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8",
  );
  return root;
}

function entry(
  tool: string,
  overrides: Partial<InvocationTelemetryEntry> = {},
): InvocationTelemetryEntry {
  return {
    timestamp: "2026-07-28T00:00:00.000Z",
    tool,
    action: tool.startsWith("query") ? "query" : "diagnostics",
    operationId: null,
    projectId: "test",
    outcome: "ok",
    failureClass: "none",
    errorCode: null,
    durationMs: 10,
    writeIntent: "read",
    paramNamesPresent: [],
    missingParams: [],
    rejectedParams: [],
    unknownToolName: null,
    ...overrides,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("logs invocation source and filters (#1197)", () => {
  it("filters the real tool independently from the coarse action", async () => {
    const root = fixture([
      entry("query_sql"),
      entry("query_execute"),
      entry("schema", { action: "diagnostics" }),
      entry("import_modules", { action: "import" }),
      entry("test_vba", { action: "test" }),
      entry("run_vba", { action: "run" }),
    ]);

    const byTool = await tryReadLogs({ options: { tool: "query_sql" } }, root);
    const byAction = await tryReadLogs({ options: { action: "query" } }, root);
    const operationalFamilies = await Promise.all(
      ["import", "test", "run"].map((action) => tryReadLogs({ options: { action } }, root)),
    );

    expect(byTool.entries.map((item) => item.tool)).toEqual(["query_sql"]);
    expect(byAction.entries.map((item) => item.tool).sort()).toEqual([
      "query_execute",
      "query_sql",
    ]);
    expect(operationalFamilies.map((result) => result.entries[0]?.tool)).toEqual([
      "import_modules",
      "test_vba",
      "run_vba",
    ]);
  });

  it("aggregates calls, split errors, percentiles, last use, and rejected names", async () => {
    const root = fixture([
      entry("query_sql", { durationMs: 10, timestamp: "2026-07-28T00:00:00.000Z" }),
      entry("query_sql", {
        durationMs: 20,
        timestamp: "2026-07-28T00:01:00.000Z",
        outcome: "error",
        failureClass: "contract",
        errorCode: "MCP_INPUT_INVALID",
        missingParams: ["databasePath"],
        rejectedParams: ["dryRun"],
        warningCodes: ["LEGACY_TOOL_AVAILABLE"],
      }),
      entry("query_sql", {
        durationMs: 100,
        timestamp: "2026-07-28T00:02:00.000Z",
        outcome: "error",
        failureClass: "runtime",
        errorCode: "ACCESS_DATABASE_LOCKED",
        warningCodes: ["LEGACY_TOOL_AVAILABLE"],
      }),
      entry("schema", {
        durationMs: 3,
        timestamp: "2026-07-28T00:03:00.000Z",
        outcome: "error",
        failureClass: "contract",
        errorCode: "MCP_INPUT_INVALID",
        rejectedParams: ["dryRun", "project"],
      }),
    ]);

    const result = await tryReadLogs({ options: { groupBy: "tool" } }, root);

    expect(result.aggregate?.tools).toEqual([
      {
        tool: "query_sql",
        calls: 3,
        errors: 2,
        contractErrors: 1,
        runtimeErrors: 1,
        p50Ms: 20,
        p95Ms: 100,
        lastUsed: "2026-07-28T00:02:00.000Z",
      },
      {
        tool: "schema",
        calls: 1,
        errors: 1,
        contractErrors: 1,
        runtimeErrors: 0,
        p50Ms: 3,
        p95Ms: 3,
        lastUsed: "2026-07-28T00:03:00.000Z",
      },
    ]);
    expect(result.aggregate?.rejectedParams).toEqual([
      { parameter: "dryRun", count: 2 },
      { parameter: "project", count: 1 },
    ]);
    expect(result.aggregate?.missingParams).toEqual([{ parameter: "databasePath", count: 1 }]);
    expect(result.aggregate?.warnings.byCode).toEqual([
      { code: "LEGACY_TOOL_AVAILABLE", count: 2 },
    ]);
  });

  it("advertises separate action and aggregate controls", () => {
    const options = LOGS_TOOL_SCHEMA.properties?.options as {
      properties?: Record<string, unknown>;
    };
    expect(options.properties).toHaveProperty("tool");
    expect(options.properties).toHaveProperty("action");
    expect(options.properties).toHaveProperty("groupBy");
    expect(JSON.stringify(options.properties?.tool)).not.toContain("tool/action");
  });
});
