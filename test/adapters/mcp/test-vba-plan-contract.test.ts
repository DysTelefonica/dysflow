import { describe, expect, it } from "vitest";
import { resultContractForDispatchTool } from "../../../src/adapters/mcp/contracts/dispatch-result-contracts";
import { validateToolResult } from "../../../src/adapters/mcp/contracts/result-validation";

describe("test_vba plan-mode produces a contract-valid result", () => {
  it("accepts the runtime plan returned for a non-empty proceduresJson", () => {
    const payload = {
      dryRun: true,
      willExecute: false,
      willModifyAccess: false,
      plan: {
        procedureName: ["existing_test_proc"],
        proceduresCount: 1,
        warnings: [],
        errors: [],
      },
    };

    expect(
      validateToolResult({
        toolName: "test_vba",
        contract: resultContractForDispatchTool("test_vba"),
        payload,
        policy: "enforce",
      }),
    ).toEqual({ ok: true });
  });
});
