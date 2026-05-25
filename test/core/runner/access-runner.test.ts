import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight.js";
import {
  AccessPowerShellRunner,
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
      operation: { accessPath: "C:/data/finance.accdb", status: "pid_unknown" },
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
