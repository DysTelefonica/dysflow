import { describe, expect, it } from "vitest";
import { AGENT_WORKFLOW_PHASES } from "../../../src/adapters/mcp/agent-workflow-registry.js";
import { MCP_TOOL_CONTRACTS } from "../../../src/adapters/mcp/mcp-tool-contracts.js";
import { buildSurfaceProfileCatalog } from "../../../src/adapters/mcp/surface-profile-catalog.js";
import { SAMPLED_WORKFLOW_PHASES } from "../../../src/core/telemetry/surface-profile-evidence.js";

/**
 * Issue #1459 — the evidence analyzer lives in core and cannot import the
 * adapter's workflow registry, so it declares its own phase list. That is a
 * second copy, and a second copy drifts. These tests anchor it against the live
 * runtime rather than against a literal, so adding or renaming a workflow phase
 * fails here instead of silently producing a coverage report that under-counts.
 */
describe("surface-profile catalog projection (#1459)", () => {
  it("samples exactly the phases the runtime workflow registry declares", () => {
    expect([...SAMPLED_WORKFLOW_PHASES].sort()).toEqual([...AGENT_WORKFLOW_PHASES].sort());
  });

  it("projects every advertised tool with at least one phase", () => {
    const catalog = buildSurfaceProfileCatalog();

    expect(Object.keys(catalog).length).toBeGreaterThan(0);
    for (const [name, entry] of Object.entries(catalog)) {
      expect(entry.phases.length, `${name} must carry at least one phase`).toBeGreaterThan(0);
    }
  });

  it("derives write capability from declared access, not from observed usage", () => {
    const catalog = buildSurfaceProfileCatalog();

    const writeTool = Object.entries(MCP_TOOL_CONTRACTS).find(
      ([name, contract]) => contract.access !== "read-only" && catalog[name] !== undefined,
    );
    const readTool = Object.entries(MCP_TOOL_CONTRACTS).find(
      ([name, contract]) => contract.access === "read-only" && catalog[name] !== undefined,
    );

    expect(writeTool, "expected at least one write-class tool in the catalog").toBeDefined();
    expect(readTool, "expected at least one read-only tool in the catalog").toBeDefined();
    if (writeTool !== undefined) expect(catalog[writeTool[0]]?.writeCapable).toBe(true);
    if (readTool !== undefined) expect(catalog[readTool[0]]?.writeCapable).toBe(false);
  });
});
