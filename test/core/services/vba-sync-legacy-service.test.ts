import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { failureResult } from "../../../src/core/contracts/index";
import { VbaSyncLegacyService, resolveDefaultVbaManagerScriptPath, spawnVbaManager, type VbaManagerExecutor } from "../../../src/core/services/vba-sync-legacy-service";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

describe("VbaSyncLegacyService", () => {
  it("maps export_modules to a product-owned PowerShell runner invocation", async () => {
    const calls: unknown[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      calls.push(request);
      return { exitCode: 0, stdout: '{"ok":true}', stderr: "", durationMs: 12, timedOut: false };
    };
    const service = new VbaSyncLegacyService({
      executor,
      scriptPath: "C:/Users/alice/AppData/Local/dysflow/app/scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb", DYSFLOW_ACCESS_PASSWORD: "secret" },
    });

    await expect(service.execute("export_modules", { moduleNames: ["Module1"], destinationRoot: "C:/repo/src" })).resolves.toMatchObject({
      ok: true,
      data: { ok: true },
      durationMs: 12,
    });

    expect(calls).toEqual([{ 
      scriptPath: "C:/Users/alice/AppData/Local/dysflow/app/scripts/dysflow-vba-manager.ps1",
      action: "Export",
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      moduleNames: ["Module1"],
      password: "secret",
      json: false,
      extra: {},
      timeoutMs: 30_000,
    }]);
  });

  it("timeout: executor that never exits resolves VBA_MANAGER_TIMEOUT", async () => {
    vi.useFakeTimers();
    try {
      const executor: VbaManagerExecutor = () => new Promise(() => {});
      const service = new VbaSyncLegacyService({
        executor,
        processTimeoutMs: 50,
        scriptPath: "scripts/dysflow-vba-manager.ps1",
        env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb" },
      });

      const resultPromise = service.execute("export_all", {});
      await vi.advanceTimersByTimeAsync(50);

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
    const service = new VbaSyncLegacyService({
      executor: async () => ({ exitCode: 1, stdout: "", stderr: "failed", durationMs: 51, timedOut: true }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb" },
    });

    const result = await service.execute("export_all", {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VBA_MANAGER_TIMEOUT");
      expect(result.error.retryable).toBe(true);
      expect(result.error.message).not.toContain("VBA_MANAGER_FAILED");
    }
  });

  it("-NonInteractive present in spawned args at correct position", async () => {
    let capturedArgs: readonly string[] = [];
    spawnMock.mockImplementationOnce((_command: string, args: readonly string[]) => {
      capturedArgs = args;
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      queueMicrotask(() => child.emit("close", 0));
      return child;
    });

    await spawnVbaManager({
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      action: "Export",
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      moduleNames: [],
      json: false,
      extra: {},
      timeoutMs: 1_000,
    });

    expect(capturedArgs.slice(0, 4)).toEqual(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"]);
  });

  it("maps legacy list/exists tools with JSON output enabled", async () => {
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: '{"exists":true}', stderr: "", durationMs: 1, timedOut: false };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb" },
    });

    await service.execute("exists", { moduleName: "Form_Main" });
    await service.execute("list_objects", {});

    expect(calls).toEqual([
      expect.objectContaining({ action: "Exists", moduleNames: ["Form_Main"], json: true }),
      expect.objectContaining({ action: "List-Objects", moduleNames: [], json: true }),
    ]);
  });

  it("maps compile_vba to the repo-owned compile action with JSON output", async () => {
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: '{"ok":true}', stderr: "", durationMs: 2, timedOut: false };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb" },
    });

    await expect(service.execute("compile_vba", { accessPath: "C:/custom/front.accdb", destinationRoot: "C:/repo" })).resolves.toMatchObject({
      ok: true,
      data: { ok: true },
    });

    expect(calls).toEqual([
      expect.objectContaining({
        action: "Compile",
        accessPath: "C:/custom/front.accdb",
        destinationRoot: "C:/repo",
        moduleNames: [],
        json: true,
        extra: {},
      }),
    ]);
  });

  it("maps direct test_vba calls to a Run-Tests procedures JSON payload", async () => {
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: '[{"ok":true,"procedure":"Test_RunAll"}]', stderr: "", durationMs: 5, timedOut: false };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb" },
    });

    await expect(service.execute("test_vba", {
      procedureName: "Test_RunAll",
      argsJson: "[\"fixture\", 1]",
      destinationRoot: "C:/repo",
    })).resolves.toMatchObject({
      ok: true,
      data: [{ ok: true, procedure: "Test_RunAll" }],
    });

    expect(calls).toEqual([
      expect.objectContaining({
        action: "Run-Tests",
        destinationRoot: "C:/repo",
        json: true,
        extra: {
          proceduresJson: JSON.stringify([{ procedure: "Test_RunAll", args: ["fixture", 1] }]),
        },
      }),
    ]);
  });

  it("loads test_vba manifests from testsPath and filters by name, procedure, or tags", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-tests-"));
    await writeFile(join(root, "tests.vba.json"), JSON.stringify({
      tests: [
        { name: "smoke import", procedure: "Test_Import", args: ["a"], tags: ["smoke"] },
        { name: "slow export", procedure: "Test_Export", args: ["b"], tags: ["slow"] },
      ],
    }), "utf8");
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: '[{"ok":true,"procedure":"Test_Import"}]', stderr: "", durationMs: 7, timedOut: false };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb" },
      cwd: root,
    });

    await expect(service.execute("test_vba", { testsPath: "tests.vba.json", filter: "smoke" })).resolves.toMatchObject({
      ok: true,
      data: [{ ok: true, procedure: "Test_Import" }],
    });

    expect(calls).toEqual([
      expect.objectContaining({
        action: "Run-Tests",
        destinationRoot: root,
        json: true,
        extra: {
          proceduresJson: JSON.stringify([{ procedure: "Test_Import", args: ["a"] }]),
        },
      }),
    ]);
  });

  it("runs compile before test_vba plan execution when compile is requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-compile-tests-"));
    await writeFile(join(root, "tests.vba.json"), JSON.stringify([{ procedure: "Test_RunAll", args: [] }]), "utf8");
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: request.action === "Compile" ? '{"ok":true}' : '[{"ok":true}]', stderr: "", durationMs: 4, timedOut: false };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb" },
      cwd: root,
    });

    await expect(service.execute("test_vba", { compile: true })).resolves.toMatchObject({ ok: true });

    expect(calls).toEqual([
      expect.objectContaining({ action: "Compile", json: true }),
      expect.objectContaining({
        action: "Run-Tests",
        extra: { proceduresJson: JSON.stringify([{ procedure: "Test_RunAll", args: [] }]) },
      }),
    ]);
  });

  it("returns a safe failure when a direct runner mapping is not available yet", async () => {
    const service = new VbaSyncLegacyService({
      executor: async () => ({ exitCode: 0, stdout: "{}", stderr: "", durationMs: 1, timedOut: false }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb" },
    });

    expect(await service.execute("verify_binary", { diff: true })).toEqual(failureResult({
      code: "LEGACY_TOOL_NOT_IMPLEMENTED",
      message: "verify_binary requires a higher-level source/binary comparison implementation and is tracked by #25.",
      retryable: false,
    }));
  });

  it("redacts passwords from runner failures", async () => {
    const service = new VbaSyncLegacyService({
      executor: async () => ({ exitCode: 1, stdout: "", stderr: "bad password secret", durationMs: 3, timedOut: false }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb", DYSFLOW_ACCESS_PASSWORD: "secret" },
    });

    const result = await service.execute("export_all", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("[REDACTED]");
      expect(result.error.message).not.toContain("secret");
    }
  });

  it("resolves installed script path from DYSFLOW_HOME", () => {
    expect(resolveDefaultVbaManagerScriptPath({ DYSFLOW_HOME: "C:/Users/alice/AppData/Local/dysflow" })).toBe("C:/Users/alice/AppData/Local/dysflow/app/scripts/dysflow-vba-manager.ps1");
  });
});
