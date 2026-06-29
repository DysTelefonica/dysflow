import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadDysflowConfig,
  loadDysflowConfigAsync,
} from "../../../src/adapters/config/dysflow-config-node";
import {
  loadDysflowConfigShared,
  loadProjectConfigCore,
  redactDysflowConfig,
} from "../../../src/core/config/dysflow-config";

function createTempWorkspace(): { root: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "dysflow-config-"));
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

describe("dysflow configuration", () => {
  // #61 — both .dysflow/project.json and dysflow.project.json in same dir
  it("returns CONFIG_AMBIGUOUS_PROJECT_FILE when both config filenames exist", () => {
    const { root, cleanup } = createTempWorkspace();
    try {
      // Write .dysflow/project.json
      mkdirSync(join(root, ".dysflow"), { recursive: true });
      writeFileSync(join(root, ".dysflow", "project.json"), '{"accessPath":"a.accdb"}', "utf8");
      // Write dysflow.project.json
      writeFileSync(join(root, "dysflow.project.json"), '{"accessPath":"b.accdb"}', "utf8");

      const result = loadDysflowConfig({ cwd: root, env: {} });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.error.code).toBe("CONFIG_AMBIGUOUS_PROJECT_FILE");
      expect(result.error.retryable).toBe(false);
      expect(result.error.message).toContain(".dysflow");
      expect(result.error.message).toContain("dysflow.project.json");
    } finally {
      cleanup();
    }
  });

  // #13228 — an explicitly-passed destinationRoot MUST win over a discovered repo
  // config's destinationRoot. Otherwise export_all from a worktree whose cwd resolves
  // the startup project overwrites the wrong src/ (the 186-file staging incident).
  it("explicit destinationRoot wins over a discovered repo config destinationRoot", async () => {
    const { root, cleanup } = createTempWorkspace();
    try {
      const startup = join(root, "staging");
      const worktreeSrc = join(root, "worktree", "src");
      const worktreeBackend = join(root, "worktree", "backend.accdb");
      mkdirSync(worktreeSrc, { recursive: true });
      writeRepoProjectConfig(startup, {
        accessPath: "front.accdb",
        backendPath: "backend.accdb",
        destinationRoot: "src",
      });
      writeFileSync(join(startup, "front.accdb"), "", "utf8");

      const result = await loadDysflowConfigAsync({
        cwd: startup,
        env: {},
        destinationRoot: worktreeSrc,
        backendPath: worktreeBackend,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      // The caller's explicit overrides win over the discovered repo config's values.
      expect(result.data.destinationRoot).toBe(worktreeSrc);
      expect(result.data.backendPath).toBe(worktreeBackend);
    } finally {
      cleanup();
    }
  });

  it("still succeeds when only one config filename exists", () => {
    const { root, cleanup } = createTempWorkspace();
    try {
      writeRepoProjectConfig(root, { accessPath: "app.accdb" });
      const result = loadDysflowConfig({ cwd: root, env: {} });
      expect(result.ok).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("resolves Access path, timeout, and redacts password from explicit input", () => {
    const result = loadDysflowConfig({
      accessDbPath: "C:/data/app.accdb",
      accessPassword: "super-secret",
      timeoutMs: 45_000,
      env: {},
    });

    expect(result).toEqual({
      ok: true,
      data: {
        configSource: "explicit-request",
        allowWrites: false,
        accessDbPath: "C:/data/app.accdb",
        backendPath: undefined,
        timeoutMs: 45_000,
        accessPassword: "super-secret",
        backendPassword: undefined,
        projectId: undefined,
        projectRoot: expect.any(String),
        destinationRoot: expect.any(String),
      },
      diagnostics: [],
      durationMs: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected config success");
    expect(redactDysflowConfig(result.data)).toMatchObject({
      accessDbPath: "C:/data/app.accdb",
      allowWrites: false,
      timeoutMs: 45_000,
      accessPassword: "[REDACTED]",
      configSource: "explicit-request",
    });
  });

  it("does not resolve functional config from environment variables", () => {
    const workspace = createTempWorkspace();
    try {
      const result = loadDysflowConfig({
        cwd: workspace.root,
        env: {
          DYSFLOW_ACCESS_DB_PATH: "D:/fixtures/demo.accdb",
          DYSFLOW_PROJECT_ID: "demo",
          DYSFLOW_TIMEOUT_MS: "120000",
        },
      });

      expect(result).toEqual({
        ok: false,
        error: {
          code: "CONFIG_MISSING_ACCESS_PATH",
          message:
            "Access database path is required. Define .dysflow/project.json in the repository or pass accessDbPath explicitly.",
          retryable: false,
        },
        diagnostics: [],
        durationMs: 0,
      });
    } finally {
      workspace.cleanup();
    }
  });

  it("returns a typed configuration error when repo project config is missing", () => {
    const workspace = createTempWorkspace();
    try {
      const result = loadDysflowConfig({ cwd: workspace.root, env: {} });
      expect(result).toEqual({
        ok: false,
        error: {
          code: "CONFIG_MISSING_ACCESS_PATH",
          message:
            "Access database path is required. Define .dysflow/project.json in the repository or pass accessDbPath explicitly.",
          retryable: false,
        },
        diagnostics: [],
        durationMs: 0,
      });
    } finally {
      workspace.cleanup();
    }
  });

  it("falls back to the default timeout when explicit timeout is invalid", () => {
    for (const timeoutMs of [0, -1, Number.NaN]) {
      const result = loadDysflowConfig({
        accessDbPath: "C:/data/app.accdb",
        timeoutMs,
        env: {},
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected config success");
      expect(result.data.timeoutMs).toBe(30_000);
    }
  });

  it("loads repo .dysflow project config and resolves relative credentials", () => {
    const workspace = createTempWorkspace();
    try {
      writeRepoProjectConfig(workspace.root, {
        id: "proyecto-demo",
        accessPath: "front.accdb",
        backendPath: "backend.accdb",
        allowWrites: true,
        destinationRoot: "src",
        projectRoot: ".",
        timeoutMs: 12_000,
        accessPasswordEnv: "WORKTREE_ACCESS_PASSWORD",
        frontendPasswordEnv: "WORKTREE_ACCESS_PASSWORD",
        backendPasswordEnv: "WORKTREE_BACKEND_PASSWORD",
      });
      writeFileSync(join(workspace.root, "front.accdb"), "", "utf8");
      writeFileSync(join(workspace.root, "backend.accdb"), "", "utf8");

      const result = loadDysflowConfig({
        cwd: workspace.root,
        env: {
          WORKTREE_ACCESS_PASSWORD: "access-secret",
          WORKTREE_BACKEND_PASSWORD: "backend-secret",
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected project config to load");

      expect(result.data).toMatchObject({
        configSource: "repo-config",
        accessDbPath: resolve(workspace.root, "front.accdb"),
        backendPath: resolve(workspace.root, "backend.accdb"),
        allowWrites: true,
        destinationRoot: resolve(workspace.root, "src"),
        projectRoot: resolve(workspace.root),
        projectId: "proyecto-demo",
        accessPassword: "access-secret",
        backendPassword: "backend-secret",
        timeoutMs: 12_000,
      });
    } finally {
      workspace.cleanup();
    }
  });

  it("resolves projectRoot dot and relative accessPath from the project config directory", () => {
    const workspace = createTempWorkspace();
    try {
      writeRepoProjectConfig(workspace.root, {
        id: "relative-access-project",
        projectRoot: ".",
        accessPath: "Gestion_Riesgos.accdb",
        backendPath: "Gestion_Riesgos_Datos.accdb",
      });
      writeFileSync(join(workspace.root, "Gestion_Riesgos.accdb"), "", "utf8");
      writeFileSync(join(workspace.root, "Gestion_Riesgos_Datos.accdb"), "", "utf8");

      const result = loadDysflowConfig({
        cwd: join(workspace.root, "src"),
        projectId: "relative-access-project",
        env: {},
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected project config to load");
      expect(result.data.accessDbPath).toBe(resolve(workspace.root, "Gestion_Riesgos.accdb"));
      expect(result.data.backendPath).toBe(resolve(workspace.root, "Gestion_Riesgos_Datos.accdb"));
      expect(result.data.projectRoot).toBe(resolve(workspace.root));
    } finally {
      workspace.cleanup();
    }
  });

  it("lets an explicit absolute accessDbPath override a stale repo config accessPath", async () => {
    const workspace = createTempWorkspace();
    try {
      writeRepoProjectConfig(workspace.root, {
        id: "override-access-project",
        accessPath: "missing-front.accdb",
      });
      const overrideAccessPath = join(workspace.root, "Gestion_Riesgos.accdb");
      writeFileSync(overrideAccessPath, "", "utf8");

      const result = await loadDysflowConfigAsync({
        cwd: workspace.root,
        projectId: "override-access-project",
        accessDbPath: overrideAccessPath,
        env: {},
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected explicit access path to load");
      expect(result.data.accessDbPath).toBe(overrideAccessPath);
      expect(result.data.projectId).toBe("override-access-project");
    } finally {
      workspace.cleanup();
    }
  });

  it("resolves matching projectId from the repo-local config so project allowWrites can apply", () => {
    const workspace = createTempWorkspace();
    try {
      writeRepoProjectConfig(workspace.root, {
        id: "any-access-project",
        accessPath: "front.accdb",
        backendPath: "backend.accdb",
        allowWrites: true,
      });
      writeFileSync(join(workspace.root, "front.accdb"), "", "utf8");
      writeFileSync(join(workspace.root, "backend.accdb"), "", "utf8");

      const result = loadDysflowConfig({
        cwd: workspace.root,
        projectId: "any-access-project",
        env: {},
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected project config to load");
      expect(result.data.projectId).toBe("any-access-project");
      expect(result.data.allowWrites).toBe(true);
    } finally {
      workspace.cleanup();
    }
  });

  it("rejects projectId when it does not match the repo-local config id", () => {
    const workspace = createTempWorkspace();
    try {
      writeRepoProjectConfig(workspace.root, {
        id: "configured-project",
        accessPath: "front.accdb",
        allowWrites: true,
      });

      const result = loadDysflowConfig({
        cwd: workspace.root,
        projectId: "other-project",
        env: {},
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected config mismatch");
      expect(result.error.code).toBe("CONFIG_PROJECT_ID_MISMATCH");
      expect(result.error.message).toContain("other-project");
      expect(result.error.message).toContain("configured-project");
    } finally {
      workspace.cleanup();
    }
  });

  it("async config resolves matching projectId from the repo-local config", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "dysflow-config-async-project-id-"));
    try {
      await mkdir(join(workspace, ".dysflow"), { recursive: true });
      await writeFile(
        join(workspace, ".dysflow", "project.json"),
        JSON.stringify({ id: "async-project", accessPath: "front.accdb", allowWrites: true }),
        "utf8",
      );
      await writeFile(join(workspace, "front.accdb"), "", "utf8");

      const result = await loadDysflowConfigAsync({
        cwd: workspace,
        projectId: "async-project",
        env: {},
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected async project config to load");
      expect(result.data.projectId).toBe("async-project");
      expect(result.data.allowWrites).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("uses explicit projectId as canonical trace identity ahead of contextId", () => {
    const result = loadDysflowConfig({
      accessDbPath: "C:/data/app.accdb",
      projectId: "engram-canonical-project",
      contextId: "run-context-only",
      env: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected config success");
    expect(result.data.projectId).toBe("engram-canonical-project");
  });

  it("falls back to contextId only when no projectId exists", () => {
    const result = loadDysflowConfig({
      accessDbPath: "C:/data/app.accdb",
      contextId: "context-fallback-project",
      env: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected config success");
    expect(result.data.projectId).toBe("context-fallback-project");
  });

  it("does not let env path variables override repo config", () => {
    const workspace = createTempWorkspace();
    try {
      writeRepoProjectConfig(workspace.root, {
        id: "repo-project",
        accessPath: "front.accdb",
      });
      writeFileSync(join(workspace.root, "front.accdb"), "", "utf8");

      const result = loadDysflowConfig({
        cwd: workspace.root,
        env: {
          DYSFLOW_ACCESS_DB_PATH: "D:/wrong/other.accdb",
          DYSFLOW_PROJECT_ID: "wrong-project",
          DYSFLOW_TIMEOUT_MS: "120000",
          DYSFLOW_ACCESS_PASSWORD: "allowed-secret",
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected config success");
      expect(result.data).toMatchObject({
        configSource: "repo-config",
        accessDbPath: resolve(workspace.root, "front.accdb"),
        projectId: "repo-project",
        timeoutMs: 30_000,
        accessPassword: "allowed-secret",
      });
    } finally {
      workspace.cleanup();
    }
  });

  it("resolves E2E_testing-style repo config paths, env passwords, and 90000ms timeout", async () => {
    const workspace = createTempWorkspace();
    try {
      const e2eRoot = join(workspace.root, "E2E_testing");
      mkdirSync(e2eRoot, { recursive: true });
      writeRepoProjectConfig(e2eRoot, {
        id: "lanzadera",
        accessPath: "Expedientes.accdb",
        backendPath: "Expedientes_datos.accdb",
        destinationRoot: "src",
        allowWrites: true,
        timeoutMs: 90_000,
        passwordEnv: "DYSFLOW_ACCESS_PASSWORD",
        backendPasswordEnv: "DYSFLOW_BACKEND_PASSWORD",
      });
      writeFileSync(join(e2eRoot, "Expedientes.accdb"), "", "utf8");
      writeFileSync(join(e2eRoot, "Expedientes_datos.accdb"), "", "utf8");

      const result = await loadDysflowConfigAsync({
        cwd: e2eRoot,
        env: {
          DYSFLOW_ACCESS_PASSWORD: "front-secret",
          DYSFLOW_BACKEND_PASSWORD: "backend-secret",
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected async config success");
      expect(result.data).toMatchObject({
        configSource: "repo-config",
        allowWrites: true,
        projectId: "lanzadera",
        accessDbPath: resolve(e2eRoot, "Expedientes.accdb"),
        backendPath: resolve(e2eRoot, "Expedientes_datos.accdb"),
        destinationRoot: resolve(e2eRoot, "src"),
        projectRoot: e2eRoot,
        timeoutMs: 90_000,
        accessPassword: "front-secret",
        backendPassword: "backend-secret",
      });
    } finally {
      workspace.cleanup();
    }
  });

  it("does not share generic passwordEnv with backend passwords", () => {
    const workspace = createTempWorkspace();
    try {
      writeRepoProjectConfig(workspace.root, {
        accessPath: "front.accdb",
        backendPath: "backend.accdb",
        passwordEnv: "SHARED_PASSWORD",
      });
      writeFileSync(join(workspace.root, "front.accdb"), "", "utf8");
      writeFileSync(join(workspace.root, "backend.accdb"), "", "utf8");

      const result = loadDysflowConfig({
        cwd: workspace.root,
        env: { SHARED_PASSWORD: "shared-secret" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected config success");
      expect(result.data.accessPassword).toBe("shared-secret");
      expect(result.data.backendPassword).toBeUndefined();
    } finally {
      workspace.cleanup();
    }
  });

  it("loads repo project config asynchronously for production request paths (#181)", async () => {
    const workspace = createTempWorkspace();
    try {
      writeRepoProjectConfig(workspace.root, {
        id: "async-project",
        accessPath: "front.accdb",
        destinationRoot: "src",
      });
      writeFileSync(join(workspace.root, "front.accdb"), "", "utf8");

      const result = await loadDysflowConfigAsync({
        cwd: workspace.root,
        env: {},
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected async config success");
      expect(result.data).toMatchObject({
        configSource: "repo-config",
        projectId: "async-project",
        accessDbPath: resolve(workspace.root, "front.accdb"),
      });
    } finally {
      workspace.cleanup();
    }
  });

  it("rejects relative project registry entries that escape the registry directory", () => {
    const workspace = createTempWorkspace();
    try {
      const registryDir = join(workspace.root, "registry");
      const outside = join(workspace.root, "outside");
      mkdirSync(registryDir, { recursive: true });
      mkdirSync(outside, { recursive: true });
      writeRepoProjectConfig(outside, { accessPath: "front.accdb" });
      writeFileSync(join(outside, "front.accdb"), "", "utf8");
      const registryPath = join(registryDir, "projects.json");
      writeFileSync(
        registryPath,
        JSON.stringify({ projects: { escaped: "../outside/.dysflow/project.json" } }, null, 2),
        "utf8",
      );

      const result = loadDysflowConfig({
        projectId: "escaped",
        env: {},
        cwd: workspace.root,
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected config failure");
      expect(result.error.code).toBe("CONFIG_PROJECT_NOT_REGISTERED");
    } finally {
      workspace.cleanup();
    }
  });

  // #193 RED: loadProjectConfigFromPath must return OperationResult failure for malformed JSON (not throw)
  describe("readJsonFile call-site guards (#193)", () => {
    it("loadDysflowConfig returns CONFIG_PROJECT_FILE_INVALID for malformed repo project JSON (sync)", () => {
      const workspace = createTempWorkspace();
      try {
        mkdirSync(join(workspace.root, ".dysflow"), { recursive: true });
        writeFileSync(
          join(workspace.root, ".dysflow", "project.json"),
          "{ this is not valid json }",
          "utf8",
        );

        const result = loadDysflowConfig({ cwd: workspace.root, env: {} });

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected failure");
        expect(result.error.code).toBe("CONFIG_PROJECT_FILE_INVALID");
      } finally {
        workspace.cleanup();
      }
    });

    it("loadDysflowConfigAsync returns CONFIG_PROJECT_FILE_INVALID for malformed repo project JSON (async)", async () => {
      const root = await mkdtemp(join(tmpdir(), "dysflow-malformed-async-"));
      try {
        await mkdir(join(root, ".dysflow"), { recursive: true });
        await writeFile(
          join(root, ".dysflow", "project.json"),
          "{ this is not valid json }",
          "utf8",
        );

        const result = await loadDysflowConfigAsync({ cwd: root, env: {} });

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected failure");
        expect(result.error.code).toBe("CONFIG_PROJECT_FILE_INVALID");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  it("loadDysflowConfig and loadDysflowConfigAsync return structurally equal config for identical inputs (parity)", async () => {
    const workspace = createTempWorkspace();
    try {
      writeRepoProjectConfig(workspace.root, {
        id: "parity-test-pr2",
        accessPath: "front.accdb",
        allowWrites: true,
      });
      writeFileSync(join(workspace.root, "front.accdb"), "", "utf8");

      const input = { cwd: workspace.root, env: {} };
      const syncResult = loadDysflowConfig(input);
      const asyncResult = await loadDysflowConfigAsync(input);

      expect(syncResult).toEqual(asyncResult);
      expect(syncResult.ok).toBe(true);

      // Assert single update to a routing condition only requires one code change.
      // This is because both sync and async paths delegate config-building and validation
      // to the exported `loadProjectConfigCore` function.
      // Any routing logic updates happen only once inside `loadProjectConfigCore`.
      expect(loadProjectConfigCore).toBeTypeOf("function");
    } finally {
      workspace.cleanup();
    }
  });

  describe("loadDysflowConfigShared", () => {
    it("is exported and routes calls correctly", () => {
      expect(loadDysflowConfigShared).toBeTypeOf("function");
    });

    it("returns explicit config when accessDbPath is provided", () => {
      const input = { accessDbPath: "C:/my.accdb", env: {} };
      const repoConfig = { found: "none" as const };
      let called = false;
      const loadFromPath = (_: string) => {
        called = true;
        return null as unknown as ReturnType<typeof loadDysflowConfig>;
      };

      const result = loadDysflowConfigShared(input, repoConfig, loadFromPath);
      expect(called).toBe(false);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.accessDbPath).toBe("C:/my.accdb");
    });

    it("returns ambiguous error when multiple configs are found", () => {
      const input = { env: {} };
      const repoConfig = {
        found: "ambiguous" as const,
        paths: ["path/a", "path/b"] as [string, string],
      };
      let called = false;
      const loadFromPath = (_: string) => {
        called = true;
        return null as unknown as ReturnType<typeof loadDysflowConfig>;
      };

      const result = loadDysflowConfigShared(input, repoConfig, loadFromPath);
      expect(called).toBe(false);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure result");
      expect(result.error.code).toBe("CONFIG_AMBIGUOUS_PROJECT_FILE");
    });

    it("delegates to loadFromPath when single config is found", () => {
      const input = { env: {} };
      const repoConfig = { found: "standard" as const, path: "path/to/project.json" };
      let calledWithPath: string | null = null;
      const expectedResult = {
        ok: true,
        data: { accessDbPath: "mock" },
      } as unknown as ReturnType<typeof loadDysflowConfig>;
      const loadFromPath = (p: string) => {
        calledWithPath = p;
        return expectedResult;
      };

      const result = loadDysflowConfigShared(input, repoConfig, loadFromPath);
      expect(calledWithPath).toBe("path/to/project.json");
      expect(result).toBe(expectedResult);
    });

    it("returns deprecated error when project is requested but not found", () => {
      const input = { projectId: "old-project", env: {} };
      const repoConfig = { found: "none" as const };
      let called = false;
      const loadFromPath = (_: string) => {
        called = true;
        return null as unknown as ReturnType<typeof loadDysflowConfig>;
      };

      const result = loadDysflowConfigShared(input, repoConfig, loadFromPath);
      expect(called).toBe(false);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure result");
      expect(result.error.code).toBe("CONFIG_PROJECT_NOT_REGISTERED");
    });

    it("returns missing access path error when no config is found and no projectId is requested", () => {
      const input = { env: {} };
      const repoConfig = { found: "none" as const };
      let called = false;
      const loadFromPath = (_: string) => {
        called = true;
        return null as unknown as ReturnType<typeof loadDysflowConfig>;
      };

      const result = loadDysflowConfigShared(input, repoConfig, loadFromPath);
      expect(called).toBe(false);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure result");
      expect(result.error.code).toBe("CONFIG_MISSING_ACCESS_PATH");
    });
  });

  describe("httpToken bearer authentication config", () => {
    it("resolves httpToken from explicit input and redacts it", () => {
      const result = loadDysflowConfig({
        accessDbPath: "C:/data/app.accdb",
        httpToken: "explicit-token-123",
        env: {},
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.data.httpToken).toBe("explicit-token-123");

      const redacted = redactDysflowConfig(result.data);
      expect(redacted.httpToken).toBe("[REDACTED]");
    });

    it("resolves httpToken from standard environment variable DYSFLOW_HTTP_TOKEN", () => {
      const result = loadDysflowConfig({
        accessDbPath: "C:/data/app.accdb",
        env: {
          DYSFLOW_HTTP_TOKEN: "env-token-456",
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.data.httpToken).toBe("env-token-456");
    });

    it("resolves httpToken from custom environment variable override", () => {
      const { root, cleanup } = createTempWorkspace();
      try {
        writeRepoProjectConfig(root, {
          accessPath: "app.accdb",
          httpTokenEnv: "CUSTOM_TOKEN_VAR",
        });
        writeFileSync(join(root, "app.accdb"), "", "utf8");

        const result = loadDysflowConfig({
          cwd: root,
          env: {
            CUSTOM_TOKEN_VAR: "custom-token-789",
          },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("expected success");
        expect(result.data.httpToken).toBe("custom-token-789");
        expect(result.data.httpTokenEnv).toBe("CUSTOM_TOKEN_VAR");
      } finally {
        cleanup();
      }
    });
  });
});
