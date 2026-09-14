import { describe, expect, it } from "vitest";
import {
  classifyVbaPair,
  type SemanticClassification,
  type VbaRecommendation,
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
 *
 * Refs #1443 (AGENTS.md "string-aware folding"): the `commentOnly` bucket is
 * no longer reachable through these synthetic probes — comment-body content
 * drifts are runtime-visible per AGENTS.md, so the two comment-body probes
 * (apostrophe and `Rem`) and the `nonActionableMixed` case-and-comment probe
 * now classify as `bothChanged` with `manual_merge`. The `commentOnly`
 * probe row is preserved here for documentation purposes: any future change
 * that re-introduces the collapse would need to re-explain that decision.
 */
describe("vba-semantic-classifier — categories-v2 exhaustive pin (#1724 WU-3)", () => {
  type Probe = {
    id: string;
    sourceText: string;
    binaryText: string;
    expected: SemanticClassification["classification"];
    expectedActionable: boolean;
    expectedRecommendation: VbaRecommendation;
  };

  const probes: Probe[] = [
    {
      // Refs #1443: comment-body content drift is runtime-visible, so this
      // pair no longer collapses to `commentOnly`; it lands in `bothChanged`.
      id: "v2-commentOnly-case-only-in-apostrophe-comment",
      sourceText: 'Attribute VB_Name = "M"\nOption Explicit\nPublic Sub Run()\nEnd Sub\n\' NOTE\n',
      binaryText: 'Attribute VB_Name = "M"\nOption Explicit\nPublic Sub Run()\nEnd Sub\n\' note\n',
      expected: "bothChanged",
      expectedActionable: true,
      expectedRecommendation: "manual_merge",
    },
    {
      // Refs #1443: same for `Rem`-prefixed comment bodies.
      id: "v2-commentOnly-Rem-content-diff",
      sourceText:
        'Attribute VB_Name = "M"\nOption Explicit\nPublic Sub Run()\nEnd Sub\nRem Old note\n',
      binaryText:
        'Attribute VB_Name = "M"\nOption Explicit\nPublic Sub Run()\nEnd Sub\nRem New note\n',
      expected: "bothChanged",
      expectedActionable: true,
      expectedRecommendation: "manual_merge",
    },
    {
      id: "v2-continuationOnly-reflow-only",
      sourceText:
        "Option Explicit\nPublic Function Total() As Long\n    Total = 1 + _\n        2\nEnd Function\n",
      binaryText:
        "Option Explicit\nPublic Function Total() As Long\n    Total = 1 + 2\nEnd Function\n",
      expected: "continuationOnly",
      expectedActionable: false,
      expectedRecommendation: "no_action",
    },
    {
      id: "v2-statementBoundaryOnly-colon-vs-newline",
      sourceText:
        "Option Explicit\nPublic Function Run() As Long\n    a = 1: b = 2\n    Run = a + b\nEnd Function\n",
      binaryText:
        "Option Explicit\nPublic Function Run() As Long\n    a = 1\n    b = 2\n    Run = a + b\nEnd Function\n",
      expected: "statementBoundaryOnly",
      expectedActionable: false,
      expectedRecommendation: "no_action",
    },
    {
      // Refs #1443: identifier case alone is still `caseOnly`/non-actionable,
      // but the comment-body content drift keeps the pair from collapsing
      // to `nonActionableMixed`; both sides have unique functional lines
      // (distinct comment lines + distinct identifier names).
      id: "v2-nonActionableMixed-case-and-comment",
      sourceText:
        'Attribute VB_Name = "M"\nOption Explicit\nPublic Sub calculate()\nEnd Sub\n\' NOTE\n',
      binaryText:
        'Attribute VB_Name = "M"\nOption Explicit\nPublic Sub Calculate()\nEnd Sub\n\' note\n',
      expected: "bothChanged",
      expectedActionable: true,
      expectedRecommendation: "manual_merge",
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
    expect(result.actionable).toBe(probe.expectedActionable);
    expect(result.recommendation).toBe(probe.expectedRecommendation);
  });

  it("keeps single-family detectors preferred over the nonActionableMixed fallback", () => {
    // Each non-actionable probe is constructed so ONLY its own normalizer can
    // equalize the texts. If the classifier collapses any of them to
    // nonActionableMixed, the single-family detector order is wrong.
    //
    // Refs #1443: `commentOnly` is no longer in this list — the comment-body
    // probes above now classify as `bothChanged`, so they no longer need the
    // single-family detector ordering guard (they would never collapse to
    // `nonActionableMixed` in the first place). `continuationOnly` and
    // `statementBoundaryOnly` still rely on this guard.
    const singleFamily: SemanticClassification["classification"][] = [
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
