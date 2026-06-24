import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDefaultPowerShellExecutor } from "../../../src/adapters/powershell/default-executor.js";
import { nodeLockFileSystem } from "../../../src/adapters/runner/node-lock-file-system.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight.js";
import {
  type CreateAccessOperationRecord,
  InMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry.js";
import {
  AccessPowerShellRunner,
  CROSS_PROCESS_LOCK_STALE_MS,
  getCrossProcessLockPath,
  type PowerShellExecutor,
  resolveDefaultRunnerScriptPath,
  sanitizePowerShellOutput,
} from "../../../src/core/runner/access-runner.js";

// v1.2.32 regression: the runner now refuses to invoke the PowerShell
// executor for query actions when the configured accessPath points at a
// .accdb that does not exist on disk, returning CONFIG_TARGET_NOT_FOUND
// instead of letting the runner throw and surface RUNNER_INVALID_JSON to
// MCP callers. The shared config below points at a real temp file so the
// pre-existing tests (which use a mocked executor and only care about
// runner.run's own control flow) still pass the new existsSync check.
let testTmpDir = "";
let testAccessDbPath = "";
let config: DysflowConfig;
const noOpPreflight: AccessOperationPreflightCleanup = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

beforeAll(() => {
  testTmpDir = mkdtempSync(join(tmpdir(), "dysflow-runner-suite-"));
  testAccessDbPath = join(testTmpDir, "finance.accdb");
  writeFileSync(testAccessDbPath, "");
  config = {
    configSource: "explicit-request",
    allowWrites: false,
    accessDbPath: testAccessDbPath,
    accessPassword: "super-secret",
    backendPassword: "backend-secret",
    timeoutMs: 1_500,
  };
});

afterAll(() => {
  if (testTmpDir) rmSync(testTmpDir, { recursive: true, force: true });
});

describe("AccessPowerShellRunner", () => {
  it("passes PowerShell command input as separated safe arguments", async () => {
    const calls: Array<{
      command: string;
      args: readonly string[];
      timeoutMs: number;
      env?: Record<string, string | undefined>;
    }> = [];
    const executor: PowerShellExecutor = async (command, args, options) => {
      calls.push({ command, args, timeoutMs: options.timeoutMs, env: options.env });
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"returnValue":42}',
        stderr: "",
        durationMs: 12,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run access.ps1",
    });

    const result = await runner.run(
      {
        kind: "vba",
        request: {
          moduleName: "Main Module",
          procedureName: "Run-It",
          arguments: ["a;b", "$(nope)"],
        },
      },
      config,
    );

    expect(result).toMatchObject({
      ok: true,
      data: { returnValue: 42 },
      durationMs: 12,
      operation: { accessPath: testAccessDbPath, status: "pid_unknown" },
    });
    expect(calls).toEqual([
      {
        command: "powershell.exe",
        timeoutMs: 1_500,
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "C:/tools/run access.ps1",
          "-AccessDbPath",
          testAccessDbPath,
          "-Operation",
          "vba",
          "-PayloadJson",
          '{"moduleName":"Main Module","procedureName":"Run-It","arguments":["a;b","$(nope)"]}',
          "-OperationId",
          expect.stringMatching(/^dysflow-/),
        ],
        env: {
          DYSFLOW_ACCESS_PASSWORD: "super-secret",
          ACCESS_VBA_PASSWORD: "super-secret",
          DYSFLOW_BACKEND_PASSWORD: "backend-secret",
        },
      },
    ]);
  });

  it("forwards backend password through runner environment when access password is absent", async () => {
    const calls: Array<{
      command: string;
      args: readonly string[];
      timeoutMs: number;
      env?: Record<string, string | undefined>;
    }> = [];
    const executor: PowerShellExecutor = async (command, args, options) => {
      calls.push({ command, args, timeoutMs: options.timeoutMs, env: options.env });
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"returnValue":true}',
        stderr: "",
        durationMs: 9,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.access-no-passwd.ps1",
    });

    await runner.run(
      {
        kind: "diagnostics",
        request: { includeEnvironment: true },
      },
      {
        ...config,
        accessPassword: undefined,
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.env).toEqual({
      DYSFLOW_BACKEND_PASSWORD: "backend-secret",
    });
  });

  it("forwards secrets for compare_backends with backend-only credentials", async () => {
    const calls: Array<{
      command: string;
      args: readonly string[];
      timeoutMs: number;
      env?: Record<string, string | undefined>;
    }> = [];
    const executor: PowerShellExecutor = async (command, args, options) => {
      calls.push({ command, args, timeoutMs: options.timeoutMs, env: options.env });
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"comparison":{"missingInBackend":[],"extraInBackend":[]}}',
        stderr: "",
        durationMs: 8,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.compare.ps1",
    });

    await runner.run(
      {
        kind: "query",
        request: {
          sql: "SELECT 1",
          mode: "read",
          action: "compare_backends",
          backendPath: "C:/data/backend.accdb",
        },
      },
      {
        ...config,
        accessPassword: undefined,
      },
    );

    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) throw new Error("Expected call");
    const payloadArgIndex = firstCall.args.indexOf("-PayloadJson");
    const payloadArg = payloadArgIndex >= 0 ? firstCall.args[payloadArgIndex + 1] : undefined;
    const payload = payloadArg ? (JSON.parse(payloadArg) as Record<string, unknown>) : undefined;

    expect(firstCall.env).toEqual({ DYSFLOW_BACKEND_PASSWORD: "backend-secret" });
    expect(payload).toMatchObject({
      action: "compare_backends",
      backendPath: "C:/data/backend.accdb",
    });
  });

  it("does fallback to config.backendPath when query request.backendPath is missing", async () => {
    const calls: {
      cmd: string;
      args: readonly string[];
      env?: Record<string, string | undefined>;
    }[] = [];
    const executor: PowerShellExecutor = async (cmd, args, options) => {
      calls.push({ cmd, args, env: options.env });
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"rows":[]}',
        stderr: "",
        durationMs: 8,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    await runner.run(
      {
        kind: "query",
        request: {
          sql: "SELECT 1",
          mode: "read",
          action: "localize_backend_links",
        },
      },
      {
        ...config,
        backendPath: "C:/data/config-backend.accdb",
      },
    );

    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) throw new Error("Expected call");
    const payloadArgIndex = firstCall.args.indexOf("-PayloadJson");
    const payloadArg = payloadArgIndex >= 0 ? firstCall.args[payloadArgIndex + 1] : undefined;
    const payload = payloadArg ? (JSON.parse(payloadArg) as Record<string, unknown>) : undefined;

    expect(payload).toMatchObject({
      action: "localize_backend_links",
      backendPath: "C:/data/config-backend.accdb",
    });
  });

  it("preserves explicit write databasePath ahead of config.backendPath fallback", async () => {
    const calls: { args: readonly string[] }[] = [];
    const executor: PowerShellExecutor = async (_cmd, args) => {
      calls.push({ args });
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"rows":[]}',
        stderr: "",
        durationMs: 8,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    await runner.run(
      {
        kind: "query",
        request: {
          action: "create_table",
          mode: "write",
          sql: "",
          tableName: "ZZZ_Target",
          definition: "Id INTEGER",
          databasePath: "C:/data/explicit-write.accdb",
        },
      },
      {
        ...config,
        backendPath: "C:/data/config-backend.accdb",
      },
    );

    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) throw new Error("Expected call");
    const payloadArgIndex = firstCall.args.indexOf("-PayloadJson");
    const payloadArg = payloadArgIndex >= 0 ? firstCall.args[payloadArgIndex + 1] : undefined;
    const payload = payloadArg ? (JSON.parse(payloadArg) as Record<string, unknown>) : undefined;

    expect(payload).toMatchObject({
      action: "create_table",
      mode: "write",
      databasePath: "C:/data/explicit-write.accdb",
    });
    expect(payload).not.toHaveProperty("backendPath");
  });

  it("never serializes backendPassword into PowerShell command-line arguments (issue #498)", async () => {
    const calls: {
      args: readonly string[];
      env?: Record<string, string | undefined>;
    }[] = [];
    const executor: PowerShellExecutor = async (_cmd, args, options) => {
      calls.push({ args, env: options.env });
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"rows":[]}',
        stderr: "",
        durationMs: 5,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    await runner.run(
      {
        kind: "query",
        request: {
          sql: "SELECT 1",
          mode: "read",
          action: "compact_repair",
          backendPath: "C:/data/backend.accdb",
          backendPassword: "per-request-secret",
        },
      },
      { ...config, accessPassword: undefined, backendPassword: undefined },
    );

    const firstCall = calls[0];
    if (!firstCall) throw new Error("Expected call");

    // The secret must NEVER appear anywhere in the spawned process arguments,
    // because Windows exposes Win32_Process.CommandLine to other local processes.
    expect(firstCall.args.join(" ")).not.toContain("per-request-secret");

    const payloadArgIndex = firstCall.args.indexOf("-PayloadJson");
    const payloadArg = payloadArgIndex >= 0 ? firstCall.args[payloadArgIndex + 1] : undefined;
    const payload = payloadArg ? (JSON.parse(payloadArg) as Record<string, unknown>) : undefined;
    expect(payload).not.toHaveProperty("backendPassword");

    // But it MUST still reach the child process through the env channel.
    expect(firstCall.env).toMatchObject({ DYSFLOW_BACKEND_PASSWORD: "per-request-secret" });
  });

  it("never stores request secrets in operation registry metadata", async () => {
    const createdRecords: CreateAccessOperationRecord[] = [];
    const registry = new InMemoryAccessOperationRegistry();
    const originalCreate = registry.create.bind(registry);
    registry.create = async (record) => {
      createdRecords.push(record);
      return originalCreate(record);
    };
    const executor: PowerShellExecutor = async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "boom",
      durationMs: 5,
      timedOut: false,
    });

    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      operationRegistry: registry,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    await runner.run(
      {
        kind: "query",
        request: {
          sql: "SELECT 1",
          mode: "read",
          action: "compact_repair",
          backendPath: "C:/data/backend.accdb",
          backendPassword: "per-request-secret",
        },
      },
      { ...config, accessPassword: undefined, backendPassword: undefined },
    );

    expect(createdRecords).toHaveLength(1);
    expect(createdRecords[0]?.metadata).toMatchObject({
      sql: "SELECT 1",
      mode: "read",
      action: "compact_repair",
      backendPath: "C:/data/backend.accdb",
    });
    expect(createdRecords[0]?.metadata).not.toHaveProperty("backendPassword");
    expect(JSON.stringify(createdRecords[0]?.metadata)).not.toContain("per-request-secret");
  });

  it("uses the injected fileExists port to detect a missing configured accessPath (issue #499)", async () => {
    let executorCalls = 0;
    const executor: PowerShellExecutor = async () => {
      executorCalls += 1;
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"rows":[]}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };

    // The configured accessDbPath points at a REAL temp file, but the injected
    // port reports it missing — proving the runner consults the port, not the
    // real filesystem, and never reaches the executor.
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
      fileExists: () => false,
    });

    const result = await runner.run(
      {
        kind: "query",
        request: {
          sql: "SELECT 1",
          mode: "read",
          action: "query_sql",
          databasePath: "C:/data/whatever.accdb",
        },
      },
      config,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "CONFIG_TARGET_NOT_FOUND" } });
    expect(executorCalls).toBe(0);
  });

  // Routing behavior (dryRun, path precedence, Owned, ReadOnly) is proven by
  // behavioral Pester tests in scripts/tests/dysflow-access-runner.Tests.ps1
  // (Resolve-WriteActionDatabase, Resolve-ReadActionDatabase,
  //  Invoke-QuerySqlReadAction, Invoke-ListTablesAction — issue #380 P6).
  // The structural source-text wiring change-detector that was here has been
  // removed (issue #443) — it was an implementation-coupled assertion that
  // would break on a behavior-preserving rename. The P6 Pester tests cover the
  // behavioral contracts (routing, read/write database selection, SQL dispatch).

  it("serializes concurrent executor invocations for the same Access database", async () => {
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    let notifyFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      notifyFirstStarted = resolve;
    });
    const executor: PowerShellExecutor = async (_command, _args, options) => {
      events.push(`start:${options.operationId}`);
      if (options.operationId === "op-1") {
        notifyFirstStarted?.();
        await new Promise<void>((release) => {
          releaseFirst = release;
        });
      }
      events.push(`end:${options.operationId}`);
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"returnValue":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      operationIdFactory: (() => {
        let count = 0;
        return () => `op-${++count}`;
      })(),
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const firstRun = runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "First" } },
      config,
    );
    const secondRun = runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "Second" } },
      config,
    );

    await firstStarted;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(["start:op-1"]);

    releaseFirst?.();
    await Promise.all([firstRun, secondRun]);

    expect(events).toEqual(["start:op-1", "end:op-1", "start:op-2", "end:op-2"]);
  });

  it("redacts backend passwords from diagnostics and runner failures", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 7,
      stdout: "",
      stderr: "DAO failed with connection string ;PWD=backend-secret",
      durationMs: 33,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "diagnostics", request: { includeEnvironment: true } },
      config,
    );

    expect(JSON.stringify(result)).not.toContain("backend-secret");
    expect(result).toMatchObject({
      ok: false,
      error: {
        message:
          "PowerShell runner failed with exit code 7: DAO failed with connection string ;PWD=[REDACTED]",
      },
      diagnostics: [
        expect.objectContaining({
          message: "DAO failed with connection string ;PWD=[REDACTED]",
        }),
        expect.any(Object),
      ],
    });
  });

  it("resolves the production runner script from DYSFLOW_HOME", () => {
    const dysflowHome = join(tmpdir(), "dysflow-runtime");

    expect(
      normalize(
        resolveDefaultRunnerScriptPath({
          DYSFLOW_HOME: dysflowHome,
        }),
      ),
    ).toBe(join(dysflowHome, "app", "scripts", "dysflow-access-runner.ps1"));
  });

  it("records operation roots from resolved config instead of process cwd", async () => {
    const records: unknown[] = [];
    const events: string[] = [];
    const preflight: AccessOperationPreflightCleanup = {
      cleanup: async (request) => {
        events.push(`preflight:${request.accessPath}:${request.projectRoot}`);
        return { cleaned: [], killed: [], orphanedKilled: [], errors: [] };
      },
    };
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor: async () => ({
        exitCode: 0,
        stdout: "DYSFLOW_RESULT {}",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      }),
      operationRegistry: {
        create: async (record) => {
          events.push("create");
          records.push(record);
          return record;
        },
        update: async () => undefined,
        get: async () => undefined,
        listRecent: async () => [],
      },
      operationIdFactory: () => "op-roots",
      preflightCleanup: preflight,
      scriptPath: "C:/tools/run.ps1",
    });

    await runner.run(
      { kind: "diagnostics", request: { includeEnvironment: true } },
      {
        ...config,
        projectRoot: "C:/repo/project",
        destinationRoot: "C:/repo/project/src",
      },
    );

    expect(records).toEqual([
      expect.objectContaining({
        projectRootAbs: "C:/repo/project",
        destinationRootAbs: "C:/repo/project/src",
      }),
    ]);
    expect(events).toEqual([`preflight:${testAccessDbPath}:C:/repo/project`, "create"]);
  });

  it("continues and emits a diagnostic when preflight cleanup throws", async () => {
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor: async () => ({
        exitCode: 0,
        stdout: "DYSFLOW_RESULT {}",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      }),
      operationRegistry: {
        create: async (record) => record,
        update: async () => undefined,
        get: async () => undefined,
        listRecent: async () => [],
      },
      operationIdFactory: () => "op-preflight-error",
      preflightCleanup: {
        cleanup: async () => {
          throw new Error("registry locked");
        },
      },
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run({ kind: "diagnostics", request: {} }, config);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        source: "access.preflight",
        message: "preflight: Pre-flight cleanup failed: registry locked",
      }),
    );
  });

  it("surfaces access process capture failures as diagnostics", async () => {
    const executor: PowerShellExecutor = async (_command, _args, options) => {
      const captureTask = options.onAccessProcessCaptured({
        pid: 4567,
        processStartTime: "2026-05-15T10:00:00.000Z",
      });
      await Promise.allSettled([captureTask]);
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"returnValue":42}',
        stderr: "",
        durationMs: 12,
        timedOut: false,
      };
    };
    let updateCalls = 0;
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      operationRegistry: {
        create: async (record) => record,
        update: async (_operationId, patch) => {
          updateCalls += 1;
          if (updateCalls === 1) throw new Error("registry write failed");
          return {
            operationId: "op",
            action: "vba",
            accessPath: config.accessDbPath,
            projectRootAbs: "",
            destinationRootAbs: "",
            metadata: {},
            accessPid: null,
            processStartTime: null,
            status: "completed",
            updatedAt: "now",
            ...patch,
          };
        },
        get: async () => undefined,
        listRecent: async () => [],
      },
      operationIdFactory: () => "op",
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
      config,
    );

    expect(result).toMatchObject({ ok: true });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        {
          level: "error",
          source: "access.pid",
          message: "Failed to record Access PID ownership: registry write failed",
        },
      ]),
    );
  });

  it("maps timed-out execution to a retryable timeout error with sanitized diagnostics", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: null,
      stdout: "starting with super-secret",
      stderr: "connection password=super-secret stalled",
      durationMs: 1_501,
      timedOut: true,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "diagnostics", request: { includeEnvironment: true } },
      config,
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "RUNNER_TIMEOUT",
        message: "Access operation timed out after 1500ms.",
        retryable: true,
      },
      diagnostics: [
        {
          level: "warning",
          source: "powershell.stdout",
          message: "starting with [REDACTED]",
        },
        {
          level: "error",
          source: "powershell.stderr",
          message: "connection password=[REDACTED] stalled",
        },
        {
          level: "warning",
          source: "access.pid",
          message: "Access PID could not be determined; automatic cleanup is not safe.",
        },
      ],
      durationMs: 1_501,
      operation: { accessPath: testAccessDbPath, status: "timed_out" },
    });
  });

  it("records timed-out operation metadata even when Access PID was never captured", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 1_500,
      timedOut: true,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "diagnostics", request: { includeEnvironment: true } },
      config,
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "RUNNER_TIMEOUT",
        retryable: true,
      },
      durationMs: 1_500,
      operation: {
        operationId: expect.stringMatching(/^dysflow-/),
        accessPath: testAccessDbPath,
        status: "timed_out",
      },
    });
  });

  it("maps non-zero PowerShell exit output to a sanitized runner failure", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 7,
      stdout: "",
      stderr: `failed opening ${testAccessDbPath} with super-secret`,
      durationMs: 33,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      {
        kind: "query",
        request: { sql: "SELECT * FROM Customers", mode: "read" },
      },
      config,
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "RUNNER_FAILED",
        message: `PowerShell runner failed with exit code 7: failed opening ${testAccessDbPath} with [REDACTED]`,
        retryable: false,
      },
      diagnostics: [
        {
          level: "error",
          source: "powershell.stderr",
          message: `failed opening ${testAccessDbPath} with [REDACTED]`,
        },
        {
          level: "warning",
          source: "access.pid",
          message: "Access PID could not be determined; automatic cleanup is not safe.",
        },
      ],
      durationMs: 33,
      operation: { accessPath: testAccessDbPath, status: "pid_unknown" },
    });
  });

  it.each([
    {
      name: "malformed output",
      stdout: "DYSFLOW_RESULT not-valid-json",
    },
    {
      name: "valid structured sentinel failure",
      stdout: 'DYSFLOW_RESULT {"ok":false,"error":{"code":"ACCESS_SCRIPT_FAILED"}}',
    },
  ])("maps non-zero PowerShell exit with $name to RUNNER_FAILED", async ({ stdout }) => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 3,
      stdout,
      stderr: "",
      durationMs: 22,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "query", request: { sql: "SELECT * FROM Customers", mode: "read" } },
      config,
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "RUNNER_FAILED",
        message: `PowerShell runner failed with exit code 3: ${stdout}`,
      },
      durationMs: 22,
    });
  });

  it("maps valid JSON that is not a record object to a typed runner failure", async () => {
    for (const nonObject of ["null", "42", '"string"', "[1,2,3]", "true"]) {
      const executor: PowerShellExecutor = async () => ({
        exitCode: 0,
        stdout: nonObject,
        stderr: "",
        durationMs: 10,
        timedOut: false,
      });
      const runner = new AccessPowerShellRunner({
        lockFileSystem: nodeLockFileSystem,
        executor,
        preflightCleanup: noOpPreflight,
        scriptPath: "C:/tools/run.ps1",
      });

      const result = await runner.run(
        { kind: "diagnostics", request: { includeEnvironment: true } },
        config,
      );

      expect(result, `expected failure for stdout: ${nonObject}`).toMatchObject({
        ok: false,
        error: { code: "RUNNER_INVALID_JSON" },
      });
    }
  });

  it("maps malformed successful PowerShell JSON to a typed runner failure", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 0,
      stdout: "WARNING: noisy output\n{not json",
      stderr: "",
      durationMs: 44,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "diagnostics", request: { includeEnvironment: true } },
      config,
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "RUNNER_INVALID_JSON",
        message:
          "PowerShell runner produced invalid JSON output: No DYSFLOW_RESULT line in runner output",
      },
      durationMs: 44,
    });
  });

  it("maps empty stdout to a typed runner failure with RUNNER_INVALID_JSON", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 0,
      stdout: "   \n   ",
      stderr: "",
      durationMs: 10,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "diagnostics", request: { includeEnvironment: true } },
      config,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "RUNNER_INVALID_JSON" },
    });
  });

  // --- DYSFLOW_RESULT sentinel contract (issue #440) ---

  it("extracts result from DYSFLOW_RESULT sentinel line ignoring surrounding diagnostic braces", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 0,
      stdout: [
        "DEBUG: connecting {host=localhost}",
        'DYSFLOW_RESULT {"ok":true,"data":42}',
        "DEBUG: done {elapsed=12ms}",
      ].join("\n"),
      stderr: "",
      durationMs: 10,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
      config,
    );

    expect(result).toMatchObject({ ok: true, data: { ok: true, data: 42 } });
  });

  it("extracts result when sentinel is the only stdout line (clean output)", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 0,
      stdout: 'DYSFLOW_RESULT {"ok":true,"returnValue":99}',
      stderr: "",
      durationMs: 5,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
      config,
    );

    expect(result).toMatchObject({ ok: true, data: { ok: true, returnValue: 99 } });
  });

  it("maps missing DYSFLOW_RESULT sentinel to RUNNER_INVALID_JSON (no silent fallback)", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 0,
      stdout: '{"ok":true}',
      stderr: "",
      durationMs: 5,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
      config,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "RUNNER_INVALID_JSON" } });
  });

  it("maps duplicate DYSFLOW_RESULT sentinel lines to RUNNER_INVALID_JSON", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 0,
      stdout: ['DYSFLOW_RESULT {"ok":true}', 'DYSFLOW_RESULT {"ok":false}'].join("\n"),
      stderr: "",
      durationMs: 5,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
      config,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "RUNNER_INVALID_JSON" } });
  });

  it("maps malformed JSON after DYSFLOW_RESULT sentinel to RUNNER_INVALID_JSON", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 0,
      stdout: "DYSFLOW_RESULT not-valid-json",
      stderr: "",
      durationMs: 5,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
      config,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "RUNNER_INVALID_JSON" } });
  });

  // --- issue #474: RUNNER_INVALID_JSON surfaces underlying parse error ---

  it("RUNNER_INVALID_JSON message includes underlying RunnerResultChannelError for missing sentinel", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 0,
      stdout: '{"ok":true}', // missing DYSFLOW_RESULT line → RunnerResultChannelError
      stderr: "",
      durationMs: 5,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
      config,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "RUNNER_INVALID_JSON" } });
    expect(result.ok === false && result.error.message).toContain(
      "No DYSFLOW_RESULT line in runner output",
    );
  });

  it("RUNNER_INVALID_JSON message includes underlying SyntaxError for malformed JSON payload", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 0,
      stdout: "DYSFLOW_RESULT not-valid-json", // malformed JSON → SyntaxError
      stderr: "",
      durationMs: 5,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
      config,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "RUNNER_INVALID_JSON" } });
    expect(result.ok === false && result.error.message).toContain("Unexpected token");
  });

  it("RUNNER_INVALID_JSON diagnostics redact secrets in stdout preview", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 0,
      stdout: "WARNING: connecting password=super-secret\nDYSFLOW_RESULT null", // sentinel present but null → type error
      stderr: "",
      durationMs: 5,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
    });

    const result = await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
      config,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "RUNNER_INVALID_JSON" } });
    // stdout preview in diagnostics must be secret-scrubbed
    const stdoutDiags = result.diagnostics?.filter((d) => d.source === "powershell.stdout") ?? [];
    expect(stdoutDiags.length).toBeGreaterThan(0);
    const preview = stdoutDiags[0]?.message;
    expect(preview).not.toContain("super-secret");
    expect(preview).toContain("[REDACTED]");
  });

  it("each runner gets its own isolated in-memory registry by default and does not share state", () => {
    const runner1 = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor: async () => ({
        exitCode: 0,
        stdout: "{}",
        stderr: "",
        durationMs: 0,
        timedOut: false,
      }),
      preflightCleanup: noOpPreflight,
    });
    const runner2 = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor: async () => ({
        exitCode: 0,
        stdout: "{}",
        stderr: "",
        durationMs: 0,
        timedOut: false,
      }),
      preflightCleanup: noOpPreflight,
    });

    const registry1 = (runner1 as unknown as { operationRegistry: unknown }).operationRegistry;
    const registry2 = (runner2 as unknown as { operationRegistry: unknown }).operationRegistry;

    expect(registry1).toBeDefined();
    expect(registry2).toBeDefined();
    expect(registry1).not.toBe(registry2);
  });
});

describe("sanitizePowerShellOutput", () => {
  it("redacts configured secrets and password assignments", () => {
    expect(
      sanitizePowerShellOutput("token abc password=hunter2; pwd: hunter2", ["abc", "hunter2"]),
    ).toBe("token [REDACTED] password=[REDACTED]; pwd: [REDACTED]");
  });
});

describe("Cross-process lock for .accdb", () => {
  it("CROSS_PROCESS_LOCK_STALE_MS is a positive integer of at most 60s", () => {
    expect(Number.isInteger(CROSS_PROCESS_LOCK_STALE_MS)).toBe(true);
    expect(CROSS_PROCESS_LOCK_STALE_MS).toBeGreaterThan(0);
    expect(CROSS_PROCESS_LOCK_STALE_MS).toBeLessThanOrEqual(60_000);
  });

  it("run() returns RUNNER_LOCK_TIMEOUT when cross-process lock cannot be acquired", async () => {
    const dbPath = join(tmpdir(), `dysflow-lock-test-${Date.now()}.accdb`);
    const lockPath = getCrossProcessLockPath(dbPath);
    mkdirSync(lockPath, { recursive: true });
    try {
      const executor: PowerShellExecutor = async () => ({
        exitCode: 0,
        stdout: "{}",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      });
      const runner = new AccessPowerShellRunner({
        lockFileSystem: nodeLockFileSystem,
        executor,
        preflightCleanup: noOpPreflight,
        scriptPath: "C:/tools/run.ps1",
        lockAcquireTimeoutMs: 100,
      });
      const result = await runner.run(
        { kind: "diagnostics", request: {} },
        { ...config, accessDbPath: dbPath },
      );
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("RUNNER_LOCK_TIMEOUT");
    } finally {
      rmSync(lockPath, { recursive: true, force: true });
    }
  });
  // The source-text test "verifies scripts/dysflow-access-runner.ps1 conforms to
  // return-based exits and force-kill design" has been removed (issue #443) — it was
  // an implementation-coupled assertion that would break on a behavior-preserving
  // rename/refactor of script-scoped variable names. The behavioral contracts (no
  // bare exit inside try, finally block always runs, Stop-Process force-kill) are
  // now covered by Pester behavioral tests in scripts/tests/dysflow-access-runner.Tests.ps1
  // ("Access runner return-based exits and force-kill — behavioral" describe block).

  it("runs a real diagnostics check and verifies no lingering MSACCESS.EXE process", async () => {
    if (process.platform !== "win32") {
      return;
    }
    const dbPath = join(process.cwd(), "E2E_testing/NoConformidades.accdb");
    // Pass scriptPath explicitly so the test always uses the dev script regardless of DYSFLOW_HOME.
    // AGENTS.md: "Never modify the production runtime at %LOCALAPPDATA%\dysflow" — tests must
    // not inadvertently use it either.
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor: createDefaultPowerShellExecutor(),
      scriptPath: join(process.cwd(), "scripts/dysflow-access-runner.ps1"),
    });
    const result = await runner.run(
      { kind: "diagnostics", request: {} },
      {
        ...config,
        accessDbPath: dbPath,
        accessPassword:
          process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD ?? "",
        timeoutMs: 180_000,
      },
    );
    // eslint-disable-next-line no-console
    console.log("DEBUG REAL TEST result:", JSON.stringify(result));
    expect(result.ok).toBe(true);
    const pid = result.operation?.accessPid;
    expect(pid).toBeTypeOf("number");
    if (pid) {
      let isRunning = true;
      try {
        process.kill(pid, 0);
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException).code === "ESRCH") {
          isRunning = false;
        }
      }
      expect(isRunning).toBe(false);
    }
  }, 180_000);

  // ------------------------------------------------------------------
  // v1.2.32 regression: query actions must fail fast with a structured
  // CONFIG_* error when the project config or the request cannot resolve
  // a target Access database, instead of letting the PowerShell runner
  // throw and the MCP caller see the opaque
  // "RUNNER_INVALID_JSON: No DYSFLOW_RESULT line".
  // ------------------------------------------------------------------

  it("query: returns CONFIG_MISSING_TARGET_PATH when neither the request nor the config resolves a target", async () => {
    const calls: unknown[] = [];
    const executor: PowerShellExecutor = async () => {
      calls.push("executor_called");
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT {}",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run access.ps1",
    });
    const result = await runner.run(
      { kind: "query", request: { action: "list_tables", mode: "read", sql: "" } },
      {
        ...config,
        // Both backendPath and accessPath point at the same nonexistent file
        // so neither defaulting branch can rescue us. The runner must
        // refuse to invoke the PowerShell executor.
        accessDbPath: "C:/no/such/dir/missing.accdb",
        backendPath: undefined,
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("CONFIG_TARGET_NOT_FOUND");
    expect(calls).toEqual([]); // executor MUST NOT be invoked
  });

  it("query: returns CONFIG_TARGET_NOT_FOUND when the configured accessPath does not exist on disk", async () => {
    const calls: unknown[] = [];
    const executor: PowerShellExecutor = async () => {
      calls.push("executor_called");
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT {}",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run access.ps1",
    });
    const result = await runner.run(
      { kind: "query", request: { action: "list_tables", mode: "read", sql: "" } },
      {
        ...config,
        accessDbPath: "C:/no/such/access.accdb",
        backendPath: "C:/no/such/backend.accdb",
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("CONFIG_TARGET_NOT_FOUND");
    expect(String(result.error.message)).toMatch(/accessPath/);
    expect(calls).toEqual([]);
  });

  it("query: still works when accessPath exists on disk (happy path regression)", async () => {
    // Use a real temp file so existsSync passes. We never open Access
    // because the mocked executor returns the DYSFLOW_RESULT sentinel
    // before the runner would touch the file.
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "dysflow-runner-test-"));
    const fakeAccdb = join(dir, "fake.accdb");
    writeFileSync(fakeAccdb, "");
    try {
      const calls: unknown[] = [];
      const executor: PowerShellExecutor = async () => {
        calls.push("executor_called");
        return {
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"tables":[]}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      };
      const runner = new AccessPowerShellRunner({
        lockFileSystem: nodeLockFileSystem,
        executor,
        preflightCleanup: noOpPreflight,
        scriptPath: "C:/tools/run access.ps1",
      });
      const result = await runner.run(
        { kind: "query", request: { action: "list_tables", mode: "read", sql: "" } },
        {
          ...config,
          accessDbPath: fakeAccdb,
          backendPath: undefined,
        },
      );
      expect(result.ok).toBe(true);
      expect(calls.length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
