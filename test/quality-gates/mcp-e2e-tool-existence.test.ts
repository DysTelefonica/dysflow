// Pinner that asserts every tool referenced by mcp-e2e.mjs exists in the
// CURRENT MCP tool registry. If a tool is renamed, hidden, or its
// schema drops a required param, the e2e battery would fail with
// "tool not found" or "missing required field" errors — and these
// failures would only surface in the 30-minute `node E2E_testing/mcp-e2e.mjs`
// run. This test catches the same regressions in <100ms by parsing the
// e2e source, extracting every record() call's `(area, tool)` pair,
// and asserting each tool name exists in `createDysflowMcpTools({})`.
//
// Why the registry call matters: `createDysflowMcpTools` is the
// production tool surface. If a tool is renamed, this test catches it
// before the e2e battery does. If a tool's schema is removed entirely,
// this test catches it. If a tool is moved to the hidden registry,
// this test catches it.
//
// What this test does NOT catch:
//   - Schema-level breaks (e.g. a param becomes optional). Those
//     surface as `expected:"error"` mismatches at runtime, not here.
//   - Wiring-level breaks in the harness. Pinned separately in
//     `mcp-e2e-suite-contracts.test.ts` (STOP-ON-FAIL, childPid reg).
//   - Runtime errors from Access (e.g. compile_vba mojibake). Pinned
//     separately in `mcp-e2e-compile-vba-mojibake-pin.test.ts`.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildHiddenToolRegistry } from "../../src/adapters/mcp/stdio-wrappers.js";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

const MCP_E2E_PATH = resolve(process.cwd(), "E2E_testing/mcp-e2e.mjs");

interface ParsedCall {
  area: string;
  tool: string;
  index: number;
}

function extractRecordCalls(source: string): ParsedCall[] {
  // Match every record(area, tool, ...) or record("area", "tool", ...)
  // call. Capture only the first two args (area, tool); we don't need
  // the rest. Greedy enough to span multi-line.
  const re =
    /record\(\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_][\w.]*))\s*,\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_][\w.]*))/g;
  const calls: ParsedCall[] = [];
  for (let m = re.exec(source); m !== null; m = re.exec(source)) {
    const area = m[1] ?? m[2] ?? m[3] ?? "";
    const tool = m[4] ?? m[5] ?? m[6] ?? "";
    calls.push({ area, tool, index: m.index });
  }
  return calls;
}

describe("mcp-e2e.mjs — every record() tool exists in createDysflowMcpTools({ services: #fix-e2e-tool-existence })", () => {
  const src = readFileSync(MCP_E2E_PATH, "utf8");
  const tools = createDysflowMcpTools({
    services: {
      vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
    },
  });
  const advertised = new Set(
    tools.filter((t) => !buildHiddenToolRegistry(tools).has(t.name)).map((t) => t.name),
  );
  const allKnown = new Set(tools.map((t) => t.name));

  it("extracts at least one record() call from mcp-e2e.mjs (sanity)", () => {
    const calls = extractRecordCalls(src);
    expect(calls.length, "no record() calls extracted — regex broken?").toBeGreaterThan(5);
  });

  it("every (area, tool) pair references a tool the e2e is allowed to advertise", () => {
    const calls = extractRecordCalls(src);
    const failures: { area: string; tool: string; index: number; reason: string }[] = [];

    for (const call of calls) {
      // Skip non-tool pseudo-rows: anything that starts with `dysflow_` is a
      // real MCP tool; anything else (e.g. `tools/list`, `lingering-access-check`,
      // `compile_vba:zombie-check`, `export_all:semantic-fields`) is either a
      // meta-tool or a synthetic row suffix.
      if (!call.tool.startsWith("dysflow_")) continue;
      if (!advertised.has(call.tool)) {
        failures.push({
          area: call.area,
          tool: call.tool,
          index: call.index,
          reason: advertised.has(call.tool)
            ? ""
            : `not in advertised tool surface (advertised: ${[...advertised].sort().join(", ")})`,
        });
      }
    }

    if (failures.length > 0) {
      const lines = failures
        .slice(0, 10)
        .map((f) => `  - idx=${f.index} ${f.area}/${f.tool}: ${f.reason}`);
      throw new Error(
        `${failures.length} e2e record() call(s) reference tools that are not in the advertised MCP tool surface:\n${lines.join("\n")}`,
      );
    }
    expect(failures).toEqual([]);
  });

  it("every (area, tool) pair references a tool that EXISTS in the full tool registry (even if hidden)", () => {
    // Stricter check: the tool must exist somewhere in the registry, even
    // if hidden. This catches "tool renamed and moved to hidden" or "tool
    // removed entirely" — both of which would be a battery-breaking change.
    const calls = extractRecordCalls(src);
    const failures: { tool: string; index: number }[] = [];

    for (const call of calls) {
      if (!call.tool.startsWith("dysflow_")) continue;
      if (!allKnown.has(call.tool)) {
        failures.push({ tool: call.tool, index: call.index });
      }
    }

    if (failures.length > 0) {
      const lines = failures.map((f) => `  - idx=${f.index} ${f.tool}`);
      throw new Error(
        `${failures.length} e2e record() call(s) reference tools that do not exist anywhere in the MCP tool registry:\n${lines.join("\n")}\nKnown tools: ${[...allKnown].sort().join(", ")}`,
      );
    }
    expect(failures).toEqual([]);
  });
});
