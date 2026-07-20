import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ConfigFileSystemPort,
  loadDysflowConfigAsyncWith,
  loadDysflowConfigWith,
} from "../../../src/core/config/dysflow-config.js";

// A purely in-memory ConfigFileSystemPort. Paths are normalized through resolve()
// so the walk-up discovery logic and the fake agree on identity. This lets us
// exercise repo-config discovery, parsing, and error mapping WITHOUT touching disk
// — the whole point of putting filesystem access behind a port.
function makeFakeFs(files: Record<string, string>): ConfigFileSystemPort {
  const map = new Map(Object.entries(files).map(([k, v]) => [resolve(k), v]));
  const read = <T>(path: string): T => {
    const raw = map.get(resolve(path));
    if (raw === undefined) throw new Error(`ENOENT: ${path}`);
    return JSON.parse(raw) as T;
  };
  return {
    existsSync: (path) => map.has(resolve(path)),
    existsAsync: async (path) => map.has(resolve(path)),
    readJsonSync: read,
    readJsonAsync: async <T>(path: string) => read<T>(path),
  };
}

const REPO = resolve(process.cwd(), "fake-repo-fixture");
const CONFIG_PATH = resolve(REPO, ".dysflow", "project.json");

describe("loadDysflowConfig — ConfigFileSystemPort (sync)", () => {
  it("discovers and parses repo config through the injected port", () => {
    const fs = makeFakeFs({
      [CONFIG_PATH]: JSON.stringify({
        id: "proj",
        accessPath: "db.accdb",
        capabilities: { allowWrites: true },
      }),
    });

    const result = loadDysflowConfigWith({ cwd: REPO, env: {} }, fs);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.configSource).toBe("repo-config");
      expect(result.data.projectId).toBe("proj");
      expect(result.data.allowWrites).toBe(true);
      expect(result.data.accessDbPath).toBe(resolve(REPO, "db.accdb"));
    }
  });

  it("uses the configured project identity when contextId is supplied without projectId", () => {
    const fs = makeFakeFs({
      [CONFIG_PATH]: JSON.stringify({ id: "configured-project", accessPath: "db.accdb" }),
    });

    const result = loadDysflowConfigWith({ cwd: REPO, contextId: "request-trace", env: {} }, fs);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected repo config to load");
    expect(result.data.projectId).toBe("configured-project");
  });

  it("walks up the directory tree to find the repo config", () => {
    const fs = makeFakeFs({
      [CONFIG_PATH]: JSON.stringify({ id: "proj", accessPath: "db.accdb" }),
    });

    const result = loadDysflowConfigWith({ cwd: resolve(REPO, "src", "deep"), env: {} }, fs);

    expect(result.ok).toBe(true);
  });

  it("does not treat contextId as a registry project identity when repo config is absent", () => {
    const fs = makeFakeFs({});
    const result = loadDysflowConfigWith({ cwd: REPO, contextId: "request-trace", env: {} }, fs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFIG_MISSING_ACCESS_PATH");
  });

  it("returns CONFIG_MISSING_ACCESS_PATH when no repo config exists anywhere", () => {
    const fs = makeFakeFs({});
    const result = loadDysflowConfigWith({ cwd: REPO, env: {} }, fs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFIG_MISSING_ACCESS_PATH");
  });

  it("maps invalid JSON to CONFIG_PROJECT_FILE_INVALID", () => {
    const fs = makeFakeFs({ [CONFIG_PATH]: "{ not json" });
    const result = loadDysflowConfigWith({ cwd: REPO, env: {} }, fs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFIG_PROJECT_FILE_INVALID");
  });
});

describe("loadDysflowConfig — ConfigFileSystemPort (async)", () => {
  it("discovers and parses repo config through the injected port", async () => {
    const fs = makeFakeFs({
      [CONFIG_PATH]: JSON.stringify({ id: "proj", accessPath: "db.accdb" }),
    });

    const result = await loadDysflowConfigAsyncWith({ cwd: REPO, env: {} }, fs);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.accessDbPath).toBe(resolve(REPO, "db.accdb"));
  });

  it("uses the configured project identity when contextId is supplied without projectId", async () => {
    const fs = makeFakeFs({
      [CONFIG_PATH]: JSON.stringify({ id: "configured-project", accessPath: "db.accdb" }),
    });

    const result = await loadDysflowConfigAsyncWith(
      { cwd: REPO, contextId: "request-trace", env: {} },
      fs,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected repo config to load");
    expect(result.data.projectId).toBe("configured-project");
  });

  it("maps invalid JSON to CONFIG_PROJECT_FILE_INVALID", async () => {
    const fs = makeFakeFs({ [CONFIG_PATH]: "{ not json" });
    const result = await loadDysflowConfigAsyncWith({ cwd: REPO, env: {} }, fs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFIG_PROJECT_FILE_INVALID");
  });
});
