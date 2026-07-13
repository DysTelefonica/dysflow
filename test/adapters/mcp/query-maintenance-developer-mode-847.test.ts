/**
 * Issue #847 — developer-mode query-maintenance writes must EXECUTE, not
 * silently plan.
 *
 * Root cause: the `query-maintenance` dispatch branch built the forwarded
 * request from the raw caller `input` instead of `normalizedInput`, dropping
 * the #785 policy-driven `dryRun: false` injection. The write-gate (computed
 * on `normalizedInput`) treated the call as a real write, but the runner
 * received `dryRun: true` and only planned. The sibling `vba-sync` branch
 * already forwards `normalizedInput`; this suite pins the same contract for
 * the `query-maintenance` branch.
 *
 * Affected tools (route `query-maintenance` + risk `routine-dev-write`):
 *   link_tables, relink_tables, unlink_table, localize_backend_links.
 */

import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

/** Query service that records every forwarded maintenance request. */
class CapturingQueryService {
  public requests: Array<Record<string, unknown>> = [];
  async execute(request: unknown) {
    this.requests.push(request as Record<string, unknown>);
    return successResult({ rows: [] });
  }
}

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}
class FakeCleanupService {
  async cleanup() {
    return successResult({
      operationId: "op-fake",
      accessPid: null,
      status: "cleaned" as const,
      killed: [],
      refused: [],
      errors: [],
    });
  }
}
class FakeOrphanCleanupService {
  async listOrphans() {
    return successResult([]);
  }
  async cleanupOrphan() {
    return successResult({ killed: [], refused: [], errors: [] });
  }
}

function makeServices(queryService: CapturingQueryService) {
  return {
    vbaService: new FakeVbaService(),
    vbaSyncToolService: new FakeVbaService(),
    queryService,
    diagnosticsService: new FakeDiagnosticsService(),
    cleanupService: new FakeCleanupService(),
    orphanCleanupService: new FakeOrphanCleanupService(),
  };
}

function buildTools(
  queryService: CapturingQueryService,
  writeExecutionPolicy: "safe-by-default" | "developer",
) {
  return createDysflowMcpTools({
    services: makeServices(queryService),
    writes: true,
    writeExecutionPolicy,
  });
}

const MAINTENANCE_INPUTS: ReadonlyArray<{ name: string; input: Record<string, unknown> }> = [
  {
    name: "link_tables",
    input: { accessPath: "C:/project/front.accdb", backendPath: "C:/project/back.accdb" },
  },
  {
    name: "relink_tables",
    input: { accessPath: "C:/project/front.accdb", backendPath: "C:/project/back.accdb" },
  },
  {
    name: "unlink_table",
    input: { accessPath: "C:/project/front.accdb", tableName: "tbFoo" },
  },
  {
    name: "localize_backend_links",
    input: { accessPath: "C:/project/front.accdb", backendPath: "C:/project/back.accdb" },
  },
];

describe("#847 — developer mode: query-maintenance writes execute (dryRun:false forwarded)", () => {
  for (const { name, input } of MAINTENANCE_INPUTS) {
    it(`${name} without dryRun/apply forwards dryRun:false to the runner`, async () => {
      const queryService = new CapturingQueryService();
      const tools = buildTools(queryService, "developer");
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`${name} not registered`);

      await tool.handler(input);

      expect(queryService.requests).toHaveLength(1);
      // The write-gate let this through as a real write; the runner MUST
      // therefore receive an execute request, not a silent plan.
      expect(queryService.requests[0]).toMatchObject({ dryRun: false });
    });
  }
});

describe("#847 — safe-by-default mode: query-maintenance writes still plan (dryRun:true)", () => {
  for (const { name, input } of MAINTENANCE_INPUTS) {
    it(`${name} without dryRun/apply forwards dryRun:true`, async () => {
      const queryService = new CapturingQueryService();
      const tools = buildTools(queryService, "safe-by-default");
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`${name} not registered`);

      await tool.handler(input);

      expect(queryService.requests).toHaveLength(1);
      expect(queryService.requests[0]).toMatchObject({ dryRun: true });
    });
  }
});

describe("#847 — explicit caller intent wins over policy injection", () => {
  it("developer + link_tables + dryRun:true forwards dryRun:true (no policy override)", async () => {
    const queryService = new CapturingQueryService();
    const tools = buildTools(queryService, "developer");
    const tool = tools.find((candidate) => candidate.name === "link_tables");
    if (!tool) throw new Error("link_tables not registered");

    await tool.handler({
      accessPath: "C:/project/front.accdb",
      backendPath: "C:/project/back.accdb",
      dryRun: true,
    });

    expect(queryService.requests).toHaveLength(1);
    expect(queryService.requests[0]).toMatchObject({ dryRun: true });
  });
});
