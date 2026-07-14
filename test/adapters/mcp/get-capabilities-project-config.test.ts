import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";
import { createGetCapabilitiesTool } from "../../../src/adapters/mcp/get-capabilities-tool.js";

describe("get_capabilities projectConfig", () => {
  it("re-resolves the active worktree on every call without mutation", async () => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-caps-"));
    writeFileSync(join(root, ".git"), "");
    const tool = createGetCapabilitiesTool({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: undefined,
      allowWrites: true,
      projectConfigResolver: () => diagnoseProjectConfig(root),
    });
    const first = JSON.parse((await tool.handler({})).content[0]?.text ?? "{}");
    expect(first.projectConfig.status).toBe("missing");
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb", destinationRoot: "src" }),
    );
    const second = JSON.parse((await tool.handler({})).content[0]?.text ?? "{}");
    expect(second.projectConfig).toMatchObject({ status: "valid", writeReady: true });
  });
});
