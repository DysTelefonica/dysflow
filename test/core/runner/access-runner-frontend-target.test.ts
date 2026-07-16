import { describe, expect, it } from "vitest";
import { nodeLockFileSystem } from "../../../src/adapters/runner/node-lock-file-system.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight.js";
import {
  AccessPowerShellRunner,
  type PowerShellExecutor,
} from "../../../src/core/runner/access-runner.js";

const noOpPreflight: AccessOperationPreflightCleanup = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

describe("AccessPowerShellRunner frontend target contract", () => {
  it("reports TABLE_NOT_IN_DATABASE for a simple SELECT whose table is absent", async () => {
    let linkedTablePresent = false;
    const runner = new AccessPowerShellRunner({
      executor: async (_command, args) => {
        const payloadIndex = args.indexOf("-PayloadJson");
        const payload = JSON.parse(args[payloadIndex + 1] ?? "{}") as Record<string, unknown>;
        return {
          exitCode: 0,
          stdout:
            payload.action === "list_tables"
              ? 'DYSFLOW_RESULT {"tables":[]}'
              : payload.action === "list_linked_tables"
                ? `DYSFLOW_RESULT {"tables":${linkedTablePresent ? '["TbConfiguracionBackends"]' : "[]"}}`
                : payload.action === "get_schema"
                  ? 'DYSFLOW_RESULT {"schema":[{"name":"BackendActivo"}]}'
                  : 'DYSFLOW_RESULT {"rows":[]}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      },
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/runner.ps1",
      fileExists: () => true,
      lockFileSystem: nodeLockFileSystem,
    });
    const result = await runner.run(
      {
        kind: "query",
        request: {
          action: "query_sql",
          mode: "read",
          sql: "SELECT TOP 1 BackendActivo FROM TbConfiguracionBackends",
          databasePath: "C:/project/frontend.accdb",
        },
      },
      {
        configSource: "repo-config",
        allowWrites: true,
        accessDbPath: "C:/project/frontend.accdb",
        backendPath: "C:/project/backend.accdb",
        timeoutMs: 1_000,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TABLE_NOT_IN_DATABASE");
      expect(result.error.details).toMatchObject({
        tableName: "TbConfiguracionBackends",
        resolvedAccessPath: "C:/project/frontend.accdb",
      });
    }

    linkedTablePresent = true;
    const linkedResult = await runner.run(
      {
        kind: "query",
        request: {
          action: "query_sql",
          mode: "read",
          sql: "SELECT TOP 1 BackendActivo FROM TbConfiguracionBackends",
          databasePath: "C:/project/frontend.accdb",
        },
      },
      {
        configSource: "repo-config",
        allowWrites: true,
        accessDbPath: "C:/project/frontend.accdb",
        timeoutMs: 1_000,
      },
    );
    expect(linkedResult.ok).toBe(true);
  });

  it("reports COLUMN_NOT_IN_TABLE for a simple SELECT whose table exists", async () => {
    const runner = new AccessPowerShellRunner({
      executor: async (_command, args) => {
        const payloadIndex = args.indexOf("-PayloadJson");
        const payload = JSON.parse(args[payloadIndex + 1] ?? "{}") as Record<string, unknown>;
        return {
          exitCode: 0,
          stdout:
            payload.action === "list_tables"
              ? 'DYSFLOW_RESULT {"tables":["TbConfiguracionBackends"]}'
              : payload.action === "list_linked_tables"
                ? 'DYSFLOW_RESULT {"tables":[]}'
                : payload.action === "get_schema"
                  ? 'DYSFLOW_RESULT {"schema":[{"name":"BackendActivo"}]}'
                  : 'DYSFLOW_RESULT {"rows":[]}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      },
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/runner.ps1",
      fileExists: () => true,
      lockFileSystem: nodeLockFileSystem,
    });
    const result = await runner.run(
      {
        kind: "query",
        request: {
          action: "query_sql",
          mode: "read",
          sql: "SELECT MissingColumn FROM TbConfiguracionBackends",
          databasePath: "C:/project/frontend.accdb",
        },
      },
      {
        configSource: "repo-config",
        allowWrites: true,
        accessDbPath: "C:/project/frontend.accdb",
        timeoutMs: 1_000,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("COLUMN_NOT_IN_TABLE");
      expect(result.error.details).toMatchObject({
        tableName: "TbConfiguracionBackends",
        columnName: "MissingColumn",
        resolvedAccessPath: "C:/project/frontend.accdb",
      });
    }
  });

  it("does not invent typed schema errors for a complex SELECT", async () => {
    let schemaProbeCount = 0;
    const runner = new AccessPowerShellRunner({
      executor: async (_command, args) => {
        const payloadIndex = args.indexOf("-PayloadJson");
        const payload = JSON.parse(args[payloadIndex + 1] ?? "{}") as Record<string, unknown>;
        if (payload.action === "get_schema") schemaProbeCount += 1;
        return {
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"rows":[]}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      },
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/runner.ps1",
      fileExists: () => true,
      lockFileSystem: nodeLockFileSystem,
    });
    const result = await runner.run(
      {
        kind: "query",
        request: {
          action: "query_sql",
          mode: "read",
          sql: "SELECT a.Id FROM A AS a INNER JOIN B AS b ON a.Id = b.Id",
          databasePath: "C:/project/frontend.accdb",
        },
      },
      {
        configSource: "repo-config",
        allowWrites: true,
        accessDbPath: "C:/project/frontend.accdb",
        timeoutMs: 1_000,
      },
    );

    expect(result.ok).toBe(true);
    expect(schemaProbeCount).toBe(0);
  });

  it("reports the database path resolved for query_sql", async () => {
    const runner = new AccessPowerShellRunner({
      executor: async () => ({
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"rows":[{"value":1}]}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      }),
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/runner.ps1",
      fileExists: () => true,
      lockFileSystem: nodeLockFileSystem,
    });
    const result = await runner.run(
      {
        kind: "query",
        request: {
          action: "query_sql",
          mode: "read",
          sql: "SELECT 1",
          target: "frontend",
          backendPath: "C:/project/backend.accdb",
        },
      },
      {
        configSource: "repo-config",
        allowWrites: true,
        accessDbPath: "C:/project/frontend.accdb",
        backendPath: "C:/project/backend.accdb",
        timeoutMs: 1_000,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ resolvedAccessPath: "C:/project/frontend.accdb" });
    }

    const explicitBackend = await runner.run(
      {
        kind: "query",
        request: {
          action: "query_sql",
          mode: "read",
          sql: "SELECT 1",
          target: "backend",
          backendPath: "C:/override/backend.accdb",
        },
      },
      {
        configSource: "repo-config",
        allowWrites: true,
        accessDbPath: "C:/project/frontend.accdb",
        backendPath: "C:/project/backend.accdb",
        timeoutMs: 1_000,
      },
    );
    expect(explicitBackend.ok && explicitBackend.data).toMatchObject({
      resolvedAccessPath: "C:/override/backend.accdb",
    });
  });

  it("resolves a frontend-only action to accessPath even when backendPath is auxiliary input", async () => {
    let payload: Record<string, unknown> | undefined;
    const executor: PowerShellExecutor = async (_command, args) => {
      const payloadIndex = args.indexOf("-PayloadJson");
      payload = JSON.parse(args[payloadIndex + 1] ?? "{}") as Record<string, unknown>;
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"links":[]}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const runner = new AccessPowerShellRunner({
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/runner.ps1",
      fileExists: () => true,
      lockFileSystem: nodeLockFileSystem,
    });
    const config: DysflowConfig = {
      configSource: "repo-config",
      allowWrites: true,
      accessDbPath: "C:/project/frontend.accdb",
      backendPath: "C:/project/backend.accdb",
      timeoutMs: 1_000,
    };

    const result = await runner.run(
      {
        kind: "query",
        request: {
          action: "link_tables",
          mode: "write",
          sql: "",
          target: "frontend",
          backendPath: "C:/project/backend.accdb",
          dryRun: true,
        },
      },
      config,
    );

    expect(result.ok).toBe(true);
    expect(payload).toMatchObject({
      action: "link_tables",
      databasePath: "C:/project/frontend.accdb",
      backendPath: "C:/project/backend.accdb",
    });
  });

  it("resolves compact_repair semantic targets while explicit databasePath wins", async () => {
    const payloads: Record<string, unknown>[] = [];
    const runner = new AccessPowerShellRunner({
      executor: async (_command, args) => {
        const payloadIndex = args.indexOf("-PayloadJson");
        payloads.push(JSON.parse(args[payloadIndex + 1] ?? "{}") as Record<string, unknown>);
        return {
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"dryRun":true}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      },
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/runner.ps1",
      fileExists: () => true,
      lockFileSystem: nodeLockFileSystem,
    });
    const config: DysflowConfig = {
      configSource: "repo-config",
      allowWrites: true,
      accessDbPath: "C:/project/frontend.accdb",
      backendPath: "C:/project/backend.accdb",
      timeoutMs: 1_000,
    };

    await runner.run(
      {
        kind: "query",
        request: {
          action: "compact_repair",
          mode: "write",
          sql: "",
          target: "backend",
          dryRun: true,
        },
      },
      config,
    );
    await runner.run(
      {
        kind: "query",
        request: {
          action: "compact_repair",
          mode: "write",
          sql: "",
          target: "backend",
          databasePath: "C:/override/explicit.accdb",
          dryRun: true,
        },
      },
      config,
    );

    expect(payloads[0]).toMatchObject({
      action: "compact_repair",
      backendPath: "C:/project/backend.accdb",
    });
    expect(payloads[1]).toMatchObject({
      action: "compact_repair",
      databasePath: "C:/override/explicit.accdb",
    });
  });
});
