import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VbaModulesAdapter } from "../../../src/adapters/vba-sync/vba-modules-adapter";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { successResult } from "../../../src/core/contracts/index";

interface CapturedChunkCall {
  moduleNames: string[];
}

function buildAdapter(executor: VbaManagerExecutor, accessPath = "C:/db/front.accdb") {
  return new VbaSyncAdapter({
    executor,
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    accessPath,
    destinationRoot: "C:/repo/src",
    env: {},
  });
}

describe("VbaModulesAdapter — import_modules bulk by directory (#807 Feature 2)", () => {
  let tmpRoot: string;
  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "dysflow-bulk-impl-"));
  });
  afterEach(async () => {
    if (tmpRoot) {
      const { rm } = await import("node:fs/promises");
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("moduleNames provided — current path, no behavior change", async () => {
    const captured: CapturedChunkCall[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      captured.push({ moduleNames: [...(request.moduleNames ?? [])] });
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const adapter = buildAdapter(executor);
    const result = await adapter.execute("import_modules", {
      moduleNames: ["ModA", "ModB"],
      apply: true,
    });
    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
    const firstCall = captured[0];
    expect(firstCall?.moduleNames).toEqual(["ModA", "ModB"]);
  });

  it("sourceDir + no moduleNames — walks the directory and dispatches chunks", async () => {
    await mkdir(tmpRoot, { recursive: true });
    for (let i = 0; i < 4; i += 1) {
      await writeFile(join(tmpRoot, `Mod${i}.bas`), "");
    }
    const captured: CapturedChunkCall[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      captured.push({ moduleNames: [...(request.moduleNames ?? [])] });
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const adapter = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: tmpRoot,
      env: {},
    });
    const result = await adapter.execute("import_modules", {
      sourceDir: tmpRoot,
      apply: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    const data = result.data as { summary: { total: number; chunks: { planned: number } } };
    expect(data.summary.total).toBe(4);
    expect(captured.length).toBeGreaterThanOrEqual(1);
    const allNames = [...captured.flatMap((c) => c.moduleNames)].sort();
    expect(allNames).toEqual(["Mod0", "Mod1", "Mod2", "Mod3"]);
  });

  it("recursive: false — only top-level files (no subdirs)", async () => {
    await mkdir(join(tmpRoot, "sub"), { recursive: true });
    await writeFile(join(tmpRoot, "TopMod.bas"), "");
    await writeFile(join(tmpRoot, "sub", "NestedMod.bas"), "");
    const captured: CapturedChunkCall[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      captured.push({ moduleNames: [...(request.moduleNames ?? [])] });
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const adapter = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: tmpRoot,
      env: {},
    });
    const result = await adapter.execute("import_modules", {
      sourceDir: tmpRoot,
      recursive: false,
      apply: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    const data = result.data as { summary: { total: number } };
    expect(data.summary.total).toBe(1);
    const allNames = captured.flatMap((c) => c.moduleNames);
    expect(allNames).toEqual(["TopMod"]);
  });

  it("filePattern: 'Test_*' — only matching files", async () => {
    await mkdir(tmpRoot, { recursive: true });
    await writeFile(join(tmpRoot, "Test_One.bas"), "");
    await writeFile(join(tmpRoot, "Test_Two.bas"), "");
    await writeFile(join(tmpRoot, "Production.bas"), "");
    const captured: CapturedChunkCall[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      captured.push({ moduleNames: [...(request.moduleNames ?? [])] });
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const adapter = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: tmpRoot,
      env: {},
    });
    const result = await adapter.execute("import_modules", {
      sourceDir: tmpRoot,
      filePattern: "Test_*",
      apply: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    const data = result.data as { summary: { total: number } };
    expect(data.summary.total).toBe(2);
    const allNames = captured.flatMap((c) => c.moduleNames).sort();
    expect(allNames).toEqual(["Test_One", "Test_Two"]);
  });

  it("includeTests: false — Test_*.bas excluded", async () => {
    await mkdir(tmpRoot, { recursive: true });
    await writeFile(join(tmpRoot, "Test_One.bas"), "");
    await writeFile(join(tmpRoot, "Production.bas"), "");
    const captured: CapturedChunkCall[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      captured.push({ moduleNames: [...(request.moduleNames ?? [])] });
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const adapter = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: tmpRoot,
      env: {},
    });
    const result = await adapter.execute("import_modules", {
      sourceDir: tmpRoot,
      includeTests: false,
      apply: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    const data = result.data as { summary: { total: number } };
    expect(data.summary.total).toBe(1);
    const allNames = captured.flatMap((c) => c.moduleNames);
    expect(allNames).toEqual(["Production"]);
  });

  it("includeForms: false — Form_*/Report_* excluded", async () => {
    await mkdir(tmpRoot, { recursive: true });
    await writeFile(join(tmpRoot, "Production.bas"), "");
    await writeFile(join(tmpRoot, "Form_Main.cls"), "");
    await writeFile(join(tmpRoot, "Form_Main.form.txt"), "");
    await writeFile(join(tmpRoot, "Report_Run.cls"), "");
    const captured: CapturedChunkCall[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      captured.push({ moduleNames: [...(request.moduleNames ?? [])] });
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const adapter = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: tmpRoot,
      env: {},
    });
    const result = await adapter.execute("import_modules", {
      sourceDir: tmpRoot,
      includeForms: false,
      apply: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    const data = result.data as { summary: { total: number } };
    expect(data.summary.total).toBe(1);
    const allNames = captured.flatMap((c) => c.moduleNames);
    expect(allNames).toEqual(["Production"]);
  });

  it("chunkSize: 5 — modules chunked into groups of 5", async () => {
    await mkdir(tmpRoot, { recursive: true });
    for (let i = 0; i < 12; i += 1) {
      await writeFile(join(tmpRoot, `Mod${i}.bas`), "");
    }
    const captured: CapturedChunkCall[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      captured.push({ moduleNames: [...(request.moduleNames ?? [])] });
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const adapter = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: tmpRoot,
      env: {},
    });
    const result = await adapter.execute("import_modules", {
      sourceDir: tmpRoot,
      chunkSize: 5,
      apply: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    const data = result.data as { summary: { chunks: { planned: number } } };
    expect(data.summary.chunks.planned).toBe(3);
    const sizes = captured.map((c) => c.moduleNames.length);
    expect(sizes.sort()).toEqual([2, 5, 5]);
  });

  it("onChunkError: abort — first chunk failure aborts all", async () => {
    await mkdir(tmpRoot, { recursive: true });
    for (let i = 0; i < 4; i += 1) {
      await writeFile(join(tmpRoot, `Mod${i}.bas`), "");
    }
    let chunkIndex = 0;
    const executor: VbaManagerExecutor = async (_request) => {
      const ci = chunkIndex;
      chunkIndex += 1;
      if (ci === 0) {
        return {
          exitCode: 1,
          stdout:
            'DYSFLOW_RESULT {"ok":false,"error":{"code":"VBA_MODULE_NOT_FOUND","message":"synthetic"}}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      }
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const adapter = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: tmpRoot,
      env: {},
    });
    const result = await adapter.execute("import_modules", {
      sourceDir: tmpRoot,
      chunkSize: 2,
      onChunkError: "abort",
      apply: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    const data = result.data as {
      chunkFailures: unknown[];
      summary: { chunks: { failed: number } };
    };
    expect(data.chunkFailures.length).toBe(1);
    expect(data.summary.chunks.failed).toBe(1);
  });

  it("onChunkError: continue (default) — first chunk failure continues with remaining chunks", async () => {
    await mkdir(tmpRoot, { recursive: true });
    for (let i = 0; i < 4; i += 1) {
      await writeFile(join(tmpRoot, `Mod${i}.bas`), "");
    }
    let chunkIndex = 0;
    const executor: VbaManagerExecutor = async () => {
      const ci = chunkIndex;
      chunkIndex += 1;
      if (ci === 0) {
        return {
          exitCode: 1,
          stdout:
            'DYSFLOW_RESULT {"ok":false,"error":{"code":"VBA_MODULE_NOT_FOUND","message":"synthetic"}}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      }
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const adapter = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: tmpRoot,
      env: {},
    });
    const result = await adapter.execute("import_modules", {
      sourceDir: tmpRoot,
      chunkSize: 2,
      apply: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    const data = result.data as {
      chunkFailures: unknown[];
      summary: { chunks: { failed: number; applied: number } };
    };
    expect(data.summary.chunks.failed).toBe(1);
    expect(data.summary.chunks.applied).toBeGreaterThanOrEqual(1);
  });

  it("dryRun: true — returns plan without writing", async () => {
    await mkdir(tmpRoot, { recursive: true });
    for (let i = 0; i < 4; i += 1) {
      await writeFile(join(tmpRoot, `Mod${i}.bas`), "");
    }
    let called = 0;
    const executor: VbaManagerExecutor = async () => {
      called += 1;
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const adapter = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: tmpRoot,
      env: {},
    });
    const result = await adapter.execute("import_modules", {
      sourceDir: tmpRoot,
      dryRun: true,
      apply: true,
    });
    expect(result.ok).toBe(true);
    expect(called).toBe(0);
  });

  it("apply: true — executes the imports", async () => {
    await mkdir(tmpRoot, { recursive: true });
    for (let i = 0; i < 4; i += 1) {
      await writeFile(join(tmpRoot, `Mod${i}.bas`), "");
    }
    let called = 0;
    const executor: VbaManagerExecutor = async () => {
      called += 1;
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const adapter = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: tmpRoot,
      env: {},
    });
    const result = await adapter.execute("import_modules", {
      sourceDir: tmpRoot,
      apply: true,
    });
    expect(result.ok).toBe(true);
    expect(called).toBeGreaterThanOrEqual(1);
  });
});

describe("VbaModulesAdapter — handles() (#807 Feature 2)", () => {
  it("handles import_modules", () => {
    expect(VbaModulesAdapter.handles("import_modules")).toBe(true);
  });
});

// Suppress unused import lint warnings for re-exported helpers used by callers.
void successResult;
