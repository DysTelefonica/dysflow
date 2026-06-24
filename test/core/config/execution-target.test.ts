import { describe, expect, it } from "vitest";
import type { ConfigFileSystemPort } from "../../../src/core/config/dysflow-config.js";
import { resolveExecutionTarget } from "../../../src/core/config/execution-target.js";

// These scenarios resolve through explicit overrides or context defaults, so the
// config filesystem is never read. A throwing fake makes that contract explicit:
// if any path tried to hit disk, the test would fail loudly.
const unusedFileSystem: ConfigFileSystemPort = {
  existsSync: () => false,
  existsAsync: async () => false,
  readJsonSync: <T>(): T => {
    throw new Error("ConfigFileSystemPort.readJsonSync must not be called here");
  },
  readJsonAsync: <T>(): Promise<T> =>
    Promise.reject(new Error("ConfigFileSystemPort.readJsonAsync must not be called here")),
};

describe("resolveExecutionTarget", () => {
  const context = {
    env: {},
    cwd: "C:/my-project",
    accessPath: "C:/my-project/db.accdb",
    destinationRoot: "C:/my-project/dest",
    timeoutMs: 15000,
    fileSystem: unusedFileSystem,
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

  it("resolves timeoutMs override from params", async () => {
    const result = await resolveExecutionTarget({ timeoutMs: 45000 }, context);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.timeoutMs).toBe(45000);
    }
  });

  it("resolves timeoutMs from context when not overridden", async () => {
    const result = await resolveExecutionTarget({}, context);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.timeoutMs).toBe(15000);
    }
  });
});
