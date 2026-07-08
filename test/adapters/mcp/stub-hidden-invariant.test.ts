/**
 * Policy test: ZERO hidden tools, permanently.
 *
 * The user policy (#510 + explicit directive) is that no MCP tool may be hidden.
 * Hidden state still derives from a single source of truth — the parity registry
 * (`tool-parity-registry.ts`), preserving #433 — but that derived set MUST always
 * be empty:
 *
 *   - `pendingToolNames()` is empty,
 *   - no registered tool has `hidden === true`,
 *   - tools/list projects every registered tool.
 *
 * This stays a real CI gate: re-introducing a hidden/pending tool turns it red.
 * It works at the public port (registered tool objects + exported registry
 * helpers), not at implementation internals.
 */
import { describe, expect, it } from "vitest";
import {
  isHiddenStubTool,
  pendingToolNames,
  TOOL_PARITY_REGISTRY,
} from "../../../src/adapters/mcp/tool-parity-registry";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
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

describe("zero-hidden-tools policy — registry is the single source of truth (#433, #510)", () => {
  const services = {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  };

  it("pendingToolNames() is empty — no tool may be pending", () => {
    expect([...pendingToolNames()]).toEqual([]);
  });

  it("no registry entry has status 'pending' and isHiddenStubTool is false for every tool", () => {
    for (const entry of TOOL_PARITY_REGISTRY) {
      expect(entry.status, `${entry.name} must be implemented`).toBe("implemented");
      expect(isHiddenStubTool(entry.name), `${entry.name} must not be a hidden stub`).toBe(false);
    }
  });

  it("no registered tool is hidden — tools/list projects every tool", () => {
    const tools = createDysflowMcpTools({
      services: services,
      writes: true,
    });

    const hidden = tools.filter((t) => t.hidden === true).map((t) => t.name);
    expect(hidden, "no registered tool may be hidden").toEqual([]);

    // Every registered tool is visible (the tools/list projection includes them all).
    const visible = tools.filter((t) => t.hidden !== true);
    expect(visible.length).toBe(tools.length);
  });
});
