import { describe, expect, it } from "vitest";
import type { DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import { createDysflowMcpTools, MODERN_TOOL_NAMES } from "../../../src/adapters/mcp/tools";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../../src/core/contracts/index";
import type {
  AccessOrphanCandidate,
  AccessOrphanCleanupResult,
} from "../../../src/core/operations/access-orphan-cleanup";

class FakeOrphanCleanupService {
  public listOrphansRequests: unknown[] = [];
  public cleanupOrphanRequests: unknown[] = [];
  constructor(
    private readonly listResult: readonly AccessOrphanCandidate[] = [],
    private readonly cleanupResult: OperationResult<AccessOrphanCleanupResult> = successResult({
      killed: [],
      refused: [],
      errors: [],
    }),
  ) {}
  async listOrphans(request: unknown): Promise<readonly AccessOrphanCandidate[]> {
    this.listOrphansRequests.push(request);
    return this.listResult;
  }
  async cleanupOrphan(request: unknown) {
    this.cleanupOrphanRequests.push(request);
    return this.cleanupResult;
  }
}

function makeBaseServices() {
  return {
    vbaService: {
      execute: async () => successResult({ returnValue: "ok" }),
    },
    queryService: {
      execute: async () => successResult({ rows: [] }),
    },
    diagnosticsService: {
      run: async () => successResult({ checks: [] }),
    },
  };
}

describe("dysflow_access_force_cleanup_orphaned tool", () => {
  it("is registered with the correct name and schema", () => {
    const fakeOrphan = new FakeOrphanCleanupService();
    const tools = createDysflowMcpTools({
      ...makeBaseServices(),
      orphanCleanupService: fakeOrphan,
    } as DysflowMcpServices);

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema).toMatchObject({
      type: "object",
      required: ["confirmPid"],
      additionalProperties: false,
      properties: {
        projectId: { type: "string" },
        accessPath: { type: "string" },
        confirmPid: { type: "number", minimum: 1 },
      },
    });
  });

  it("MODERN_TOOL_NAMES includes dysflow_access_force_cleanup_orphaned", () => {
    expect(MODERN_TOOL_NAMES).toContain("dysflow_access_force_cleanup_orphaned");
  });

  it("handler returns success when service returns success and schema is valid", async () => {
    const fakeOrphan = new FakeOrphanCleanupService(
      successResult([]),
      successResult({
        killed: [12345],
        refused: [],
        syntheticOperationId: "orphan-12345-000000",
        errors: [],
      }),
    );
    const tools = createDysflowMcpTools({
      ...makeBaseServices(),
      orphanCleanupService: fakeOrphan,
    } as DysflowMcpServices);

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({
      accessPath: "C:/project/app.accdb",
      confirmPid: 12345,
    });

    expect(result?.isError).toBe(false);
    expect(result?.content[0]?.text).toContain("12345");
    expect(fakeOrphan.cleanupOrphanRequests).toEqual([
      {
        accessPath: "C:/project/app.accdb",
        projectRoot: process.cwd(),
        confirmPid: 12345,
      },
    ]);
  });

  it("handler returns ORPHAN_CLEANUP_NOT_CONFIGURED when orphanCleanupService is undefined", async () => {
    const tools = createDysflowMcpTools(makeBaseServices() as DysflowMcpServices);

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({ accessPath: "C:/project/app.accdb", confirmPid: 12345 });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("ORPHAN_CLEANUP_NOT_CONFIGURED");
  });

  it("handler returns invalidInput when confirmPid is missing", async () => {
    const fakeOrphan = new FakeOrphanCleanupService();
    const tools = createDysflowMcpTools({
      ...makeBaseServices(),
      orphanCleanupService: fakeOrphan,
    } as DysflowMcpServices);

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({ accessPath: "C:/project/app.accdb" });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("MCP_INPUT_INVALID");
    expect(result?.content[0]?.text).toContain("confirmPid");
  });

  it("handler returns invalidInput when confirmPid is zero", async () => {
    const fakeOrphan = new FakeOrphanCleanupService();
    const tools = createDysflowMcpTools({
      ...makeBaseServices(),
      orphanCleanupService: fakeOrphan,
    } as DysflowMcpServices);

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({ accessPath: "C:/project/app.accdb", confirmPid: 0 });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("MCP_INPUT_INVALID");
  });

  it("handler returns invalidInput when confirmPid is negative", async () => {
    const fakeOrphan = new FakeOrphanCleanupService();
    const tools = createDysflowMcpTools({
      ...makeBaseServices(),
      orphanCleanupService: fakeOrphan,
    } as DysflowMcpServices);

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({ accessPath: "C:/project/app.accdb", confirmPid: -1 });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("MCP_INPUT_INVALID");
  });

  it("handler returns invalidInput when confirmPid is not a number", async () => {
    const fakeOrphan = new FakeOrphanCleanupService();
    const tools = createDysflowMcpTools({
      ...makeBaseServices(),
      orphanCleanupService: fakeOrphan,
    } as DysflowMcpServices);

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({
      accessPath: "C:/project/app.accdb",
      confirmPid: "not-a-number",
    });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("MCP_INPUT_INVALID");
  });

  it("handler propagates service failure result as McpToolResult with isError true", async () => {
    const fakeOrphan = new FakeOrphanCleanupService(
      successResult([]),
      failureResult(
        createDysflowError(
          "ORPHAN_CLEANUP_NOT_HEADLESS",
          "Refused to kill PID 12345: window handle is 0x00112233, expected 0 (headless).",
        ),
      ),
    );
    const tools = createDysflowMcpTools({
      ...makeBaseServices(),
      orphanCleanupService: fakeOrphan,
    } as DysflowMcpServices);

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({
      accessPath: "C:/project/app.accdb",
      confirmPid: 12345,
    });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("ORPHAN_CLEANUP_NOT_HEADLESS");
  });

  it("handler returns ORPHAN_CLEANUP_PATH_UNRESOLVED when accessPath is missing", async () => {
    const fakeOrphan = new FakeOrphanCleanupService();
    const tools = createDysflowMcpTools({
      ...makeBaseServices(),
      orphanCleanupService: fakeOrphan,
    } as DysflowMcpServices);

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({ confirmPid: 12345 });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("ORPHAN_CLEANUP_PATH_UNRESOLVED");
  });
});
