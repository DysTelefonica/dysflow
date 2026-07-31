import { describe, expect, it } from "vitest";
import { resultContractForDispatchTool } from "../../../src/adapters/mcp/contracts/dispatch-result-contracts.js";
import { validateToolResult } from "../../../src/adapters/mcp/contracts/result-validation.js";
import { translateCoreResultToMcpContent } from "../../../src/adapters/mcp/result-translation.js";
import { nodeLockFileSystem } from "../../../src/adapters/runner/node-lock-file-system.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import { buildMaintenanceRequest } from "../../../src/core/mapping/access-query-request-mapper.js";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight.js";
import { AccessPowerShellRunner } from "../../../src/core/runner/access-runner.js";
import { AccessQueryService } from "../../../src/core/services/query-service.js";

const noOpPreflight: AccessOperationPreflightCleanup = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

describe("compact_repair dry-run result contract (#1276)", () => {
  it("returns the executable plan payload with explicit backend target provenance", async () => {
    const runner = new AccessPowerShellRunner({
      executor: async () => ({
        exitCode: 0,
        stdout:
          'DYSFLOW_RESULT {"dryRun":true,"sourcePath":"C:/project/backend.accdb","targetPath":"C:/project/backend.compacted.accdb","backupFirst":false,"wouldReplaceSource":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      }),
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
    const service = new AccessQueryService({ runner, config });
    const request = buildMaintenanceRequest(
      "compact_repair",
      "write",
      { databasePath: config.backendPath, apply: false, backupFirst: false },
      () => undefined,
    );

    const result = await service.execute(request);
    const mcpResult = translateCoreResultToMcpContent(result);
    const payload = JSON.parse(mcpResult.content[0]?.text ?? "null") as unknown;

    expect(payload).toEqual({
      dryRun: true,
      sourcePath: "C:/project/backend.accdb",
      targetPath: "C:/project/backend.compacted.accdb",
      backupFirst: false,
      wouldReplaceSource: true,
      target: "backend",
    });
    expect(
      validateToolResult({
        toolName: "compact_repair",
        contract: resultContractForDispatchTool("compact_repair"),
        payload,
        policy: "enforce",
      }),
    ).toEqual({ ok: true });
  });
});
