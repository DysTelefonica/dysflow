import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools";
import { successResult } from "../../src/core/contracts/index";

const EXAMPLES_DIRECTORY = "skills/dysflow-usage/assets/examples";
const SKILL_PATH = "skills/dysflow-usage/SKILL.md";

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

function advertisedToolNames(): string[] {
  return createDysflowMcpTools({
    services: {
      vbaService: new FakeVbaService(),
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
    },
  })
    .filter((tool) => !tool.hidden)
    .map((tool) => tool.name);
}

describe("#1611 dysflow-usage example discovery", () => {
  it("ships a kebab-case example file for every advertised tool", () => {
    const missing = advertisedToolNames().filter(
      (name) => !existsSync(`${EXAMPLES_DIRECTORY}/${name.replaceAll("_", "-")}.md`),
    );

    expect(missing, `advertised tools missing examples: ${missing.join(", ")}`).toEqual([]);
  });

  it("points to the canonical examples directory without a manual file/action index", () => {
    const skill = readFileSync(SKILL_PATH, "utf8");

    expect(skill).toMatch(
      /## Examples[^\n]*\n\n[^\n]*`assets\/examples\/`[^\n]*canonical per-tool index/i,
    );
    expect(skill).not.toMatch(/\|\s*File\s*\|\s*Action\s*\|/i);
  });
});
