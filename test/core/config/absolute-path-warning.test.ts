/**
 * Tests for #205 — absolute path warn-on-escape.
 *
 * When a registry entry uses an absolute path that is NOT inside the registry
 * directory, `resolveRegisteredPath` should emit console.warn with a message
 * that includes the resolved path (ADR-7: warn-only, still returns the path).
 *
 * RED: currently no warning is emitted.
 * GREEN: add console.warn in resolveRegisteredPath when isAbsolute && !isPathInside.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDysflowConfig } from "../../../src/core/config/dysflow-config.js";

function createRegistryWorkspace(): {
  root: string;
  registryPath: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "dysflow-abspath-"));
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  const registryPath = join(root, ".dysflow", "projects.json");
  return { root, registryPath, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe("resolveRegisteredPath — absolute path warn-on-escape (#205)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("emits console.warn when registry entry uses an absolute path outside the registry directory", () => {
    const workspace = createRegistryWorkspace();
    try {
      // Point to an absolute path that is outside the registry dir (e.g., /tmp or C:/other)
      const outsidePath = resolve(tmpdir(), "other-project", "project.json");
      writeFileSync(
        workspace.registryPath,
        JSON.stringify({
          projects: {
            "my-project": outsidePath,
          },
        }),
        "utf8",
      );

      // Trigger registry resolution
      loadDysflowConfig({
        projectRegistryPath: workspace.registryPath,
        projectId: "my-project",
        cwd: workspace.root,
        env: {},
      });

      // Assert that console.warn was called with a message mentioning the path
      const warnCalls = warnSpy.mock.calls.map((args) => String(args[0]));
      const pathWarnCall = warnCalls.find(
        (msg) => msg.includes("absolute") || msg.includes("escapes") || msg.includes("outside"),
      );
      expect(pathWarnCall).toBeDefined();
      expect(pathWarnCall).toContain(outsidePath);
    } finally {
      workspace.cleanup();
    }
  });

  it("does NOT warn when registry entry uses a relative path inside the registry directory", () => {
    const workspace = createRegistryWorkspace();
    try {
      // Relative path inside the registry dir (will be resolved relative to .dysflow/)
      const projectDir = join(workspace.root, ".dysflow", "my-project");
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, "project.json"), JSON.stringify({ accessPath: "app.accdb" }), "utf8");
      writeFileSync(
        workspace.registryPath,
        JSON.stringify({
          projects: {
            "my-project": "my-project/project.json",
          },
        }),
        "utf8",
      );

      loadDysflowConfig({
        projectRegistryPath: workspace.registryPath,
        projectId: "my-project",
        cwd: workspace.root,
        env: {},
      });

      // No path-escape warnings should be emitted for relative paths inside the dir
      const warnCalls = warnSpy.mock.calls.map((args) => String(args[0]));
      const pathWarnCall = warnCalls.find(
        (msg) => msg.includes("absolute") || msg.includes("escapes") || msg.includes("outside"),
      );
      expect(pathWarnCall).toBeUndefined();
    } finally {
      workspace.cleanup();
    }
  });

  it("still resolves the path (warn-only, no hard block) when absolute path escapes registry dir", () => {
    const workspace = createRegistryWorkspace();
    try {
      const outsidePath = resolve(tmpdir(), "external-project", "project.json");
      writeFileSync(
        workspace.registryPath,
        JSON.stringify({
          projects: {
            "ext-project": outsidePath,
          },
        }),
        "utf8",
      );

      // Should not throw — warn-only per ADR-7
      expect(() =>
        loadDysflowConfig({
          projectRegistryPath: workspace.registryPath,
          projectId: "ext-project",
          cwd: workspace.root,
          env: {},
        }),
      ).not.toThrow();
    } finally {
      workspace.cleanup();
    }
  });
});
