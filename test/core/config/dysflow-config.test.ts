import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDysflowConfig, redactDysflowConfig } from "../../../src/core/config/dysflow-config";

function createTempWorkspace(): { root: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "dysflow-config-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe("dysflow configuration", () => {
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
        accessDbPath: "C:/data/app.accdb",
        timeoutMs: 45_000,
        processTimeoutMs: 45_000,
        accessPassword: "super-secret",
        projectRoot: expect.any(String),
        destinationRoot: expect.any(String),
      },
      diagnostics: [],
      durationMs: 0,
    });

    expect(redactDysflowConfig(result.data)).toMatchObject({
      accessDbPath: "C:/data/app.accdb",
      timeoutMs: 45_000,
      processTimeoutMs: 45_000,
      accessPassword: "[REDACTED]",
      configSource: "explicit-request",
    });
  });

  it("resolves config from environment with safe defaults", () => {
    const result = loadDysflowConfig({
      env: {
        DYSFLOW_ACCESS_DB_PATH: "D:/fixtures/demo.accdb",
        DYSFLOW_ACCESS_PASSWORD: "env-secret",
        DYSFLOW_TIMEOUT_MS: "120000",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected config success");
    expect(result.data).toEqual({
      configSource: "legacy-env",
      accessDbPath: "D:/fixtures/demo.accdb",
      timeoutMs: 120_000,
      processTimeoutMs: 120_000,
      accessPassword: "env-secret",
      projectRoot: expect.any(String),
      destinationRoot: expect.any(String),
      ...(result.data.backendPath === undefined ? { backendPath: undefined } : { backendPath: result.data.backendPath }),
      ...(result.data.backendPassword === undefined ? { backendPassword: undefined } : { backendPassword: result.data.backendPassword }),
      ...(result.data.projectId === undefined ? { projectId: undefined } : { projectId: result.data.projectId }),
    });
    expect(redactDysflowConfig(result.data).accessPassword).toBe("[REDACTED]");
  });

  it("returns a typed configuration error when Access path is missing", () => {
    const result = loadDysflowConfig({ env: {} });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "Access database path is required. Set DYSFLOW_ACCESS_DB_PATH, define .dysflow/project.json, or pass accessDbPath/projectId.",
        retryable: false,
      },
      diagnostics: [],
      durationMs: 0,
    });
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

  it("loads worktree project config and resolves relative credentials", () => {
    const workspace = createTempWorkspace();
    try {
      const projectJson = {
        id: "proyecto-demo",
        accessPath: "front.accdb",
        backendPath: "backend.accdb",
        destinationRoot: "src",
        projectRoot: ".",
        timeoutMs: 12_000,
        accessPasswordEnv: "WORKTREE_ACCESS_PASSWORD",
        frontendPasswordEnv: "WORKTREE_ACCESS_PASSWORD",
        backendPasswordEnv: "WORKTREE_BACKEND_PASSWORD",
      };
      mkdirSync(join(workspace.root, ".dysflow"), { recursive: true });
      writeFileSync(
        join(workspace.root, ".dysflow", "project.json"),
        JSON.stringify(projectJson, null, 2),
        "utf8",
      );
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
      if (!result.ok) {
        throw new Error("expected project config to load");
      }

      expect(result.data).toMatchObject({
        configSource: "worktree-config",
        accessDbPath: resolve(workspace.root, "front.accdb"),
        backendPath: resolve(workspace.root, "backend.accdb"),
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

  it("returns CONFIG_AMBIGUOUS_PROJECT_FILE when both .dysflow/project.json and dysflow.project.json exist", () => {
    const workspace = createTempWorkspace();
    try {
      const projectJson = { id: "alpha", accessPath: "front.accdb" };
      mkdirSync(join(workspace.root, ".dysflow"), { recursive: true });
      writeFileSync(
        join(workspace.root, ".dysflow", "project.json"),
        JSON.stringify(projectJson, null, 2),
        "utf8",
      );
      writeFileSync(
        join(workspace.root, "dysflow.project.json"),
        JSON.stringify({ id: "beta", accessPath: "other.accdb" }, null, 2),
        "utf8",
      );

      const result = loadDysflowConfig({ cwd: workspace.root, env: {} });

      expect(result).toMatchObject({
        ok: false,
        error: { code: "CONFIG_AMBIGUOUS_PROJECT_FILE" },
      });
    } finally {
      workspace.cleanup();
    }
  });

  it("returns ok when only one project config file exists (regression guard)", () => {
    const workspace = createTempWorkspace();
    try {
      const projectJson = { id: "single", accessPath: "front.accdb" };
      writeFileSync(
        join(workspace.root, "dysflow.project.json"),
        JSON.stringify(projectJson, null, 2),
        "utf8",
      );
      writeFileSync(join(workspace.root, "front.accdb"), "", "utf8");

      const result = loadDysflowConfig({ cwd: workspace.root, env: {} });

      expect(result.ok).toBe(true);
    } finally {
      workspace.cleanup();
    }
  });

  it("resolves projectId via registry and relative project config paths", () => {
    const workspace = createTempWorkspace();
    try {
      const projectConfigPath = join(workspace.root, "project.json");
      const registryPath = join(workspace.root, "projects.json");
      mkdirSync(workspace.root, { recursive: true });
      writeFileSync(
        projectConfigPath,
        JSON.stringify({
          id: "desde-registro",
          accessPath: "front.accdb",
        }, null, 2),
        "utf8",
      );
      writeFileSync(join(workspace.root, "front.accdb"), "", "utf8");
      writeFileSync(
        registryPath,
        JSON.stringify({
          projects: {
            demo: "./project.json",
          },
        }, null, 2),
        "utf8",
      );

      const result = loadDysflowConfig({
        cwd: workspace.root,
        env: {
          DYSFLOW_PROJECT_ID: "demo",
          DYSFLOW_PROJECTS_REGISTRY_PATH: registryPath,
          ACCESS_VBA_PASSWORD: "legacy-password",
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error("expected project registry load");
      }

      expect(result.data).toMatchObject({
        configSource: "project-registry",
        accessDbPath: resolve(workspace.root, "front.accdb"),
        accessPassword: "legacy-password",
        projectId: "demo",
      });
    } finally {
      workspace.cleanup();
    }
  });
});
