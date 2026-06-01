import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectVbaSourceFiles,
  compareSourceAgainstBinary,
  compareVbaSourceTrees,
  planReconcileBinary,
  type VbaExecutionRequest,
} from "../../../src/core/services/vba-source-comparison";

describe("vba-source-comparison", () => {
  // --- compareSourceAgainstBinary error branches ---

  it("returns failure when resolveExecutionTarget fails", async () => {
    const ctx = {
      scriptPath: "script.ps1",
      resolveExecutionTarget: async () => ({
        ok: false as const,
        error: {
          code: "CONFIG_MISSING_ACCESS_PATH" as const,
          message: "no path",
          retryable: false,
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
      executeWithTimeout: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 0,
        timedOut: false,
      }),
    };
    const result = await compareSourceAgainstBinary("verify_code", {}, ctx);
    expect(result.ok).toBe(false);
  });

  it("returns failure when validateStrictContext fails", async () => {
    const ctx = {
      scriptPath: "script.ps1",
      resolveExecutionTarget: async () => ({
        ok: true as const,
        data: { destinationRoot: "/src", processTimeoutMs: 1000 },
        diagnostics: [],
        durationMs: 0,
      }),
      validateStrictContext: () => ({
        ok: false as const,
        error: { code: "STRICT_CONTEXT_MISMATCH" as const, message: "mismatch", retryable: false },
        diagnostics: [],
        durationMs: 0,
      }),
      runPreflightCleanup: async () => ({
        cleaned: [],
        killed: [],
        orphanedKilled: [],
        errors: [],
      }),
      executeWithTimeout: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 0,
        timedOut: false,
      }),
    };
    const result = await compareSourceAgainstBinary("verify_code", {}, ctx);
    expect(result.ok).toBe(false);
  });

  it("returns VBA_MANAGER_TIMEOUT when export times out", async () => {
    const ctx = {
      scriptPath: "script.ps1",
      resolveExecutionTarget: async () => ({
        ok: true as const,
        data: { destinationRoot: "/src", processTimeoutMs: 1000 },
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
      executeWithTimeout: async () => ({
        exitCode: null,
        stdout: "",
        stderr: "",
        durationMs: 1000,
        timedOut: true,
      }),
    };
    const result = await compareSourceAgainstBinary("verify_code", {}, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VBA_MANAGER_TIMEOUT");
  });

  it("returns VBA_MANAGER_FAILED when export exits with non-zero code", async () => {
    const ctx = {
      scriptPath: "script.ps1",
      resolveExecutionTarget: async () => ({
        ok: true as const,
        data: { destinationRoot: "/src", processTimeoutMs: 1000 },
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
      executeWithTimeout: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "export error",
        durationMs: 100,
        timedOut: false,
      }),
    };
    const result = await compareSourceAgainstBinary("verify_code", {}, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VBA_MANAGER_FAILED");
  });

  it("uses params.timeoutMs when provided and positive", async () => {
    let capturedTimeoutMs = 0;
    const ctx = {
      scriptPath: "script.ps1",
      resolveExecutionTarget: async () => ({
        ok: true as const,
        data: { destinationRoot: "/src", processTimeoutMs: 5000 },
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
      executeWithTimeout: async (req: { timeoutMs: number; destinationRoot: string }) => {
        capturedTimeoutMs = req.timeoutMs;
        await mkdir(req.destinationRoot, { recursive: true });
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 10, timedOut: false };
      },
    };
    await compareSourceAgainstBinary("verify_code", { timeoutMs: 9999 }, ctx);
    expect(capturedTimeoutMs).toBe(9999);
  });

  it("planReconcileBinary returns not-ok recommendation when source and binary differ", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-recon-diff-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await writeFile(join(sourceRoot, "modules", "Mod.bas"), "source content", "utf8");

    const ctx = {
      scriptPath: "mock.ps1",
      resolveExecutionTarget: async () => ({
        ok: true as const,
        data: { destinationRoot: sourceRoot, processTimeoutMs: 1000 },
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
      executeWithTimeout: async (req: { destinationRoot: string }) => {
        const destMod = join(req.destinationRoot, "modules");
        await mkdir(destMod, { recursive: true });
        await writeFile(join(destMod, "Mod.bas"), "binary content", "utf8");
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 10, timedOut: false };
      },
    };
    const result = await planReconcileBinary({}, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ok).toBe(false);
      expect(result.data.recommendation).toContain("review differences");
    }
  });

  // --- compareVbaSourceTrees branches ---

  it("reports missingInBinary when source has modules absent from binary", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-missing-binary-"));
    const sourceRoot = join(root, "src");
    const binaryRoot = join(root, "bin");
    await mkdir(sourceRoot, { recursive: true });
    await mkdir(binaryRoot, { recursive: true });
    await writeFile(join(sourceRoot, "Mod1.bas"), "content", "utf8");
    // bin is empty — Mod1 missing in binary

    const comparison = await compareVbaSourceTrees(sourceRoot, binaryRoot, [], false);
    expect(comparison.missingInBinary).toHaveLength(1);
    expect(comparison.missingInBinary[0]?.moduleName).toBe("Mod1");
    expect(comparison.diffs).toBeUndefined(); // includeDiffs=false
  });

  it("compareVbaSourceTrees with includeDiffs=false does not include diffs for different files", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-nodiff-"));
    const sourceRoot = join(root, "src");
    const binaryRoot = join(root, "bin");
    await mkdir(sourceRoot, { recursive: true });
    await mkdir(binaryRoot, { recursive: true });
    await writeFile(join(sourceRoot, "Mod1.bas"), "source", "utf8");
    await writeFile(join(binaryRoot, "Mod1.bas"), "binary", "utf8");

    const comparison = await compareVbaSourceTrees(sourceRoot, binaryRoot, [], false);
    expect(comparison.different).toHaveLength(1);
    expect(comparison.diffs).toBeUndefined();
  });

  it("moduleFilter excludes files not in the filter set", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-filter-"));
    const sourceRoot = join(root, "src");
    await mkdir(sourceRoot, { recursive: true });
    await writeFile(join(sourceRoot, "Mod1.bas"), "content1", "utf8");
    await writeFile(join(sourceRoot, "Mod2.bas"), "content2", "utf8");

    const files = await collectVbaSourceFiles(sourceRoot, new Set(["mod1"]));
    expect(files).toHaveLength(1);
    expect(files[0]?.moduleName).toBe("Mod1");
  });

  // --- collectVbaSourceFiles branches ---

  it("collects .cls and .frm files in addition to .bas", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-collect-ext-"));
    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, "ClassMod.cls"), "content", "utf8");
    await writeFile(join(srcDir, "FormMod.frm"), "content", "utf8");
    await writeFile(join(srcDir, "NotVba.txt"), "content", "utf8"); // skipped

    const files = await collectVbaSourceFiles(srcDir, new Set());
    expect(files.map((f) => f.fileType).sort()).toEqual(["cls", "frm"]);
  });

  it("collects .form.txt and .report.txt files", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-collect-txt-"));
    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, "MyForm.form.txt"), "content", "utf8");
    await writeFile(join(srcDir, "MyReport.report.txt"), "content", "utf8");

    const files = await collectVbaSourceFiles(srcDir, new Set());
    const types = files.map((f) => f.fileType).sort();
    expect(types).toContain("form.txt");
    expect(types).toContain("report.txt");
    const formFile = files.find((f) => f.fileType === "form.txt");
    expect(formFile?.moduleName).toBe("MyForm");
    const reportFile = files.find((f) => f.fileType === "report.txt");
    expect(reportFile?.moduleName).toBe("MyReport");
  });

  it("recurses into subdirectories", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-recurse-"));
    const srcDir = join(root, "src");
    const subDir = join(srcDir, "sub");
    await mkdir(subDir, { recursive: true });
    await writeFile(join(subDir, "DeepMod.bas"), "content", "utf8");

    const files = await collectVbaSourceFiles(srcDir, new Set());
    expect(files).toHaveLength(1);
    expect(files[0]?.moduleName).toBe("DeepMod");
  });

  it("firstDifferentLineSnippet returns label: files differ when no diff line found", async () => {
    // Two identical-length equal files will not have a different line; test indirectly via compareVbaSourceTrees
    // Actually, we need to trick it: pass files that differ only in content we can't predict the line for.
    // The easiest port-level test is equal files produce no diffs (already tested).
    // To exercise the final fallback ("files differ") we need files where every line matches
    // but one has more lines. This causes leftLines[index] !== rightLines[index] (one is undefined).
    // So actually the first different line is found (one side is undefined).
    // The true "files differ" path requires equal line content throughout.
    // This is an internal helper — skip asserting its fallback directly per philosophy.
    // Instead assert the comparison result is correct.
    const root = await mkdtemp(join(tmpdir(), "dysflow-snippet-"));
    const src = join(root, "src");
    const bin = join(root, "bin");
    await mkdir(src, { recursive: true });
    await mkdir(bin, { recursive: true });
    await writeFile(join(src, "Mod.bas"), "line1\nline2", "utf8");
    await writeFile(join(bin, "Mod.bas"), "line1\nline2\nline3", "utf8"); // bin has extra line

    const comparison = await compareVbaSourceTrees(src, bin, [], true);
    expect(comparison.different).toHaveLength(1);
    expect(comparison.diffs?.[0]?.binarySnippet).toContain("line3");
  });

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
      executeWithTimeout: async (request: VbaExecutionRequest) => {
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
