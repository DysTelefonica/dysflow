import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools";
import { successResult } from "../../src/core/contracts/index";

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

describe("README MCP tool surface", () => {
  it("keeps the visible tool count aligned with the tools/list surface (#590)", async () => {
    const readme = await readFile("README.md", "utf8");
    const tools = advertisedTools();
    const visibleCount = tools.filter((tool) => !tool.hidden).length;
    const statedCounts = [...readme.matchAll(/(\d+) visible MCP tools/g)].map((match) =>
      Number(match[1]),
    );

    expect(statedCounts.length, "README should state the visible MCP tool count").toBeGreaterThan(0);
    expect(new Set(statedCounts)).toEqual(new Set([visibleCount]));
  });

  it("documents every visible tools/list name in the README inventory (#590)", async () => {
    const readme = await readFile("README.md", "utf8");
    const missing = advertisedTools()
      .filter((tool) => !tool.hidden)
      .map((tool) => tool.name)
      .filter((toolName) => !readme.includes(`\`${toolName}\``));

    expect(missing).toEqual([]);
  });
});

function advertisedTools() {
  return createDysflowMcpTools({
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  });
}
