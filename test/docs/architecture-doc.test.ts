import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  advanceVbaImportAfterPass,
  startVbaImportOrchestration,
} from "../../src/core/services/vba-import-orchestration.js";

describe("core and adapters architecture doc", () => {
  it("documents inward dependency direction and the MCP compatibility boundary", async () => {
    const content = await readFile("docs/architecture/dysflow-core-and-adapters.md", "utf8");

    expect(content).toContain("adapters depend inward on `src/core/**`");
    expect(content).toContain("`src/core/**` MUST NOT import MCP or HTTP adapters");
    expect(content).toContain("`<workflow-repo>/skills/dysflow`");
    expect(content).toContain("Compatibility reference");
    expect(content).toContain("./relink-directory-orchestration.md");
  });

  it("anchors the documented VBA import boundary to core runtime decisions", async () => {
    const [architecture, api] = await Promise.all([
      readFile("docs/architecture/dysflow-core-and-adapters.md", "utf8"),
      readFile("docs/api/mcp-tools.md", "utf8"),
    ]);
    const start = startVbaImportOrchestration(["Form_frmRuntimeAnchor"]);

    expect(start.kind).toBe("run-pass");
    if (start.kind !== "run-pass") throw new Error("Expected an import pass decision");
    expect(start.rollbackOnMutationFailure).toBe(true);

    const save = advanceVbaImportAfterPass(start.state, [
      {
        module: "Form_frmRuntimeAnchor",
        ok: true,
        durationMs: 1,
        modifiedDocumentName: "Form_frmRuntimeAnchor",
      },
    ]);
    expect(save).toMatchObject({
      kind: "save",
      moduleNames: ["Form_frmRuntimeAnchor"],
    });
    expect(architecture).toContain("src/core/services/vba-import-orchestration.ts");
    expect(architecture).toContain("RunCommand(280)");
    expect(api).toContain("post-import save failure is returned as a warning");
    expect(api).toContain("the human compiles in Access before testing");
  });
});
