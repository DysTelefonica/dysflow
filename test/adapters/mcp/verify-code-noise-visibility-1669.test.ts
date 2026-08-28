import { describe, expect, it } from "vitest";
import { shapeVerifyCodeResponse } from "../../../src/adapters/mcp/verify-code-response-shaping.js";

/**
 * Issue #1669 — the core comparison already computes, per non-actionable
 * category, how many modules were folded as noise
 * (`summaryStructured.nonActionable.{whitespaceOnly,caseOnly,…}`). The compact
 * MCP projection collapsed all of it into a single `nonActionableTotal`, so a
 * consumer seeing `ok:false` with `actionableOk:true` had no way to learn WHY
 * the two sides differ without paying for `diagnostic:true`.
 *
 * The actionable half of that split is already projected as
 * `summaryByCategory`. These tests pin the symmetric non-actionable
 * projection at the public boundary.
 */

const noiseOnlyComparison = {
  operation: "verify_code",
  ok: false,
  actionableOk: true,
  hasFunctionalDifferences: false,
  recommendedAction: "no_action",
  dryRun: true,
  willModifyAccess: false,
  sourceRoot: "C:/repo/src",
  warnings: [],
  summary: { whitespaceOnly: 2, caseOnly: 1 },
  summaryStructured: {
    matched: 40,
    different: 3,
    missingInSource: 0,
    missingInBinary: 0,
    actionable: { sourceNewer: 0, binaryNewer: 0, bothChanged: 0, total: 0 },
    nonActionable: {
      caseOnly: 1,
      whitespaceOnly: 2,
      attributeOnly: 0,
      formSerializationOnly: 0,
      encodingOnly: 0,
      total: 3,
    },
  },
  different: [{ moduleName: "A" }, { moduleName: "B" }, { moduleName: "C" }],
  nonActionableDifferent: [
    { moduleName: "A", classification: "whitespaceOnly" },
    { moduleName: "B", classification: "whitespaceOnly" },
    { moduleName: "C", classification: "caseOnly" },
  ],
  bulkImportable: [],
  bulkExportable: [],
};

const strictComparison = {
  operation: "verify_code",
  ok: false,
  dryRun: true,
  willModifyAccess: false,
  sourceRoot: "C:/repo/src",
  warnings: [],
  different: [{ moduleName: "A" }],
};

describe("#1669 — compact verify_code explains why ok is false", () => {
  it("projects the non-actionable category breakdown alongside the actionable one", () => {
    const compact = shapeVerifyCodeResponse(noiseOnlyComparison, { diagnostic: false });

    expect(compact).toMatchObject({
      ok: false,
      actionableOk: true,
      summaryStructured: { matched: 40, actionableTotal: 0, nonActionableTotal: 3 },
      summaryByCategory: { sourceNewer: 0, binaryNewer: 0, bothChanged: 0 },
      nonActionableByCategory: {
        caseOnly: 1,
        whitespaceOnly: 2,
        attributeOnly: 0,
        formSerializationOnly: 0,
        encodingOnly: 0,
      },
    });
  });

  it("keeps the raw evidence arrays out of the compact response", () => {
    const compact = shapeVerifyCodeResponse(noiseOnlyComparison, { diagnostic: false });

    expect(compact).not.toHaveProperty("different");
    expect(compact).not.toHaveProperty("nonActionableDifferent");
  });

  it("omits the breakdown for a strict comparison that carries no classification", () => {
    const compact = shapeVerifyCodeResponse(strictComparison, { diagnostic: false });

    expect(compact).not.toHaveProperty("nonActionableByCategory");
    expect(compact).not.toHaveProperty("summaryByCategory");
  });

  it("keeps the full nested summary in diagnostic mode", () => {
    const diagnostic = shapeVerifyCodeResponse(noiseOnlyComparison, { diagnostic: true });

    expect(diagnostic).toMatchObject({
      summaryStructured: noiseOnlyComparison.summaryStructured,
      nonActionableDifferent: noiseOnlyComparison.nonActionableDifferent,
    });
  });
});
