import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

/**
 * PR-1 (issue #656) — integration check that `get_capabilities`
 * is reachable through the `createDysflowMcpTools` dispatch chain (the same
 * chain that `registerMcpTools` exposes) and that its `allowedProcedures`
 * field reflects the project-level allowlist passed in at registration time.
 *
 * One happy-path assertion. Cheap — no MSACCESS, no PowerShell.
 */

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}
class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

function makeServices() {
  return {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  };
}

describe("get_capabilities via dispatch harness (#656)", () => {
  it("is reachable and the allowlist propagates through the registration chain", async () => {
    const allowedProcedures = ["Test_Alpha", "Test_Beta"] as const;
    const tools = createDysflowMcpTools(
      makeServices(),
      true, // writesEnabled
      undefined, // no per-input resolver
      process.env,
      allowedProcedures, // project allowlist
    );

    const tool = tools.find((t) => t.name === "get_capabilities");
    expect(tool, "tool must be reachable through the dispatch chain").toBeDefined();

    const result = await tool?.handler({});
    expect(result?.isError).toBe(false);
    expect(result?.ok).toBe(true);

    const payload = JSON.parse(result?.content[0]?.text ?? "{}") as {
      allowedProcedures?: readonly string[];
    };
    expect(payload.allowedProcedures).toEqual(["Test_Alpha", "Test_Beta"]);
  });
});
