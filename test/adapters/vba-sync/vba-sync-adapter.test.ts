import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  resolveDefaultVbaManagerScriptPath,
  spawnVbaManager,
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight";
import { parseArgsJson } from "../../../src/core/services/vba-import-plan";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

describe("VbaSyncAdapter Orchestrator", () => {
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

  it("timeout: executor receives a cancellation signal and resolves VBA_MANAGER_TIMEOUT", async () => {
    vi.useFakeTimers();
    try {
      let capturedSignal: AbortSignal | undefined;
      const executor: VbaManagerExecutor = (request) => {
        capturedSignal = request.signal;
        return new Promise(() => {});
      };
      const service = new VbaSyncAdapter({
        executor,
        processTimeoutMs: 50,
        scriptPath: "scripts/dysflow-vba-manager.ps1",
        accessPath: "C:/db/front.accdb",
        env: {},
      });

      const resultPromise = service.execute("exists", { moduleName: "Module1" });
      await vi.advanceTimersByTimeAsync(50);

      expect(capturedSignal?.aborted).toBe(true);
      await expect(resultPromise).resolves.toMatchObject({
        ok: false,
        error: { code: "VBA_MANAGER_TIMEOUT", retryable: true },
        durationMs: 50,
      });
    } finally {
      vi.useRealTimers();
    }
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

  it("validateStrictContext returns success when strictContext is not set", () => {
    const service = new VbaSyncAdapter({ accessPath: "C:/db/front.accdb", env: {} });
    const result = service.validateStrictContext(
      { accessPath: "C:/db/front.accdb" },
      { accessPath: "C:/db/front.accdb", destinationRoot: "C:/repo" },
    );
    expect(result.ok).toBe(true);
  });

  it("validateStrictContext returns STRICT_CONTEXT_MISMATCH when expected path provided but target has none", () => {
    const service = new VbaSyncAdapter({ accessPath: "C:/db/front.accdb", env: {} });
    const result = service.validateStrictContext(
      {
        strictContext: true,
        expectedAccessPath: "C:/db/front.accdb",
      },
      {
        accessPath: undefined, // no accessPath resolved
        destinationRoot: "C:/repo",
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("STRICT_CONTEXT_MISMATCH");
  });

  it("validateStrictContext returns STRICT_CONTEXT_MISMATCH when resolved path differs from expected", () => {
    const service = new VbaSyncAdapter({ accessPath: "C:/db/front.accdb", env: {} });
    const result = service.validateStrictContext(
      {
        strictContext: true,
        expectedAccessPath: "C:/db/front.accdb",
      },
      {
        accessPath: "C:/db/different.accdb",
        destinationRoot: "C:/repo",
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("STRICT_CONTEXT_MISMATCH");
  });

  it("validateStrictContext passes when strictWrite is set and paths match", () => {
    const service = new VbaSyncAdapter({ accessPath: "C:/db/front.accdb", env: {} });
    const result = service.validateStrictContext(
      {
        strictWrite: true,
        expectedDestinationRoot: "C:/repo",
      },
      {
        accessPath: "C:/db/front.accdb",
        destinationRoot: "C:/repo",
      },
    );
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

    // run_vba with an unknown extra key like "unsupportedKey"
    // VbaExecutionAdapter maps run_vba via executeMappedTool
    // We can't easily inject a custom extra key via run_vba, so let's drive through
    // a direct call to executeMappedTool with a mapping that has an unsupported extra key
    type ServiceInternals = {
      executeMappedTool: (
        toolName: string,
        params: Record<string, unknown>,
        mapping: {
          action: string;
          json: boolean;
          moduleNames: (p: unknown) => string[];
          extra: (p: unknown) => Record<string, unknown>;
        },
      ) => Promise<unknown>;
    };
    const internals = service as unknown as ServiceInternals;
    const result = await internals.executeMappedTool(
      "run_vba",
      {},
      {
        action: "Run",
        json: true,
        moduleNames: () => [],
        extra: () => ({ unsupportedKey: "value" }), // not in VBA_MANAGER_EXTRA_KEYS
      },
    );
    expect((result as { ok: boolean }).ok).toBe(false);
    if (!(result as { ok: boolean }).ok) {
      expect((result as { error: { code: string } }).error.code).toBe(
        "VBA_MANAGER_EXTRA_NOT_ALLOWED",
      );
    }
  });

  it("resolveExecutionTarget uses service-level accessPath when no params override", async () => {
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/service.accdb",
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
    const target = await service.resolveExecutionTarget({});
    expect(target.ok).toBe(true);
    if (target.ok) {
      expect(target.data.accessPath).toBe("C:/db/service.accdb");
    }
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
      const service = new VbaSyncAdapter({
        cwd: root,
        env: {},
        executor: async () => ({
          exitCode: 0,
          stdout: "{}",
          stderr: "",
          durationMs: 1,
          timedOut: false,
        }),
      });
      const target = await service.resolveExecutionTarget({});
      expect(target.ok).toBe(true);
      if (target.ok) {
        expect(target.data.accessPath).toBeDefined();
      }
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
      const target = await service.resolveExecutionTarget({});
      expect(target.ok).toBe(false);
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
