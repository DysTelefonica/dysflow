import { describe, expect, it } from "vitest";
import { resultContractForDispatchTool } from "../../../src/adapters/mcp/contracts/dispatch-result-contracts";
import { validateToolResult } from "../../../src/adapters/mcp/contracts/result-validation";

const preSync = {
  ok: true,
  missingInBinary: [],
  missingInSource: [],
  actionable: { total: 0, sourceNewer: 0, binaryNewer: 0, bothChanged: 0 },
  nonActionable: { total: 0 },
  hasFunctionalDifferences: false,
  recommendedAction: "none",
  recommendation: "none",
};

describe("sync_binary plan-mode produces a contract-valid result", () => {
  it.each([[["Anexo"]], [[]]])("accepts apply:false with moduleNames=%j", (moduleNames) => {
    const payload = {
      ok: true,
      dryRun: true,
      preSync,
      plan: {
        toImport: moduleNames,
        toExport: [],
        skipped: [],
        totalActionable: moduleNames.length,
      },
      execution: null,
      postSync: null,
      recommendation: moduleNames.length === 0 ? "no_action" : "import_to_binary",
    };

    expect(
      validateToolResult({
        toolName: "sync_binary",
        contract: resultContractForDispatchTool("sync_binary"),
        payload,
        policy: "enforce",
      }),
    ).toEqual({ ok: true });
  });
});
