/**
 * Characterization tests (PR3 — #195)
 *
 * These tests assert that the sync variant (loadDysflowConfig) and the async
 * variant (loadDysflowConfigAsync) return deepEqual results for identical
 * inputs.  They MUST remain GREEN before, during, and after the refactor that
 * extracts shared pure helpers.  If any test turns RED during the refactor,
 * STOP and revert to the last GREEN state.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  loadDysflowConfig,
  loadDysflowConfigAsync,
} from "../../../src/core/config/dysflow-config";

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

function writeProjectConfig(
  root: string,
  config: Record<string, unknown>,
): void {
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    JSON.stringify(config, null, 2),
    "utf8",
  );
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
        processTimeoutMs: 15_000,
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
        passwordEnv: "LEGACY_PWD",
      });
      writeFileSync(join(ws.root, "data.accdb"), "", "utf8");

      const env = { LEGACY_PWD: "legacy-pass" };
      const input = { cwd: ws.root, env };

      const syncResult = loadDysflowConfig(input);
      const asyncResult = await loadDysflowConfigAsync(input);

      expect(syncResult).toEqual(asyncResult);
      expect(syncResult.ok).toBe(true);
      if (!syncResult.ok) throw new Error("expected success");
      // passwordEnv maps to accessPassword only, NOT backendPassword
      expect(syncResult.data.accessPassword).toBe("legacy-pass");
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
      expect(syncResult.data.accessDbPath).toBe(
        resolve(projectRoot, "data.accdb"),
      );
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

  it("global registry entry resolution — both variants resolve to the same config", async () => {
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
      expect(syncResult.ok).toBe(true);
      if (!syncResult.ok) throw new Error("expected success");
      expect(syncResult.data).toMatchObject({
        configSource: "global-registry",
        projectId: "registry-project",
        accessDbPath: resolve(projectDir, "app.accdb"),
        timeoutMs: 20_000,
      });
    } finally {
      ws.cleanup();
    }
  });

  it("global registry with malformed project JSON — both variants return CONFIG_PROJECT_FILE_INVALID", async () => {
    const ws = createTempWorkspace();
    try {
      const projectDir = join(ws.root, "badproject");
      const registryDir = join(ws.root, "registry");
      const configFilePath = join(projectDir, ".dysflow", "project.json");

      mkdirSync(join(projectDir, ".dysflow"), { recursive: true });
      writeFileSync(configFilePath, "{ bad json here }", "utf8");

      const registryPath = join(registryDir, "projects.json");
      writeRegistryWithProject(registryPath, "bad-project", configFilePath);

      const input = {
        projectId: "bad-project",
        projectRegistryPath: registryPath,
        env: {},
        cwd: ws.root,
      };

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
});
