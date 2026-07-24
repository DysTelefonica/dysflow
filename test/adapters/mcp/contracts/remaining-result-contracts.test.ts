import { describe, expect, it } from "vitest";

import {
  REMAINING_RESULT_CONTRACTS,
  remainingResultContractForTool,
} from "../../../../src/adapters/mcp/contracts/remaining-result-contracts.js";
import { MODERN_ANALYSIS_TOOL_NAMES } from "../../../../src/adapters/mcp/tools.js";

describe("remaining executable result contracts (#1099)", () => {
  it("uses the executable registry itself as the single ownership source", () => {
    expect(Object.keys(REMAINING_RESULT_CONTRACTS).sort()).toEqual(
      [...MODERN_ANALYSIS_TOOL_NAMES].sort(),
    );
    for (const [name, contract] of Object.entries(REMAINING_RESULT_CONTRACTS)) {
      expect(remainingResultContractForTool(name), name).toBe(contract);
    }
  });

  it("validates representative analysis, catalog, manifest and lint payloads", () => {
    const fixtures: Record<string, object> = {
      list_procedures: {
        module: "ModOrders",
        procedures: [{ name: "LoadOrder", kind: "Sub", visibility: "Public", line: 10 }],
      },
      get_procedure: {
        module: "ModOrders",
        procedure: "LoadOrder",
        startLine: 10,
        endLine: 20,
        body: "Public Sub LoadOrder()\nEnd Sub",
      },
      find_references: {
        symbol: "LoadOrder",
        scope: "source",
        references: [],
        totalCount: 0,
        truncated: false,
        nextOffset: null,
      },
      detect_dead_code: {
        scope: "source",
        scannedModules: [],
        scannedAt: "2026-07-24T00:00:00.000Z",
        findings: [],
        summary: { total: 0, low: 0, med: 0, high: 0 },
      },
      validate_manifest: {
        valid: true,
        errors: [],
        warnings: [],
        invalid: [],
        summary: {
          totalTests: 0,
          validTests: 0,
          errorCount: 0,
          warningCount: 0,
          invalidCount: 0,
        },
      },
      lint_module: {
        module: "ModOrders",
        rules: [],
        isClean: true,
        diagnostics: {},
        flatDiagnostics: [],
        summary: { errors: 0, warnings: 0 },
      },
    };

    for (const [name, payload] of Object.entries(fixtures)) {
      const contract = remainingResultContractForTool(name);
      expect(contract?.kind, name).toBe("dataSchema");
      if (contract?.kind === "dataSchema") {
        expect(contract.schema.safeParse(payload).success, name).toBe(true);
      }
    }
  });
});
