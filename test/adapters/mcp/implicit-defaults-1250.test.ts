import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools.js";
import { nodeLockFileSystem } from "../../../src/adapters/runner/node-lock-file-system.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import { successResult } from "../../../src/core/contracts/index.js";
import {
  buildMaintenanceRequest,
  buildQueryExecuteRequest,
} from "../../../src/core/mapping/access-query-request-mapper.js";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight.js";
import { AccessPowerShellRunner } from "../../../src/core/runner/access-runner.js";
import { commitFlagMetadataFor } from "../../../src/core/runtime/commit-flag-registry.js";

function makeBaseServices() {
  return {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  };
}

function tool(name: string) {
  const found = createDysflowMcpTools({
    services: makeBaseServices() as DysflowMcpServices,
  }).find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`${name} tool not found`);
  return found;
}

const noOpPreflight: AccessOperationPreflightCleanup = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

describe("implicit defaults safety (#1250)", () => {
  it.each(["export_modules", "export_all"])("%s advertises plan as its default", (name) => {
    expect(commitFlagMetadataFor(name)?.defaultBehavior).toBe("plan");
  });

  it("query_execute mode:write defaults to a surfaced plan intent", () => {
    expect(buildQueryExecuteRequest({ mode: "write", sql: "UPDATE T SET x = 1" })).toMatchObject({
      mode: "write",
      dryRun: true,
    });
  });

  it("list_procedures rejects an inline source whose VB_Name differs from module", async () => {
    const result = await tool("list_procedures").handler({
      module: "ZZZ_NonExistent_Module",
      source: 'Attribute VB_Name = "mdlCursor"\nOption Explicit\nPublic Sub Foo()\nEnd Sub\n',
    });

    expect(result).toMatchObject({ isError: true, error: { code: "MODULE_MISMATCH" } });
  });

  it("get_procedure accepts module.procedure and returns the canonical procedure", async () => {
    const result = await tool("get_procedure").handler({
      module: "mdlCursor",
      procedure: "mdlCursor.MouseCursor",
      source:
        'Attribute VB_Name = "mdlCursor"\nOption Explicit\nPublic Sub MouseCursor()\nEnd Sub\n',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({
      module: "mdlCursor",
      procedure: "MouseCursor",
    });
  });

  it("compact_repair leaves an omitted semantic target unresolved for runtime disambiguation", () => {
    expect(buildMaintenanceRequest("compact_repair", "write", {}, () => undefined).target).toBe(
      undefined,
    );
  });

  it("compact_repair refuses an ambiguous configured target and surfaces an explicit target", async () => {
    const runner = new AccessPowerShellRunner({
      executor: async () => ({
        exitCode: 0,
        stdout:
          'DYSFLOW_RESULT {"dryRun":true,"sourcePath":"C:/project/backend.accdb","targetPath":"C:/project/backend.compacted.accdb"}',
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

    const ambiguous = await runner.run(
      {
        kind: "query",
        request: { action: "compact_repair", mode: "write", sql: "", dryRun: true },
      },
      config,
    );
    expect(ambiguous).toMatchObject({
      ok: false,
      error: { code: "CONFIG_TARGET_AMBIGUOUS" },
    });

    const explicit = await runner.run(
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
    expect(explicit).toMatchObject({ ok: true, data: { target: "backend" } });
  });
});
