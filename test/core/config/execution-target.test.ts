import { describe, expect, it } from "vitest";
import { resolveExecutionTarget } from "../../../src/core/config/execution-target.js";

describe("resolveExecutionTarget", () => {
  const context = {
    env: {},
    cwd: "C:/my-project",
    accessPath: "C:/my-project/db.accdb",
    destinationRoot: "C:/my-project/dest",
    timeoutMs: 15000,
  };

  it("returns explicit overrides if specified", async () => {
    const result = await resolveExecutionTarget(
      { accessPath: "C:/other/db.accdb", projectRoot: "C:/other" },
      context,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.accessDbPath).toBe("C:/other/db.accdb");
      expect(result.data.projectRoot).toBe("C:/other");
    }
  });

  it("falls back to context defaults if no overrides specified", async () => {
    const result = await resolveExecutionTarget({}, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.accessDbPath).toBe("C:/my-project/db.accdb");
      expect(result.data.destinationRoot).toBe("C:/my-project/dest");
    }
  });
});
