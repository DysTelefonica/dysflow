import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

// Node-backed filesystem for tests that need branch 1 to load a real repo config.
// Kept inline so the existing branch-2 (no-fs) tests stay decoupled from disk.
const nodeFileSystem: ConfigFileSystemPort = {
  existsSync: (path: string) => existsSync(path),
  existsAsync: async (path: string) => existsSync(path),
  readJsonSync: <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T,
  readJsonAsync: async <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T,
};

function createTempWorkspace(): { root: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "execution-target-pr2-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function writeRepoProjectConfig(root: string, config: Record<string, unknown>): void {
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

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

  it("keeps contextId as metadata while using context defaults", async () => {
    const result = await resolveExecutionTarget({ contextId: "request-trace" }, context);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected context defaults");
    expect(result.data.accessDbPath).toBe("C:/my-project/db.accdb");
    expect(result.data.destinationRoot).toBe("C:/my-project/dest");
    expect(result.data.projectId).toBeUndefined();
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

describe("ExecutionTarget Override Precedence (#619)", () => {
  const branch2Context = {
    env: {} as Record<string, string | undefined>,
    cwd: "C:/my-project",
    accessPath: "C:/my-project/db.accdb",
    destinationRoot: "C:/my-project/dest",
    timeoutMs: 15000,
    fileSystem: unusedFileSystem,
  };

  it("branch 2 returns caller-supplied params.backendPath (#619)", async () => {
    const result = await resolveExecutionTarget(
      { backendPath: "C:/worktrees/feature/backend.accdb" },
      branch2Context,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.backendPath).toBe("C:/worktrees/feature/backend.accdb");
    }
  });

  it("branch 2 normalizes empty-string params.backendPath to undefined (#619)", async () => {
    const result = await resolveExecutionTarget({ backendPath: "" }, branch2Context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.backendPath).toBeUndefined();
    }
  });

  it("branch 2 normalizes whitespace-only params.backendPath to undefined (#619)", async () => {
    const result = await resolveExecutionTarget({ backendPath: "   " }, branch2Context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.backendPath).toBeUndefined();
    }
  });

  it("branches 0/1/2 backendPath propagation contract — caller wins in 0/2; branch 1 honors repo config (#619)", async () => {
    const callerOverride = "C:/worktrees/feature/backend.accdb";

    // Branch 0 — explicit accessPath forces loadDysflowConfigAsyncWith → buildExplicitConfig,
    // which already threads input.backendPath through. Caller wins (existing behavior).
    const branch0Context = { ...branch2Context, fileSystem: unusedFileSystem };
    const branch0 = await resolveExecutionTarget(
      { accessPath: "C:/other/db.accdb", backendPath: callerOverride },
      branch0Context,
    );
    expect(branch0.ok).toBe(true);
    if (branch0.ok) {
      expect(branch0.data.backendPath).toBe(callerOverride);
    }

    // Branch 1 — context.accessPath is undefined; the repo config is loaded.
    // Branch 1 calls loadDysflowConfigAsyncWith WITHOUT params.backendPath, so the
    // result carries the repo config's backendPath (the caller's value is NOT
    // propagated today; this test pins the existing behavior so any future change
    // is intentional). If the design is later extended to also fix branch 1, this
    // assertion will flip to expect(callerOverride).
    const { root, cleanup } = createTempWorkspace();
    try {
      writeRepoProjectConfig(root, {
        accessPath: "front.accdb",
        backendPath: "repo-backend.accdb",
      });
      writeFileSync(join(root, "front.accdb"), "", "utf8");
      const branch1Context = {
        ...branch2Context,
        accessPath: undefined,
        cwd: root,
        fileSystem: nodeFileSystem,
      };
      const branch1 = await resolveExecutionTarget({ backendPath: callerOverride }, branch1Context);
      expect(branch1.ok).toBe(true);
      if (branch1.ok) {
        expect(branch1.data.backendPath).toBe(join(root, "repo-backend.accdb"));
      }
    } finally {
      cleanup();
    }

    // Branch 2 — context.accessPath defined, no explicit config override, no projectId.
    // After the #619 fix, caller's params.backendPath propagates into the result.
    const branch2 = await resolveExecutionTarget({ backendPath: callerOverride }, branch2Context);
    expect(branch2.ok).toBe(true);
    if (branch2.ok) {
      expect(branch2.data.backendPath).toBe(callerOverride);
    }
  });

  it("branch 2 undefined backendPath stays undefined when caller omits it (#619)", async () => {
    const result = await resolveExecutionTarget({}, branch2Context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.backendPath).toBeUndefined();
    }
  });
});
