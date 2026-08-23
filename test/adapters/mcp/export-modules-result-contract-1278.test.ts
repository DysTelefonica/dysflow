import { describe, expect, it } from "vitest";
import { resultContractForDispatchTool } from "../../../src/adapters/mcp/contracts/dispatch-result-contracts.js";
import { validateToolResult } from "../../../src/adapters/mcp/contracts/result-validation.js";
import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter.js";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

describe("export_modules dry-run result contract (#1278)", () => {
  it("returns an explicit non-mutating export plan accepted by the executable contract", async () => {
    let runnerCalls = 0;
    const service = new VbaSyncAdapter({
      preflightCleanup: noopPreflightCleanup(),
      executor: async () => {
        runnerCalls += 1;
        throw new Error("dry-run export must not invoke the runner");
      },
      accessPath: "C:/project/frontend.accdb",
      destinationRoot: "C:/project/src",
      env: {},
    });

    const result = await service.execute("export_modules", {
      destinationRoot: "C:/project/export",
      moduleNames: ["Module1"],
      apply: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected export plan success");
    expect(result.data).toEqual({
      operation: "export_modules",
      mode: "plan",
      exportedPaths: [],
      dryRun: true,
      willExecute: false,
      willModifyAccess: false,
      willModifyFilesystem: false,
      destinationRoot: "C:/project/export",
      moduleNames: ["Module1"],
    });
    expect(runnerCalls).toBe(0);
    expect(
      validateToolResult({
        toolName: "export_modules",
        contract: resultContractForDispatchTool("export_modules"),
        payload: result.data,
        policy: "enforce",
      }),
    ).toEqual({ ok: true });
  });
});
