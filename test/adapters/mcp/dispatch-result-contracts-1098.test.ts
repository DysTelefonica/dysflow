import { describe, expect, it } from "vitest";
import { ALIAS_TOOL_NAME_LIST } from "../../../src/adapters/mcp/alias-tools.js";
import {
  deriveDispatchResultContract,
  resultContractForDispatchTool,
  resultContractForToolAlias,
} from "../../../src/adapters/mcp/contracts/dispatch-result-contracts.js";
import {
  type GeneratedDispatchToolName,
  MCP_TOOL_ROUTES,
} from "../../../src/adapters/mcp/dispatch-routes.js";

describe("dispatch-family executable result contracts — #1098", () => {
  it("derives a contract for every generated route without a name fallback", () => {
    for (const [name, route] of Object.entries(MCP_TOOL_ROUTES)) {
      const derived = deriveDispatchResultContract(route.resultFamily);
      expect(derived, name).toBe(resultContractForDispatchTool(name as GeneratedDispatchToolName));
      expect(derived.kind, name).toBe("dataSchema");
    }
  });

  it.each([
    ["query-read", { rows: [], columns: [] }],
    ["query-write", { mode: "plan", affectedCount: 0 }],
    ["vba-read", { modules: [] }],
    ["vba-write", { mode: "apply", applied: ["Module1"] }],
    ["vba-export", { mode: "plan", exportedPaths: [] }],
    ["vba-test", { mode: "apply", passed: 2, failed: 0, tests: [] }],
    [
      "verify-code",
      {
        driftDetected: false,
        summary: { total: 1, inSync: 1, sourceOnly: 0, binaryOnly: 0, diverged: 0 },
      },
    ],
    ["sync-binary", { mode: "plan", direction: "both", conflicts: [] }],
  ] as const)("validates a real %s family fixture", (family, fixture) => {
    const contract = deriveDispatchResultContract(family);
    expect(contract.kind).toBe("dataSchema");
    if (contract.kind === "dataSchema")
      expect(contract.schema.safeParse(fixture).success).toBe(true);
  });

  it("models plan/apply and summary/file/full as executable unions", () => {
    const exportContract = resultContractForDispatchTool("export_modules");
    expect(exportContract.kind).toBe("dataSchema");
    if (exportContract.kind !== "dataSchema") return;
    expect(exportContract.schema.safeParse({ mode: "plan", exportedPaths: [] }).success).toBe(true);
    expect(exportContract.schema.safeParse({ mode: "apply", exportedPaths: [] }).success).toBe(
      true,
    );
    expect(exportContract.schema.safeParse({ mode: "unknown", exportedPaths: [] }).success).toBe(
      false,
    );
    expect(exportContract.metadata.outputModes).toEqual(["summary", "file", "full"]);
  });

  it("aliases reuse the canonical contract object and cannot fork schemas", () => {
    for (const alias of ALIAS_TOOL_NAME_LIST) {
      const binding = resultContractForToolAlias(alias);
      expect(binding.contract, alias).toBe(binding.canonicalContract);
    }
  });

  it("keeps the run_vba alias aligned with its genuine execution and dry-run payloads", () => {
    const contract = resultContractForToolAlias("run_vba").contract;
    expect(contract.kind).toBe("dataSchema");
    if (contract.kind !== "dataSchema") return;

    expect(contract.schema.safeParse({ returnValue: 42 }).success).toBe(true);
    expect(
      contract.schema.safeParse({
        dryRun: true,
        willExecute: false,
        willModifyAccess: false,
        procedureName: "SmokeTest",
        moduleName: "",
      }).success,
    ).toBe(true);
  });
});
