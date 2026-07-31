import { describe, expect, it } from "vitest";

import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

class FakeService {
  public calls = 0;

  async execute() {
    this.calls += 1;
    return successResult({ rows: [], returnValue: "ok" });
  }

  async run() {
    return successResult({ checks: [] });
  }
}

function makeTools() {
  const queryService = new FakeService();
  const vbaSyncToolService = new FakeService();
  const tools = createDysflowMcpTools({
    services: {
      queryService,
      vbaService: new FakeService(),
      vbaSyncToolService,
      diagnosticsService: new FakeService(),
    },
    writes: true,
  });
  return { queryService, tools, vbaSyncToolService };
}

describe("HR-1 human compile and HR-3 sandbox gates", () => {
  it("run_script refuses an Access target outside the current worktree", async () => {
    const { queryService, tools } = makeTools();
    const tool = tools.find((candidate) => candidate.name === "run_script");

    const result = await tool?.handler({
      accessPath: "C:/Production/real.accdb",
      scriptPath: "/path/to/anything.sql",
      apply: false,
    });

    expect(result?.ok).toBe(false);
    expect(result?.error?.code).toMatch(/SANDBOX_ONLY|RUNNING_PRODUCTION|HR3_VIOLATION/);
    expect(queryService.calls).toBe(0);
  });

  it("vba_inline_execution refuses runtime mutation without confirmation", async () => {
    const { tools, vbaSyncToolService } = makeTools();
    const tool = tools.find((candidate) => candidate.name === "vba_inline_execution");

    const result = await tool?.handler({ code: "Application.Quit", apply: true });

    expect(result?.ok).toBe(false);
    expect(result?.error?.code).toMatch(/HR1_VIOLATION|COMPILE_REQUIRED|CONFIRMATION_REQUIRED/);
    expect(vbaSyncToolService.calls).toBe(0);
  });
});
