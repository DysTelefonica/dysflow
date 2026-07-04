import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

/**
 * Phase 5 (issue #705 — `detect-dead-code`): `dysflow_detect_dead_code` is a
 * read-only tool. It MUST remain available regardless of the MCP write-gate
 * state — invoking it from `--disable-writes` runs must NOT return
 * `MCP_WRITES_DISABLED`, and the tool MUST appear in the registered
 * surface in both write-enabled and write-disabled modes.
 *
 * Modern read-only tools are intentionally registered outside
 * `dispatch-routes.ts` / `mcp-tool-registry.ts` so they stay reachable
 * for an audit pass while writes are otherwise frozen.
 */

function makeBaseServices(): DysflowMcpServices {
  return {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  };
}

describe("dysflow_detect_dead_code — read-only tools stay available when writes are disabled (#705)", () => {
  it("is registered AND the handler succeeds when the write gate is closed", async () => {
    const tools = createDysflowMcpTools(makeBaseServices(), false);
    const tool = tools.find((t) => t.name === "dysflow_detect_dead_code");
    expect(tool).toBeDefined();

    const result = await tool?.handler({
      scope: "binary",
      modules: {
        ModA: ["Option Explicit", "", "Private Sub UnusedProc()", "End Sub"].join("\r\n"),
      },
    });

    // No MCP_WRITES_DISABLED — the handler is read-only.
    const text = result?.content?.[0]?.text ?? "";
    expect(text).not.toContain("MCP_WRITES_DISABLED");

    expect(result?.isError).toBe(false);
    expect(result?.ok).toBe(true);

    const parsed = JSON.parse(text) as { findings: unknown[]; scannedModules: string[] };
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings.length).toBeGreaterThan(0);
    expect(parsed.scannedModules).toEqual(["ModA"]);
  });
});
