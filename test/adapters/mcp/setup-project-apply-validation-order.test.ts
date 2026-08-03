import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSetupProjectTool } from "../../../src/adapters/mcp/setup-project-tool.js";

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "dysflow-setup-order-"));
  writeFileSync(join(workdir, ".git"), "gitdir: fixture", "utf8");
  mkdirSync(join(workdir, "src"));
});

afterEach(() => rmSync(workdir, { recursive: true, force: true }));

describe("setup_project apply validation order (#1352)", () => {
  it("validates identity, write policy, then target existence with resolved evidence", async () => {
    const writeEnabled = createSetupProjectTool({ cwd: workdir, writesEnabled: true });
    const missingId = await writeEnabled.handler({ frontendFile: "x.accdb", apply: true });
    expect(missingId.error?.code).toBe("MCP_INPUT_INVALID");
    expect(missingId.error?.message).toContain("projectId is required");

    const writeDisabled = createSetupProjectTool({ cwd: workdir, writesEnabled: false });
    const denied = await writeDisabled.handler({
      frontendFile: "x.accdb",
      projectId: "my-fixed-id",
      apply: true,
    });
    expect(denied.error?.code).toBe("MCP_WRITES_DISABLED");

    const missingTarget = await writeEnabled.handler({
      frontendFile: "x.accdb",
      projectId: "my-fixed-id",
      apply: true,
    });
    expect(missingTarget.isError).toBe(true);
    expect(JSON.parse(missingTarget.content[0]?.text ?? "{}")).toMatchObject({
      ok: false,
      error: {
        code: "TARGET_NOT_FOUND",
        configPath: join(workdir, ".dysflow", "project.json"),
        resolvedConfig: {
          id: "my-fixed-id",
          frontendFile: "x.accdb",
        },
      },
    });
  });
});
