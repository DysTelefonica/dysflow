import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, translateCoreResultToMcpContent } from "../../../src/adapters/mcp/tools";
import { failureResult, successResult, type OperationResult } from "../../../src/core/contracts/index";
import type { AccessDiagnosticsResult } from "../../../src/core/services/diagnostics-service";
import type { AccessQueryResult } from "../../../src/core/services/query-service";
import type { AccessVbaResult } from "../../../src/core/services/vba-service";

class FakeVbaService {
  public requests: unknown[] = [];
  constructor(private readonly result: OperationResult<AccessVbaResult>) {}
  async execute(request: unknown): Promise<OperationResult<AccessVbaResult>> {
    this.requests.push(request);
    return this.result;
  }
}

class FakeQueryService {
  public requests: unknown[] = [];
  constructor(private readonly result: OperationResult<AccessQueryResult>) {}
  async execute(request: unknown): Promise<OperationResult<AccessQueryResult>> {
    this.requests.push(request);
    return this.result;
  }
}

class FakeDiagnosticsService {
  public requests: unknown[] = [];
  constructor(private readonly result: OperationResult<AccessDiagnosticsResult>) {}
  async run(request: unknown): Promise<OperationResult<AccessDiagnosticsResult>> {
    this.requests.push(request);
    return this.result;
  }
}

describe("MCP tool registration over core services", () => {
  it("registers protocol-safe MCP tools that invoke the matching core services", async () => {
    const vba = new FakeVbaService(successResult({ returnValue: "refreshed" }, { durationMs: 7 }));
    const query = new FakeQueryService(successResult({ rows: [{ id: 1, name: "Ada" }] }, { durationMs: 5 }));
    const diagnostics = new FakeDiagnosticsService(
      successResult({ checks: [{ name: "access-db-path", ok: true, message: "configured" }] }, { durationMs: 3 }),
    );

    const tools = createDysflowMcpTools({ vbaService: vba, queryService: query, diagnosticsService: diagnostics });
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toEqual(["dysflow.vba.execute", "dysflow.query.execute", "dysflow.doctor", "dysflow.access.operations.list", "dysflow.access.cleanup"]);
    await expect(tools[0]?.handler({ moduleName: "Automation", procedureName: "Refresh", arguments: [2026] })).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ returnValue: "refreshed" }) }],
      isError: false,
    });
    await expect(tools[1]?.handler({ sql: "SELECT id, name FROM People", mode: "read" })).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ rows: [{ id: 1, name: "Ada" }] }) }],
      isError: false,
    });
    await expect(tools[2]?.handler({ includeEnvironment: true })).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ checks: [{ name: "access-db-path", ok: true, message: "configured" }] }) }],
      isError: false,
    });

    expect(vba.requests).toEqual([{ moduleName: "Automation", procedureName: "Refresh", arguments: [2026] }]);
    expect(query.requests).toEqual([{ sql: "SELECT id, name FROM People", mode: "read" }]);
    expect(diagnostics.requests).toEqual([{ includeEnvironment: true }]);
  });

  it("translates core failures to safe MCP errors without leaking diagnostics or protocol details", () => {
    const result = failureResult(
      { code: "RUNNER_FAILED", message: "PowerShell runner failed: password=[REDACTED]", retryable: false },
      { diagnostics: [{ level: "error", source: "powershell.stderr", message: "raw internal stack" }], durationMs: 11 },
    );

    expect(translateCoreResultToMcpContent(result)).toEqual({
      content: [{ type: "text", text: "RUNNER_FAILED: PowerShell runner failed: password=[REDACTED]" }],
      isError: true,
    });
  });
});
