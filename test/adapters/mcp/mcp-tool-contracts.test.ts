import { describe, expect, it } from "vitest";
import {
  getMcpToolContract,
  MCP_TOOL_CONTRACTS,
} from "../../../src/adapters/mcp/mcp-tool-contracts";
import { createDysflowMcpTools, MODERN_TOOL_NAMES } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}
class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

describe("MCP tool contract metadata", () => {
  it("centralizes modern and legacy cleanup write-gate metadata", () => {
    expect(getMcpToolContract("dysflow_access_cleanup")).toMatchObject({
      access: "conditional-write",
      writeGate: "conditional",
    });
    expect(getMcpToolContract("cleanup_access_operation")).toMatchObject(
      getMcpToolContract("dysflow_access_cleanup"),
    );
  });

  it("classifies modern query execution as read/write with dry-run protection", () => {
    expect(getMcpToolContract("dysflow_query_execute")).toMatchObject({
      access: "read-write",
      writeGate: "conditional",
      dryRunDefault: true,
    });
  });

  it("reclassifies run_vba as conditional-write honoring the allowlist/dryRun gate (PR1a #621)", () => {
    // #777 (Opción A cont.) — only `run_vba` survives; the legacy
    // `dysflow_vba_execute` contract was folded into `aliasContracts.run_vba`.
    expect(getMcpToolContract("run_vba")).toMatchObject({
      access: "conditional-write",
      writeGate: "conditional",
    });
    const summary = getMcpToolContract("run_vba").summary;
    expect(summary.toLowerCase()).toContain("allowlist");
    expect(summary.toLowerCase()).toContain("dryrun");
  });

  it("reclassifies test_vba contract metadata to conditional-write (PR1a #621, runtime gate deferred to PR1b)", () => {
    expect(getMcpToolContract("test_vba")).toMatchObject({
      access: "conditional-write",
      writeGate: "conditional",
    });
    const summary = getMcpToolContract("test_vba").summary;
    expect(summary.toLowerCase()).toContain("allowlist");
  });

  it("defines contract metadata for every modern tool", () => {
    for (const toolName of MODERN_TOOL_NAMES) {
      expect(getMcpToolContract(toolName), `${toolName} contract`).toMatchObject({
        access: expect.any(String),
        writeGate: expect.any(String),
        summary: expect.stringContaining("MCP contract"),
      });
    }
  });

  it("advertises each modern tool contract in its description", () => {
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(),
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
    });

    for (const toolName of MODERN_TOOL_NAMES) {
      const advertised = tools.find((tool) => tool.name === toolName);
      expect(advertised?.description, `${toolName} description`).toContain(
        MCP_TOOL_CONTRACTS[toolName].summary,
      );
    }
  });

  it("advertises modern tool safety footguns and key arguments (#593 + PR1a #621)", () => {
    const descriptions = modernToolDescriptions();

    // #777 (Opción A cont.) — `dysflow_vba_execute` was REMOVED and its
    // alias `run_vba` (registered in alias-tools.ts) is NOT in
    // `MODERN_TOOL_NAMES` anymore. The `run_vba` description assertions
    // are removed — the modern-tool safety footguns contract for
    // `run_vba` is covered by the canonical-handlers test instead.

    expect(descriptions.dysflow_query_execute).toContain('mode: "read"');
    expect(descriptions.dysflow_query_execute).toContain('mode: "write"');
    expect(descriptions.dysflow_query_execute).toContain("dryRun");
    expect(descriptions.dysflow_query_execute).toContain("apply");
    expect(descriptions.dysflow_query_execute).toContain("MCP_WRITES_DISABLED");

    expect(descriptions.dysflow_doctor).toContain("projectId");
    expect(descriptions.dysflow_doctor).toContain("includeEnvironment");
    expect(descriptions.dysflow_doctor).toContain("accessPath");

    expect(descriptions.dysflow_access_operations_list).toContain("operationId");
    expect(descriptions.dysflow_access_operations_list).toContain("PID");
    expect(descriptions.dysflow_access_operations_list).toContain("read-only");

    expect(descriptions.dysflow_access_cleanup).toContain("operationId");
    expect(descriptions.dysflow_access_cleanup).toContain("force: true");
    expect(descriptions.dysflow_access_cleanup).toContain("MCP_WRITES_DISABLED");
    expect(descriptions.dysflow_access_cleanup).toContain("kills nothing");

    expect(descriptions.dysflow_access_force_cleanup_orphaned).toContain("confirmPid");
    expect(descriptions.dysflow_access_force_cleanup_orphaned).toContain("list");
    expect(descriptions.dysflow_access_force_cleanup_orphaned).toContain("headless");
    expect(descriptions.dysflow_access_force_cleanup_orphaned).toContain("MCP_WRITES_DISABLED");
  });
});

function modernToolDescriptions() {
  const tools = createDysflowMcpTools({
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  });

  return Object.fromEntries(
    MODERN_TOOL_NAMES.map((toolName) => {
      const tool = tools.find((candidate) => candidate.name === toolName);
      expect(tool, `${toolName} must be advertised`).toBeDefined();
      return [toolName, tool?.description ?? ""];
    }),
  ) as Record<(typeof MODERN_TOOL_NAMES)[number], string>;
}
