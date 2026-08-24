import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

const rawVerifyResult = {
  operation: "verify_code",
  ok: false,
  dryRun: true,
  willModifyAccess: false,
  sourceRoot: "C:/repo/src",
  matched: [{ moduleName: "Matched" }],
  different: [{ moduleName: "Noise" }, { moduleName: "Changed" }],
  missingInSource: [],
  missingInBinary: [],
  diffs: [
    {
      moduleName: "Noise",
      classification: "caseOnly",
      sourceSnippet: "Public Foo As PM",
      binarySnippet: "Public foo As pm",
      isActionable: false,
    },
    {
      moduleName: "Changed",
      classification: "sourceNewer",
      sourceSnippet: "x = 2",
      binarySnippet: "x = 1",
      isActionable: true,
    },
  ],
  summary: { caseOnly: 1, sourceNewer: 1 },
  actionableDifferent: [{ moduleName: "Changed", classification: "sourceNewer" }],
  nonActionableDifferent: [{ moduleName: "Noise", classification: "caseOnly" }],
  hasFunctionalDifferences: true,
  actionableOk: false,
  recommendation: "Source is newer; import to binary.",
  recommendedAction: "import_to_binary",
  summaryStructured: {
    matched: 1,
    different: 2,
    missingInSource: 0,
    missingInBinary: 0,
    actionable: { sourceNewer: 1, binaryNewer: 0, bothChanged: 0, total: 1 },
    nonActionable: {
      caseOnly: 1,
      whitespaceOnly: 0,
      attributeOnly: 0,
      formSerializationOnly: 0,
      encodingOnly: 0,
      total: 1,
    },
  },
  moduleCounts: {
    matchedModules: 1,
    differentModules: 2,
    missingInSourceModules: 0,
    missingInBinaryModules: 0,
    sourceNewerModules: 1,
    binaryNewerModules: 0,
    bothChangedModules: 0,
  },
  summaryUnits: {
    caseOnly: { modulesCount: 1, linesCount: 0 },
    sourceNewer: { modulesCount: 1, linesCount: 1 },
  },
  bulkImportable: ["Changed"],
  bulkImportableCount: 1,
  bulkExportable: [],
  bulkExportableCount: 0,
  vbeCacheNote: "Close and reopen Access if the live VBE cache is stale.",
  dysflowVersion: "3.0.1",
  classifierRules: "2026-07-16.r6-order-safe-lcs-cap",
  runtimeDiagnostics: { interface: "mcp-stdio" },
  warnings: [],
} as const;

function verifyToolWithRequestCapture(requests: unknown[], rawResult: unknown = rawVerifyResult) {
  const services = {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
    vbaSyncToolService: {
      execute: async (_toolName: string, input: unknown) => {
        requests.push(input);
        return successResult(rawResult);
      },
    },
  } as unknown as DysflowMcpServices;
  const tools = createDysflowMcpTools({
    services,
  });
  const tool = tools.find((candidate) => candidate.name === "verify_code");
  if (tool === undefined) throw new Error("verify_code should be registered");
  return tool;
}

async function payloadFor(input: Record<string, unknown>, rawResult: unknown = rawVerifyResult) {
  const requests: unknown[] = [];
  const result = await verifyToolWithRequestCapture(requests, rawResult).handler(input);
  expect(result.isError).toBe(false);
  const text = result.content[0]?.text;
  if (text === undefined) throw new Error("verify_code should return a text payload");
  return { payload: JSON.parse(text) as Record<string, unknown>, requests };
}

describe("verify_code MCP response shaping (#1535)", () => {
  it("returns the compact actionable view by default while preserving decision fields", async () => {
    const { payload, requests } = await payloadFor({ moduleNames: ["Changed"] });

    expect(payload).toMatchObject({
      operation: "verify_code",
      ok: false,
      dryRun: true,
      willModifyAccess: false,
      sourceRoot: "C:/repo/src",
      recommendedAction: "import_to_binary",
      actionableOk: false,
      classifierRules: "2026-07-16.r6-order-safe-lcs-cap",
      summaryStructured: { matched: 1, actionableTotal: 1, nonActionableTotal: 1 },
      summaryByCategory: { sourceNewer: 1, binaryNewer: 0, bothChanged: 0 },
      bulkImportable: ["Changed"],
      bulkImportableCount: 1,
      bulkExportable: [],
      bulkExportableCount: 0,
      warnings: [],
    });
    for (const hidden of [
      "matched",
      "different",
      "diffs",
      "missingInSource",
      "missingInBinary",
      "summary",
      "actionableDifferent",
      "nonActionableDifferent",
      "moduleCounts",
      "summaryUnits",
    ]) {
      expect(payload, `${hidden} should require diagnostic:true`).not.toHaveProperty(hidden);
    }
    expect(requests).toEqual([{ moduleNames: ["Changed"], dryRun: true }]);
  });

  it("makes omitted and explicit diagnostic:false return the same compact contract", async () => {
    const omitted = await payloadFor({});
    const explicit = await payloadFor({ diagnostic: false });

    expect(explicit.payload).toEqual(omitted.payload);
    expect(explicit.requests).toEqual([{ dryRun: true }]);
  });

  it("returns the full diagnostic evidence and implicitly requests snippets", async () => {
    const { payload, requests } = await payloadFor({
      moduleNames: ["Noise", "Changed"],
      diagnostic: true,
      strict: true,
    });

    expect(payload).toMatchObject({
      summaryStructured: rawVerifyResult.summaryStructured,
      summaryByCategory: { sourceNewer: 1, binaryNewer: 0, bothChanged: 0 },
      different: rawVerifyResult.different,
      diffs: rawVerifyResult.diffs,
      matched: rawVerifyResult.matched,
      missingInSource: [],
      missingInBinary: [],
      summary: rawVerifyResult.summary,
      actionableDifferent: rawVerifyResult.actionableDifferent,
      nonActionableDifferent: rawVerifyResult.nonActionableDifferent,
      moduleCounts: rawVerifyResult.moduleCounts,
      summaryUnits: rawVerifyResult.summaryUnits,
    });
    expect(requests).toEqual([
      { moduleNames: ["Noise", "Changed"], strict: true, diff: true, dryRun: true },
    ]);
  });

  it("does not fabricate semantic zeroes for a compact strict result", async () => {
    const strictRaw = {
      operation: "verify_code",
      ok: false,
      dryRun: true,
      willModifyAccess: false,
      sourceRoot: "C:/repo/src",
      matched: [],
      different: [{ moduleName: "ByteDifferent" }],
      missingInSource: [],
      missingInBinary: [],
      vbeCacheNote: "Strict byte comparison.",
      warnings: [],
    };
    const { payload, requests } = await payloadFor({ strict: true }, strictRaw);

    expect(payload).toMatchObject({ operation: "verify_code", ok: false });
    for (const unavailable of [
      "summaryStructured",
      "summaryByCategory",
      "bulkImportable",
      "bulkImportableCount",
      "bulkExportable",
      "bulkExportableCount",
    ]) {
      expect(
        payload,
        `${unavailable} should remain absent in compact strict mode`,
      ).not.toHaveProperty(unavailable);
    }
    expect(requests).toEqual([{ strict: true, dryRun: true }]);
  });
});
