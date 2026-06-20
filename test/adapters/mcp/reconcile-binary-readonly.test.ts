import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

/**
 * Regression guard for the misleading-name trap: `reconcile_binary` SOUNDS like
 * it mutates the Access .accdb, but it is a dry-run compare (planReconcileBinary →
 * compareSourceAgainstBinary) that only RECOMMENDS an explicit import/export. It
 * must stay read-only: `mutatesBinary:false` on the route and NOT behind the
 * write-gate. This characterization test locks that intent so a future "fix" that
 * flips it to a binary writer (or gates it) is caught and questioned on purpose.
 *
 * See src/core/services/vba-source-comparison.ts (planReconcileBinary).
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

describe("reconcile_binary is read-only despite its name", () => {
  it("routes as vba-sync with mutatesBinary:false", () => {
    const route = MCP_TOOL_ROUTES.reconcile_binary;
    expect(route.kind).toBe("vba-sync");
    expect(route.kind === "vba-sync" && route.mutatesBinary).toBe(false);
  });

  it("is NOT write-gated when writes are disabled", async () => {
    const tools = createDysflowMcpTools(services, false); // writesEnabled=false
    const tool = tools.find((t) => t.name === "reconcile_binary");
    if (!tool) throw new Error("reconcile_binary not registered");
    // A binary-mutating tool would return MCP_WRITES_DISABLED here; reconcile_binary
    // is read-only, so it passes the gate and reaches dispatch instead.
    const result = await tool.handler({});
    expect(result.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
  });
});
