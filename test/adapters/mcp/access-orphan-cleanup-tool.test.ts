import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDynamicServices } from "../../../src/adapters/mcp/stdio.js";
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
    private readonly listResult: OperationResult<AccessOrphanCandidate[]> = successResult([]),
    private readonly cleanupResult: OperationResult<AccessOrphanCleanupResult> = successResult({
      killed: [],
      refused: [],
      errors: [],
    }),
  ) {}
  async listOrphans(request: unknown): Promise<OperationResult<AccessOrphanCandidate[]>> {
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

function resolveAccessContext(accessPath = "C:/project/app.accdb", projectRoot = process.cwd()) {
  return async () => successResult({ accessPath, projectRoot });
}

describe("dysflow_access_force_cleanup_orphaned tool", () => {
  it("is registered with the correct name and schema", () => {
    const fakeOrphan = new FakeOrphanCleanupService();
    const tools = createDysflowMcpTools(
      {
        ...makeBaseServices(),
        orphanCleanupService: fakeOrphan,
      } as DysflowMcpServices,
      false,
      undefined,
      process.env,
      undefined,
      resolveAccessContext(),
    );

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema).toMatchObject({
      type: "object",
      required: [],
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
    const tools = createDysflowMcpTools(
      {
        ...makeBaseServices(),
        orphanCleanupService: fakeOrphan,
      } as DysflowMcpServices,
      true,
      undefined,
      process.env,
      undefined,
      resolveAccessContext(),
    );

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

  it("handler blocks confirmed cleanup when writes are disabled", async () => {
    const fakeOrphan = new FakeOrphanCleanupService(
      successResult([]),
      successResult({
        killed: [12345],
        refused: [],
        syntheticOperationId: "orphan-12345-000000",
        errors: [],
      }),
    );
    const tools = createDysflowMcpTools(
      {
        ...makeBaseServices(),
        orphanCleanupService: fakeOrphan,
      } as DysflowMcpServices,
      false,
      undefined,
      process.env,
      undefined,
      resolveAccessContext(),
    );

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({
      accessPath: "C:/project/app.accdb",
      confirmPid: 12345,
    });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(fakeOrphan.cleanupOrphanRequests).toEqual([]);
  });

  it("handler returns ORPHAN_CLEANUP_NOT_CONFIGURED when orphanCleanupService is undefined", async () => {
    const tools = createDysflowMcpTools(
      makeBaseServices() as DysflowMcpServices,
      false,
      undefined,
      process.env,
      undefined,
      resolveAccessContext(),
    );

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({ accessPath: "C:/project/app.accdb", confirmPid: 12345 });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("ORPHAN_CLEANUP_NOT_CONFIGURED");
  });

  it("handler lists orphan candidates when confirmPid is missing", async () => {
    const fakeOrphan = new FakeOrphanCleanupService(
      successResult([
        {
          pid: 12345,
          accessPath: "C:/project/app.accdb",
          startTime: "2026-06-08T10:00:00.000Z",
          mainWindowHandle: 0,
        },
      ]),
    );
    const tools = createDysflowMcpTools(
      {
        ...makeBaseServices(),
        orphanCleanupService: fakeOrphan,
      } as DysflowMcpServices,
      false,
      undefined,
      process.env,
      undefined,
      resolveAccessContext(),
    );

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({ accessPath: "C:/project/app.accdb" });

    expect(result?.isError).toBe(false);
    expect(result?.content[0]?.text).toContain("12345");
    expect(fakeOrphan.listOrphansRequests).toEqual([
      { accessPath: "C:/project/app.accdb", projectRoot: process.cwd() },
    ]);
    expect(fakeOrphan.cleanupOrphanRequests).toEqual([]);
  });

  it("handler lists orphan candidates when writes are enabled and confirmPid is missing", async () => {
    const fakeOrphan = new FakeOrphanCleanupService(
      successResult([
        {
          pid: 12345,
          accessPath: "C:/project/app.accdb",
          startTime: "2026-06-08T10:00:00.000Z",
          mainWindowHandle: 0,
        },
      ]),
    );
    const tools = createDysflowMcpTools(
      {
        ...makeBaseServices(),
        orphanCleanupService: fakeOrphan,
      } as DysflowMcpServices,
      true,
      undefined,
      process.env,
      undefined,
      resolveAccessContext(),
    );

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({ accessPath: "C:/project/app.accdb" });

    expect(result?.isError).toBe(false);
    expect(result?.content[0]?.text).toContain("12345");
    expect(fakeOrphan.listOrphansRequests).toEqual([
      { accessPath: "C:/project/app.accdb", projectRoot: process.cwd() },
    ]);
    expect(fakeOrphan.cleanupOrphanRequests).toEqual([]);
  });

  it("handler returns invalidInput when confirmPid is zero", async () => {
    const fakeOrphan = new FakeOrphanCleanupService();
    const tools = createDysflowMcpTools(
      {
        ...makeBaseServices(),
        orphanCleanupService: fakeOrphan,
      } as DysflowMcpServices,
      false,
      undefined,
      process.env,
      undefined,
      resolveAccessContext(),
    );

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({ accessPath: "C:/project/app.accdb", confirmPid: 0 });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("MCP_INPUT_INVALID");
  });

  it("handler returns invalidInput when confirmPid is negative", async () => {
    const fakeOrphan = new FakeOrphanCleanupService();
    const tools = createDysflowMcpTools(
      {
        ...makeBaseServices(),
        orphanCleanupService: fakeOrphan,
      } as DysflowMcpServices,
      false,
      undefined,
      process.env,
      undefined,
      resolveAccessContext(),
    );

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({ accessPath: "C:/project/app.accdb", confirmPid: -1 });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("MCP_INPUT_INVALID");
  });

  it("handler returns invalidInput when confirmPid is not a number", async () => {
    const fakeOrphan = new FakeOrphanCleanupService();
    const tools = createDysflowMcpTools(
      {
        ...makeBaseServices(),
        orphanCleanupService: fakeOrphan,
      } as DysflowMcpServices,
      false,
      undefined,
      process.env,
      undefined,
      resolveAccessContext(),
    );

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
    const tools = createDysflowMcpTools(
      {
        ...makeBaseServices(),
        orphanCleanupService: fakeOrphan,
      } as DysflowMcpServices,
      true,
      undefined,
      process.env,
      undefined,
      resolveAccessContext(),
    );

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({
      accessPath: "C:/project/app.accdb",
      confirmPid: 12345,
    });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("ORPHAN_CLEANUP_NOT_HEADLESS");
  });

  it("handler propagates listOrphans failure as McpToolResult with isError true", async () => {
    const fakeOrphan = new FakeOrphanCleanupService(
      failureResult(createDysflowError("PROCESS_SCAN_FAILED", "Failed to scan processes")),
    );
    const tools = createDysflowMcpTools(
      {
        ...makeBaseServices(),
        orphanCleanupService: fakeOrphan,
      } as DysflowMcpServices,
      false,
      undefined,
      process.env,
      undefined,
      resolveAccessContext(),
    );

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({ accessPath: "C:/project/app.accdb" });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("PROCESS_SCAN_FAILED");
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

  it("handler uses resolved project config accessPath when accessPath is omitted", async () => {
    const fakeOrphan = new FakeOrphanCleanupService();
    const tools = createDysflowMcpTools(
      {
        ...makeBaseServices(),
        orphanCleanupService: fakeOrphan,
      } as DysflowMcpServices,
      true,
      undefined,
      process.env,
      undefined,
      resolveAccessContext("C:/repo/default.accdb", "C:/repo"),
    );

    const tool = tools.find((t) => t.name === "dysflow_access_force_cleanup_orphaned");
    const result = await tool?.handler({ projectId: "dysflow", confirmPid: 12345 });

    expect(result?.isError).toBe(false);
    expect(fakeOrphan.cleanupOrphanRequests).toEqual([
      {
        accessPath: "C:/repo/default.accdb",
        projectRoot: "C:/repo",
        confirmPid: 12345,
      },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELTA-005 (mcp-reliability-fix) — listOrphans returns failureResult, never throws
// ─────────────────────────────────────────────────────────────────────────────

describe("DELTA-005 — orphanCleanupService.listOrphans returns failureResult on resolveService failure, not throw", () => {
  it("returns failureResult with ORPHAN_CLEANUP_SERVICE_UNAVAILABLE when resolveService fails", async () => {
    const services = createDynamicServices(undefined, {
      code: "STARTUP_ERR",
      message: "no startup config available",
      retryable: false,
    });
    // Trigger listOrphans with an empty input that has no project config —
    // resolveService falls back to the startup error path.
    const result = await services.orphanCleanupService?.listOrphans({});
    expect(result).toBeDefined();
    expect(result?.ok).toBe(false);
    if (result && !result.ok) {
      // Must NOT be a thrown Error — the wrapper MUST return failureResult
      // mirroring the cleanupOrphan pattern.
      expect(result.error.message).toContain("no startup config available");
    }
  });

  it("returns failureResult with SERVICE_UNAVAILABLE when orphanCleanupService is undefined in resolved config", async () => {
    // Build a custom service factory that returns services WITHOUT
    // orphanCleanupService — the wrapper MUST return failureResult, not throw.
    // We need a real on-disk accessPath because resolveService enforces
    // existsSync before delegating to the factory.
    const root = mkdtempSync(join(tmpdir(), "dysflow-orphan-undefined-"));
    const frontend = join(root, "front.accdb");
    writeFileSync(frontend, "", "utf8");
    mkdirSync(join(root, ".dysflow"), { recursive: true });

    const services = createDynamicServices(undefined, undefined, {
      cwd: root,
      env: {},
      serviceFactory: () => {
        // Intentionally do NOT set orphanCleanupService — it is undefined.
        return makeBaseServices() as DysflowMcpServices;
      },
    });
    const result = await services.orphanCleanupService?.listOrphans({ accessPath: frontend });
    expect(result).toBeDefined();
    expect(result?.ok).toBe(false);
    if (result && !result.ok) {
      expect(result.error.message).toMatch(/not available/i);
      expect(result.error.code).toBe("SERVICE_UNAVAILABLE");
    }
  });
});
