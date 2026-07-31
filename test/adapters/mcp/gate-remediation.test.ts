import { describe, expect, it } from "vitest";
import { projectConfigNotWriteReady } from "../../../src/adapters/mcp/dispatch-common.js";

describe("write gates include error.remediation", () => {
  it("PROJECT_CONFIG_NOT_WRITE_READY has an actionable structured remediation", () => {
    const result = projectConfigNotWriteReady("import_modules", {
      status: "missing",
      cwd: "C:/project",
      configPath: "C:/project/.dysflow/project.json",
      projectRoot: "C:/project",
      projectId: "not-ready",
      accessPath: null,
      backendPath: null,
      destinationRoot: null,
      writeReady: false,
      diagnostics: [],
      remediation: null,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PROJECT_CONFIG_NOT_WRITE_READY");
    expect(result.error?.remediation).toBeDefined();
    expect(typeof result.error?.remediation).toBe("object");
    expect(result.error?.remediation).toMatchObject({
      description: expect.stringContaining("write-ready"),
    });
  });
});
