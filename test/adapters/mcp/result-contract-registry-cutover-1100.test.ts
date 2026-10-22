import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ALIAS_TOOL_NAMES } from "../../../src/adapters/mcp/alias-tools.js";
import { executableResultContractForTool } from "../../../src/adapters/mcp/contracts/executable-result-contract-registry.js";
import { registerMcpToolList } from "../../../src/adapters/mcp/dispatch.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

describe("executable result-contract registry cutover — #1100", () => {
  it("registers aliases with the same canonical contracts advertised by introspection", () => {
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({}) },
        queryService: { execute: async () => successResult({}) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
      },
    });
    for (const tool of tools.filter((entry) =>
      (ALIAS_TOOL_NAMES as ReadonlySet<string>).has(entry.name),
    )) {
      expect(tool.resultContract, tool.name).toBe(executableResultContractForTool(tool.name));
    }
  });

  it("removes the manual schema result registry and its fallback lookup", () => {
    const source = readFileSync(
      new URL("../../../src/adapters/mcp/schema-tool.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("TOOL_RESULT_CONTRACTS");
    expect(source).not.toMatch(/function\s+resultContractForTool\s*\(/);
    expect(source).not.toContain("ENVELOPE_ONLY_PASSTHROUGH");
  });

  it("refuses a synthetic advertised tool without an executable result contract", () => {
    expect(() =>
      registerMcpToolList([
        {
          name: "synthetic_missing_contract",
          description: "Synthetic contract-completeness probe.",
          handler: async () => ({
            content: [{ type: "text", text: "{}" }],
            isError: false,
            ok: true,
          }),
        },
      ]),
    ).toThrow(/synthetic_missing_contract.*executable result contract/i);
  });
});
