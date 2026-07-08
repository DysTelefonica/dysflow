/**
 * Characterization tests (PR2 — #295, originally PR3 — #195)
 *
 * These tests assert that the sync variant (loadDysflowConfig) and the async
 * variant (loadDysflowConfigAsync) return deepEqual results for identical
 * inputs.  They MUST remain GREEN before, during, and after the refactor that
 * extracts shared pure helpers.  If any test turns RED during the refactor,
 * STOP and revert to the last GREEN state.
 *
 * Section "loadProjectConfigCore unit tests" exercises the extracted shared
 * core directly, ensuring both load variants delegate to a single
 * implementation rather than duplicating the validation + build logic.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadDysflowConfig,
  loadDysflowConfigAsync,
} from "../../../src/adapters/config/dysflow-config-node";
import { loadProjectConfigCore } from "../../../src/core/config/dysflow-config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempWorkspace(): { root: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "dysflow-parity-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function writeProjectConfig(root: string, config: Record<string, unknown>): void {
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  writeFileSync(join(root, ".dysflow", "project.json"), JSON.stringify(config, null, 2), "utf8");
}

function writeRegistryWithProject(
  registryPath: string,
  projectId: string,
  configPath: string,
): void {
  mkdirSync(join(registryPath, ".."), { recursive: true });
  writeFileSync(
    registryPath,
    JSON.stringify({ projects: { [projectId]: { configPath } } }, null, 2),
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// Characterization tests: sync == async for the same inputs
// ---------------------------------------------------------------------------

describe("loadDysflowConfig / loadDysflowConfigAsync parity (#195)", () => {
  it("valid project.json with all fields — both variants return identical DysflowConfig", async () => {
    const ws = createTempWorkspace();
    try {
      writeProjectConfig(ws.root, {
        id: "parity-project",
        accessPath: "front.accdb",
        backendPath: "back.accdb",
        destinationRoot: "src",
        timeoutMs: 15_000,
        accessPasswordEnv: "MY_ACCESS_PWD",
        backendPasswordEnv: "MY_BACKEND_PWD",
      });
      writeFileSync(join(ws.root, "front.accdb"), "", "utf8");
      writeFileSync(join(ws.root, "back.accdb"), "", "utf8");

      const env = {
        MY_ACCESS_PWD: "access-secret",
        MY_BACKEND_PWD: "backend-secret",
      };
      const input = { cwd: ws.root, env };

      const syncResult = loadDysflowConfig(input);
      const asyncResult = await loadDysflowConfigAsync(input);

      expect(syncResult).toEqual(asyncResult);
      expect(syncResult.ok).toBe(true);
      if (!syncResult.ok) throw new Error("expected success");
      expect(syncResult.data).toMatchObject({
        configSource: "repo-config",
        projectId: "parity-project",
        accessDbPath: resolve(ws.root, "front.accdb"),
        backendPath: resolve(ws.root, "back.accdb"),
        destinationRoot: resolve(ws.root, "src"),
        projectRoot: resolve(ws.root),
        accessPassword: "access-secret",
        backendPassword: "backend-secret",
        timeoutMs: 15_000,
      });
    } finally {
      ws.cleanup();
    }
  });

  it("valid project.json with password in env var — env is resolved identically by both variants", async () => {
    const ws = createTempWorkspace();
    try {
      writeProjectConfig(ws.root, {
        id: "env-pwd-project",
        accessPath: "data.accdb",
        passwordEnv: "CUSTOM_PWD",
      });
      writeFileSync(join(ws.root, "data.accdb"), "", "utf8");

      const env = { CUSTOM_PWD: "custom-pass" };
      const input = { cwd: ws.root, env };

      const syncResult = loadDysflowConfig(input);
      const asyncResult = await loadDysflowConfigAsync(input);

      expect(syncResult).toEqual(asyncResult);
      expect(syncResult.ok).toBe(true);
      if (!syncResult.ok) throw new Error("expected success");
      // passwordEnv maps to accessPassword only, NOT backendPassword
      expect(syncResult.data.accessPassword).toBe("custom-pass");
      expect(syncResult.data.backendPassword).toBeUndefined();
    } finally {
      ws.cleanup();
    }
  });

  it("malformed JSON — both variants return CONFIG_PROJECT_FILE_INVALID (guards from PR1)", async () => {
    const ws = createTempWorkspace();
    try {
      mkdirSync(join(ws.root, ".dysflow"), { recursive: true });
      writeFileSync(
        join(ws.root, ".dysflow", "project.json"),
        "{ this is not valid json }",
        "utf8",
      );

      const input = { cwd: ws.root, env: {} };

      const syncResult = loadDysflowConfig(input);
      const asyncResult = await loadDysflowConfigAsync(input);

      expect(syncResult).toEqual(asyncResult);
      expect(syncResult.ok).toBe(false);
      if (syncResult.ok) throw new Error("expected failure");
      expect(syncResult.error.code).toBe("CONFIG_PROJECT_FILE_INVALID");
    } finally {
      ws.cleanup();
    }
  });

  it("project.json with projectRoot override — both variants apply override identically", async () => {
    const ws = createTempWorkspace();
    try {
      const projectRoot = join(ws.root, "sub");
      mkdirSync(projectRoot, { recursive: true });
      writeProjectConfig(ws.root, {
        id: "root-override",
        accessPath: "data.accdb",
        projectRoot: projectRoot,
      });
      writeFileSync(join(projectRoot, "data.accdb"), "", "utf8");

      const input = { cwd: ws.root, env: {} };

      const syncResult = loadDysflowConfig(input);
      const asyncResult = await loadDysflowConfigAsync(input);

      expect(syncResult).toEqual(asyncResult);
      expect(syncResult.ok).toBe(true);
      if (!syncResult.ok) throw new Error("expected success");
      expect(syncResult.data.projectRoot).toBe(resolve(projectRoot));
      expect(syncResult.data.accessDbPath).toBe(resolve(projectRoot, "data.accdb"));
    } finally {
      ws.cleanup();
    }
  });

  it("missing accessPath — both variants return CONFIG_MISSING_ACCESS_PATH", async () => {
    const ws = createTempWorkspace();
    try {
      writeProjectConfig(ws.root, { id: "no-access-path" });

      const input = { cwd: ws.root, env: {} };

      const syncResult = loadDysflowConfig(input);
      const asyncResult = await loadDysflowConfigAsync(input);

      expect(syncResult).toEqual(asyncResult);
      expect(syncResult.ok).toBe(false);
      if (syncResult.ok) throw new Error("expected failure");
      expect(syncResult.error.code).toBe("CONFIG_MISSING_ACCESS_PATH");
    } finally {
      ws.cleanup();
    }
  });

  it("global registry projectId returns CONFIG_PROJECT_NOT_REGISTERED with deprecation message", async () => {
    const ws = createTempWorkspace();
    try {
      const projectDir = join(ws.root, "myproject");
      const registryDir = join(ws.root, "registry");

      writeProjectConfig(projectDir, {
        id: "registry-project",
        accessPath: "app.accdb",
        timeoutMs: 20_000,
      });
      writeFileSync(join(projectDir, "app.accdb"), "", "utf8");

      const registryPath = join(registryDir, "projects.json");
      writeRegistryWithProject(
        registryPath,
        "registry-project",
        join(projectDir, ".dysflow", "project.json"),
      );

      const input = {
        projectId: "registry-project",
        projectRegistryPath: registryPath,
        env: {},
        cwd: ws.root,
      };

      const syncResult = loadDysflowConfig(input);
      const asyncResult = await loadDysflowConfigAsync(input);

      expect(syncResult).toEqual(asyncResult);
      expect(syncResult.ok).toBe(false);
      if (syncResult.ok) throw new Error("expected failure");
      expect(syncResult.error.code).toBe("CONFIG_PROJECT_NOT_REGISTERED");
      expect(syncResult.error.message).toContain("deprecated");
    } finally {
      ws.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// loadProjectConfigCore unit tests (PR2 — #295)
// These tests verify the extracted shared core directly.  Both
// loadProjectConfigFromPath (sync) and loadProjectConfigFromPathAsync call
// this function after resolving the file path and reading raw JSON — so the
// validation + build logic lives in exactly one place.
// ---------------------------------------------------------------------------

describe("loadProjectConfigCore — shared validation and build (#295)", () => {
  function createTempWorkspace(): { root: string; cleanup(): void } {
    const root = mkdtempSync(join(tmpdir(), "dysflow-core-"));
    return {
      root,
      cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
  }

  it("returns a valid DysflowConfig for a well-formed raw project config", () => {
    const ws = createTempWorkspace();
    try {
      writeFileSync(join(ws.root, "app.accdb"), "", "utf8");
      const resolvedPath = join(ws.root, ".dysflow", "project.json");
      mkdirSync(join(ws.root, ".dysflow"), { recursive: true });

      const raw = {
        id: "core-test",
        accessPath: "app.accdb",
        capabilities: { allowWrites: true },
        timeoutMs: 10_000,
      };

      const result = loadProjectConfigCore(
        resolvedPath,
        raw,
        { cwd: ws.root, env: {} },
        {},
        "repo-config",
        undefined,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.data.configSource).toBe("repo-config");
      expect(result.data.projectId).toBe("core-test");
      expect(result.data.allowWrites).toBe(true);
      expect(result.data.timeoutMs).toBe(10_000);
      expect(result.data.accessDbPath).toBe(resolve(ws.root, "app.accdb"));
    } finally {
      ws.cleanup();
    }
  });

  it("returns CONFIG_PROJECT_ID_MISMATCH when requested projectId differs from config id", () => {
    const ws = createTempWorkspace();
    try {
      writeFileSync(join(ws.root, "app.accdb"), "", "utf8");
      const resolvedPath = join(ws.root, ".dysflow", "project.json");
      mkdirSync(join(ws.root, ".dysflow"), { recursive: true });

      const raw = { id: "configured-id", accessPath: "app.accdb" };

      const result = loadProjectConfigCore(
        resolvedPath,
        raw,
        { cwd: ws.root, env: {} },
        {},
        "repo-config",
        "requested-id",
      );

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.error.code).toBe("CONFIG_PROJECT_ID_MISMATCH");
      expect(result.error.message).toContain("requested-id");
      expect(result.error.message).toContain("configured-id");
    } finally {
      ws.cleanup();
    }
  });

  it("returns CONFIG_MISSING_ACCESS_PATH when raw config has no accessPath", () => {
    const ws = createTempWorkspace();
    try {
      const resolvedPath = join(ws.root, ".dysflow", "project.json");
      mkdirSync(join(ws.root, ".dysflow"), { recursive: true });

      const raw = { id: "no-path-project" };

      const result = loadProjectConfigCore(
        resolvedPath,
        raw,
        { cwd: ws.root, env: {} },
        {},
        "repo-config",
        undefined,
      );

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.error.code).toBe("CONFIG_MISSING_ACCESS_PATH");
    } finally {
      ws.cleanup();
    }
  });

  it("resolves passwords from env via injected env parameter", () => {
    const ws = createTempWorkspace();
    try {
      writeFileSync(join(ws.root, "app.accdb"), "", "utf8");
      const resolvedPath = join(ws.root, ".dysflow", "project.json");
      mkdirSync(join(ws.root, ".dysflow"), { recursive: true });

      const raw = {
        id: "pwd-project",
        accessPath: "app.accdb",
        accessPasswordEnv: "MY_PWD",
        backendPasswordEnv: "MY_BACKEND_PWD",
      };
      const env = { MY_PWD: "access-secret", MY_BACKEND_PWD: "backend-secret" };

      const result = loadProjectConfigCore(
        resolvedPath,
        raw,
        { cwd: ws.root, env },
        env,
        "repo-config",
        undefined,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.data.accessPassword).toBe("access-secret");
      expect(result.data.backendPassword).toBe("backend-secret");
    } finally {
      ws.cleanup();
    }
  });
});
