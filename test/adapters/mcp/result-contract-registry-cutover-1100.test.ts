import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { registerMcpToolList } from "../../../src/adapters/mcp/dispatch.js";

describe("executable result-contract registry cutover — #1100", () => {
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
