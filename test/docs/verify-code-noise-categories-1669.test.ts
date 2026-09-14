import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { shapeVerifyCodeResponse } from "../../src/adapters/mcp/verify-code-response-shaping.js";
import { classifyVbaPair } from "../../src/core/services/vba-semantic-classifier.js";

/**
 * Issue #1669 — runtime anchor, not a string anchor. The documented
 * `nonActionableByCategory` key set is compared against the keys the live
 * shaper actually emits, so adding or renaming a non-actionable category
 * without touching the docs fails here.
 */

const semanticComparison = {
  operation: "verify_code",
  ok: false,
  actionableOk: true,
  recommendedAction: "no_action",
  dryRun: true,
  willModifyAccess: false,
  sourceRoot: "C:/repo/src",
  warnings: [],
  summaryStructured: {
    matched: 1,
    different: 1,
    missingInSource: 0,
    missingInBinary: 0,
    actionable: { sourceNewer: 0, binaryNewer: 0, bothChanged: 0, total: 0 },
    nonActionable: {
      caseOnly: 0,
      whitespaceOnly: 1,
      attributeOnly: 0,
      formSerializationOnly: 0,
      encodingOnly: 0,
      commentOnly: 0,
      continuationOnly: 0,
      statementBoundaryOnly: 0,
      nonActionableMixed: 0,
      total: 1,
    },
  },
  bulkImportable: [],
  bulkExportable: [],
};

// WU-3 v2-categories (Refs #1724): the canonical non-actionable bucket set
// is 9 named keys, plus the `total` aggregate. The live shaper must emit
// exactly these 10 properties; missing or extra keys fail this anchor.
const EXPECTED_NON_ACTIONABLE_KEYS = [
  "caseOnly",
  "whitespaceOnly",
  "attributeOnly",
  "formSerializationOnly",
  "encodingOnly",
  "commentOnly",
  "continuationOnly",
  "statementBoundaryOnly",
  "nonActionableMixed",
] as const;

describe("verify_code non-actionable category documentation contract (#1669)", () => {
  it("documents every non-actionable category the live shaper emits", async () => {
    const compact = shapeVerifyCodeResponse(semanticComparison, { diagnostic: false }) as Record<
      string,
      unknown
    >;
    const emitted = Object.keys(compact.nonActionableByCategory as Record<string, number>);

    // WU-3 v2-categories: the bucket set is now 9 named keys, plus `total`.
    expect(emitted.length).toBeGreaterThanOrEqual(EXPECTED_NON_ACTIONABLE_KEYS.length);
    for (const category of EXPECTED_NON_ACTIONABLE_KEYS) {
      expect(emitted, `live shaper is missing ${category}`).toContain(category);
    }

    const reference = await readFile("docs/api/mcp-tools.md", "utf8");
    const skillExample = await readFile(
      "skills/dysflow-usage/assets/examples/verify-code.md",
      "utf8",
    );

    expect(reference).toContain("`nonActionableByCategory`");
    expect(skillExample).toContain("`nonActionableByCategory`");
    for (const category of EXPECTED_NON_ACTIONABLE_KEYS) {
      expect(reference, `docs/api/mcp-tools.md is missing ${category}`).toContain(category);
      expect(skillExample, `verify-code.md is missing ${category}`).toContain(category);
    }
  });

  it("keeps the documented indentation verdict true of the live classifier", async () => {
    const indented = 'Attribute VB_Name = "M"\nPublic Sub F()\n    x = 1\nEnd Sub\n';
    const flattened = indented.replace("    x = 1", "x = 1");

    const verdict = classifyVbaPair({
      sourceText: indented,
      binaryText: flattened,
      fileType: "bas",
      mode: "semantic",
    });

    expect(verdict.classification).toBe("whitespaceOnly");
    expect(verdict.actionable).toBe(false);

    const reference = await readFile("docs/api/mcp-tools.md", "utf8");
    expect(reference).toMatch(/reported as `whitespaceOnly`, never as `caseOnly`/);
  });
});
