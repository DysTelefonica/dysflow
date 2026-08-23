import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/core/services/vba-source-comparison", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/core/services/vba-source-comparison")
  >("../../../src/core/services/vba-source-comparison");
  return {
    ...actual,
    compareSourceAgainstBinary: vi.fn(),
  };
});

import { resultContractForDispatchTool } from "../../../src/adapters/mcp/contracts/dispatch-result-contracts.js";
import { validateToolResult } from "../../../src/adapters/mcp/contracts/result-validation.js";
import {
  VbaSyncAdapter,
  type VbaVerifyResult,
} from "../../../src/adapters/vba-sync/vba-sync-adapter.js";
import { compareSourceAgainstBinary } from "../../../src/core/services/vba-source-comparison.js";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const mockedCompare = vi.mocked(compareSourceAgainstBinary);

function verifyResult(missingInBinary: readonly string[]): VbaVerifyResult {
  const missing = missingInBinary.map((moduleName) => ({ moduleName, fileType: "bas" }));
  const hasFunctionalDifferences = missing.length > 0;
  return {
    operation: "verify_code",
    ok: !hasFunctionalDifferences,
    dryRun: true,
    willModifyAccess: false,
    sourceRoot: "C:/repo/src",
    matched: [],
    different: [],
    missingInSource: [],
    missingInBinary: missing,
    actionableDifferent: [],
    nonActionableDifferent: [],
    hasFunctionalDifferences,
    actionableOk: !hasFunctionalDifferences,
    recommendation: hasFunctionalDifferences ? "import_to_binary" : "no_action",
    recommendedAction: hasFunctionalDifferences ? "import_to_binary" : "no_action",
    summaryStructured: {
      matched: 0,
      different: 0,
      missingInSource: 0,
      missingInBinary: missing.length,
      actionable: {
        total: missing.length,
        sourceNewer: 0,
        binaryNewer: missing.length,
        bothChanged: 0,
      },
      nonActionable: {
        caseOnly: 0,
        whitespaceOnly: 0,
        attributeOnly: 0,
        formSerializationOnly: 0,
        encodingOnly: 0,
        total: 0,
      },
    },
    vbeCacheNote: "test",
  } as VbaVerifyResult;
}

function buildAdapter() {
  const executor = vi.fn(async () => ({
    exitCode: 0,
    stdout: 'DYSFLOW_RESULT {"ok":true}',
    stderr: "",
    durationMs: 1,
    timedOut: false,
  }));
  return {
    executor,
    adapter: new VbaSyncAdapter({
      preflightCleanup: noopPreflightCleanup(),
      executor,
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      env: {},
    }),
  };
}

function expectContractValid(payload: unknown) {
  expect(
    validateToolResult({
      toolName: "sync_binary",
      contract: resultContractForDispatchTool("sync_binary"),
      payload,
      policy: "enforce",
    }),
  ).toEqual({ ok: true });
}

describe("sync_binary effective dry-run polarity (#1346)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { label: "apply:false", input: { apply: false } },
    { label: "omitted apply", input: {} },
    { label: "explicit dryRun:true overrides apply:true", input: { apply: true, dryRun: true } },
  ])("returns and executes a safe plan for $label", async ({ input }) => {
    mockedCompare.mockResolvedValue({
      ok: true,
      data: verifyResult(["Module1"]),
      diagnostics: [],
      durationMs: 0,
    });
    const { adapter, executor } = buildAdapter();

    const result = await adapter.execute("sync_binary", {
      direction: "src-to-binary",
      ...input,
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      dryRun: true,
      plan: { toImport: ["Module1"] },
      execution: null,
      postSync: null,
    });
    expect(executor).not.toHaveBeenCalled();
    expectContractValid(result.data);
  });

  it("returns apply semantics for the same arguments with apply:true", async () => {
    mockedCompare
      .mockResolvedValueOnce({
        ok: true,
        data: verifyResult(["Module1"]),
        diagnostics: [],
        durationMs: 0,
      })
      .mockResolvedValueOnce({
        ok: true,
        data: verifyResult([]),
        diagnostics: [],
        durationMs: 0,
      });
    const { adapter, executor } = buildAdapter();

    const result = await adapter.execute("sync_binary", {
      direction: "src-to-binary",
      apply: true,
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      dryRun: false,
      plan: { toImport: ["Module1"] },
      execution: { chunksExecuted: 1 },
      postSync: expect.any(Object),
    });
    expect(executor).toHaveBeenCalledTimes(1);
    expectContractValid(result.data);
  });
});
