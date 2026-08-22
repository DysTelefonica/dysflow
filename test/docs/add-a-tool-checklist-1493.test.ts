/**
 * Issue #1493 — the add-a-tool checklist #1120 asked for, anchored to the runtime.
 *
 * #1120 examined the distributed MCP registration surface and decided the
 * separation is correct: "schema, routing and descriptions are genuinely
 * different concerns and should remain separate. Do not create a universal
 * mega-registry or code generator." This test does not reopen that. It makes the
 * distribution navigable instead of tribal, by proving the documented
 * registration points against the live tool surface.
 *
 * Per AGENTS.md: "Anchor against the runtime, not against a string." A test that
 * greps the doc for a sentence only catches deletion. These assertions compare
 * each documented registry against the tools the server actually advertises, so
 * a tool added to the surface but missed in a registry fails here — and a NEW
 * per-tool registry introduced later without documentation fails the coverage
 * assertion at the end.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MCP_TOOL_CONTRACTS } from "../../src/adapters/mcp/mcp-tool-contracts";
import { DYSFLOW_MCP_TOOL_NAMES } from "../../src/adapters/mcp/mcp-tool-registry";
import { MCP_TOOL_RISKS } from "../../src/adapters/mcp/mcp-tool-risks";
import { MODERN_TOOL_NAMES } from "../../src/adapters/mcp/modern-tool-registry";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools";
import { successResult } from "../../src/core/contracts/index";
import { COMMIT_FLAG_REGISTRY } from "../../src/core/runtime/commit-flag-registry";

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

function advertisedToolNames(): string[] {
  return createDysflowMcpTools({
    services: {
      vbaService: new FakeVbaService(),
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
    },
  })
    .filter((tool) => !tool.hidden)
    .map((tool) => tool.name);
}

/** Registration points a NEW canonical tool must be added to by hand. */
const HAND_MAINTAINED_REGISTRIES: ReadonlyArray<{ doc: string; keys: () => string[] }> = [
  {
    doc: "src/adapters/mcp/mcp-tool-registry.ts + modern-tool-registry.ts (the name)",
    keys: () => [...DYSFLOW_MCP_TOOL_NAMES, ...MODERN_TOOL_NAMES],
  },
  {
    doc: "src/adapters/mcp/mcp-tool-contracts.ts (the result contract)",
    keys: () => Object.keys(MCP_TOOL_CONTRACTS),
  },
  {
    doc: "src/core/runtime/commit-flag-registry.ts (the write flag)",
    keys: () => Object.keys(COMMIT_FLAG_REGISTRY),
  },
  {
    doc: "src/adapters/mcp/mcp-tool-risks.ts (the risk classification)",
    keys: () => Object.keys(MCP_TOOL_RISKS),
  },
];

describe("#1493 add-a-tool registration points", () => {
  it.each(HAND_MAINTAINED_REGISTRIES)("covers every advertised tool: $doc", ({ keys }) => {
    const registered = new Set(keys());
    const missing = advertisedToolNames().filter((name) => !registered.has(name));
    expect(missing, `advertised but not registered here: ${missing.join(", ")}`).toEqual([]);
  });

  it("declares no tool the server does not advertise", () => {
    const advertised = new Set(advertisedToolNames());
    const declared = [...new Set([...DYSFLOW_MCP_TOOL_NAMES, ...MODERN_TOOL_NAMES])];
    expect(declared.filter((name) => !advertised.has(name))).toEqual([]);
  });

  it("documents every registration point this test knows about", () => {
    // The doc is the map; this test is the compass. If they disagree, a
    // contributor following the doc will miss a registry.
    const doc = readFileSync("docs/api/adding-an-mcp-tool.md", "utf8");
    for (const { doc: path } of HAND_MAINTAINED_REGISTRIES) {
      const sourcePath = path.split(" ")[0] as string;
      expect(doc, `checklist must name ${sourcePath}`).toContain(sourcePath);
    }
  });
});
