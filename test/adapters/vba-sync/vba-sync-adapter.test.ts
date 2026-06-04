import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  resolveDefaultVbaManagerScriptPath,
  spawnVbaManager,
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry";
import { parseArgsJson } from "../../../src/core/services/vba-import-plan";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

describe("VbaSyncAdapter Orchestrator", () => {
  it("delete_module registers a cleanable Access operation and passes marker arguments to the VBA manager", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    let launchedOperationId: string | undefined;
    let launchedOperationFile: string | undefined;
    const service = new VbaSyncAdapter({
      operationRegistry: registry,
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      env: {},
      executor: async (request) => {
        launchedOperationId = (request as { operationId?: string }).operationId;
        launchedOperationFile = (request as { operationFile?: string }).operationFile;
        return { exitCode: 0, stdout: '{"ok":true}', stderr: "", durationMs: 1, timedOut: false };
      },
    });

    const result = await service.execute("delete_module", { moduleName: "TempModule" });

    expect(result.ok).toBe(true);
    expect(launchedOperationId).toMatch(/^dysflow-/);
    expect(launchedOperationFile).toContain(launchedOperationId);
    await expect(registry.listRecent()).resolves.toEqual([]);
  });

  it("mapped VBA manager failures keep a failed registry record updated from the operation marker", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    let launchedOperationId = "";
    const service = new VbaSyncAdapter({
      operationRegistry: registry,
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      env: {},
      executor: async (request) => {
        launchedOperationId = (request as { operationId?: string }).operationId ?? "";
        const operationFile = (request as { operationFile?: string }).operationFile;
        if (operationFile === undefined) throw new Error("operationFile was not provided");
        await mkdir(dirname(operationFile), { recursive: true });
        await writeFile(
          operationFile,
          JSON.stringify({
            operationId: launchedOperationId,
            accessPid: 4321,
            processStartTime: "2026-06-02T10:00:00.000Z",
            status: "running",
          }),
          "utf8",
        );
        return { exitCode: 1, stdout: "", stderr: "boom", durationMs: 2, timedOut: false };
      },
    });

    const result = await service.execute("delete_module", { moduleName: "TempModule" });

    expect(result.ok).toBe(false);
    await expect(registry.get(launchedOperationId)).resolves.toMatchObject({
      operationId: launchedOperationId,
      accessPath: "C:/db/front.accdb",
      accessPid: 4321,
      processStartTime: "2026-06-02T10:00:00.000Z",
      status: "failed",
      metadata: { toolName: "delete_module", managerAction: "Delete" },
    });
  });

  it("characterizes general tool dispatch to sub-adapters", async () => {
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/front.accdb",
      env: {},
      executor: async () => ({
        exitCode: 0,
        stdout: '{"ok":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      }),
    });

    // Test routing to Operations adapter (now implemented — returns records)
    const opResult = await service.execute("list_access_operations", {});
    expect(opResult.ok).toBe(true);

    // Test routing to Execution adapter
    const execResult = await service.execute("compile_vba", {});
    expect(execResult.ok).toBe(true);

    // Test routing to Forms adapter
    const formResult = await service.execute("validate_form_spec", { spec: { name: "TestForm" } });
    expect(formResult.ok).toBe(true);

    // Test routing to Modules adapter
    const moduleResult = await service.execute("exists", { moduleName: "Module1" });
    expect(moduleResult.ok).toBe(true);
  });

  it("runs preflight cleanup with the resolved target before invoking the manager", async () => {
    const calls: string[] = [];
    const preflight: AccessOperationPreflightCleanup = {
      cleanup: vi.fn(async (request) => {
        calls.push("preflight");
        expect(request).toEqual({
          accessPath: "C:/db/front.accdb",
          projectRoot: "C:/repo",
        });
        return { cleaned: ["stale-op"], killed: [1234], orphanedKilled: [], errors: [] };
      }),
    };
    const executor: VbaManagerExecutor = async () => {
      calls.push("executor");
      return {
        exitCode: 0,
        stdout: '{"ok":true}',
        stderr: "",
        durationMs: 7,
        timedOut: false,
      };
    };
    const service = new VbaSyncAdapter({
      executor,
      preflightCleanup: preflight,
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo",
    });

    const result = await service.execute("exists", {
      accessPath: "C:/db/front.accdb",
      projectRoot: "C:/repo",
      destinationRoot: "C:/repo/src",
      moduleName: "Module1",
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["preflight", "executor"]);
    expect(preflight.cleanup).toHaveBeenCalledTimes(1);
  });

  it("keeps operation running when preflight cleanup throws and surfaces a warning", async () => {
    const preflight: AccessOperationPreflightCleanup = {
      cleanup: vi.fn(async () => {
        throw new Error("registry unavailable");
      }),
    };
    const service = new VbaSyncAdapter({
      preflightCleanup: preflight,
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo",
      executor: async () => ({
        exitCode: 0,
        stdout: '{"ok":true}',
        stderr: "",
        durationMs: 9,
        timedOut: false,
      }),
    });

    const result = await service.execute("exists", {
      accessPath: "C:/db/front.accdb",
      projectRoot: "C:/repo",
      destinationRoot: "C:/repo/src",
      moduleName: "Module1",
    });

    expect(result).toMatchObject({
      ok: true,
      data: { ok: true },
      diagnostics: [
        {
          level: "warning",
          source: "access.preflight",
          message: "preflight: Pre-flight cleanup failed: registry unavailable",
        },
      ],
    });
  });

  it("timeout: slow executor resolves VBA_MANAGER_TIMEOUT — authoritative timeout is the executor's own timer", async () => {
    // The executor layer (spawnPowerShellProcess) is the single authoritative timeout:
    // it owns the kill and sets timedOut=true in the result.  The adapter no longer
    // races the executor against a parallel timer — it simply maps timedOut:true → VBA_MANAGER_TIMEOUT.
    const executor: VbaManagerExecutor = async (request) => {
      // Simulate executor timing out and killing the process itself
      return {
        exitCode: null,
        stdout: "",
        stderr: "",
        durationMs: request.timeoutMs,
        timedOut: true,
      };
    };
    const service = new VbaSyncAdapter({
      executor,
      processTimeoutMs: 50,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      env: {},
    });

    const result = await service.execute("exists", { moduleName: "Module1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VBA_MANAGER_TIMEOUT");
      expect(result.error.retryable).toBe(true);
      // durationMs in the error message reflects the executor's authoritative timeout duration
      expect(result.error.message).toContain("timed out after 50ms");
    }
    expect(result.durationMs).toBe(50);
  });

  it("timeout: timedOut=true with exitCode=1 maps to VBA_MANAGER_TIMEOUT not VBA_MANAGER_FAILED", async () => {
    const service = new VbaSyncAdapter({
      executor: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "failed",
        durationMs: 51,
        timedOut: true,
      }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      env: {},
    });

    const result = await service.execute("exists", { moduleName: "Module1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VBA_MANAGER_TIMEOUT");
      expect(result.error.retryable).toBe(true);
      expect(result.error.message).not.toContain("VBA_MANAGER_FAILED");
    }
  });

  it("timeout: wall-clock budget caps PS timeout even when project config timeoutMs is larger", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-timeout-orchestrator-"));
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "myproject",
        accessPath: "front.accdb",
        destinationRoot: "src",
        timeoutMs: 180_000,
      }),
      "utf8",
    );

    const capturedTimeouts: number[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      capturedTimeouts.push(request.timeoutMs);
      return { exitCode: 0, stdout: '{"ok":true}', stderr: "", durationMs: 1, timedOut: false };
    };
    const service = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      cwd: root,
      env: {},
    });

    await service.execute("exists", { moduleName: "Module1" });
    await service.execute("compile_vba", {});

    expect(capturedTimeouts[0]).toBeLessThanOrEqual(25_000);
    expect(capturedTimeouts[1]).toBeLessThanOrEqual(25_000);
    expect(capturedTimeouts[0]).toBeGreaterThanOrEqual(20_000);
    expect(capturedTimeouts[1]).toBeGreaterThanOrEqual(20_000);
  });

  it("timeout: explicit per-call timeoutMs overrides project config timeout", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-timeout-override-orchestrator-"));
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "myproject",
        accessPath: "front.accdb",
        destinationRoot: "src",
        timeoutMs: 180_000,
      }),
      "utf8",
    );

    let capturedTimeout = 0;
    const executor: VbaManagerExecutor = async (request) => {
      capturedTimeout = request.timeoutMs;
      return { exitCode: 0, stdout: '{"ok":true}', stderr: "", durationMs: 1, timedOut: false };
    };
    const service = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      cwd: root,
      env: {},
    });

    await service.execute("exists", { moduleName: "Module1", timeoutMs: 90_000 });

    expect(capturedTimeout).toBe(90_000);
  });

  it("timeout: wall-clock budget caps PS timeout when service processTimeoutMs exceeds the budget", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-timeout-budget-orchestrator-"));

    let capturedTimeout = 0;
    const executor: VbaManagerExecutor = async (request) => {
      capturedTimeout = request.timeoutMs;
      return { exitCode: 0, stdout: '{"ok":true}', stderr: "", durationMs: 1, timedOut: false };
    };
    const service = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      processTimeoutMs: 45_000,
      cwd: root,
      env: {},
    });

    await service.execute("exists", { moduleName: "Module1" });

    expect(capturedTimeout).toBeLessThanOrEqual(25_000);
    expect(capturedTimeout).toBeGreaterThanOrEqual(20_000);
  });

  it("-NonInteractive present in spawned args at correct position", async () => {
    let capturedArgs: readonly string[] = [];
    let capturedEnv: Record<string, string | undefined> | undefined;
    let capturedCwd: string | undefined;
    spawnMock.mockImplementationOnce(
      (
        _command: string,
        args: readonly string[],
        options?: { cwd?: string; env?: Record<string, string | undefined> },
      ) => {
        capturedArgs = args;
        capturedEnv = options?.env;
        capturedCwd = options?.cwd;
        const child = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter;
          stderr: EventEmitter;
          kill: ReturnType<typeof vi.fn>;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = vi.fn();
        queueMicrotask(() => child.emit("close", 0));
        return child;
      },
    );

    await spawnVbaManager({
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      action: "Export",
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      moduleNames: [],
      json: false,
      extra: {},
      password: "super-secret",
      operationId: "dysflow-test-op",
      operationFile: "C:/repo/.dysflow/runtime/markers/dysflow-test-op.json",
      env: { DYSFLOW_ACCESS_PASSWORD: "super-secret", ACCESS_VBA_PASSWORD: "super-secret" },
      timeoutMs: 1_000,
      cwd: "C:/repo",
    });

    expect(capturedArgs.slice(0, 4)).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
    ]);
    expect(capturedArgs).not.toContain("-Password");
    expect(capturedArgs).not.toContain("super-secret");
    expect(capturedArgs).toContain("-OperationId");
    expect(capturedArgs).toContain("dysflow-test-op");
    expect(capturedArgs).toContain("-OperationFile");
    expect(capturedArgs).toContain("C:/repo/.dysflow/runtime/markers/dysflow-test-op.json");
    expect(capturedEnv).toMatchObject({
      DYSFLOW_ACCESS_PASSWORD: "super-secret",
      ACCESS_VBA_PASSWORD: "super-secret",
    });
    expect(capturedCwd).toBe("C:/repo");
  });

  it("redacts passwords from runner failures", async () => {
    const service = new VbaSyncAdapter({
      executor: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "bad password secret",
        durationMs: 3,
        timedOut: false,
      }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      env: { DYSFLOW_ACCESS_PASSWORD: "secret" },
    });

    const result = await service.execute("exists", { moduleName: "Module1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("[REDACTED]");
      expect(result.error.message).not.toContain("secret");
    }
  });

  it("resolves installed script path from DYSFLOW_HOME", () => {
    expect(
      resolveDefaultVbaManagerScriptPath({
        DYSFLOW_HOME: "C:/Users/alice/AppData/Local/dysflow",
      }),
    ).toBe("C:/Users/alice/AppData/Local/dysflow/app/scripts/dysflow-vba-manager.ps1");
  });

  describe("parseArgsJson discriminated union (#192)", () => {
    it("returns { ok: false, error } for invalid JSON instead of throwing", () => {
      const result = parseArgsJson("{ not valid json }");
      expect(result).toMatchObject({ ok: false });
      expect(typeof (result as { ok: false; error: string }).error).toBe("string");
    });

    it("returns { ok: true, value: [] } for undefined input", () => {
      const result = parseArgsJson(undefined);
      expect(result).toMatchObject({ ok: true, value: [] });
    });

    it("returns { ok: true, value: [...] } for valid JSON array", () => {
      const result = parseArgsJson('["fixture", 1]');
      expect(result).toMatchObject({ ok: true, value: ["fixture", 1] });
    });

    it("wraps a non-array JSON value in an array", () => {
      const result = parseArgsJson('"single"');
      expect(result).toMatchObject({ ok: true, value: ["single"] });
    });
  });

  it("returns TOOL_NOT_IMPLEMENTED for a tool not handled by any sub-adapter", async () => {
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/front.accdb",
      env: {},
    });
    const result = await service.execute("completely_unknown_tool_xyz", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TOOL_NOT_IMPLEMENTED");
  });

  it("validateStrictContext success when strictContext is not set", async () => {
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/front.accdb",
      env: {},
      executor: async () => ({
        exitCode: 0,
        stdout: "{}",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      }),
    });
    const result = await service.execute("compile_vba", {});
    expect(result.ok).toBe(true);
  });

  it("validateStrictContext returns STRICT_CONTEXT_MISMATCH when resolved path differs from expected", async () => {
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/front.accdb",
      env: {},
      executor: async () => ({
        exitCode: 0,
        stdout: "{}",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      }),
    });
    const result = await service.execute("compile_vba", {
      strictContext: true,
      expectedAccessPath: "C:/db/different.accdb",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("STRICT_CONTEXT_MISMATCH");
    }
  });

  it("validateStrictContext passes when strictWrite is set and paths match", async () => {
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo",
      env: {},
      executor: async () => ({
        exitCode: 0,
        stdout: "{}",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      }),
    });
    const result = await service.execute("compile_vba", {
      strictWrite: true,
      expectedDestinationRoot: "C:/repo",
    });
    expect(result.ok).toBe(true);
  });

  it("resolveDefaultVbaManagerScriptPath returns default when DYSFLOW_HOME is undefined", () => {
    expect(resolveDefaultVbaManagerScriptPath({})).toBe("scripts/dysflow-vba-manager.ps1");
  });

  it("resolveDefaultVbaManagerScriptPath returns default when DYSFLOW_HOME is whitespace", () => {
    expect(resolveDefaultVbaManagerScriptPath({ DYSFLOW_HOME: "   " })).toBe(
      "scripts/dysflow-vba-manager.ps1",
    );
  });

  it("executeMappedTool returns VBA_MANAGER_EXTRA_NOT_ALLOWED for extra keys not in the allowed set", async () => {
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/front.accdb",
      env: {},
      executor: async () => ({
        exitCode: 0,
        stdout: "{}",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      }),
    });

    (service as unknown as { executionAdapter: unknown }).executionAdapter = {
      execute: async () => {
        return (
          service as unknown as {
            executeMappedTool: (
              toolName: string,
              params: Record<string, unknown>,
              mapping: unknown,
            ) => Promise<unknown>;
          }
        ).executeMappedTool(
          "run_vba",
          {},
          {
            action: "Run",
            json: true,
            moduleNames: () => [],
            extra: () => ({ unsupportedKey: "value" }),
          },
        );
      },
    };

    const result = await service.execute("run_vba", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VBA_MANAGER_EXTRA_NOT_ALLOWED");
    }
  });

  it("resolveExecutionTarget uses service-level accessPath when no params override", async () => {
    let capturedRequest: { accessPath?: string } | undefined;
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/service.accdb",
      destinationRoot: "C:/repo",
      env: {},
      executor: async (req) => {
        capturedRequest = req;
        return {
          exitCode: 0,
          stdout: "{}",
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      },
    });
    const result = await service.execute("compile_vba", {});
    expect(result.ok).toBe(true);
    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.accessPath).toBe("C:/db/service.accdb");
  });

  it("resolveExecutionTarget loads config from disk when accessPath is undefined and repo config exists", async () => {
    const { mkdir, writeFile, mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = await mkdtemp(join(tmpdir(), "dysflow-adapter-config-"));
    try {
      await mkdir(join(root, ".dysflow"), { recursive: true });
      await writeFile(
        join(root, ".dysflow", "project.json"),
        JSON.stringify({
          id: "myproject",
          accessPath: "C:/db/project.accdb",
          destinationRoot: "src",
        }),
        "utf8",
      );
      let capturedRequest: { accessPath?: string } | undefined;
      const service = new VbaSyncAdapter({
        cwd: root,
        env: {},
        executor: async (req) => {
          capturedRequest = req;
          return {
            exitCode: 0,
            stdout: "{}",
            stderr: "",
            durationMs: 1,
            timedOut: false,
          };
        },
      });
      const result = await service.execute("compile_vba", {});
      expect(result.ok).toBe(true);
      expect(capturedRequest).toBeDefined();
      expect(capturedRequest?.accessPath?.replace(/\\/g, "/")).toBe("C:/db/project.accdb");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("resolveExecutionTarget returns config failure when no accessPath and no repo config", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = await mkdtemp(join(tmpdir(), "dysflow-adapter-no-config-"));
    try {
      const service = new VbaSyncAdapter({
        cwd: root,
        env: {},
      });
      const result = await service.execute("compile_vba", {});
      expect(result.ok).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  describe("delegation to form service and comparison modules", () => {
    it("re-exports VbaFormService, comparison helpers, and related types for backward compatibility", async () => {
      const adapterModule = await import("../../../src/adapters/vba-sync/vba-sync-adapter");
      expect(adapterModule.VbaFormService).toBeDefined();
      expect(adapterModule.compareSourceAgainstBinary).toBeDefined();
      expect(adapterModule.planReconcileBinary).toBeDefined();
    });

    it("delegates form-related operations to VbaFormService methods", async () => {
      const service = new VbaSyncAdapter({
        accessPath: "C:/db/front.accdb",
        env: {},
      });

      const result = await service.execute("validate_form_spec", { spec: { name: "SpyForm" } });
      expect(result).toMatchObject({
        ok: true,
        data: { valid: true, name: "SpyForm", kind: "Form", controlCount: 0 },
      });
    });
  });
});
