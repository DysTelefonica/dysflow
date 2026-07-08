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

    expect(statedCounts.length, "README should state the visible MCP tool count").toBeGreaterThan(
      0,
    );
    expect(new Set(statedCounts)).toEqual(new Set([visibleCount]));
  });

  it("documents every visible tools/list name in the README inventory (#590)", async () => {
    const readme = await readFile("README.md", "utf8");
    const inventoryToolNames = readmeInventoryToolNames(readme);
    const missing = visibleToolNames().filter((toolName) => !inventoryToolNames.has(toolName));

    expect(missing).toEqual([]);
  });

  it("documents visible tools/list names only as shaped entries in the MCP inventory (#590)", async () => {
    const readme = await readFile("README.md", "utf8");
    const expected = new Set(visibleToolNames());
    const inventoryToolNames = readmeInventoryToolNames(readme);

    expect(inventoryToolNames).toEqual(expected);
  });

  it("describes MCP writes as enabled by default with a --disable-writes opt-out, not only SQL writes", async () => {
    const readme = await readFile("README.md", "utf8");
    const cliSection = sectionBetween(readme, "## CLI", "### Common flow");

    expect(cliSection).toContain("writes enabled by default");
    expect(cliSection).toContain("--disable-writes");
    expect(cliSection).not.toContain("enables guarded SQL writes");
  });
});

function advertisedTools() {
  return createDysflowMcpTools({
    services: {
      vbaService: new FakeVbaService(),
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
    },
  });
}

function visibleToolNames() {
  return advertisedTools()
    .filter((tool) => !tool.hidden)
    .map((tool) => tool.name);
}

function readmeInventoryToolNames(readme: string): Set<string> {
  const inventory = sectionBetween(
    readme,
    "### Core MCP Tools",
    "### MCP protocol and maintenance",
  );
  return new Set(
    [...inventory.matchAll(/^\s*(?:####|\*)\s+(?:\*\*)?`([^`]+)`(?:\*\*)?\s*(?::)?/gm)].flatMap(
      (match) => (match[1] === undefined ? [] : [match[1]]),
    ),
  );
}

function sectionBetween(content: string, startMarker: string, endMarker: string): string {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start + startMarker.length);

  expect(start, `README should include ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(end, `README should include ${endMarker} after ${startMarker}`).toBeGreaterThan(start);

  return content.slice(start, end);
}
