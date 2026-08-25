import { describe, expect, it } from "vitest";
import type { DysflowMcpTool } from "../../../src/adapters/mcp/result-translation.js";
import { buildToolSchemaCatalog } from "../../../src/adapters/mcp/schema-tool.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

function harness() {
  const syncRequests: Array<{ tool: string; input: unknown }> = [];
  const services = {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [{ value: 1 }] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
    vbaSyncToolService: {
      execute: async (tool: string, input: unknown) => {
        syncRequests.push({ tool, input });
        return successResult({ operation: tool, ok: true, warnings: [] });
      },
    },
  } as unknown as DysflowMcpServices;
  const tools = createDysflowMcpTools({
    services,
    writes: true,
    writeAccessResolver: async () => true,
  });
  const tool = (name: string) => {
    const found = tools.find((candidate) => candidate.name === name);
    if (found === undefined) throw new Error(`${name} should be registered`);
    return found;
  };
  return { tool, syncRequests };
}

async function payload(tool: DysflowMcpTool, input: Record<string, unknown>) {
  const result = await tool.handler(input);
  expect(result.isError, JSON.stringify(result)).toBe(false);
  return JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
}

describe("preferred tool runtime warnings (#1536)", () => {
  it("adds an informational preferred-tool warning without blocking a specialized write tool", async () => {
    const { tool } = harness();

    const result = await payload(tool("import_modules"), {
      moduleNames: ["Example"],
      apply: false,
    });

    expect(result).toMatchObject({ operation: "import_modules", ok: true });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "PREFERRED_TOOL_AVAILABLE",
        severity: "info",
        called: "import_modules",
        preferred: "sync_binary",
        rationale: expect.any(String),
        docsAnchor: "dysflow-usage/assets/examples/sync-binary.md",
        release: expect.any(String),
      }),
    ]);
  });

  it("honors forceSpecialized without leaking the control flag to the underlying tool", async () => {
    const { tool, syncRequests } = harness();

    const result = await payload(tool("import_modules"), {
      moduleNames: ["Example"],
      apply: false,
      forceSpecialized: true,
    });

    expect(result.warnings).toEqual([]);
    expect(syncRequests.at(-1)?.input).not.toHaveProperty("forceSpecialized");
    expect(tool("import_modules").inputSchema?.properties).toHaveProperty("forceSpecialized");
    const described = buildToolSchemaCatalog({ view: "full" }).tools.find(
      (candidate) => candidate.name === "import_modules",
    );
    expect(described?.inputSchema.properties).toHaveProperty("forceSpecialized");
  });

  it("does not warn for the preferred tool or for read-only specialized tools", async () => {
    const { tool } = harness();

    const preferred = await payload(tool("sync_binary"), { direction: "src-to-binary" });
    const readOnly = await payload(tool("verify_code"), {});

    expect(preferred.warnings).toEqual([]);
    expect(readOnly.warnings).toEqual([]);
  });

  it("adds an escalated legacy warning that names the preferred replacement", async () => {
    const { tool } = harness();

    const result = await payload(tool("query_sql"), { sql: "SELECT 1" });

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "LEGACY_TOOL_AVAILABLE",
        severity: "warning",
        called: "query_sql",
        preferred: "query_execute",
        rationale: expect.stringContaining("query_execute"),
        docsAnchor: "dysflow-usage/assets/examples/query-execute.md",
        release: expect.any(String),
      }),
    ]);
  });
});
