import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  derivePsTimeoutMs,
  MIN_PS_TIMEOUT_MS,
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
        return {
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"ok":true}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
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
        stdout: 'DYSFLOW_RESULT {"ok":true}',
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
        stdout: 'DYSFLOW_RESULT {"ok":true}',
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
        stdout: 'DYSFLOW_RESULT {"ok":true}',
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
    // timeoutMs=12000 survives the absurdly-small clamp (>= 1000) and the MIN_PS_TIMEOUT_MS floor (5000).
    // The adapter deducts preflightElapsedMs so the executor sees slightly less than 12000.
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
      timeoutMs: 12_000,
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
      expect(result.error.message).toMatch(/timed out after \d+ms/);
    }
    expect(result.durationMs).toBeGreaterThan(10_000);
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

  it("timeout: project config timeoutMs is honored end-to-end without a 25s hard-cap (#485)", async () => {
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
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const service = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      cwd: root,
      env: {},
    });

    await service.execute("exists", { moduleName: "Module1" });
    await service.execute("compile_vba", {});

    // The project config timeoutMs=180_000 must be honored; no 25s hard-cap.
    // The captured timeout is effectiveTimeoutMs - preflightElapsedMs.
    // With preflight typically taking <1s, the result should be ~180_000.
    expect(capturedTimeouts[0]).toBeGreaterThanOrEqual(170_000);
    expect(capturedTimeouts[1]).toBeGreaterThanOrEqual(170_000);
    // Must NOT be capped at 25s
    expect(capturedTimeouts[0]).toBeGreaterThan(25_000);
    expect(capturedTimeouts[1]).toBeGreaterThan(25_000);
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
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
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

  it("timeout: VbaSyncAdapter timeoutMs is honored without a 25s hard-cap (#485)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-timeout-budget-orchestrator-"));

    let capturedTimeout = 0;
    const executor: VbaManagerExecutor = async (request) => {
      capturedTimeout = request.timeoutMs;
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const service = new VbaSyncAdapter({
      executor,
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      timeoutMs: 45_000,
      cwd: root,
      env: {},
    });

    await service.execute("exists", { moduleName: "Module1" });

    // timeoutMs=45_000 must be honored; no 25s hard-cap.
    expect(capturedTimeout).toBeGreaterThan(25_000);
    expect(capturedTimeout).toBeGreaterThanOrEqual(40_000);
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

  it("serializes a boolean extra as a bare PowerShell switch (-Force), never -Force true", async () => {
    const capture = (): (() => readonly string[]) => {
      let captured: readonly string[] = [];
      spawnMock.mockImplementationOnce((_command: string, args: readonly string[]) => {
        captured = args;
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
      });
      return () => captured;
    };

    const baseRequest = {
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      action: "Delete",
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      moduleNames: ["TempModule"],
      json: true,
      env: {},
      timeoutMs: 1_000,
      cwd: "C:/repo",
    };

    const getForced = capture();
    await spawnVbaManager({ ...baseRequest, extra: { force: true } });
    const forcedArgs = getForced();
    expect(forcedArgs).toContain("-Force");
    expect(forcedArgs[forcedArgs.indexOf("-Force") + 1]).not.toBe("true");

    const getUnforced = capture();
    await spawnVbaManager({ ...baseRequest, extra: { force: false } });
    expect(getUnforced()).not.toContain("-Force");
  });

  it("offloads a large proceduresJson to a temp file via -ProceduresJsonFile to avoid spawn ENAMETOOLONG", async () => {
    // A test plan large enough that passing it inline on the command line would
    // bloat the Windows ~32K command-line limit (the cause of spawn ENAMETOOLONG).
    const bigPlan = JSON.stringify(
      Array.from({ length: 2_000 }, (_, i) => ({
        procedure: `Test_${i}`,
        args: ["x".repeat(20)],
      })),
    );
    expect(bigPlan.length).toBeGreaterThan(8_000);

    let capturedArgs: readonly string[] = [];
    let fileContentDuringSpawn: string | undefined;
    spawnMock.mockImplementationOnce((_command: string, args: readonly string[]) => {
      capturedArgs = args;
      const idx = args.indexOf("-ProceduresJsonFile");
      const filePath = idx !== -1 ? args[idx + 1] : undefined;
      if (filePath !== undefined) {
        fileContentDuringSpawn = readFileSync(filePath, "utf8");
      }
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
    });

    await spawnVbaManager({
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      action: "Run-Tests",
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      moduleNames: [],
      json: true,
      extra: { proceduresJson: bigPlan },
      timeoutMs: 1_000,
      cwd: "C:/repo",
    });

    // The payload moves to a file the PS script reads; it is NOT on the command line.
    expect(capturedArgs).toContain("-ProceduresJsonFile");
    expect(capturedArgs).not.toContain("-ProceduresJson");
    expect(capturedArgs).not.toContain(bigPlan);
    // The temp file held the exact JSON while the process was running.
    expect(fileContentDuringSpawn).toBe(bigPlan);
    // The command line stays bounded regardless of plan size.
    expect(capturedArgs.join(" ").length).toBeLessThan(2_000);
  });

  it("keeps a small proceduresJson inline as -ProceduresJson without a temp file", async () => {
    const smallPlan = JSON.stringify([{ procedure: "Test_A", args: [] }]);

    let capturedArgs: readonly string[] = [];
    spawnMock.mockImplementationOnce((_command: string, args: readonly string[]) => {
      capturedArgs = args;
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
    });

    await spawnVbaManager({
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      action: "Run-Tests",
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      moduleNames: [],
      json: true,
      extra: { proceduresJson: smallPlan },
      timeoutMs: 1_000,
      cwd: "C:/repo",
    });

    expect(capturedArgs).toContain("-ProceduresJson");
    expect(capturedArgs[capturedArgs.indexOf("-ProceduresJson") + 1]).toBe(smallPlan);
    expect(capturedArgs).not.toContain("-ProceduresJsonFile");
  });

  it("redacts passwords from runner failures", async () => {
    const service = new VbaSyncAdapter({
      executor: async () => ({
        exitCode: 1,
        stdout:
          'DYSFLOW_RESULT {"ok":false,"error":{"code":"VBA_MANAGER_FAILED","message":"runner failed"}}',
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

  it("surfaces structured non-zero runner results instead of treating them as invalid output", async () => {
    const service = new VbaSyncAdapter({
      executor: async () => ({
        exitCode: 1,
        stdout:
          'DYSFLOW_RESULT {"ok":false,"error":{"code":"VBA_IMPORT_FAILED","message":"Import failed for Module1"}}',
        stderr: "runner stderr detail",
        durationMs: 4,
        timedOut: false,
      }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      env: {},
    });

    const result = await service.execute("import_modules", { moduleNames: ["Module1"] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected structured failure");
    expect(result.error.code).toBe("VBA_IMPORT_FAILED");
    expect(result.error.message).toContain("Import failed for Module1");
    expect(result.error.message).toContain("runner stderr detail");
  });

  describe("import runner parse-failure contract", () => {
    const stderr = "runner stderr detail";
    const importTools = [
      {
        toolName: "import_modules",
        params: {
          moduleNames: ["Test_IndicadoresCaracterizacion", "ModuloCacheIndicadoresIssue18"],
          importMode: "Auto",
          compile: false,
        },
      },
      {
        toolName: "import_all",
        params: {
          importMode: "Auto",
          compile: false,
        },
      },
    ];
    const parseFailureOutputs = [
      { name: "exitCode 0 + empty stdout", exitCode: 0, stdout: "" },
      {
        name: "exitCode 0 + stdout with text but no sentinel",
        exitCode: 0,
        stdout: "Import completed but no sentinel was emitted",
      },
      {
        name: "exitCode 0 + duplicate DYSFLOW_RESULT lines",
        exitCode: 0,
        stdout: ['DYSFLOW_RESULT {"ok":true}', 'DYSFLOW_RESULT {"ok":false}'].join("\n"),
      },
      {
        name: "exitCode 0 + malformed JSON after DYSFLOW_RESULT",
        exitCode: 0,
        stdout: "DYSFLOW_RESULT not-valid-json",
      },
      { name: "exitCode 1 + empty stdout", exitCode: 1, stdout: "" },
      {
        name: "exitCode 1 + stdout with text but no sentinel",
        exitCode: 1,
        stdout: "PowerShell host exited before writing the sentinel",
      },
      {
        name: "exitCode 1 + duplicate DYSFLOW_RESULT lines",
        exitCode: 1,
        stdout: ['DYSFLOW_RESULT {"ok":true}', 'DYSFLOW_RESULT {"ok":false}'].join("\n"),
      },
      {
        name: "exitCode 1 + malformed JSON after DYSFLOW_RESULT",
        exitCode: 1,
        stdout: "DYSFLOW_RESULT not-valid-json",
      },
    ];
    const matrix = importTools.flatMap(({ toolName, params }) =>
      parseFailureOutputs.map((runnerOutput) => ({ toolName, params, ...runnerOutput })),
    );

    it.each(matrix)("$toolName returns structured runner failure for $name", async ({
      toolName,
      params,
      exitCode,
      stdout,
    }) => {
      const service = new VbaSyncAdapter({
        executor: async () => ({
          exitCode,
          stdout,
          stderr,
          durationMs: 4,
          timedOut: false,
        }),
        scriptPath: "scripts/dysflow-vba-manager.ps1",
        accessPath: "C:/db/front.accdb",
        destinationRoot: "C:/repo/src",
        env: {},
      });

      const result = await service.execute(toolName, params);

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected runner protocol failure");
      expect(result.error.code).not.toBe("VBA_MANAGER_INVALID_OUTPUT");
      expect(result.error.code).toBe("VBA_MANAGER_UNEXPECTED_EXIT");
      expect(result.error.details).toMatchObject({
        exitCode,
        stdout,
        stderr,
        parseError: expect.objectContaining({ message: expect.any(String) }),
      });
    });
  });

  it("preserves stdout and stderr separately in sanitized runner failure details", async () => {
    const service = new VbaSyncAdapter({
      executor: async () => ({
        exitCode: 1,
        stdout:
          'diagnostic secret on stdout\nDYSFLOW_RESULT {"ok":false,"error":{"code":"VBA_IMPORT_FAILED","message":"Import failed"}}',
        stderr: "diagnostic secret on stderr",
        durationMs: 4,
        timedOut: false,
      }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      env: { DYSFLOW_ACCESS_PASSWORD: "secret" },
    });

    const result = await service.execute("import_modules", { moduleNames: ["Module1"] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected structured failure");
    expect(result.error.message).toContain("diagnostic [REDACTED] on stderr");
    expect(result.error.message).not.toContain("diagnostic [REDACTED] on stdout");
    expect(result.error.details).toMatchObject({
      exitCode: 1,
      stdout:
        'diagnostic [REDACTED] on stdout\nDYSFLOW_RESULT {"ok":false,"error":{"code":"VBA_IMPORT_FAILED","message":"Import failed"}}',
      stderr: "diagnostic [REDACTED] on stderr",
    });
    expect(JSON.stringify(result.error.details)).not.toContain("secret");
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
        stdout: "DYSFLOW_RESULT {}",
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
        stdout: "DYSFLOW_RESULT {}",
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

  it("resolveDefaultVbaManagerScriptPath returns an absolute package-root path when DYSFLOW_HOME is undefined", () => {
    const resolved = resolveDefaultVbaManagerScriptPath({}).replace(/\\/g, "/");
    // Now cwd-independent: absolute path ending in the bundled script, not the bare relative.
    expect(resolved.endsWith("scripts/dysflow-vba-manager.ps1")).toBe(true);
    expect(resolved).not.toBe("scripts/dysflow-vba-manager.ps1");
  });

  it("resolveDefaultVbaManagerScriptPath returns an absolute package-root path when DYSFLOW_HOME is whitespace", () => {
    const resolved = resolveDefaultVbaManagerScriptPath({ DYSFLOW_HOME: "   " }).replace(
      /\\/g,
      "/",
    );
    expect(resolved.endsWith("scripts/dysflow-vba-manager.ps1")).toBe(true);
    expect(resolved).not.toBe("scripts/dysflow-vba-manager.ps1");
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
            action: "Run-Procedure",
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
          stdout: "DYSFLOW_RESULT {}",
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
            stdout: "DYSFLOW_RESULT {}",
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

  // --- DYSFLOW_RESULT sentinel contract (issue #440) ---

  it("parseOutput extracts result from DYSFLOW_RESULT sentinel line ignoring surrounding diagnostic braces", async () => {
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/front.accdb",
      env: {},
      executor: async () => ({
        exitCode: 0,
        stdout: [
          "INFO: loading {module=TempModule}",
          'DYSFLOW_RESULT {"ok":true,"modules":[]}',
          "INFO: done {elapsed=5ms}",
        ].join("\n"),
        stderr: "",
        durationMs: 3,
        timedOut: false,
      }),
    });

    const result = await service.execute("exists", { moduleName: "TempModule" });

    expect(result).toMatchObject({ ok: true, data: { ok: true, modules: [] } });
  });

  it("parseOutput extracts array result from DYSFLOW_RESULT sentinel line", async () => {
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/front.accdb",
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: {},
      executor: async () => ({
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT [{"name":"Module1"},{"name":"Module2"}]',
        stderr: "",
        durationMs: 2,
        timedOut: false,
      }),
    });

    const result = await service.execute("list_objects", {});

    expect(result).toMatchObject({ ok: true, data: [{ name: "Module1" }, { name: "Module2" }] });
  });

  it("parseOutput maps missing DYSFLOW_RESULT sentinel to VBA_MANAGER_INVALID_OUTPUT (no silent fallback)", async () => {
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/front.accdb",
      env: {},
      executor: async () => ({
        exitCode: 0,
        stdout: '{"ok":true}',
        stderr: "",
        durationMs: 2,
        timedOut: false,
      }),
    });

    const result = await service.execute("exists", { moduleName: "TempModule" });

    expect(result).toMatchObject({ ok: false, error: { code: "VBA_MANAGER_INVALID_OUTPUT" } });
  });

  it("parseOutput maps duplicate DYSFLOW_RESULT sentinel lines to VBA_MANAGER_INVALID_OUTPUT", async () => {
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/front.accdb",
      env: {},
      executor: async () => ({
        exitCode: 0,
        stdout: ['DYSFLOW_RESULT {"ok":true}', 'DYSFLOW_RESULT {"ok":false}'].join("\n"),
        stderr: "",
        durationMs: 2,
        timedOut: false,
      }),
    });

    const result = await service.execute("exists", { moduleName: "TempModule" });

    expect(result).toMatchObject({ ok: false, error: { code: "VBA_MANAGER_INVALID_OUTPUT" } });
  });

  it("parseOutput maps malformed JSON after DYSFLOW_RESULT sentinel to VBA_MANAGER_INVALID_OUTPUT", async () => {
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/front.accdb",
      env: {},
      executor: async () => ({
        exitCode: 0,
        stdout: "DYSFLOW_RESULT not-valid-json",
        stderr: "",
        durationMs: 2,
        timedOut: false,
      }),
    });

    const result = await service.execute("exists", { moduleName: "TempModule" });

    expect(result).toMatchObject({ ok: false, error: { code: "VBA_MANAGER_INVALID_OUTPUT" } });
  });

  it("parseOutput maps empty stdout to VBA_MANAGER_INVALID_OUTPUT instead of silent ok:true", async () => {
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/front.accdb",
      env: {},
      executor: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 2,
        timedOut: false,
      }),
    });

    const result = await service.execute("exists", { moduleName: "TempModule" });

    expect(result).toMatchObject({ ok: false, error: { code: "VBA_MANAGER_INVALID_OUTPUT" } });
  });

  it("non-import tools map non-zero malformed manager output to VBA_MANAGER_UNEXPECTED_EXIT", async () => {
    const service = new VbaSyncAdapter({
      accessPath: "C:/db/front.accdb",
      env: {},
      executor: async () => ({
        exitCode: 1,
        stdout: "PowerShell exited before writing DYSFLOW_RESULT",
        stderr: "manager failed",
        durationMs: 2,
        timedOut: false,
      }),
    });

    const result = await service.execute("exists", { moduleName: "TempModule" });

    expect(result).toMatchObject({ ok: false, error: { code: "VBA_MANAGER_UNEXPECTED_EXIT" } });
  });

  it("wraps successful manager output with import diagnostics only for import tools", async () => {
    const cases = [
      { toolName: "import_modules" as const, params: { moduleNames: ["Module1"] }, wrapped: true },
      { toolName: "import_all" as const, params: {}, wrapped: true },
      { toolName: "exists" as const, params: { moduleName: "Module1" }, wrapped: false },
      { toolName: "compile_vba" as const, params: {}, wrapped: false },
    ];

    for (const { toolName, params, wrapped } of cases) {
      const service = new VbaSyncAdapter({
        accessPath: "C:/db/front.accdb",
        destinationRoot: "C:/repo/src",
        env: {},
        executor: async () => ({
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"ok":true}',
          stderr: "",
          durationMs: 2,
          timedOut: false,
        }),
      });

      const result = await service.execute(toolName, params);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`expected ${toolName} success`);
      if (wrapped) {
        expect(result.data).toMatchObject({
          operation: toolName,
          willModifyAccess: true,
          result: { ok: true },
        });
      } else {
        expect(result.data).toEqual({ ok: true });
      }
    }
  });

  describe("delegation to form service and comparison modules", () => {
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

describe("derivePsTimeoutMs", () => {
  it("returns effectiveTimeoutMs minus preflightElapsedMs when result is >= MIN_PS_TIMEOUT_MS", () => {
    // 600_000 (10 min project config) - 100ms preflight = 599_900
    expect(derivePsTimeoutMs(600_000, 100)).toBe(599_900);
  });

  it("returns effectiveTimeoutMs minus preflightElapsedMs for a moderately large timeout", () => {
    // 45_000 (service timeoutMs) - 500ms preflight = 44_500
    expect(derivePsTimeoutMs(45_000, 500)).toBe(44_500);
  });

  it("returns MIN_PS_TIMEOUT_MS when effectiveTimeoutMs is absurdly small", () => {
    expect(derivePsTimeoutMs(500, 0)).toBe(MIN_PS_TIMEOUT_MS);
    expect(derivePsTimeoutMs(999, 0)).toBe(MIN_PS_TIMEOUT_MS);
  });

  it("returns MIN_PS_TIMEOUT_MS when effectiveTimeoutMs - preflightElapsedMs would be below floor", () => {
    // 6_000 - 4_000 = 2_000, which is < MIN_PS_TIMEOUT_MS=5_000 -> floor applies
    expect(derivePsTimeoutMs(6_000, 4_000)).toBe(MIN_PS_TIMEOUT_MS);
  });

  it("returns MIN_PS_TIMEOUT_MS when effectiveTimeoutMs equals preflightElapsedMs", () => {
    expect(derivePsTimeoutMs(5_000, 5_000)).toBe(MIN_PS_TIMEOUT_MS);
  });

  it("returns MIN_PS_TIMEOUT_MS when preflightElapsedMs exceeds effectiveTimeoutMs", () => {
    expect(derivePsTimeoutMs(3_000, 10_000)).toBe(MIN_PS_TIMEOUT_MS);
  });

  it("does NOT cap at 25_000 - project timeoutMs=600_000 must be honored", () => {
    const result = derivePsTimeoutMs(600_000, 100);
    expect(result).toBe(599_900);
    expect(result).toBeGreaterThan(25_000);
  });
});
