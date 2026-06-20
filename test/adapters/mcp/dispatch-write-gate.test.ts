import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

/**
 * Guards that the VBA-sync write-gate is DERIVED from MCP_TOOL_ROUTES
 * (route.mutatesBinary) rather than a hand-maintained name set in the dispatch
 * factory. Adding a new binary-mutating VBA tool without declaring it cannot
 * silently skip the write-gate: `mutatesBinary` is a required field on the
 * vba-sync route (compile-time net) and this test asserts the gate actually
 * fires for every flagged tool (runtime net).
 */
class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

const services = {
  vbaService: new FakeVbaService(),
  queryService: new FakeQueryService(),
  diagnosticsService: new FakeDiagnosticsService(),
};

describe("vba-sync write-gate derives from MCP_TOOL_ROUTES.mutatesBinary", () => {
  const tools = createDysflowMcpTools(services, false); // writesEnabled=false → gate active

  const binaryWriters = Object.entries(MCP_TOOL_ROUTES)
    .filter(([, route]) => route.kind === "vba-sync" && route.mutatesBinary)
    .map(([name]) => name);

  // Minimal valid input per tool; only tools with `required` fields need an override.
  const minimalInput: Record<string, Record<string, unknown>> = {
    vba_inline_execution: { code: "Sub T()\r\nEnd Sub" },
  };

  it("flags exactly the binary-mutating VBA tools", () => {
    expect([...binaryWriters].sort()).toEqual(
      [
        "compile_vba",
        "delete_module",
        "import_all",
        "import_modules",
        "vba_inline_execution",
      ].sort(),
    );
  });

  it("write-gates every binary-mutating tool when writes are disabled", async () => {
    expect(binaryWriters.length).toBeGreaterThan(0);
    for (const name of binaryWriters) {
      const tool = tools.find((t) => t.name === name);
      if (!tool) throw new Error(`Tool not registered: ${name}`);
      // These tools force isDryRun=false, so they must gate even without apply/dryRun.
      const result = await tool.handler(minimalInput[name] ?? {});
      expect(result.content[0]?.text, name).toContain("MCP_WRITES_DISABLED");
    }
  });
});
