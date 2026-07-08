import { describe, expect, it } from "vitest";
import { getMcpToolContract } from "../../../src/adapters/mcp/mcp-tool-contracts";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

/**
 * Phase 3 (issue #705 — `detect-dead-code`): `detect_dead_code`
 * is a read-only tool. Its contract MUST be `{ access: "read-only",
 * writeGate: "none" }` and this MUST be reflected both in
 * `getMcpToolContract("detect_dead_code")` and in the tool
 * description so consumers can introspect the gate without calling the
 * tool.
 */

function makeBaseServices() {
  return {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  };
}

describe("detect_dead_code — read-only contract (issue #705)", () => {
  it("returns { access: 'read-only', writeGate: 'none' } from getMcpToolContract", () => {
    const contract = getMcpToolContract("detect_dead_code");
    expect(contract.access).toBe("read-only");
    expect(contract.writeGate).toBe("none");
    // Summary must surface the read-only posture so the contract consumer
    // (and humans grep'ing the description) can see it.
    expect(contract.summary.toLowerCase()).toContain("read-only");
  });

  it("description advertises the read-only contract summary", () => {
    const tools = createDysflowMcpTools({ services: makeBaseServices() });
    const tool = tools.find((t) => t.name === "detect_dead_code");
    expect(tool).toBeDefined();
    expect(tool?.description ?? "").toContain(getMcpToolContract("detect_dead_code").summary);
  });
});
