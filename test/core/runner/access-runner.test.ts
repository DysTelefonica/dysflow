import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight.js";
import {
  AccessPowerShellRunner,
  CROSS_PROCESS_LOCK_STALE_MS,
  getCrossProcessLockPath,
  type PowerShellExecutor,
  resolveDefaultRunnerScriptPath,
  sanitizePowerShellOutput,
} from "../../../src/core/runner/access-runner.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: false,
  accessDbPath: "C:/data/finance.accdb",
  accessPassword: "super-secret",
  backendPassword: "backend-secret",
  timeoutMs: 1_500,
  processTimeoutMs: 1_500,
};

const noOpPreflight: AccessOperationPreflightCleanup = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

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
        stdout: '{"returnValue":42}',
        stderr: "",
        durationMs: 12,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
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
      operation: { accessPath: "C:/data/finance.accdb", status: "pid_unknown" },
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
          "C:/data/finance.accdb",
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
        stdout: '{"returnValue":true}',
        stderr: "",
        durationMs: 9,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
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
    expect(calls[0].env).toEqual({
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
        stdout: '{"comparison":{"missingInBackend":[],"extraInBackend":[]}}',
        stderr: "",
        durationMs: 8,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
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

    const payloadArgIndex = calls[0].args.indexOf("-PayloadJson");
    const payloadArg = payloadArgIndex >= 0 ? calls[0].args[payloadArgIndex + 1] : undefined;
    const payload = payloadArg ? (JSON.parse(payloadArg) as Record<string, unknown>) : undefined;

    expect(calls[0].env).toEqual({ DYSFLOW_BACKEND_PASSWORD: "backend-secret" });
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
        stdout: '{"rows":[]}',
        stderr: "",
        durationMs: 8,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
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

    const payloadArgIndex = calls[0].args.indexOf("-PayloadJson");
    const payloadArg = payloadArgIndex >= 0 ? calls[0].args[payloadArgIndex + 1] : undefined;
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
        stdout: '{"rows":[]}',
        stderr: "",
        durationMs: 8,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
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

    const payloadArgIndex = calls[0].args.indexOf("-PayloadJson");
    const payloadArg = payloadArgIndex >= 0 ? calls[0].args[payloadArgIndex + 1] : undefined;
    const payload = payloadArg ? (JSON.parse(payloadArg) as Record<string, unknown>) : undefined;

    expect(payload).toMatchObject({
      action: "create_table",
      mode: "write",
      databasePath: "C:/data/explicit-write.accdb",
    });
    expect(payload).not.toHaveProperty("backendPath");
  });

  it("dispatches write actions through a selected database helper instead of CurrentDb directly", () => {
    const script = readFileSync("scripts/dysflow-access-runner.ps1", "utf8");

    expect(script).toContain("$isDirectTargetQuery = $Operation -eq 'query'");
    expect(script).toContain(
      "Open-DatabaseWithBackendPassword -DbEngine $access.DBEngine -DatabasePath $targetPath",
    );
    expect(script).toContain("function Resolve-WriteActionDatabase");
    expect(script).toContain("Resolve-WriteActionDatabase -DbEngine");
    expect(script).toContain("Invoke-WriteAction -Database $writeDb.Database");
    expect(script).not.toContain(
      "Invoke-WriteAction -Database $db -Action $action -Payload $payload",
    );
  });

  it("dispatches read schema actions through a read-only selected database helper", () => {
    const script = readFileSync("scripts/dysflow-access-runner.ps1", "utf8");

    expect(script).toContain("function Resolve-ReadActionDatabase");
    expect(script).toContain(
      "Open-DatabaseWithBackendPassword -DbEngine $DbEngine -DatabasePath $targetPath -ReadOnly $true",
    );
    expect(script).toContain(
      "Resolve-ReadActionDatabase -DbEngine $access.DBEngine -CurrentDb $db -Payload $payload",
    );
    expect(script).toContain("if ($readDb.Owned)");
    // Shared read-action helpers are extracted into named functions
    expect(script).toContain("function Invoke-ListTablesAction");
    expect(script).toContain("function Invoke-GetSchemaAction");
    expect(script).toContain("function Invoke-GetRelationshipsAction");
    expect(script).toContain("Invoke-ListTablesAction -Database $readDb.Database");
    expect(script).toContain("Invoke-GetSchemaAction -Database $readDb.Database");
    expect(script).toContain("Invoke-GetRelationshipsAction -Database $readDb.Database");
    // No direct inline calls to helpers bypassing the shared functions
    expect(script).not.toContain("Get-TableSchema -Database $db");
    expect(script).not.toContain("Get-Relationships -Database $db");
  });

  it("dispatches generic SQL reads and writes through selected database helpers", () => {
    const script = readFileSync("scripts/dysflow-access-runner.ps1", "utf8");

    expect(script).toContain(
      "$readDb = Resolve-ReadActionDatabase -DbEngine $access.DBEngine -CurrentDb $db -Payload $payload",
    );
    // SQL read is now dispatched via the shared Invoke-QuerySqlReadAction helper
    expect(script).toContain("function Invoke-QuerySqlReadAction");
    expect(script).toContain("Invoke-QuerySqlReadAction -Database $readDb.Database");
    expect(script).toContain(
      "$writeDb = Resolve-WriteActionDatabase -DbEngine $access.DBEngine -CurrentDb $db -Payload $payload",
    );
    expect(script).toContain("$writeDb.Database.Execute([string]$payload.sql, 128)");
    expect(script).not.toContain("$rs = $db.OpenRecordset([string]$payload.sql)");
    expect(script).not.toContain("$db.Execute([string]$payload.sql, 128)");
  });

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
        stdout: '{"returnValue":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
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
      executor: async () => ({
        exitCode: 0,
        stdout: "{}",
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
    expect(events).toEqual(["preflight:C:/data/finance.accdb:C:/repo/project", "create"]);
  });

  it("continues and emits a diagnostic when preflight cleanup throws", async () => {
    const runner = new AccessPowerShellRunner({
      executor: async () => ({
        exitCode: 0,
        stdout: "{}",
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
        stdout: '{"returnValue":42}',
        stderr: "",
        durationMs: 12,
        timedOut: false,
      };
    };
    let updateCalls = 0;
    const runner = new AccessPowerShellRunner({
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
      operation: { accessPath: "C:/data/finance.accdb", status: "timed_out" },
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
        accessPath: "C:/data/finance.accdb",
        status: "timed_out",
      },
    });
  });

  it("maps non-zero PowerShell exit output to a sanitized runner failure", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 7,
      stdout: "",
      stderr: "failed opening C:/data/finance.accdb with super-secret",
      durationMs: 33,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({
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
        message:
          "PowerShell runner failed with exit code 7: failed opening C:/data/finance.accdb with [REDACTED]",
        retryable: false,
      },
      diagnostics: [
        {
          level: "error",
          source: "powershell.stderr",
          message: "failed opening C:/data/finance.accdb with [REDACTED]",
        },
        {
          level: "warning",
          source: "access.pid",
          message: "Access PID could not be determined; automatic cleanup is not safe.",
        },
      ],
      durationMs: 33,
      operation: { accessPath: "C:/data/finance.accdb", status: "pid_unknown" },
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
        message: "PowerShell runner produced invalid JSON output.",
      },
      durationMs: 44,
    });
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
  it("verifies scripts/dysflow-access-runner.ps1 conforms to return-based exits and force-kill design", async () => {
    const { readFileSync } = await import("node:fs");
    const scriptContent = readFileSync("scripts/dysflow-access-runner.ps1", "utf8");

    // 1. Initialized script-scoped variables
    expect(scriptContent).toContain("$script:exitCode =");
    expect(scriptContent).toContain("$script:accessPid =");

    // 2. Stop-Process force kill fallback in finally block
    expect(scriptContent).toContain("Stop-Process");
    expect(scriptContent).toContain("$script:accessPid");

    // 3. No early exits inside try block, only return or exit $script:exitCode at the bottom
    const lines = scriptContent.split(/\r?\n/);
    let exitCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      // Ignore comments and matches that are not the single final exit statement
      if (trimmed.startsWith("exit ") && !trimmed.includes("$script:exitCode")) {
        exitCount++;
      }
    }
    expect(exitCount).toBe(0);
  });

  it("runs a real diagnostics check and verifies no lingering MSACCESS.EXE process", async () => {
    if (process.platform !== "win32") {
      return;
    }
    const dbPath = join(process.cwd(), "E2E_testing/NoConformidades.accdb");
    const runner = new AccessPowerShellRunner();
    const result = await runner.run(
      { kind: "diagnostics", request: {} },
      {
        ...config,
        accessDbPath: dbPath,
        accessPassword:
          process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD ?? "",
        timeoutMs: 30_000,
        processTimeoutMs: 30_000,
      },
    );
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
  }, 30_000);
});
