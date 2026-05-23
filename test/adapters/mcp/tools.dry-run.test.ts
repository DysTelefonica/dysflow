import { describe, expect, it, vi } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

class FakeQueryService {
  async execute() { return successResult({ rows: [] }); }
}
class FakeVbaService {
  async execute() { return successResult({ returnValue: "ok" }); }
}
class FakeDiagnosticsService {
  async run() { return successResult({ checks: [] }); }
}

const services = {
  vbaService: new FakeVbaService(),
  queryService: new FakeQueryService(),
  diagnosticsService: new FakeDiagnosticsService(),
};

describe("resolveIsDryRun — canonical dry-run resolution truth table", () => {
  // These tests verify via the write tools' handler behavior:
  // - if isDryRun returns false → write guard is checked → writesDisabled() if no resolver
  // - if isDryRun returns true → execution proceeds (no write check)

  const tools = createDysflowMcpTools(services, false); // writesEnabled=false → write guard active

  function getToolHandler(name: string) {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool not found: ${name}`);
    return tool.handler.bind(tool);
  }

  describe("apply:true → isDryRun=false → write guard fires", () => {
    it("exec_sql with {apply:true} triggers write guard when writesEnabled=false", async () => {
      const handler = getToolHandler("exec_sql");
      const result = await handler({ apply: true, sql: "SELECT 1" });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    });

    it("create_table with {apply:true} triggers write guard when writesEnabled=false", async () => {
      const handler = getToolHandler("create_table");
      const result = await handler({ apply: true });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    });
  });

  describe("dryRun:false → isDryRun=false → write guard fires", () => {
    it("exec_sql with {dryRun:false} triggers write guard when writesEnabled=false", async () => {
      const handler = getToolHandler("exec_sql");
      const result = await handler({ dryRun: false, sql: "UPDATE T SET x=1" });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    });
  });

  describe("empty input → isDryRun=true → proceeds without write guard", () => {
    it("exec_sql with {} does NOT trigger write guard (dry-run default)", async () => {
      const handler = getToolHandler("exec_sql");
      const result = await handler({});
      // should NOT be write-disabled (proceeds to execute, which succeeds)
      expect(result.isError).toBe(false);
    });

    it("exec_sql with {dryRun:true} does NOT trigger write guard", async () => {
      const handler = getToolHandler("exec_sql");
      const result = await handler({ dryRun: true });
      expect(result.isError).toBe(false);
    });
  });

  describe("write guard in createLegacyDispatchTool (relink_directory via dispatch) — apply:true now triggers correctly", () => {
    it("relink_directory with {apply:true} triggers write guard when writesEnabled=false", async () => {
      const handler = getToolHandler("relink_directory");
      const result = await handler({ apply: true });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    });

    it("relink_directory with {} (no apply/dryRun) does NOT trigger write guard", async () => {
      const handler = getToolHandler("relink_directory");
      const result = await handler({});
      // dry-run = true by default → no write guard
      expect(result.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
    });
  });
});
