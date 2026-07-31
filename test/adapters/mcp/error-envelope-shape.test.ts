import { describe, expect, it } from "vitest";
import { createMigrateProjectConfigTool } from "../../../src/adapters/mcp/migrate-project-config-tool.js";

describe("errorEnvelope contract", () => {
  it("migrate_project_config returns structured JSON on a missing config", async () => {
    const tool = createMigrateProjectConfigTool({
      cwd: "Z:/definitely-not-a-dysflow-project",
      writesEnabled: false,
    });

    const result = await tool.handler({ cwd: "Z:/definitely-not-a-dysflow-project" });
    const payload = JSON.parse(result.content[0]?.text ?? "");

    expect(result.ok).toBe(false);
    expect(payload).toMatchObject({
      ok: false,
      error: {
        code: "PROJECT_CONFIG_NOT_FOUND",
        message: expect.any(String),
        remediation: expect.any(String),
      },
    });
  });
});
