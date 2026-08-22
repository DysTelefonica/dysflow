import { describe, expect, it, vi } from "vitest";
import { createBootstrapTool } from "../../../src/adapters/mcp/bootstrap-tool.js";
import { MCP_TOOL_CONTRACTS } from "../../../src/adapters/mcp/mcp-tool-contracts.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

class FakeVbaService {
  execute = vi.fn(async () => successResult({ returnValue: "ok" }));
}

class FakeQueryService {
  execute = vi.fn(async () => successResult({ rows: [] }));
}

class FakeDiagnosticsService {
  run = vi.fn(async () => successResult({ checks: [] }));
}

function makeServices() {
  return {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
    vbaSyncToolService: {
      execute: vi.fn(async () => {
        throw new Error("bootstrap must not open Access or spawn PowerShell");
      }),
    },
  };
}

function makeBootstrapTool() {
  return createBootstrapTool({
    writesEnabled: true,
    writeAccessResolver: undefined,
    allowedProcedures: undefined,
    projectId: "project-1484",
    allowWrites: true,
    adapterVersion: "2.37.5-test",
    writeExecutionPolicy: "safe-by-default",
  });
}

async function callBootstrap(input: unknown = {}) {
  const result = await makeBootstrapTool().handler(input);
  return JSON.parse(result.content[0]?.text ?? "{}");
}

describe("bootstrap MCP tool (#1484)", () => {
  it("returns every first-call field and omits heavy capability blocks", async () => {
    const payload = await callBootstrap();

    expect(payload).toMatchObject({
      adapterVersion: "2.37.5-test",
      surface: "stdio",
      writesProcess: { enabled: true, resolverConfigured: false },
      writesProject: { allowWrites: true },
      writeExecutionPolicy: "safe-by-default",
      toolsVisible: expect.any(Number),
      preferredAgentWorkflows: {
        tools: { count: expect.any(Number) },
        bootstrap: expect.arrayContaining(["bootstrap", "get_capabilities"]),
        sync: ["sync_binary"],
      },
      humanCompilePending: false,
    });
    expect(payload).not.toHaveProperty("projectConfig");
    expect(payload).not.toHaveProperty("sharedBlockSupport");
    expect(payload).not.toHaveProperty("effectiveDryRunDefault");
    expect(payload).not.toHaveProperty("migrationNotes");
    expect(payload).not.toHaveProperty("documentationBundle");
    expect(payload).not.toHaveProperty("tools");
  });

  it("narrows preferredAgentWorkflows when phase is supplied", async () => {
    const payload = await callBootstrap({ phase: "tests" });

    expect(payload.preferredAgentWorkflows).toEqual({
      tools: { count: payload.toolsVisible },
      tests: ["validate_manifest", "test_vba"],
    });
  });

  it('declares access: "read-only" in the MCP contract', () => {
    expect(MCP_TOOL_CONTRACTS.bootstrap).toMatchObject({ access: "read-only", writeGate: "none" });
  });

  it("is registered and succeeds when writes are disabled", async () => {
    const tools = createDysflowMcpTools({ services: makeServices(), writes: false });
    const bootstrap = tools.find((tool) => tool.name === "bootstrap");

    expect(bootstrap).toBeDefined();
    const result = await bootstrap?.handler({});
    expect(result?.isError).toBe(false);
  });

  it("does not open Access", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({ services, writes: false });
    const bootstrap = tools.find((tool) => tool.name === "bootstrap");

    await bootstrap?.handler({ cwd: "C:/repo", phase: "bootstrap" });

    expect(services.vbaService.execute).not.toHaveBeenCalled();
    expect(services.queryService.execute).not.toHaveBeenCalled();
    expect(services.vbaSyncToolService.execute).not.toHaveBeenCalled();
  });

  it("does not spawn PowerShell through the Access-backed service path", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({ services, writes: true });
    const bootstrap = tools.find((tool) => tool.name === "bootstrap");

    const dryRunResult = await bootstrap?.handler({ dryRun: true });
    const applyResult = await bootstrap?.handler({ apply: true });

    expect(dryRunResult?.isError).toBe(true);
    expect(applyResult?.isError).toBe(true);
    expect(services.vbaSyncToolService.execute).not.toHaveBeenCalled();
  });
});
