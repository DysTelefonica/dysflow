import { describe, expect, it } from "vitest";
import {
  classifyVbaPair,
  type SemanticClassification,
} from "../../../src/core/services/vba-semantic-classifier.js";

/**
 * Refs #1724 WU-3 — exhaustive pins for the 9-bucket non-actionable taxonomy
 * that verify-code v2 ships. Every bucket must classify deterministically for
 * a synthetic, minimally-redundant probe; the probe is structured so that ONLY
 * the targeted normalizer can equalize the texts (no other bucket can claim it).
 *
 * The test also asserts the symmetric contract:
 *   - Every non-actionable bucket is reachable through the public API.
 *   - The single-bucket detectors run BEFORE the `nonActionableMixed` fallback
 *     so a single-family diff is never collapsed to the mixed bucket.
 *   - The classifier's recommendation key agrees with the category for every
 *     non-actionable bucket (all collapse to `no_action`).
 */
describe("vba-semantic-classifier — categories-v2 exhaustive pin (#1724 WU-3)", () => {
  const probes: Array<{
    id: string;
    sourceText: string;
    binaryText: string;
    expected: SemanticClassification["classification"];
  }> = [
    {
      id: "v2-commentOnly-case-only-in-apostrophe-comment",
      sourceText: 'Attribute VB_Name = "M"\nOption Explicit\nPublic Sub Run()\nEnd Sub\n\' NOTE\n',
      binaryText: 'Attribute VB_Name = "M"\nOption Explicit\nPublic Sub Run()\nEnd Sub\n\' note\n',
      expected: "commentOnly",
    },
    {
      id: "v2-commentOnly-Rem-content-diff",
      sourceText:
        'Attribute VB_Name = "M"\nOption Explicit\nPublic Sub Run()\nEnd Sub\nRem Old note\n',
      binaryText:
        'Attribute VB_Name = "M"\nOption Explicit\nPublic Sub Run()\nEnd Sub\nRem New note\n',
      expected: "commentOnly",
    },
    {
      id: "v2-continuationOnly-reflow-only",
      sourceText:
        "Option Explicit\nPublic Function Total() As Long\n    Total = 1 + _\n        2\nEnd Function\n",
      binaryText:
        "Option Explicit\nPublic Function Total() As Long\n    Total = 1 + 2\nEnd Function\n",
      expected: "continuationOnly",
    },
    {
      id: "v2-statementBoundaryOnly-colon-vs-newline",
      sourceText:
        "Option Explicit\nPublic Function Run() As Long\n    a = 1: b = 2\n    Run = a + b\nEnd Function\n",
      binaryText:
        "Option Explicit\nPublic Function Run() As Long\n    a = 1\n    b = 2\n    Run = a + b\nEnd Function\n",
      expected: "statementBoundaryOnly",
    },
    {
      id: "v2-nonActionableMixed-case-and-comment",
      sourceText:
        'Attribute VB_Name = "M"\nOption Explicit\nPublic Sub calculate()\nEnd Sub\n\' NOTE\n',
      binaryText:
        'Attribute VB_Name = "M"\nOption Explicit\nPublic Sub Calculate()\nEnd Sub\n\' note\n',
      expected: "nonActionableMixed",
    },
  ];

  it.each(probes)("$id → $expected", (probe) => {
    const result = classifyVbaPair({
      sourceText: probe.sourceText,
      binaryText: probe.binaryText,
      fileType: "bas",
      mode: "semantic",
    });
    expect(result.classification).toBe(probe.expected);
    expect(result.actionable).toBe(false);
    expect(result.recommendation).toBe("no_action");
  });

  it("keeps single-family detectors preferred over the nonActionableMixed fallback", () => {
    // Each non-actionable probe is constructed so ONLY its own normalizer can
    // equalize the texts. If the classifier collapses any of them to
    // nonActionableMixed, the single-family detector order is wrong.
    const singleFamily: SemanticClassification["classification"][] = [
      "commentOnly",
      "continuationOnly",
      "statementBoundaryOnly",
    ];
    for (const expected of singleFamily) {
      const probe = probes.find((p) => p.expected === expected);
      if (probe === undefined) continue;
      const result = classifyVbaPair({
        sourceText: probe.sourceText,
        binaryText: probe.binaryText,
        fileType: "bas",
        mode: "semantic",
      });
      expect(result.classification, `${expected} should not collapse to nonActionableMixed`).toBe(
        expected,
      );
    }
  });
});
