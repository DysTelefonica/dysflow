import { describe, expect, it } from "vitest";
import type { FormUiBehaviorMap } from "../../../src/core/models/form-ui-builder";
import type { LayoutFinding } from "../../../src/core/services/form-ui-layout-lint";
import { lintFormLayout } from "../../../src/core/services/form-ui-layout-lint";

/**
 * Issue #815 — `analyze_form_layout` geometry lint.
 *
 * The lint is the pure sibling of the `analyze_form_layout` MCP tool (#815,
 * Phase 2 — Perception). It runs over a `FormUiBehaviorMap` — the same shape
 * `verify_form_ui` consumes — and emits a flat list of typed `LayoutFinding`
 * diagnostics. All findings carry `severity: "warning"` (non-blocking; the
 * tool is informational, never gating).
 *
 * Behavioral contract pinned here:
 *   - Overlap uses the strict AABB test (`form-ui-geometry.ts:boxesOverlap`).
 *     Edge-touching is NOT overlap.
 *   - Alignment buckets controls by `Top` proximity
 *     (`alignmentThresholdTwips`, default 50). One finding per cluster of
 *     size ≥ 2 — naming every cluster member.
 *   - Off-section runs ONLY when both `sectionBounds` and `controlSection`
 *     are supplied; absent inputs ⇒ check skipped silently (no warning).
 *   - Tab order runs ONLY when ≥ 2 controls have explicit TabIndex; mismatch
 *     ⇒ one `FORM_LAYOUT_TAB_ORDER_MISMATCH` finding listing the expected
 *     visual order.
 *   - Missing-geometry warns per control whose `Left`/`Top`/`Width`/`Height`
 *     are incomplete (cannot be parsed as positive finite twips).
 *
 * The geometry primitives are NOT re-implemented — every detection calls
 * into `form-ui-geometry.ts` so future siblings (#818 `verify_form_bindings`,
 * #817 `diff_form_preview`) reuse the same primitives.
 */

const source: FormUiBehaviorMap = {
  formName: "Customer",
  formEvents: [],
  unmappedEvidence: [],
  warnings: [],
  controls: [],
};

function withControls(controls: FormUiBehaviorMap["controls"]): FormUiBehaviorMap {
  return { ...source, controls };
}

function controlWithBox(
  name: string,
  box: { left: number; top: number; width: number; height: number },
  extras: Partial<FormUiBehaviorMap["controls"][number]> = {},
): FormUiBehaviorMap["controls"][number] {
  return {
    name,
    type: "CommandButton",
    role: "action",
    events: [],
    bindings: [],
    codegraphEvidence: [],
    properties: {
      Left: String(box.left),
      Top: String(box.top),
      Width: String(box.width),
      Height: String(box.height),
    },
    ...extras,
  };
}

function findingsByCode(findings: LayoutFinding[], code: string): LayoutFinding[] {
  return findings.filter((finding) => finding.code === code);
}

describe("lintFormLayout — happy path", () => {
  it("returns no findings on an empty contract", () => {
    const findings = lintFormLayout(source);
    expect(findings).toEqual([]);
  });

  it("returns no findings for a clean well-aligned non-overlapping form", () => {
    // Three controls: stacked vertically, identical Left, no overlap, no
    // shared visual row beyond pairwise adjacency at very different Tops.
    const cmdA = controlWithBox("cmdA", { left: 100, top: 100, width: 500, height: 400 });
    const txtB = controlWithBox("txtB", { left: 100, top: 800, width: 1500, height: 400 });
    const cmdC = controlWithBox("cmdC", { left: 100, top: 1500, width: 500, height: 400 });

    const findings = lintFormLayout(withControls([cmdA, txtB, cmdC]));
    expect(findings).toEqual([]);
  });
});

describe("lintFormLayout — overlap", () => {
  it("flags two controls whose AABBs strictly overlap", () => {
    const cmdA = controlWithBox("cmdA", { left: 100, top: 100, width: 500, height: 400 });
    const cmdB = controlWithBox("cmdB", { left: 300, top: 200, width: 500, height: 400 });

    const findings = lintFormLayout(withControls([cmdA, cmdB]));

    const overlaps = findingsByCode(findings, "FORM_LAYOUT_OVERLAP");
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.severity).toBe("warning");
    // Pairwise report names both participants.
    expect(overlaps[0]?.controlName).toContain("cmdA");
    expect(overlaps[0]?.controlName).toContain("cmdB");
  });

  it("does NOT flag edge-touching boxes as overlap (strict AABB)", () => {
    // Right edge of cmdA == Left edge of cmdB — they touch but do not occlude.
    const cmdA = controlWithBox("cmdA", { left: 0, top: 0, width: 1000, height: 1000 });
    const cmdB = controlWithBox("cmdB", { left: 1000, top: 0, width: 1000, height: 1000 });

    const findings = lintFormLayout(withControls([cmdA, cmdB]));
    expect(findingsByCode(findings, "FORM_LAYOUT_OVERLAP")).toEqual([]);
  });

  it("does NOT flag controls with missing geometry as overlapping", () => {
    const cmdA = controlWithBox("cmdA", { left: 100, top: 100, width: 500, height: 400 });
    // No geometry on cmdB — parseBoundingBox returns null.
    const cmdB = {
      name: "cmdB",
      type: "CommandButton",
      role: "action" as const,
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: {},
    };

    const findings = lintFormLayout(withControls([cmdA, cmdB]));

    expect(findingsByCode(findings, "FORM_LAYOUT_OVERLAP")).toEqual([]);
  });
});

describe("lintFormLayout — alignment (visual row detection)", () => {
  it("detects a visual row when two controls share Top within default threshold (50)", () => {
    // Same Top (200) — exact match counts as aligned.
    const cmdA = controlWithBox("cmdA", { left: 100, top: 200, width: 500, height: 400 });
    const cmdB = controlWithBox("cmdB", { left: 800, top: 200, width: 500, height: 400 });

    const findings = lintFormLayout(withControls([cmdA, cmdB]));

    const aligned = findingsByCode(findings, "FORM_LAYOUT_ALIGNMENT");
    expect(aligned).toHaveLength(1);
    expect(aligned[0]?.severity).toBe("warning");
    expect(aligned[0]?.message).toContain("cmdA");
    expect(aligned[0]?.message).toContain("cmdB");
  });

  it("transitive clustering: A-B and B-C within threshold counts all three as one row", () => {
    // A top=200, B top=240 (40 apart — within 50), C top=280 (B-C 40 apart,
    // A-C 80 apart — NOT within 50 alone). All three belong to the same row
    // via transitivity.
    const cmdA = controlWithBox("cmdA", { left: 100, top: 200, width: 500, height: 400 });
    const cmdB = controlWithBox("cmdB", { left: 800, top: 240, width: 500, height: 400 });
    const cmdC = controlWithBox("cmdC", { left: 1500, top: 280, width: 500, height: 400 });

    const findings = lintFormLayout(withControls([cmdA, cmdB, cmdC]));

    const aligned = findingsByCode(findings, "FORM_LAYOUT_ALIGNMENT");
    expect(aligned).toHaveLength(1);
    // One finding covers all three controls.
    for (const name of ["cmdA", "cmdB", "cmdC"]) {
      expect(aligned[0]?.message).toContain(name);
    }
  });

  it("respects a custom alignmentThresholdTwips override (stricter threshold)", () => {
    // Tops 200, 230 — 30 apart. With default 50 → one row. With custom 20
    // → no row (200/230 are 30 apart, exceeds 20).
    const cmdA = controlWithBox("cmdA", { left: 100, top: 200, width: 500, height: 400 });
    const cmdB = controlWithBox("cmdB", { left: 800, top: 230, width: 500, height: 400 });

    const loose = lintFormLayout(withControls([cmdA, cmdB]));
    expect(findingsByCode(loose, "FORM_LAYOUT_ALIGNMENT")).toHaveLength(1);

    const strict = lintFormLayout(withControls([cmdA, cmdB]), { alignmentThresholdTwips: 20 });
    expect(findingsByCode(strict, "FORM_LAYOUT_ALIGNMENT")).toEqual([]);
  });

  it("does NOT detect a row when Top deltas exceed the threshold", () => {
    // Tops 200, 300 — 100 apart, way past default 50.
    const cmdA = controlWithBox("cmdA", { left: 100, top: 200, width: 500, height: 400 });
    const cmdB = controlWithBox("cmdB", { left: 800, top: 300, width: 500, height: 400 });

    const findings = lintFormLayout(withControls([cmdA, cmdB]));
    expect(findingsByCode(findings, "FORM_LAYOUT_ALIGNMENT")).toEqual([]);
  });

  it("default threshold is 50 twips — controls 50 twips apart form a row", () => {
    const cmdA = controlWithBox("cmdA", { left: 100, top: 200, width: 500, height: 400 });
    const cmdB = controlWithBox("cmdB", { left: 800, top: 250, width: 500, height: 400 });

    // Explicitly NOT passing alignmentThresholdTwips — rely on default.
    const findings = lintFormLayout(withControls([cmdA, cmdB]));
    expect(findingsByCode(findings, "FORM_LAYOUT_ALIGNMENT")).toHaveLength(1);
  });

  it("ignores controls with missing geometry when forming rows", () => {
    const cmdA = controlWithBox("cmdA", { left: 100, top: 200, width: 500, height: 400 });
    const cmdNoGeom = {
      name: "cmdNoGeom",
      type: "CommandButton",
      role: "action" as const,
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: {},
    };

    const findings = lintFormLayout(withControls([cmdA, cmdNoGeom]));
    expect(findingsByCode(findings, "FORM_LAYOUT_ALIGNMENT")).toEqual([]);
  });
});

describe("lintFormLayout — off-section", () => {
  it("flags controls whose right/bottom exceeds their section bounds when supplied", () => {
    // txtHeader has Left=15000 — its section FormHeader only has Width=5000.
    const txtHeader = controlWithBox("txtHeader", {
      left: 15000,
      top: 100,
      width: 200,
      height: 200,
    });
    const txtDetail = controlWithBox("txtDetail", {
      left: 100,
      top: 100,
      width: 200,
      height: 200,
    });

    const findings = lintFormLayout(withControls([txtHeader, txtDetail]), {
      sectionBounds: {
        Detail: { left: 0, top: 0, width: 20000, height: 10000 },
        FormHeader: { left: 0, top: 0, width: 5000, height: 1000 },
      },
      controlSection: {
        txtHeader: "FormHeader",
        txtDetail: "Detail",
      },
    });

    const offSection = findingsByCode(findings, "FORM_LAYOUT_OFF_SECTION");
    expect(offSection).toHaveLength(1);
    expect(offSection[0]?.controlName).toBe("txtHeader");
  });

  it("does NOT flag off-section when sectionBounds is absent", () => {
    const cmdA = controlWithBox("cmdA", {
      left: 99999,
      top: 0,
      width: 200,
      height: 200,
    });
    const findings = lintFormLayout(withControls([cmdA]));
    expect(findingsByCode(findings, "FORM_LAYOUT_OFF_SECTION")).toEqual([]);
  });

  it("does NOT flag off-section when controlSection is absent (both inputs required)", () => {
    const cmdA = controlWithBox("cmdA", {
      left: 99999,
      top: 0,
      width: 200,
      height: 200,
    });
    const findings = lintFormLayout(withControls([cmdA]), {
      sectionBounds: { Detail: { left: 0, top: 0, width: 1000, height: 1000 } },
    });
    expect(findingsByCode(findings, "FORM_LAYOUT_OFF_SECTION")).toEqual([]);
  });
});

describe("lintFormLayout — tab order vs visual order", () => {
  function tabControl(
    name: string,
    box: { left: number; top: number; width: number; height: number },
    tabIndex: number,
  ): FormUiBehaviorMap["controls"][number] {
    return {
      name,
      type: "TextBox",
      role: "input",
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: {
        Left: String(box.left),
        Top: String(box.top),
        Width: String(box.width),
        Height: String(box.height),
        TabIndex: String(tabIndex),
      },
    };
  }

  it("flags tab order that contradicts the visual top-to-bottom order", () => {
    // Visual order top-to-bottom: A (100), B (500), C (900).
    // TabIndex says: C → B → A. Mismatch.
    const a = tabControl("txtA", { left: 100, top: 100, width: 1000, height: 200 }, 3);
    const b = tabControl("txtB", { left: 100, top: 500, width: 1000, height: 200 }, 2);
    const c = tabControl("txtC", { left: 100, top: 900, width: 1000, height: 200 }, 1);

    const findings = lintFormLayout(withControls([a, b, c]));

    const tabFindings = findingsByCode(findings, "FORM_LAYOUT_TAB_ORDER_MISMATCH");
    expect(tabFindings).toHaveLength(1);
    expect(tabFindings[0]?.severity).toBe("warning");
    // Message names the visual order the agent should compare against.
    expect(tabFindings[0]?.message).toContain("txtA");
    expect(tabFindings[0]?.message).toContain("txtB");
    expect(tabFindings[0]?.message).toContain("txtC");
  });

  it("does NOT flag tab order when TabIndex matches the visual order", () => {
    const a = tabControl("txtA", { left: 100, top: 100, width: 1000, height: 200 }, 1);
    const b = tabControl("txtB", { left: 100, top: 500, width: 1000, height: 200 }, 2);
    const c = tabControl("txtC", { left: 100, top: 900, width: 1000, height: 200 }, 3);

    const findings = lintFormLayout(withControls([a, b, c]));
    expect(findingsByCode(findings, "FORM_LAYOUT_TAB_ORDER_MISMATCH")).toEqual([]);
  });

  it("does NOT flag tab order when fewer than two controls have explicit TabIndex", () => {
    // Only one control has TabIndex — Access falls back to visual order.
    const a = tabControl("txtA", { left: 100, top: 100, width: 1000, height: 200 }, 1);
    const b = controlWithBox("txtB", { left: 100, top: 500, width: 1000, height: 200 });

    const findings = lintFormLayout(withControls([a, b]));
    expect(findingsByCode(findings, "FORM_LAYOUT_TAB_ORDER_MISMATCH")).toEqual([]);
  });

  it("does NOT flag tab order when no control has TabIndex set", () => {
    const a = controlWithBox("txtA", { left: 100, top: 100, width: 1000, height: 200 });
    const b = controlWithBox("txtB", { left: 100, top: 500, width: 1000, height: 200 });

    const findings = lintFormLayout(withControls([a, b]));
    expect(findingsByCode(findings, "FORM_LAYOUT_TAB_ORDER_MISMATCH")).toEqual([]);
  });
});

describe("lintFormLayout — missing geometry", () => {
  it("flags controls whose Left/Top/Width/Height cannot be parsed", () => {
    const cmdA = controlWithBox("cmdA", { left: 100, top: 100, width: 500, height: 400 });
    const cmdNoGeom = {
      name: "cmdNoGeom",
      type: "CommandButton",
      role: "action" as const,
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: {},
    };

    const findings = lintFormLayout(withControls([cmdA, cmdNoGeom]));

    const missing = findingsByCode(findings, "FORM_LAYOUT_MISSING_GEOMETRY");
    expect(missing).toHaveLength(1);
    expect(missing[0]?.controlName).toBe("cmdNoGeom");
    expect(missing[0]?.severity).toBe("warning");
  });

  it("flags controls with partially-complete geometry (missing one key)", () => {
    // Width is missing — parseBoundingBox returns null.
    const cmdA = {
      name: "cmdA",
      type: "CommandButton",
      role: "action" as const,
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: { Left: "100", Top: "100", Height: "400" },
    };

    const findings = lintFormLayout(withControls([cmdA]));
    const missing = findingsByCode(findings, "FORM_LAYOUT_MISSING_GEOMETRY");
    expect(missing).toHaveLength(1);
    expect(missing[0]?.controlName).toBe("cmdA");
  });
});
