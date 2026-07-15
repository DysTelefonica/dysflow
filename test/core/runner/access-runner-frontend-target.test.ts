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
});
