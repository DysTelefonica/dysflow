import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { VbaModulesOrchestrator } from "../../../src/adapters/vba-sync/vba-modules-adapter";
import { VbaModulesAdapter } from "../../../src/adapters/vba-sync/vba-modules-adapter";
import type { VbaManagerExecutor } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import type { OperationResult } from "../../../src/core/contracts/index";
import type { AccessOperationPreflightCleanupResult } from "../../../src/core/operations/access-operation-preflight.js";

/**
 * Issue #975 — transactional mode integration through VbaModulesAdapter.
 *
 * The pure helper tests (transactional-mode.test.ts) cover the wrapper's
 * behavior with a fake executor. These tests cover the wiring through the
 * adapter: when `params.transactional === true`, the adapter MUST copy the
 * binary to `<projectRoot>/.dysflow/runtime/transactional/<uuid>/<name>.accdb`,
 * redirect the inner `executeMappedTool` call to the staging path, and
 * atomically rename back on success.
 */

async function sha256Of(path: string): Promise<string> {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex");
}

function makeAdapter(executor: VbaManagerExecutor): {
  adapter: VbaModulesAdapter;
  stagingRoot: string;
  projectRoot: string;
  binaryPath: string;
} {
  const projectRoot = "C:/repo";
  const binaryPath = "C:/repo/App.accdb";
  const stagingRoot = join(projectRoot, ".dysflow", "runtime", "transactional");
  const orchestrator: VbaModulesOrchestrator = {
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    cwd: projectRoot,
    env: {},
    executor,
    resolveExecutionTarget: async (params) => {
      // Honor params.accessPath so the test can point at a real temp binary.
      const accessPath =
        typeof params.accessPath === "string" && params.accessPath.length > 0
          ? params.accessPath
          : binaryPath;
      return {
        ok: true,
        data: {
          configSource: "explicit-request",
          accessDbPath: accessPath,
          accessPath,
          backendPath: undefined,
          destinationRoot: projectRoot,
          projectRoot,
          projectId: "test-project",
          timeoutMs: 30_000,
        },
        diagnostics: [],
        durationMs: 0,
      };
    },
    validateStrictContext: () => ({
      ok: true,
      data: undefined,
      diagnostics: [],
      durationMs: 0,
    }),
    runPreflightCleanup: async () =>
      ({
        cleaned: [],
        killed: [],
        orphanedKilled: [],
        errors: [],
      }) satisfies AccessOperationPreflightCleanupResult,
    executeMappedTool: async (toolName, params) => {
      const accessPath = typeof params.accessPath === "string" ? params.accessPath : binaryPath;
      const executorResult = await executor({
        scriptPath: "scripts/dysflow-vba-manager.ps1",
        action: toolName === "import_modules" ? "Import" : "Export",
        accessPath,
        destinationRoot: projectRoot,
        moduleNames: [],
        json: false,
        extra: {},
        timeoutMs: 30_000,
        cwd: projectRoot,
      });
      const ok = executorResult.exitCode === 0;
      return {
        ok,
        ...(ok
          ? { data: { accessPath, executorReceived: { accessPath } } }
          : {
              error: {
                code: "RUNNER_FAILED",
                message: "Executor returned non-zero exit code",
                retryable: false,
              },
            }),
        diagnostics: [],
        durationMs: executorResult.durationMs,
      } as OperationResult<unknown>;
    },
  };
  const adapter = new VbaModulesAdapter(orchestrator, {
    mkdtemp: async () => projectRoot,
    readdir: async () => [],
    readFile: async () => "",
    readFileBytes: async () => new Uint8Array(),
    rm: async () => undefined,
    tmpdir: () => "/tmp",
  });
  return { adapter, stagingRoot, projectRoot, binaryPath };
}

describe("VbaModulesAdapter — transactional mode wiring (#975)", () => {
  let workdir: string;
  let realBinaryPath: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), "dysflow-tx-adapter-"));
    realBinaryPath = join(workdir, "App.accdb");
    const seed = Buffer.alloc(2048);
    for (let i = 0; i < seed.length; i += 1) seed[i] = (i * 7) & 0xff;
    await writeFile(realBinaryPath, seed);
  });

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(workdir, { recursive: true, force: true });
  });

  it("import_modules with transactional:true forwards staging path to executor and commits atomically", async () => {
    // The adapter's orchestrator resolves target from params; in this test
    // we pass an explicit accessPath to point at the real disk binary.
    const originalSha = await sha256Of(realBinaryPath);
    let executorAccessPath: string | undefined;
    const executor: VbaManagerExecutor = async (request) => {
      executorAccessPath = request.accessPath;
      // Simulate the runner mutating the staging copy.
      if (request.accessPath !== undefined) {
        await writeFile(request.accessPath, "mutated-by-runner");
      }
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const { adapter, binaryPath } = makeAdapter(executor);

    const result = await adapter.execute("import_modules", {
      accessPath: realBinaryPath,
      moduleNames: ["Module_Foo"],
      apply: true,
      transactional: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    // The executor was redirected to a staging path (NOT the original).
    expect(executorAccessPath).not.toBe(binaryPath);
    expect(executorAccessPath).not.toBe(realBinaryPath);
    // The staging path is under the project's transactional staging root.
    expect(executorAccessPath).toMatch(/[\\/].dysflow[\\/]runtime[\\/]transactional[\\/]/);
    // The original now carries the mutated content (atomic commit).
    const afterContent = await readFile(realBinaryPath);
    expect(afterContent.toString("utf8")).toBe("mutated-by-runner");
    // The metadata carries the transactional proof.
    expect(result.metadata?.transactional).toBeDefined();
    expect(result.metadata?.transactional?.originalSha256).toBe(originalSha);
    expect(result.metadata?.transactional?.stagingPath).toBe(executorAccessPath);
  });

  it("import_modules with transactional:true leaves the original SHA-256 untouched on failure", async () => {
    const originalSha = await sha256Of(realBinaryPath);
    const executor: VbaManagerExecutor = async (request) => {
      // Simulate a failed import by writing corruption to the staging copy.
      if (request.accessPath !== undefined) {
        await writeFile(request.accessPath, "corrupted-by-failed-runner");
      }
      return {
        exitCode: 1,
        stdout: 'DYSFLOW_RESULT {"ok":false,"error":"VBA_IMPORT_FAILED"}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const { adapter } = makeAdapter(executor);

    const result = await adapter.execute("import_modules", {
      accessPath: realBinaryPath,
      moduleNames: ["Module_Foo"],
      apply: true,
      transactional: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    const afterSha = await sha256Of(realBinaryPath);
    expect(afterSha).toBe(originalSha);
    const originalAfter = await readFile(realBinaryPath);
    expect(originalAfter.toString("utf8")).not.toBe("corrupted-by-failed-runner");
  });

  it("import_modules without transactional:true preserves current non-atomic behavior", async () => {
    const executor: VbaManagerExecutor = async (request) => {
      if (request.accessPath !== undefined) {
        await writeFile(request.accessPath, "direct-mutation");
      }
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const { adapter } = makeAdapter(executor);

    const result = await adapter.execute("import_modules", {
      accessPath: realBinaryPath,
      moduleNames: ["Module_Foo"],
      apply: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.metadata?.transactional).toBeUndefined();
    const afterContent = await readFile(realBinaryPath);
    expect(afterContent.toString("utf8")).toBe("direct-mutation");
  });

  it("export_modules with transactional:true routes through staging and commits atomically", async () => {
    const originalSha = await sha256Of(realBinaryPath);
    const executor: VbaManagerExecutor = async (request) => {
      if (request.accessPath !== undefined) {
        await writeFile(request.accessPath, "export-mutated-the-binary");
      }
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const { adapter } = makeAdapter(executor);

    const result = await adapter.execute("export_modules", {
      accessPath: realBinaryPath,
      moduleNames: ["Module_Foo"],
      apply: true,
      transactional: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.metadata?.transactional?.originalSha256).toBe(originalSha);
    const afterContent = await readFile(realBinaryPath);
    expect(afterContent.toString("utf8")).toBe("export-mutated-the-binary");
  });

  it("import_modules with transactional:true refuses when accessPath is missing", async () => {
    const executor: VbaManagerExecutor = async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 1,
      timedOut: false,
    });
    // Build an adapter whose orchestrator returns no accessPath.
    const projectRoot = "C:/repo";
    const orchestrator: VbaModulesOrchestrator = {
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      cwd: projectRoot,
      env: {},
      executor,
      resolveExecutionTarget: async () => ({
        ok: true,
        data: {
          configSource: "runtime-default",
          accessDbPath: "",
          accessPath: undefined,
          backendPath: undefined,
          destinationRoot: projectRoot,
          projectRoot,
          projectId: undefined,
          timeoutMs: 30_000,
        },
        diagnostics: [],
        durationMs: 0,
      }),
      validateStrictContext: () => ({
        ok: true,
        data: undefined,
        diagnostics: [],
        durationMs: 0,
      }),
      runPreflightCleanup: async () =>
        ({
          cleaned: [],
          killed: [],
          orphanedKilled: [],
          errors: [],
        }) satisfies AccessOperationPreflightCleanupResult,
      executeMappedTool: async () => ({
        ok: true,
        data: {},
        diagnostics: [],
        durationMs: 0,
      }),
    };
    const adapter = new VbaModulesAdapter(orchestrator, {
      mkdtemp: async () => projectRoot,
      readdir: async () => [],
      readFile: async () => "",
      readFileBytes: async () => new Uint8Array(),
      rm: async () => undefined,
      tmpdir: () => "/tmp",
    });

    const result = await adapter.execute("import_modules", {
      moduleNames: ["Module_Foo"],
      apply: true,
      transactional: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("INVALID_INPUT");
  });
});
