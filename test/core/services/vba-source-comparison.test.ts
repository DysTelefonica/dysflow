import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectVbaSourceFiles,
  compareSourceAgainstBinary,
  compareVbaSourceTrees,
  planReconcileBinary,
} from "../../../src/core/services/vba-source-comparison";

describe("vba-source-comparison", () => {
  it("can compare source trees and collect files", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-comp-test-"));
    const sourceRoot = join(root, "src");
    const binaryRoot = join(root, "bin");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await mkdir(join(binaryRoot, "modules"), { recursive: true });

    await writeFile(join(sourceRoot, "modules", "Mod1.bas"), "same content", "utf8");
    await writeFile(join(binaryRoot, "modules", "Mod1.bas"), "same content", "utf8");

    await writeFile(join(sourceRoot, "modules", "Mod2.bas"), "source content", "utf8");
    await writeFile(join(binaryRoot, "modules", "Mod2.bas"), "binary content", "utf8");

    const collected = await collectVbaSourceFiles(sourceRoot, new Set());
    expect(collected).toHaveLength(2);
    expect(collected[0]).toMatchObject({
      moduleName: "Mod1",
      fileType: "bas",
    });

    const comparison = await compareVbaSourceTrees(sourceRoot, binaryRoot, [], true);
    expect(comparison.ok).toBe(false);
    expect(comparison.matched).toHaveLength(1);
    expect(comparison.matched[0].moduleName).toBe("Mod1");
    expect(comparison.different).toHaveLength(1);
    expect(comparison.different[0].moduleName).toBe("Mod2");
    expect(comparison.diffs).toHaveLength(1);
    expect(comparison.diffs?.[0].sourceSnippet).toContain("source content");
  });

  it("runs compareSourceAgainstBinary and delegates using ctx", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-comp-ctx-"));
    const sourceRoot = join(root, "src");
    const binaryRoot = join(root, "bin");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await mkdir(join(binaryRoot, "modules"), { recursive: true });

    await writeFile(join(sourceRoot, "modules", "Mod.bas"), "content", "utf8");
    await writeFile(join(binaryRoot, "modules", "Mod.bas"), "content", "utf8");

    const ctx = {
      scriptPath: "mock-script.ps1",
      accessPassword: "pwd",
      resolveExecutionTarget: async () => ({
        ok: true as const,
        data: {
          destinationRoot: sourceRoot,
          accessPath: "some.accdb",
          processTimeoutMs: 1000,
        },
        diagnostics: [],
        durationMs: 0,
      }),
      validateStrictContext: () => ({
        ok: true as const,
        data: undefined,
        diagnostics: [],
        durationMs: 0,
      }),
      runPreflightCleanup: async () => ({
        cleaned: [],
        killed: [],
        orphanedKilled: [],
        errors: [],
      }),
      executeWithTimeout: async (request: { destinationRoot: string }) => {
        // Simulate PowerShell exporting the module to the temporary destinationRoot
        const destModules = join(request.destinationRoot, "modules");
        await mkdir(destModules, { recursive: true });
        await writeFile(join(destModules, "Mod.bas"), "content", "utf8");
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          durationMs: 10,
          timedOut: false,
        };
      },
    };

    const result = await compareSourceAgainstBinary("verify_code", { diff: false }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        operation: "verify_code",
        ok: true,
        matched: [{ moduleName: "Mod", fileType: "bas" }],
      });
    }
  });

  it("runs planReconcileBinary and returns recommendations", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-recon-ctx-"));
    const sourceRoot = join(root, "src");
    const binaryRoot = join(root, "bin");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await mkdir(join(binaryRoot, "modules"), { recursive: true });

    await writeFile(join(sourceRoot, "modules", "Mod.bas"), "content", "utf8");
    await writeFile(join(binaryRoot, "modules", "Mod.bas"), "content", "utf8");

    const ctx = {
      scriptPath: "mock-script.ps1",
      accessPassword: "pwd",
      resolveExecutionTarget: async () => ({
        ok: true as const,
        data: {
          destinationRoot: sourceRoot,
          accessPath: "some.accdb",
          processTimeoutMs: 1000,
        },
        diagnostics: [],
        durationMs: 0,
      }),
      validateStrictContext: () => ({
        ok: true as const,
        data: undefined,
        diagnostics: [],
        durationMs: 0,
      }),
      runPreflightCleanup: async () => ({
        cleaned: [],
        killed: [],
        orphanedKilled: [],
        errors: [],
      }),
      executeWithTimeout: async (request: any) => {
        const destModules = join(request.destinationRoot, "modules");
        await mkdir(destModules, { recursive: true });
        await writeFile(join(destModules, "Mod.bas"), "content", "utf8");
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          durationMs: 10,
          timedOut: false,
        };
      },
    };

    const result = await planReconcileBinary({ diff: false }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        operation: "reconcile_binary",
        ok: true,
        recommendation: expect.stringContaining("already match"),
      });
    }
  });
});
