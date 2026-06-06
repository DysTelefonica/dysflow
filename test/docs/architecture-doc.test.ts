import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("core and adapters architecture doc", () => {
  it("documents inward dependency direction and the MCP compatibility boundary", async () => {
    const content = await readFile("docs/architecture/dysflow-core-and-adapters.md", "utf8");

    expect(content).toContain("adapters depend inward on `src/core/**`");
    expect(content).toContain("`src/core/**` MUST NOT import MCP or HTTP adapters");
    expect(content).toContain("`<workflow-repo>/skills/dysflow`");
    expect(content).toContain("Compatibility reference");
  });
});
